/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "config.h"

#include <algorithm>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <vector>
#include "nspr.h"
#include "nss.h"
#include "prio.h"
#include "prnetdb.h"
#include "secerr.h"
#include "ssl.h"
#include "ssl3prot.h"
#include "sslerr.h"
#include "sslproto.h"
#include "nss_scoped_ptrs.h"
#include "sslimpl.h"
#include "dtlscon.h"
#include "tls13ech.h"
#include "base64.h"

#include "nsskeys.h"

static const char* kVersionDisableFlags[] = {"no-ssl3", "no-tls1", "no-tls11",
                                             "no-tls12", "no-tls13"};

/* Default EarlyData dummy data determined by Bogo implementation. */
const unsigned char kBogoDummyData[] = {'h', 'e', 'l', 'l', 'o'};

bool exitCodeUnimplemented = false;

// PacketAdaptor: BoringSSL bogo packet-framing protocol over TCP for DTLS
// tests. Each DTLS datagram is wrapped as: 'P' + 4-byte big-endian length +
// payload. Control opcodes:
//   'T' + 8-byte ns  — simulate a read timeout (expire DTLS timers, reply 't')
//   'M' + 4-byte mtu — update the DTLS path MTU
//   'E' + 8-byte ns  — expected next timeout hint (ignored)

struct PacketAdaptorData {
  PRFileDesc* transport;
  PRFileDesc* ssl_fd;
};

static PRDescIdentity gPacketAdaptorId = PR_INVALID_IO_LAYER;

static PacketAdaptorData* GetPacketAdaptorData(PRFileDesc* fd) {
  return reinterpret_cast<PacketAdaptorData*>(fd->secret);
}

static bool PacketAdaptorReadExact(PRFileDesc* transport, void* buf,
                                   size_t len) {
  uint8_t* ptr = static_cast<uint8_t*>(buf);
  while (len > 0) {
    PRInt32 rv = transport->methods->recv(
        transport, ptr, static_cast<PRInt32>(len), 0, PR_INTERVAL_NO_TIMEOUT);
    if (rv <= 0) return false;
    ptr += rv;
    len -= static_cast<size_t>(rv);
  }
  return true;
}

static PRInt32 PacketAdaptorRecv(PRFileDesc* fd, void* buf, PRInt32 amount,
                                 PRIntn flags, PRIntervalTime timeout) {
  auto* data = GetPacketAdaptorData(fd);
  PRFileDesc* transport = data->transport;

  for (;;) {
    uint8_t opcode;
    if (!PacketAdaptorReadExact(transport, &opcode, 1)) return -1;

    switch (opcode) {
      case 'P': {
        PRUint32 lb;
        if (!PacketAdaptorReadExact(transport, &lb, 4)) return -1;
        lb = PR_ntohl(lb);
        PRUint32 n =
            (amount >= 0 && PRUint32(amount) < lb) ? PRUint32(amount) : lb;
        if (!PacketAdaptorReadExact(transport, buf, n)) return -1;
        if (lb > n) {
          std::vector<uint8_t> drain(lb - n);
          if (!PacketAdaptorReadExact(transport, drain.data(), drain.size()))
            return -1;
        }
        return static_cast<PRInt32>(n);
      }

      case 'T': {
        PRUint64 timeout_ns;
        if (!PacketAdaptorReadExact(transport, &timeout_ns, 8)) return -1;
        timeout_ns = PR_ntohll(timeout_ns);
        PRIntervalTime elapsed =
            PR_MillisecondsToInterval(PRUint32(timeout_ns / PR_NSEC_PER_MSEC));
        if (data->ssl_fd) {
          sslSocket* ss = ssl_FindSocket(data->ssl_fd);
          if (ss) {
            ssl_GetSSL3HandshakeLock(ss);
            PRIntervalTime now = PR_IntervalNow();
            for (size_t i = 0; i < PR_ARRAY_SIZE(ss->ssl3.hs.timers); ++i) {
              if (ss->ssl3.hs.timers[i].cb) {
                ss->ssl3.hs.timers[i].started = now - elapsed;
              }
            }
            ssl_ReleaseSSL3HandshakeLock(ss);
          }
        }
        uint8_t ack = 't';
        if (transport->methods->send(transport, &ack, 1, 0,
                                     PR_INTERVAL_NO_TIMEOUT) != 1) {
          return -1;
        }
        // Return WOULD_BLOCK so that ssl3gthr.c calls dtls_CheckTimer().
        PR_SetError(PR_WOULD_BLOCK_ERROR, 0);
        return -1;
      }

      case 'M': {
        PRUint32 mtu;
        if (!PacketAdaptorReadExact(transport, &mtu, 4)) return -1;
        mtu = PR_ntohl(mtu);
        if (data->ssl_fd) {
          sslSocket* ss = ssl_FindSocket(data->ssl_fd);
          if (ss) dtls_SetMTU(ss, PRUint16(mtu));
        }
        break;
      }

      case 'E': {
        uint8_t nb[8];
        if (!PacketAdaptorReadExact(transport, nb, 8)) return -1;
        break;
      }

      default:
        std::cerr << "PacketAdaptor: unknown opcode " << int(opcode) << "\n";
        PR_SetError(PR_IO_ERROR, 0);
        return -1;
    }
  }
}

static PRInt32 PacketAdaptorSend(PRFileDesc* fd, const void* buf,
                                 PRInt32 amount, PRIntn flags,
                                 PRIntervalTime timeout) {
  PRFileDesc* transport = GetPacketAdaptorData(fd)->transport;
  uint8_t hdr[5] = {'P', uint8_t(amount >> 24), uint8_t(amount >> 16),
                    uint8_t(amount >> 8), uint8_t(amount)};
  if (transport->methods->send(transport, hdr, 5, 0, PR_INTERVAL_NO_TIMEOUT) !=
      5)
    return -1;
  return transport->methods->send(transport, buf, amount, 0,
                                  PR_INTERVAL_NO_TIMEOUT);
}

static PRInt32 PacketAdaptorRead(PRFileDesc* fd, void* buf, PRInt32 amount) {
  return PacketAdaptorRecv(fd, buf, amount, 0, PR_INTERVAL_NO_TIMEOUT);
}

static PRInt32 PacketAdaptorWrite(PRFileDesc* fd, const void* buf,
                                  PRInt32 amount) {
  return PacketAdaptorSend(fd, buf, amount, 0, PR_INTERVAL_NO_TIMEOUT);
}

static PRStatus PacketAdaptorClose(PRFileDesc* fd) {
  fd->secret = nullptr;
  fd->dtor(fd);
  return PR_SUCCESS;
}

