/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>
#include <fstream>
#include <string>
#include <vector>

#include "NSSSocketControl.h"
#include "ScopedNSSTypes.h"
#include "cert.h"
#include "gtest/gtest.h"
#include "mozilla/Base64.h"
#include "mozilla/OriginAttributes.h"
#include "nsNSSComponent.h"
#include "nsNSSIOLayer.h"
#include "nsString.h"
#include "pk11pub.h"
#include "prio.h"
#include "secerr.h"
#include "ssl.h"
#include "sslexp.h"
#include "sslproto.h"

using namespace mozilla;

// An NSPR layer that limits how many bytes can be written to the layer below
// it. This simulates a socket whose send buffer is full, which causes libssl
// to only partially send a record. The layer's secret points to the number of
// bytes that may currently be written.
static PRDescIdentity sThrottleIdentity = PR_INVALID_IO_LAYER;
static PRIOMethods sThrottleMethods;

static int32_t ThrottleSend(PRFileDesc* fd, const void* buf, int32_t amount,
                            int flags, PRIntervalTime timeout) {
  int32_t* writable = reinterpret_cast<int32_t*>(fd->secret);
  if (*writable == 0) {
    PR_SetError(PR_WOULD_BLOCK_ERROR, 0);
    return -1;
  }
  int32_t written = fd->lower->methods->send(
      fd->lower, buf, std::min(amount, *writable), flags, timeout);
  if (written > 0) {
    *writable -= written;
  }
  return written;
}

static int32_t ThrottleWrite(PRFileDesc* fd, const void* buf, int32_t amount) {
  return ThrottleSend(fd, buf, amount, 0, PR_INTERVAL_NO_TIMEOUT);
}

static PRStatus ThrottleClose(PRFileDesc* fd) {
  fd->secret = nullptr;
  return PR_GetDefaultIOMethods()->close(fd);
}

// Reads a PEM file installed alongside the gtests and returns its contents as
// DER.
static void ReadPEMFile(const char* name, nsCString& der) {
  std::ifstream in(name);
  ASSERT_TRUE(in.good());
  nsAutoCString base64;
  std::string line;
  while (std::getline(in, line)) {
    if (line.rfind("-----", 0) != 0) {
      base64.Append(line.c_str());
    }
  }
  ASSERT_EQ(NS_OK, Base64Decode(base64, der));
}

static SECItem ToSECItem(nsCString& data) {
  return {siBuffer, reinterpret_cast<unsigned char*>(data.BeginWriting()),
          static_cast<unsigned int>(data.Length())};
}

static void ConfigureServerCert(PRFileDesc* fd) {
  nsCString certDER;
  ASSERT_NO_FATAL_FAILURE(ReadPEMFile("short-write-server.pem", certDER));
  SECItem certItem = ToSECItem(certDER);
  UniqueCERTCertificate cert(CERT_NewTempCertificate(
      CERT_GetDefaultCertDB(), &certItem, nullptr, false, true));
  ASSERT_TRUE(cert);

  nsCString keyDER;
  ASSERT_NO_FATAL_FAILURE(ReadPEMFile("short-write-server.key", keyDER));
  SECItem keyItem = ToSECItem(keyDER);
  UniquePK11SlotInfo slot(PK11_GetInternalSlot());
  ASSERT_TRUE(slot);
  SECKEYPrivateKey* keyPtr = nullptr;
  ASSERT_EQ(SECSuccess, PK11_ImportDERPrivateKeyInfoAndReturnKey(
                            slot.get(), &keyItem, nullptr, nullptr, false,
                            false, KU_ALL, &keyPtr, nullptr));
  UniqueSECKEYPrivateKey key(keyPtr);

  ASSERT_EQ(SECSuccess,
            SSL_ConfigServerCert(fd, cert.get(), key.get(), nullptr, 0));
}

static const uint8_t kPskLabel[] = "psm_ShortWrite";
static const uint32_t kMaxEarlyData = 1000;
static const int32_t kUnlimited = INT32_MAX;