static PRStatus PacketAdaptorGetPeerName(PRFileDesc* fd, PRNetAddr* addr) {
  PRFileDesc* t = GetPacketAdaptorData(fd)->transport;
  return t->methods->getpeername(t, addr);
}
static PRStatus PacketAdaptorGetSockName(PRFileDesc* fd, PRNetAddr* addr) {
  PRFileDesc* t = GetPacketAdaptorData(fd)->transport;
  return t->methods->getsockname(t, addr);
}
static PRStatus PacketAdaptorGetSockOpt(PRFileDesc* fd,
                                        PRSocketOptionData* opt) {
  PRFileDesc* t = GetPacketAdaptorData(fd)->transport;
  return t->methods->getsocketoption(t, opt);
}
static PRStatus PacketAdaptorSetSockOpt(PRFileDesc* fd,
                                        const PRSocketOptionData* opt) {
  PRFileDesc* t = GetPacketAdaptorData(fd)->transport;
  return t->methods->setsocketoption(t, opt);
}
static PRInt16 PacketAdaptorPoll(PRFileDesc* fd, PRInt16 in_flags,
                                 PRInt16* out_flags) {
  PRFileDesc* t = GetPacketAdaptorData(fd)->transport;
  return t->methods->poll(t, in_flags, out_flags);
}

static PRIOMethods gPacketAdaptorMethods;

static PRFileDesc* CreatePacketAdaptor(PacketAdaptorData* data) {
  if (gPacketAdaptorId == PR_INVALID_IO_LAYER) {
    gPacketAdaptorId = PR_GetUniqueIdentity("bogo-packet-adaptor");
    if (gPacketAdaptorId == PR_INVALID_IO_LAYER) return nullptr;
    gPacketAdaptorMethods = *PR_GetDefaultIOMethods();
    gPacketAdaptorMethods.recv = PacketAdaptorRecv;
    gPacketAdaptorMethods.send = PacketAdaptorSend;
    gPacketAdaptorMethods.read = PacketAdaptorRead;
    gPacketAdaptorMethods.write = PacketAdaptorWrite;
    gPacketAdaptorMethods.close = PacketAdaptorClose;
    gPacketAdaptorMethods.getpeername = PacketAdaptorGetPeerName;
    gPacketAdaptorMethods.getsockname = PacketAdaptorGetSockName;
    gPacketAdaptorMethods.getsocketoption = PacketAdaptorGetSockOpt;
    gPacketAdaptorMethods.setsocketoption = PacketAdaptorSetSockOpt;
    gPacketAdaptorMethods.poll = PacketAdaptorPoll;
  }

  PRFileDesc* fd =
      PR_CreateIOLayerStub(gPacketAdaptorId, &gPacketAdaptorMethods);
  if (!fd) return nullptr;

  fd->secret = reinterpret_cast<PRFilePrivate*>(data);
  return fd;
}

std::string FormatError(PRErrorCode code) {
  return std::string(":") + PORT_ErrorToName(code) + ":" + ":" +
         PORT_ErrorToString(code);
}

static void StringRemoveNewlines(std::string& str) {
  str.erase(std::remove(str.begin(), str.end(), '\n'), str.cend());
  str.erase(std::remove(str.begin(), str.end(), '\r'), str.cend());
}

class TestAgent {
 public:
  TestAgent(const Config& cfg) : cfg_(cfg) {}

  ~TestAgent() {}

  static std::unique_ptr<TestAgent> Create(const Config& cfg) {
    std::unique_ptr<TestAgent> agent(new TestAgent(cfg));

    if (!agent->Init()) return nullptr;

    return agent;
  }

  bool Init() {
    if (cfg_.get<bool>("dtls")) {
      if (!ConnectDtls()) return false;
    } else {
      if (!ConnectTcp()) return false;
    }

    if (!SetupKeys()) {
      std::cerr << "Couldn't set up keys/certs\n";
      return false;
    }

    if (!SetupOptions()) {
      std::cerr << "Couldn't configure socket\n";
      return false;
    }

    SECStatus rv = SSL_ResetHandshake(ssl_fd_.get(), cfg_.get<bool>("server"));
    if (rv != SECSuccess) return false;

    return true;
  }

  bool ConnectTcp() {
    if (!(cfg_.get<bool>("ipv6") && OpenConnection("::1")) &&
        !OpenConnection("127.0.0.1")) {
      return false;
    }

    ssl_fd_ = ScopedPRFileDesc(SSL_ImportFD(NULL, pr_fd_.get()));
    if (!ssl_fd_) {
      return false;
    }
    pr_fd_.release();

    return true;
  }

  bool ConnectDtls() {
    if (!(cfg_.get<bool>("ipv6") && OpenConnection("::1")) &&
        !OpenConnection("127.0.0.1")) {
      return false;
    }

    adaptor_data_.transport = pr_fd_.get();
    adaptor_data_.ssl_fd = nullptr;
    ScopedPRFileDesc adaptor(CreatePacketAdaptor(&adaptor_data_));
    if (!adaptor) {
      return false;
    }

    ssl_fd_ = ScopedPRFileDesc(DTLS_ImportFD(NULL, adaptor.get()));
    if (!ssl_fd_) {
      return false;
    }
    PRFileDesc* imported = adaptor.release();
    (void)imported;

    adaptor_data_.ssl_fd = ssl_fd_.get();
    return true;
  }

  bool OpenConnection(const char* ip) {
    PRStatus prv;
    PRNetAddr addr;

    prv = PR_StringToNetAddr(ip, &addr);

    if (prv != PR_SUCCESS) {
      return false;
    }

    addr.inet.port = PR_htons(cfg_.get<int>("port"));

    pr_fd_ = ScopedPRFileDesc(PR_OpenTCPSocket(addr.raw.family));
    if (!pr_fd_) return false;

    prv = PR_Connect(pr_fd_.get(), &addr, PR_INTERVAL_NO_TIMEOUT);
    if (prv != PR_SUCCESS) {
      return false;
    }

    uint64_t shim_id = cfg_.get<int>("shim-id");
    uint8_t buf[8] = {0};
    for (size_t i = 0; i < 8; i++) {
      buf[i] = shim_id & 0xff;
      shim_id >>= 8;
    }
    int sent = PR_Write(pr_fd_.get(), buf, sizeof(buf));
    if (sent != sizeof(buf)) {
      return false;
    }

    return true;
  }

  bool SetupKeys() {
    SECStatus rv;

    if (cfg_.get<std::string>("key-file") != "") {
      key_ = ScopedSECKEYPrivateKey(
          ReadPrivateKey(cfg_.get<std::string>("key-file")));
      if (!key_) return false;
    }
    if (cfg_.get<std::string>("cert-file") != "") {
      cert_ = ScopedCERTCertificate(
          ReadCertificate(cfg_.get<std::string>("cert-file")));
      if (!cert_) return false;
    }

    // Needed because certs are not entirely valid.
    rv = SSL_AuthCertificateHook(ssl_fd_.get(), AuthCertificateHook, this);
    if (rv != SECSuccess) return false;

    if (cfg_.get<bool>("server")) {
      // Server
      rv = SSL_ConfigServerCert(ssl_fd_.get(), cert_.get(), key_.get(), nullptr,
                                0);
      if (rv != SECSuccess) {
        std::cerr << "Couldn't configure server cert\n";
        return false;
      }

    } else if (key_ && cert_) {
      // Client.
      rv =
          SSL_GetClientAuthDataHook(ssl_fd_.get(), GetClientAuthDataHook, this);
      if (rv != SECSuccess) return false;
    }

    return true;
  }

  static bool ConvertFromWireVersion(SSLProtocolVariant variant,
                                     int wire_version, uint16_t* lib_version) {
    // These default values are used when {min,max}-version isn't given.
    if (wire_version == 0 || wire_version == 0xffff) {
      *lib_version = static_cast<uint16_t>(wire_version);
      return true;
    }

#ifdef TLS_1_3_DRAFT_VERSION
    if (wire_version == (0x7f00 | TLS_1_3_DRAFT_VERSION)) {
      // N.B. SSL_LIBRARY_VERSION_DTLS_1_3_WIRE == SSL_LIBRARY_VERSION_TLS_1_3
      wire_version = SSL_LIBRARY_VERSION_TLS_1_3;
    }
#endif

    if (variant == ssl_variant_datagram) {
      switch (wire_version) {
        case SSL_LIBRARY_VERSION_DTLS_1_0_WIRE:
          *lib_version = SSL_LIBRARY_VERSION_DTLS_1_0;
          break;
        case SSL_LIBRARY_VERSION_DTLS_1_2_WIRE:
          *lib_version = SSL_LIBRARY_VERSION_DTLS_1_2;
          break;
        case SSL_LIBRARY_VERSION_DTLS_1_3_WIRE:
          *lib_version = SSL_LIBRARY_VERSION_DTLS_1_3;
          break;
        default:
          std::cerr << "Unrecognized DTLS version " << wire_version << ".\n";
          return false;
      }
    } else {
      if (wire_version < SSL_LIBRARY_VERSION_3_0 ||
          wire_version > SSL_LIBRARY_VERSION_TLS_1_3) {
        std::cerr << "Unrecognized TLS version " << wire_version << ".\n";
        return false;
      }
      *lib_version = static_cast<uint16_t>(wire_version);
    }
    return true;
  }

  bool GetVersionRange(SSLVersionRange* range_out, SSLProtocolVariant variant) {
    SSLVersionRange supported;
    if (SSL_VersionRangeGetSupported(variant, &supported) != SECSuccess) {
      return false;
    }

    uint16_t min_allowed;
    uint16_t max_allowed;
    if (!ConvertFromWireVersion(variant, cfg_.get<int>("min-version"),
                                &min_allowed)) {
      return false;
    }
    if (!ConvertFromWireVersion(variant, cfg_.get<int>("max-version"),
                                &max_allowed)) {
      return false;
    }

    min_allowed = std::max(min_allowed, supported.min);
    max_allowed = std::min(max_allowed, supported.max);

    bool found_min = false;
    bool found_max = false;
    // Ignore -no-ssl3, because SSLv3 is never supported.
    for (size_t i = 1; i < PR_ARRAY_SIZE(kVersionDisableFlags); ++i) {
      auto version =
          static_cast<uint16_t>(SSL_LIBRARY_VERSION_TLS_1_0 + (i - 1));
      if (variant == ssl_variant_datagram) {
        // In DTLS mode, the -no-tlsN flags refer to DTLS versions,
        // but NSS wants the corresponding TLS versions.
        if (version == SSL_LIBRARY_VERSION_TLS_1_1) {
          // DTLS 1.1 doesn't exist.
          continue;
        }
        if (version == SSL_LIBRARY_VERSION_TLS_1_0) {
          version = SSL_LIBRARY_VERSION_DTLS_1_0;
        }
      }

      if (version < min_allowed) {
        continue;
      }
      if (version > max_allowed) {
        break;
      }

      const bool allowed = !cfg_.get<bool>(kVersionDisableFlags[i]);

      if (!found_min && allowed) {
        found_min = true;
        range_out->min = version;
      }
      if (found_min && !found_max) {
        if (allowed) {
          range_out->max = version;
        } else {
          found_max = true;
        }
      }
      if (found_max && allowed) {
        std::cerr << "Discontiguous version range.\n";
        return false;
      }
    }

    if (!found_min) {
      std::cerr << "All versions disabled.\n";
    }
    return found_min;
  }

  bool SetupOptions() {
    bool is_dtls = cfg_.get<bool>("dtls");

    if (!is_dtls) {
      SECStatus rv =
          SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_TLS13_COMPAT_MODE, PR_TRUE);
      if (rv != SECSuccess) {
        return false;
      }
    }