// Sets up a TLS 1.3 connection between a client using PSM's I/O layer and an
// NSS server, both on the current thread. The peers authenticate using an
// external PSK so that no certificate verification happens.
class psm_ShortWrite : public ::testing::Test {
 protected:
  void SetUp() override {
    ASSERT_TRUE(EnsureNSSInitializedChromeOrContent());
    if (sThrottleIdentity == PR_INVALID_IO_LAYER) {
      sThrottleIdentity = PR_GetUniqueIdentity("psm_ShortWrite throttle");
      ASSERT_NE(PR_INVALID_IO_LAYER, sThrottleIdentity);
      sThrottleMethods = *PR_GetDefaultIOMethods();
      sThrottleMethods.send = ThrottleSend;
      sThrottleMethods.write = ThrottleWrite;
      sThrottleMethods.close = ThrottleClose;
    }
  }

  void TearDown() override {
    mSocketControl = nullptr;
    if (mClient) {
      PR_Close(mClient);
    }
    if (mServer) {
      PR_Close(mServer);
    }
  }

  // If `offerEarlyData` is true, the client offers 0-RTT and can send early
  // data. The server never enables 0-RTT, so it always rejects the early data.
  void Connect(bool offerEarlyData) {
    PRFileDesc* listener = PR_OpenTCPSocket(PR_AF_INET);
    ASSERT_TRUE(listener);
    PRNetAddr addr;
    ASSERT_EQ(PR_SUCCESS, PR_InitializeNetAddr(PR_IpAddrLoopback, 0, &addr));
    ASSERT_EQ(PR_SUCCESS, PR_Bind(listener, &addr));
    ASSERT_EQ(PR_SUCCESS, PR_Listen(listener, 1));
    ASSERT_EQ(PR_SUCCESS, PR_GetSockName(listener, &addr));
    mClient = PR_OpenTCPSocket(PR_AF_INET);
    ASSERT_TRUE(mClient);
    ASSERT_EQ(PR_SUCCESS, PR_Connect(mClient, &addr, PR_INTERVAL_NO_TIMEOUT));
    mServer = PR_Accept(listener, nullptr, PR_INTERVAL_NO_TIMEOUT);
    PR_Close(listener);
    ASSERT_TRUE(mServer);
    PRSocketOptionData nonblocking;
    nonblocking.option = PR_SockOpt_Nonblocking;
    nonblocking.value.non_blocking = true;
    ASSERT_EQ(PR_SUCCESS, PR_SetSocketOption(mClient, &nonblocking));
    ASSERT_EQ(PR_SUCCESS, PR_SetSocketOption(mServer, &nonblocking));

    PRFileDesc* throttle =
        PR_CreateIOLayerStub(sThrottleIdentity, &sThrottleMethods);
    ASSERT_TRUE(throttle);
    throttle->secret = reinterpret_cast<PRFilePrivate*>(&mWritable);
    ASSERT_EQ(PR_SUCCESS, PR_PushIOLayer(mClient, PR_TOP_IO_LAYER, throttle));

    nsCOMPtr<nsITLSSocketControl> socketControl;
    ASSERT_EQ(NS_OK,
              nsSSLIOLayerAddToSocket(
                  PR_AF_INET, "example.com", 443, nullptr, OriginAttributes(),
                  mClient, getter_AddRefs(socketControl), false, 0, 0));
    mSocketControl = static_cast<NSSSocketControl*>(socketControl.get());

    mServer = SSL_ImportFD(nullptr, mServer);
    ASSERT_TRUE(mServer);
    ASSERT_EQ(SECSuccess, SSL_OptionSet(mServer, SSL_NO_CACHE, true));
    ASSERT_EQ(SECSuccess,
              SSL_OptionSet(mServer, SSL_ENABLE_SESSION_TICKETS, false));
    ASSERT_EQ(SECSuccess, SSL_OptionSet(mServer, SSL_REQUIRE_CERTIFICATE,
                                        SSL_REQUIRE_NEVER));
    ASSERT_NO_FATAL_FAILURE(ConfigureServerCert(mServer));
    ASSERT_EQ(SECSuccess, SSL_ResetHandshake(mServer, true));

    SSLVersionRange range = {SSL_LIBRARY_VERSION_TLS_1_3,
                             SSL_LIBRARY_VERSION_TLS_1_3};
    ASSERT_EQ(SECSuccess, SSL_VersionRangeSet(mClient, &range));
    ASSERT_EQ(SECSuccess, SSL_VersionRangeSet(mServer, &range));

    UniquePK11SlotInfo slot(PK11_GetInternalSlot());
    ASSERT_TRUE(slot);
    UniquePK11SymKey psk(PK11_KeyGen(slot.get(), CKM_GENERIC_SECRET_KEY_GEN,
                                     nullptr, 32, nullptr));
    ASSERT_TRUE(psk);
    for (PRFileDesc* fd : {mClient, mServer}) {
      ASSERT_EQ(SECSuccess, SSL_AddExternalPsk0Rtt(
                                fd, psk.get(), kPskLabel, sizeof(kPskLabel),
                                ssl_hash_sha256, TLS_AES_128_GCM_SHA256,
                                offerEarlyData ? kMaxEarlyData : 0));
    }
    ASSERT_EQ(SECSuccess,
              SSL_OptionSet(mClient, SSL_ENABLE_0RTT_DATA, offerEarlyData));
    // The sockets are already connected, so the client handshake has to be
    // started explicitly.
    ASSERT_EQ(SECSuccess, SSL_ResetHandshake(mClient, false));
  }