    SECStatus rv =
        SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_SESSION_TICKETS, PR_TRUE);
    if (rv != SECSuccess) {
      return false;
    }

    SSLVersionRange vrange;
    SSLProtocolVariant variant =
        is_dtls ? ssl_variant_datagram : ssl_variant_stream;
    if (!GetVersionRange(&vrange, variant)) {
      return false;
    }

    rv = SSL_VersionRangeSet(ssl_fd_.get(), &vrange);
    if (rv != SECSuccess) return false;

    SSLVersionRange verify_vrange;
    rv = SSL_VersionRangeGet(ssl_fd_.get(), &verify_vrange);
    if (rv != SECSuccess) return false;
    if (vrange.min != verify_vrange.min || vrange.max != verify_vrange.max)
      return false;

    rv = SSL_OptionSet(ssl_fd_.get(), SSL_NO_CACHE, false);
    if (rv != SECSuccess) return false;

    auto alpn = cfg_.get<std::string>("advertise-alpn");
    if (!alpn.empty()) {
      assert(!cfg_.get<bool>("server"));

      rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_ALPN, PR_TRUE);
      if (rv != SECSuccess) return false;

      rv = SSL_SetNextProtoNego(
          ssl_fd_.get(), reinterpret_cast<const unsigned char*>(alpn.c_str()),
          alpn.size());
      if (rv != SECSuccess) return false;
    }

    // Set supported signature schemes.
    auto sign_prefs = cfg_.get<std::vector<int>>("signing-prefs");
    auto verify_prefs = cfg_.get<std::vector<int>>("verify-prefs");
    if (sign_prefs.empty()) {
      sign_prefs = verify_prefs;
    } else if (!verify_prefs.empty()) {
      return false;  // Both shouldn't be set.
    }
    if (!sign_prefs.empty()) {
      std::vector<SSLSignatureScheme> sig_schemes;
      std::transform(
          sign_prefs.begin(), sign_prefs.end(), std::back_inserter(sig_schemes),
          [](int scheme) { return static_cast<SSLSignatureScheme>(scheme); });

      rv = SSL_SignatureSchemePrefSet(
          ssl_fd_.get(), sig_schemes.data(),
          static_cast<unsigned int>(sig_schemes.size()));
      if (rv != SECSuccess) return false;
    }

    if (cfg_.get<bool>("fallback-scsv")) {
      rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_FALLBACK_SCSV, PR_TRUE);
      if (rv != SECSuccess) return false;
    }

    if (cfg_.get<bool>("false-start")) {
      rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_FALSE_START, PR_TRUE);
      if (rv != SECSuccess) return false;
    }

    if (cfg_.get<bool>("enable-ocsp-stapling")) {
      rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_OCSP_STAPLING, PR_TRUE);
      if (rv != SECSuccess) return false;
    }

    bool requireClientCert = cfg_.get<bool>("require-any-client-certificate");
    if (requireClientCert || cfg_.get<bool>("verify-peer")) {
      assert(cfg_.get<bool>("server"));

      rv = SSL_OptionSet(ssl_fd_.get(), SSL_REQUEST_CERTIFICATE, PR_TRUE);
      if (rv != SECSuccess) return false;

      rv = SSL_OptionSet(
          ssl_fd_.get(), SSL_REQUIRE_CERTIFICATE,
          requireClientCert ? SSL_REQUIRE_ALWAYS : SSL_REQUIRE_NO_ERROR);
      if (rv != SECSuccess) return false;
    }

    if (!cfg_.get<bool>("server")) {
      auto hostname = cfg_.get<std::string>("host-name");
      if (!hostname.empty()) {
        rv = SSL_SetURL(ssl_fd_.get(), hostname.c_str());
      } else {
        // Needed to make resumption work.
        rv = SSL_SetURL(ssl_fd_.get(), "server");
      }
      if (rv != SECSuccess) return false;

      // Setup ECH configs on client if provided
      auto echConfigList = cfg_.get<std::string>("ech-config-list");
      if (!echConfigList.empty()) {
        unsigned int binLen;
        auto bin = ATOB_AsciiToData(echConfigList.c_str(), &binLen);
        rv = SSLExp_SetClientEchConfigs(ssl_fd_.get(), bin, binLen);
        if (rv != SECSuccess) return false;
        free(bin);
      }

      if (cfg_.get<bool>("enable-grease")) {
        rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_GREASE, PR_TRUE);
        if (rv != SECSuccess) return false;
      }

      if (cfg_.get<bool>("permute-extensions")) {
        rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_CH_EXTENSION_PERMUTATION,
                           PR_TRUE);
        if (rv != SECSuccess) return false;
      }

    } else {
      // GREASE - BoGo expects servers to enable GREASE by default
      rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_GREASE, PR_TRUE);
      if (rv != SECSuccess) return false;
    }

    rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_EXTENDED_MASTER_SECRET,
                       PR_TRUE);
    if (rv != SECSuccess) return false;

    if (cfg_.get<bool>("server") && !is_dtls) {
      // BoGo expects TLS servers to enable ECH (backend) by default
      rv = SSLExp_EnableTls13BackendEch(ssl_fd_.get(), true);
      if (rv != SECSuccess) {
        return false;
      }
    }

    if (cfg_.get<bool>("enable-ech-grease")) {
      rv = SSLExp_EnableTls13GreaseEch(ssl_fd_.get(), true);
      if (rv != SECSuccess) return false;
    }

    if (cfg_.get<bool>("enable-early-data")) {
      rv = SSL_OptionSet(ssl_fd_.get(), SSL_ENABLE_0RTT_DATA, PR_TRUE);
      if (rv != SECSuccess) return false;
    }

    if (!ConfigureGroups()) return false;

    if (!ConfigureCiphers()) return false;

    return true;
  }

  bool ConfigureGroups() {
    auto curves = cfg_.get<std::vector<int>>("curves");
    if (curves.size() > 0) {
      std::vector<SSLNamedGroup> groups;
      std::transform(
          curves.begin(), curves.end(), std::back_inserter(groups),
          [](int curve) { return static_cast<SSLNamedGroup>(curve); });
      SECStatus rv =
          SSL_NamedGroupConfig(ssl_fd_.get(), &groups[0], groups.size());
      if (rv != SECSuccess) {
        return false;
      }
      // Xyber768 and ML-KEM-1024 are disabled by policy by default, so if
      // they're requested we need to update the policy flags as well.
      for (auto group : groups) {
        if (group == ssl_grp_kem_xyber768d00) {
          NSS_SetAlgorithmPolicy(SEC_OID_XYBER768D00, NSS_USE_ALG_IN_SSL_KX, 0);
        }
        if (group == ssl_grp_kem_mlkem1024) {
          NSS_SetAlgorithmPolicy(SEC_OID_ML_KEM_1024, NSS_USE_ALG_IN_SSL_KX, 0);
        }
      }
    }

    return true;
  }

  bool ConfigureCiphers() {
    auto cipherList = cfg_.get<std::string>("nss-cipher");

    if (cipherList.empty()) {
      return EnableNonExportCiphers();
    }

    for (size_t i = 0; i < SSL_NumImplementedCiphers; ++i) {
      SSLCipherSuiteInfo csinfo;
      std::string::size_type n;
      SECStatus rv = SSL_GetCipherSuiteInfo(SSL_ImplementedCiphers[i], &csinfo,
                                            sizeof(csinfo));
      if (rv != SECSuccess) {
        return false;
      }

      // Check if cipherList contains the name of the Cipher Suite and
      // enable/disable accordingly.
      n = cipherList.find(csinfo.cipherSuiteName, 0);
      if (std::string::npos == n) {
        rv = SSL_CipherPrefSet(ssl_fd_.get(), SSL_ImplementedCiphers[i],
                               PR_FALSE);
      } else {
        rv = SSL_CipherPrefSet(ssl_fd_.get(), SSL_ImplementedCiphers[i],
                               PR_TRUE);
      }
      if (rv != SECSuccess) {
        return false;
      }
    }
    return true;
  }

  bool EnableNonExportCiphers() {
    for (size_t i = 0; i < SSL_NumImplementedCiphers; ++i) {
      SSLCipherSuiteInfo csinfo;

      SECStatus rv = SSL_GetCipherSuiteInfo(SSL_ImplementedCiphers[i], &csinfo,
                                            sizeof(csinfo));
      if (rv != SECSuccess) {
        return false;
      }

      rv = SSL_CipherPrefSet(ssl_fd_.get(), SSL_ImplementedCiphers[i], PR_TRUE);
      if (rv != SECSuccess) {
        return false;
      }
    }
    return true;
  }

  // Dummy auth certificate hook.
  static SECStatus AuthCertificateHook(void* arg, PRFileDesc* fd,
                                       PRBool checksig, PRBool isServer) {
    return SECSuccess;
  }

  static SECStatus GetClientAuthDataHook(void* self, PRFileDesc* fd,
                                         CERTDistNames* caNames,
                                         CERTCertificate** cert,
                                         SECKEYPrivateKey** privKey) {
    TestAgent* a = static_cast<TestAgent*>(self);
    *cert = CERT_DupCertificate(a->cert_.get());
    *privKey = SECKEY_CopyPrivateKey(a->key_.get());
    return SECSuccess;
  }

  SECStatus Handshake() { return SSL_ForceHandshake(ssl_fd_.get()); }

  // Implement a trivial echo client/server. Read bytes from the other side,
  // flip all the bits, and send them back.
  SECStatus ReadWrite() {
    for (;;) {
      uint8_t block[512];
      int32_t rv = PR_Read(ssl_fd_.get(), block, sizeof(block));
      if (rv < 0) {
        std::cerr << "Failure reading\n";
        return SECFailure;
      }
      if (rv == 0) return SECSuccess;

      int32_t len = rv;
      for (int32_t i = 0; i < len; ++i) {
        block[i] ^= 0xff;
      }

      rv = PR_Write(ssl_fd_.get(), block, len);
      if (rv != len) {
        std::cerr << "Write failure\n";
        PORT_SetError(SEC_ERROR_OUTPUT_LEN);
        return SECFailure;
      }
    }
  }

  // Write bytes to the other side then read them back and check
  // that they were correctly XORed as in ReadWrite.
  SECStatus WriteRead() {
    static const uint8_t ch = 'E';

    // We do 600-byte blocks to provide mis-alignment of the
    // reader and writer.
    uint8_t block[600];
    memset(block, ch, sizeof(block));
    int32_t rv = PR_Write(ssl_fd_.get(), block, sizeof(block));
    if (rv != sizeof(block)) {
      std::cerr << "Write failure\n";
      PORT_SetError(SEC_ERROR_OUTPUT_LEN);
      return SECFailure;
    }

    size_t left = sizeof(block);
    while (left) {
      rv = PR_Read(ssl_fd_.get(), block, left);
      if (rv < 0) {
        std::cerr << "Failure reading\n";
        return SECFailure;
      }
      if (rv == 0) {
        PORT_SetError(SEC_ERROR_INPUT_LEN);
        return SECFailure;
      }

      int32_t len = rv;
      for (int32_t i = 0; i < len; ++i) {
        if (block[i] != (ch ^ 0xff)) {
          PORT_SetError(SEC_ERROR_BAD_DATA);
          return SECFailure;
        }
      }
      left -= len;
    }
    return SECSuccess;
  }

  SECStatus CheckALPN(std::string expectedALPN) {
    SECStatus rv;
    SSLNextProtoState state;
    char chosen[256];
    unsigned int chosen_len;

    rv = SSL_GetNextProto(ssl_fd_.get(), &state,
                          reinterpret_cast<unsigned char*>(chosen), &chosen_len,
                          sizeof(chosen));
    if (rv != SECSuccess) {
      PRErrorCode err = PR_GetError();
      std::cerr << "SSL_GetNextProto failed with error=" << FormatError(err)
                << std::endl;
      return SECFailure;
    }

    assert(chosen_len <= sizeof(chosen));
    if (std::string(chosen, chosen_len) != expectedALPN) {
      std::cerr << "Expexted ALPN (" << expectedALPN << ") != Choosen ALPN ("
                << std::string(chosen, chosen_len) << ")" << std::endl;
      return SECFailure;
    }

    return SECSuccess;
  }

  SECStatus AdvertiseALPN(std::string alpn) {
    return SSL_SetNextProtoNego(
        ssl_fd_.get(), reinterpret_cast<const unsigned char*>(alpn.c_str()),
        alpn.size());
  }

  /* Certificate Encoding/Decoding Shrinking functions
   * See
   * https://boringssl.googlesource.com/boringssl/+/master/ssl/test/runner/runner.go#16168
   */
  static SECStatus certCompressionShrinkEncode(const SECItem* input,
                                               SECItem* output) {
    if (input == NULL || input->data == NULL) {
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      return SECFailure;
    }

    if (input->len < 2) {
      std::cerr << "Certificate is too short. " << std::endl;
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      return SECFailure;
    }

    SECITEM_AllocItem(NULL, output, input->len - 2);
    if (output == NULL || output->data == NULL) {
      return SECFailure;
    }

    /* The shrinking encoding primitive expects the first two bytes of a
     * certificate to be equal to 0. */
    if (input->data[0] != 0 || input->data[1] != 0) {
      std::cerr << "Cannot compress certificate message." << std::endl;
      return SECFailure;
    }

    for (size_t i = 0; i < output->len; i++) {
      output->data[i] = input->data[i + 2];
    }
    return SECSuccess;
  }

  static SECStatus certCompressionShrinkDecode(const SECItem* input,
                                               unsigned char* output,
                                               size_t outputLen,
                                               size_t* usedLen) {
    if (input == NULL || input->data == NULL) {
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      return SECFailure;
    }

    if (output == NULL || outputLen != input->len + 2) {
      return SECFailure;
    }

    output[0] = 0;
    output[1] = 0;
    for (size_t i = 0; i < input->len; i++) {
      output[i + 2] = input->data[i];
    }

    *usedLen = outputLen;
    return SECSuccess;
  }

  /* Certificate Encoding/Decoding Expanding functions
   * See
   * https://boringssl.googlesource.com/boringssl/+/master/ssl/test/runner/runner.go#16186
   */
  static SECStatus certCompressionExpandEncode(const SECItem* input,
                                               SECItem* output) {
    if (input == NULL || input->data == NULL) {
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      return SECFailure;
    }

    SECITEM_AllocItem(NULL, output, input->len + 4);

    if (output == NULL || output->data == NULL) {
      return SECFailure;
    }

    output->data[0] = 1;
    output->data[1] = 2;
    output->data[2] = 3;
    output->data[3] = 4;
    for (size_t i = 0; i < input->len; i++) {
      output->data[i + 4] = input->data[i];
    }

    return SECSuccess;
  }

  static SECStatus certCompressionExpandDecode(const SECItem* input,
                                               unsigned char* output,
                                               size_t outputLen,
                                               size_t* usedLen) {
    if (input == NULL || input->data == NULL) {
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      return SECFailure;
    }

    if (input->len < 4) {
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      std::cerr << "Certificate is too short. " << std::endl;
      return SECFailure;
    }

    if (output == NULL || outputLen != input->len - 4) {
      return SECFailure;
    }

    /* See the corresponding compression function. */
    if (input->data[0] != 1 || input->data[1] != 2 || input->data[2] != 3 ||
        input->data[3] != 4) {
      std::cerr << "Cannot decompress certificate message." << std::endl;
      return SECFailure;
    }

    for (size_t i = 0; i < outputLen; i++) {
      output[i] = input->data[i + 4];
    }

    *usedLen = outputLen;
    return SECSuccess;
  }

  /* Certificate Encoding/Decoding Random functions
   * See
   * https://boringssl.googlesource.com/boringssl/+/master/ssl/test/runner/runner.go#16201
   */
  static SECStatus certCompressionRandomEncode(const SECItem* input,
                                               SECItem* output) {
    if (input == NULL || input->data == NULL) {
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      return SECFailure;
    }

    SECITEM_AllocItem(NULL, output, input->len + 1);

    if (output == NULL || output->data == NULL) {
      return SECFailure;
    }

    SECStatus rv = PK11_GenerateRandom(output->data, 1);

    if (rv != SECSuccess) {
      std::cerr << "Failed to generate randomness. " << std::endl;
      return SECFailure;
    }

    for (size_t i = 0; i < input->len; i++) {
      output->data[i + 1] = input->data[i];
    }
    return SECSuccess;
  }

  static SECStatus certCompressionRandomDecode(const SECItem* input,
                                               unsigned char* output,
                                               size_t outputLen,
                                               size_t* usedLen) {
    if (input == NULL || input->data == NULL) {
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      return SECFailure;
    }

    if (input->len < 1) {
      PR_SetError(SEC_ERROR_INVALID_ARGS, 0);
      std::cerr << "Certificate is too short. " << std::endl;
      return SECFailure;
    }

    if (output == NULL || outputLen != input->len - 1) {
      return SECFailure;
    }

    for (size_t i = 0; i < outputLen; i++) {
      output[i] = input->data[i + 1];
    }

    *usedLen = outputLen;
    return SECSuccess;
  }

  SECStatus DoExchange(bool resuming) {
    SECStatus rv;
    int earlyDataSent = 0;
    std::string str;
    sslSocket* ss = ssl_FindSocket(ssl_fd_.get());
    if (!ss) {
      return SECFailure;
    }
    if (cfg_.get<bool>("install-cert-compression-algs")) {
      SSLCertificateCompressionAlgorithm t = {
          (SSLCertificateCompressionAlgorithmID)0xff01,
          "shrinkingCompressionAlg", certCompressionShrinkEncode,
          certCompressionShrinkDecode};

      SSLCertificateCompressionAlgorithm t1 = {
          (SSLCertificateCompressionAlgorithmID)0xff02,
          "expandingCompressionAlg", certCompressionExpandEncode,
          certCompressionExpandDecode};

      SSLCertificateCompressionAlgorithm t2 = {
          (SSLCertificateCompressionAlgorithmID)0xff03, "randomCompressionAlg",
          certCompressionRandomEncode, certCompressionRandomDecode};

      SSLExp_SetCertificateCompressionAlgorithm(ssl_fd_.get(), t);
      SSLExp_SetCertificateCompressionAlgorithm(ssl_fd_.get(), t1);
      SSLExp_SetCertificateCompressionAlgorithm(ssl_fd_.get(), t2);
    }

    /* Apply resumption SSL options (if any). */
    if (resuming) {
      /* Client options */
      if (!cfg_.get<bool>("server")) {
        auto resumeEchConfigList =
            cfg_.get<std::string>("on-resume-ech-config-list");
        if (!resumeEchConfigList.empty()) {
          unsigned int binLen;
          auto bin = ATOB_AsciiToData(resumeEchConfigList.c_str(), &binLen);
          rv = SSLExp_SetClientEchConfigs(ssl_fd_.get(), bin, binLen);
          if (rv != SECSuccess) {
            PRErrorCode err = PR_GetError();
            std::cerr << "Setting up resumption ECH configs failed with error="
                      << err << FormatError(err) << std::endl;
          }
          free(bin);
        }

        str = cfg_.get<std::string>("on-resume-advertise-alpn");
        if (!str.empty()) {
          if (AdvertiseALPN(str) != SECSuccess) {
            PRErrorCode err = PR_GetError();
            std::cerr << "Setting up resumption ALPN failed with error=" << err
                      << FormatError(err) << std::endl;
          }
        }
      }

    } else { /* Explicitly not on resume (on initial) */
      /* Client options */
      if (!cfg_.get<bool>("server")) {
        str = cfg_.get<std::string>("on-initial-advertise-alpn");
        if (!str.empty()) {
          if (AdvertiseALPN(str) != SECSuccess) {
            PRErrorCode err = PR_GetError();
            std::cerr << "Setting up initial ALPN failed with error=" << err
                      << FormatError(err) << std::endl;
          }
        }
      }
    }

    /* If client send ClientHello. */
    if (!cfg_.get<bool>("server")) {
      ssl_Get1stHandshakeLock(ss);
      rv = ssl_BeginClientHandshake(ss);
      ssl_Release1stHandshakeLock(ss);
      if (rv != SECSuccess) {
        PRErrorCode err = PR_GetError();
        std::cerr << "Handshake failed with error=" << err << FormatError(err)
                  << std::endl;
        return SECFailure;
      }

      /* If the client is resuming. */
      if (ss->statelessResume) {
        SSLPreliminaryChannelInfo pinfo;
        rv = SSL_GetPreliminaryChannelInfo(ssl_fd_.get(), &pinfo,
                                           sizeof(SSLPreliminaryChannelInfo));
        if (rv != SECSuccess) {
          PRErrorCode err = PR_GetError();
          std::cerr << "SSL_GetPreliminaryChannelInfo failed with " << err
                    << std::endl;
          return SECFailure;
        }

        /* Check that the used ticket supports early data. */
        if (cfg_.get<bool>("expect-ticket-supports-early-data")) {
          if (!pinfo.ticketSupportsEarlyData) {
            std::cerr << "Expected ticket to support EarlyData" << std::endl;
            return SECFailure;
          }
        }

        /* If the client should send EarlyData. */
        if (cfg_.get<bool>("on-resume-shim-writes-first")) {
          earlyDataSent =
              ssl_SecureWrite(ss, kBogoDummyData, sizeof(kBogoDummyData));
          if (earlyDataSent < 0) {
            std::cerr << "Sending of EarlyData failed" << std::endl;
            return SECFailure;
          }
        }

        if (cfg_.get<bool>("expect-no-offer-early-data")) {
          if (earlyDataSent) {
            std::cerr << "Unexpectedly offered EarlyData" << std::endl;
            return SECFailure;
          }
        }
      }
    }

    /* As server start, as client continue handshake. */
    rv = Handshake();

    /* Retry config evaluation must be done before error handling since
     * handshake failure is intended on ech_required tests. */
    if (cfg_.get<bool>("expect-no-ech-retry-configs")) {
      if (ss->xtnData.ech && ss->xtnData.ech->retryConfigsValid) {
        std::cerr << "Unexpectedly received ECH retry configs" << std::endl;
        return SECFailure;
      }
    }

    /* If given, verify received retry configs before error handling. */
    std::string expectedRCs64 =
        cfg_.get<std::string>("expect-ech-retry-configs");
    if (!expectedRCs64.empty()) {
      SECItem receivedRCs;

      /* Get received RetryConfigs. */
      if (SSLExp_GetEchRetryConfigs(ssl_fd_.get(), &receivedRCs) !=
          SECSuccess) {
        std::cerr << "Failed to get ECH retry configs." << std::endl;
        return SECFailure;
      }

      /* (Re-)Encode received configs to compare with expected ASCII string. */
      std::string receivedRCs64(
          BTOA_DataToAscii(receivedRCs.data, receivedRCs.len));
      /* Remove newlines (for unknown reasons) added during b64 encoding. */
      StringRemoveNewlines(receivedRCs64);

      if (receivedRCs64 != expectedRCs64) {
        std::cerr << "Received ECH retry configs did not match expected retry "
                     "configs."
                  << std::endl;
        return SECFailure;
      }
    }

    /* Check if handshake succeeded. */
    if (rv != SECSuccess) {
      PRErrorCode err = PR_GetError();
      std::cerr << "Handshake failed with error=" << err << FormatError(err)
                << std::endl;
      return SECFailure;
    }

    /* If parts of data was sent as EarlyData make sure to send possibly
     * unsent rest. This is required to pass bogo resumption tests. */
    if (earlyDataSent && earlyDataSent < int(sizeof(kBogoDummyData))) {
      int toSend = sizeof(kBogoDummyData) - earlyDataSent;
      earlyDataSent =
          ssl_SecureWrite(ss, &kBogoDummyData[earlyDataSent], toSend);
      if (earlyDataSent != toSend) {
        std::cerr
            << "Could not send rest of EarlyData after handshake completion"
            << std::endl;
        return SECFailure;
      }
    }

    if (cfg_.get<bool>("write-then-read")) {
      rv = WriteRead();
      if (rv != SECSuccess) {
        PRErrorCode err = PR_GetError();
        std::cerr << "WriteRead failed with error=" << FormatError(err)
                  << std::endl;
        return SECFailure;
      }
    } else {
      rv = ReadWrite();
      if (rv != SECSuccess) {
        PRErrorCode err = PR_GetError();
        std::cerr << "ReadWrite failed with error=" << FormatError(err)
                  << std::endl;
        return SECFailure;
      }
    }

    SSLChannelInfo info;
    rv = SSL_GetChannelInfo(ssl_fd_.get(), &info, sizeof(info));
    if (rv != SECSuccess) {
      PRErrorCode err = PR_GetError();
      std::cerr << "SSL_GetChannelInfo failed with error=" << FormatError(err)
                << std::endl;
      return SECFailure;
    }

    auto sig_alg = cfg_.get<int>("expect-peer-signature-algorithm");
    if (sig_alg) {
      auto expected = static_cast<SSLSignatureScheme>(sig_alg);
      if (info.signatureScheme != expected) {
        std::cerr << "Unexpected signature scheme" << std::endl;
        return SECFailure;
      }
    }

    auto curve_id = cfg_.get<int>("expect-curve-id");
    if (curve_id) {
      auto expected = static_cast<SSLNamedGroup>(curve_id);
      if (info.keaGroup != expected && !(info.keaGroup == ssl_grp_none &&
                                         info.originalKeaGroup == expected)) {
        std::cerr << "Unexpected named group" << std::endl;
        return SECFailure;
      }
    }

    if (cfg_.get<bool>("expect-ech-accept")) {
      if (!info.echAccepted) {
        std::cerr << "Expected ECH" << std::endl;
        return SECFailure;
      }
    }

    if (cfg_.get<bool>("expect-hrr")) {
      if (!ss->ssl3.hs.helloRetry) {
        std::cerr << "Expected HRR" << std::endl;
        return SECFailure;
      }
    }

    str = cfg_.get<std::string>("expect-alpn");
    if (!str.empty()) {
      if (CheckALPN(str) != SECSuccess) {
        std::cerr << "Unexpected ALPN" << std::endl;
        return SECFailure;
      }
    }

    /* if resumed */
    if (info.resumed) {
      if (cfg_.get<bool>("expect-session-miss")) {
        std::cerr << "Expected reject Resume" << std::endl;
        return SECFailure;
      }

      if (cfg_.get<bool>("on-resume-expect-ech-accept")) {
        if (!info.echAccepted) {
          std::cerr << "Expected ECH on Resume" << std::endl;
          return SECFailure;
        }
      }

      if (cfg_.get<bool>("on-resume-expect-reject-early-data")) {
        if (info.earlyDataAccepted) {
          std::cerr << "Expected reject EarlyData" << std::endl;
          return SECFailure;
        }
      }
      if (cfg_.get<bool>("on-resume-expect-accept-early-data")) {
        if (!info.earlyDataAccepted) {
          std::cerr << "Expected accept EarlyData" << std::endl;
          return SECFailure;
        }
      }

      /* On successfully resumed connection. */
      if (info.earlyDataAccepted) {
        str = cfg_.get<std::string>("on-resume-expect-alpn");
        if (!str.empty()) {
          if (CheckALPN(str) != SECSuccess) {
            std::cerr << "Unexpected ALPN on Resume" << std::endl;
            return SECFailure;
          }
        } else { /* No real resume but new handshake on EarlyData rejection. */
          /* On Retry... */
          str = cfg_.get<std::string>("on-retry-expect-alpn");
          if (!str.empty()) {
            if (CheckALPN(str) != SECSuccess) {
              std::cerr << "Unexpected ALPN on HRR" << std::endl;
              return SECFailure;
            }
          }
        }
      }

    } else { /* Explicitly not on resume */
      if (cfg_.get<bool>("on-initial-expect-ech-accept")) {
        if (!info.echAccepted) {
          std::cerr << "Expected ECH accept on initial connection" << std::endl;
          return SECFailure;
        }
      }

      str = cfg_.get<std::string>("on-initial-expect-alpn");
      if (!str.empty()) {
        if (CheckALPN(str) != SECSuccess) {
          std::cerr << "Unexpected ALPN on Initial" << std::endl;
          return SECFailure;
        }
      }
    }

    return SECSuccess;
  }

 private:
  const Config& cfg_;
  ScopedPRFileDesc pr_fd_;
  PacketAdaptorData adaptor_data_{};
  ScopedPRFileDesc ssl_fd_;
  ScopedCERTCertificate cert_;
  ScopedSECKEYPrivateKey key_;
};

std::unique_ptr<const Config> ReadConfig(int argc, char** argv) {
  std::unique_ptr<Config> cfg(new Config());

  cfg->AddEntry<int>("port", 0);
  cfg->AddEntry<bool>("ipv6", false);
  cfg->AddEntry<int>("shim-id", 0);
  cfg->AddEntry<bool>("server", false);
  cfg->AddEntry<bool>("dtls", false);
  cfg->AddEntry<int>("resume-count", 0);
  cfg->AddEntry<std::string>("key-file", "");
  cfg->AddEntry<std::string>("cert-file", "");
  cfg->AddEntry<int>("min-version", 0);
  cfg->AddEntry<int>("max-version", 0xffff);
  for (auto flag : kVersionDisableFlags) {
    cfg->AddEntry<bool>(flag, false);
  }
  cfg->AddEntry<bool>("fallback-scsv", false);
  cfg->AddEntry<bool>("false-start", false);
  cfg->AddEntry<bool>("enable-ocsp-stapling", false);
  cfg->AddEntry<bool>("write-then-read", false);
  cfg->AddEntry<bool>("require-any-client-certificate", false);
  cfg->AddEntry<bool>("verify-peer", false);
  cfg->AddEntry<bool>("is-handshaker-supported", false);
  cfg->AddEntry<std::string>("handshaker-path", "");  // Ignore this
  cfg->AddEntry<std::string>("advertise-alpn", "");
  cfg->AddEntry<std::string>("on-initial-advertise-alpn", "");
  cfg->AddEntry<std::string>("on-resume-advertise-alpn", "");
  cfg->AddEntry<std::string>("expect-alpn", "");
  cfg->AddEntry<std::string>("on-initial-expect-alpn", "");
  cfg->AddEntry<std::string>("on-resume-expect-alpn", "");
  cfg->AddEntry<std::string>("on-retry-expect-alpn", "");
  cfg->AddEntry<std::vector<int>>("signing-prefs", std::vector<int>());
  cfg->AddEntry<std::vector<int>>("verify-prefs", std::vector<int>());
  cfg->AddEntry<int>("expect-peer-signature-algorithm", 0);
  cfg->AddEntry<std::string>("nss-cipher", "");
  cfg->AddEntry<std::string>("host-name", "");
  cfg->AddEntry<std::string>("ech-config-list", "");
  cfg->AddEntry<std::string>("on-resume-ech-config-list", "");
  cfg->AddEntry<bool>("expect-ech-accept", false);
  cfg->AddEntry<bool>("expect-hrr", false);
  cfg->AddEntry<bool>("enable-ech-grease", false);
  cfg->AddEntry<bool>("enable-early-data", false);
  cfg->AddEntry<bool>("enable-grease", false);
  cfg->AddEntry<bool>("permute-extensions", false);
  cfg->AddEntry<bool>("on-resume-expect-reject-early-data", false);
  cfg->AddEntry<bool>("on-resume-expect-accept-early-data", false);
  cfg->AddEntry<bool>("expect-ticket-supports-early-data", false);
  cfg->AddEntry<bool>("on-resume-shim-writes-first",
                      false);  // Always means 0Rtt write
  cfg->AddEntry<bool>("shim-writes-first",
                      false);  // Unimplemented since not required so far
  cfg->AddEntry<bool>("expect-session-miss", false);
  cfg->AddEntry<std::string>("expect-ech-retry-configs", "");
  cfg->AddEntry<bool>("expect-no-ech-retry-configs", false);
  cfg->AddEntry<bool>("on-initial-expect-ech-accept", false);
  cfg->AddEntry<bool>("on-resume-expect-ech-accept", false);
  cfg->AddEntry<bool>("expect-no-offer-early-data", false);
  /* NSS does not support earlydata rejection reason logging => Ignore. */
  cfg->AddEntry<std::string>("on-resume-expect-early-data-reason", "none");
  cfg->AddEntry<std::string>("on-retry-expect-early-data-reason", "none");
  cfg->AddEntry<std::vector<int>>("curves", std::vector<int>());
  cfg->AddEntry<int>("expect-curve-id", 0);
  cfg->AddEntry<bool>("install-cert-compression-algs", false);

  auto rv = cfg->ParseArgs(argc, argv);
  switch (rv) {
    case Config::kOK:
      break;
    case Config::kUnknownFlag:
      exitCodeUnimplemented = true;
      return nullptr;
    default:
      return nullptr;
  }

  // Needed to change to std::unique_ptr<const Config>
  return std::move(cfg);
}