  void Handshake() {
    bool clientDone = false;
    bool serverDone = false;
    // A TLS 1.3 PSK handshake needs three flights: the ClientHello, the
    // server's reply, and the client's Finished. Loopback delivery can be
    // asynchronous (it is on macOS), so each round waits for an unfinished peer
    // to have something to read. The limit leaves headroom for rounds that
    // make no progress while still failing fast if the handshake stalls.
    for (int i = 0; i < 10 && !(clientDone && serverDone); i++) {
      PRPollDesc pollDescs[2];
      PRIntn count = 0;
      for (auto [fd, done] :
           {std::pair(mClient, &clientDone), std::pair(mServer, &serverDone)}) {
        if (!*done) {
          if (SSL_ForceHandshake(fd) == SECSuccess) {
            *done = true;
          } else {
            ASSERT_EQ(PR_WOULD_BLOCK_ERROR, PR_GetError());
            pollDescs[count++] = {fd, PR_POLL_READ, 0};
          }
        }
      }
      if (count > 0) {
        ASSERT_LT(0,
                  PR_Poll(pollDescs, count, PR_MillisecondsToInterval(1000)));
      }
    }
    ASSERT_TRUE(clientDone);
    ASSERT_TRUE(serverDone);
    ASSERT_TRUE(mSocketControl->IsHandshakeCompleted());
  }

  // Reads from the server until `length` bytes have been received or no more
  // data arrives.
  std::vector<uint8_t> ServerRead(size_t length) {
    std::vector<uint8_t> received;
    while (received.size() < length) {
      PRPollDesc pollDesc = {mServer, PR_POLL_READ, 0};
      if (PR_Poll(&pollDesc, 1, PR_MillisecondsToInterval(1000)) <= 0) {
        break;
      }
      uint8_t buf[4096];
      int32_t read = PR_Recv(mServer, buf, sizeof(buf), 0, PR_INTERVAL_NO_WAIT);
      if (read < 0 && PR_GetError() == PR_WOULD_BLOCK_ERROR) {
        continue;
      }
      if (read <= 0) {
        break;
      }
      received.insert(received.end(), buf, buf + read);
    }
    return received;
  }

  static std::vector<uint8_t> Data(size_t length) {
    std::vector<uint8_t> data(length);
    for (size_t i = 0; i < length; i++) {
      data[i] = static_cast<uint8_t>(i * 7 + (i >> 8));
    }
    return data;
  }