bool RunCycle(std::unique_ptr<const Config>& cfg, bool resuming = false) {
  std::unique_ptr<TestAgent> agent(TestAgent::Create(*cfg));
  return agent && agent->DoExchange(resuming) == SECSuccess;
}

int GetExitCode(bool success) {
  if (exitCodeUnimplemented) {
    return 89;
  }

  if (success) {
    return 0;
  }

  return 1;
}

int main(int argc, char** argv) {
  std::unique_ptr<const Config> cfg = ReadConfig(argc, argv);
  if (!cfg) {
    return GetExitCode(false);
  }

  if (cfg->get<bool>("is-handshaker-supported")) {
    std::cout << "No\n";
    return 0;
  }

  if (cfg->get<bool>("server")) {
    if (SSL_ConfigServerSessionIDCache(1024, 0, 0, ".") != SECSuccess) {
      std::cerr << "Couldn't configure session cache\n";
      return 1;
    }
  }

  if (NSS_NoDB_Init(nullptr) != SECSuccess) {
    return 1;
  }

  // Run a single test cycle.
  bool success = RunCycle(cfg);

  int resume_count = cfg->get<int>("resume-count");
  while (success && resume_count-- > 0) {
    std::cout << "Resuming" << std::endl;
    success = RunCycle(cfg, true);
  }

  SSL_ClearSessionCache();

  if (cfg->get<bool>("server")) {
    SSL_ShutdownServerSessionIDCache();
  }

  if (NSS_Shutdown() != SECSuccess) {
    success = false;
  }

  return GetExitCode(success);
}