  // Writes `data` with the throttle allowing only a small number of bytes
  // through, which should result in a short write.
  void ShortWrite(const std::vector<uint8_t>& data) {
    mWritable = 100;
    ASSERT_EQ(-1, PR_Write(mClient, data.data(), data.size()));
    ASSERT_EQ(PR_WOULD_BLOCK_ERROR, PR_GetError());
    ASSERT_TRUE(mSocketControl->IsShortWritePending());
    mWritable = kUnlimited;
  }

  PRFileDesc* mClient = nullptr;
  PRFileDesc* mServer = nullptr;
  RefPtr<NSSSocketControl> mSocketControl;
  int32_t mWritable = kUnlimited;
};

TEST_F(psm_ShortWrite, RetryWithSameData) {
  ASSERT_NO_FATAL_FAILURE(Connect(false));
  ASSERT_NO_FATAL_FAILURE(Handshake());
  std::vector<uint8_t> data(Data(16384));
  ASSERT_NO_FATAL_FAILURE(ShortWrite(data));
  ASSERT_EQ(16384, PR_Write(mClient, data.data(), data.size()));
  ASSERT_FALSE(mSocketControl->IsShortWritePending());
  ASSERT_EQ(data, ServerRead(data.size()));
}

TEST_F(psm_ShortWrite, RetryWithSameDataSmallerThanRecord) {
  ASSERT_NO_FATAL_FAILURE(Connect(false));
  ASSERT_NO_FATAL_FAILURE(Handshake());
  std::vector<uint8_t> data(Data(1000));
  ASSERT_NO_FATAL_FAILURE(ShortWrite(data));
  ASSERT_EQ(1000, PR_Write(mClient, data.data(), data.size()));
  ASSERT_FALSE(mSocketControl->IsShortWritePending());
  ASSERT_EQ(data, ServerRead(data.size()));
}

// When a write spans multiple records and the first record is only partially
// sent, libssl reports that 16383 bytes were written.
TEST_F(psm_ShortWrite, RetryWithSameDataMultipleRecords) {
  ASSERT_NO_FATAL_FAILURE(Connect(false));
  ASSERT_NO_FATAL_FAILURE(Handshake());
  std::vector<uint8_t> data(Data(40000));
  ASSERT_NO_FATAL_FAILURE(ShortWrite(data));
  ASSERT_EQ(16384, PR_Write(mClient, data.data(), data.size()));
  ASSERT_FALSE(mSocketControl->IsShortWritePending());
  ASSERT_EQ(40000 - 16384,
            PR_Write(mClient, data.data() + 16384, data.size() - 16384));
  ASSERT_EQ(data, ServerRead(data.size()));
}

TEST_F(psm_ShortWrite, RetryWithDifferentFirstByte) {
  ASSERT_NO_FATAL_FAILURE(Connect(false));
  ASSERT_NO_FATAL_FAILURE(Handshake());
  std::vector<uint8_t> data(Data(16384));
  ASSERT_NO_FATAL_FAILURE(ShortWrite(data));
  data.front() ^= 0xff;
  ASSERT_EQ(-1, PR_Write(mClient, data.data(), data.size()));
  ASSERT_EQ(PR_INVALID_ARGUMENT_ERROR, PR_GetError());
}

TEST_F(psm_ShortWrite, RetryWithDifferentLastByte) {
  ASSERT_NO_FATAL_FAILURE(Connect(false));
  ASSERT_NO_FATAL_FAILURE(Handshake());
  std::vector<uint8_t> data(Data(16384));
  ASSERT_NO_FATAL_FAILURE(ShortWrite(data));
  data.back() ^= 0xff;
  ASSERT_EQ(-1, PR_Write(mClient, data.data(), data.size()));
  ASSERT_EQ(PR_INVALID_ARGUMENT_ERROR, PR_GetError());
}

TEST_F(psm_ShortWrite, RetryWithLessData) {
  ASSERT_NO_FATAL_FAILURE(Connect(false));
  ASSERT_NO_FATAL_FAILURE(Handshake());
  std::vector<uint8_t> data(Data(16384));
  ASSERT_NO_FATAL_FAILURE(ShortWrite(data));
  ASSERT_EQ(-1, PR_Write(mClient, data.data(), data.size() - 1));
  ASSERT_EQ(PR_INVALID_ARGUMENT_ERROR, PR_GetError());
}

// libssl limits how much early data can be sent. A write that exceeds the
// limit by one byte looks like a short write, but must not be treated as one.
TEST_F(psm_ShortWrite, EarlyDataIsNotShortWrite) {
  ASSERT_NO_FATAL_FAILURE(Connect(true));
  // Send the ClientHello so that subsequent writes are sent as early data.
  ASSERT_EQ(SECFailure, SSL_ForceHandshake(mClient));
  ASSERT_EQ(PR_WOULD_BLOCK_ERROR, PR_GetError());
  std::vector<uint8_t> data(Data(kMaxEarlyData + 1));
  ASSERT_EQ(static_cast<int32_t>(kMaxEarlyData),
            PR_Write(mClient, data.data(), data.size()));
  ASSERT_FALSE(mSocketControl->IsHandshakeCompleted());
  ASSERT_FALSE(mSocketControl->IsShortWritePending());
}

// If the server rejects early data, the application may send entirely
// different data instead (for example, an HTTP/2 connection preface). A write
// that was truncated at the early data limit must not affect how that data is
// sent or how much of it is reported as written.
TEST_F(psm_ShortWrite, EarlyDataRejectedThenDifferentData) {
  ASSERT_NO_FATAL_FAILURE(Connect(true));
  ASSERT_EQ(SECFailure, SSL_ForceHandshake(mClient));
  ASSERT_EQ(PR_WOULD_BLOCK_ERROR, PR_GetError());
  std::vector<uint8_t> earlyData(Data(kMaxEarlyData + 1));
  ASSERT_EQ(static_cast<int32_t>(kMaxEarlyData),
            PR_Write(mClient, earlyData.data(), earlyData.size()));

  ASSERT_NO_FATAL_FAILURE(Handshake());
  SSLChannelInfo info;
  ASSERT_EQ(SECSuccess, SSL_GetChannelInfo(mClient, &info, sizeof(info)));
  ASSERT_FALSE(info.earlyDataAccepted);

  std::vector<uint8_t> data(70, 0x5a);
  ASSERT_EQ(70, PR_Write(mClient, data.data(), data.size()));
  ASSERT_EQ(data, ServerRead(data.size()));
}

// If libssl holds back the last byte of a partially-sent early data write and
// the server then rejects early data, the application resends its data from
// the beginning. That data must be sent as-is, not checked against or merged
// with the byte held back from the rejected early data.
TEST_F(psm_ShortWrite, EarlyDataRejectedWithHeldByte) {
  ASSERT_NO_FATAL_FAILURE(Connect(true));
  ASSERT_EQ(SECFailure, SSL_ForceHandshake(mClient));
  ASSERT_EQ(PR_WOULD_BLOCK_ERROR, PR_GetError());
  std::vector<uint8_t> data(Data(500));
  mWritable = 100;
  ASSERT_EQ(499, PR_Write(mClient, data.data(), data.size()));
  mWritable = kUnlimited;

  // The server doesn't enable 0-RTT, so it rejects the early data.
  ASSERT_NO_FATAL_FAILURE(Handshake());
  SSLChannelInfo info;
  ASSERT_EQ(SECSuccess, SSL_GetChannelInfo(mClient, &info, sizeof(info)));
  ASSERT_FALSE(info.earlyDataAccepted);

  ASSERT_EQ(500, PR_Write(mClient, data.data(), data.size()));
  ASSERT_EQ(data, ServerRead(data.size()));
}
