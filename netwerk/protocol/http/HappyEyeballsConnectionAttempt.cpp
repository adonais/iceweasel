/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// HttpLog.h should generally be included first
#include "HttpLog.h"

#include <algorithm>

#include "HappyEyeballsConnectionAttempt.h"
#include "ConnectionEntry.h"
#include "NSSErrorsService.h"
#include "mozilla/net/NeckoChannelParams.h"
#include "mozilla/StaticPrefs_network.h"
#include "nsIHttpActivityObserver.h"
#include "PendingTransactionInfo.h"
#include "nsHttpTransaction.h"
#include "HttpConnectionUDP.h"
#include "nsIDNSAdditionalInfo.h"
#include "nsDNSService2.h"
#include "nsHttpConnectionMgr.h"
#include "nsHttpHandler.h"
#include "nsQueryObject.h"
#include "nsSocketTransport2.h"
#include "nsSocketTransportService2.h"

// Log on level :5, instead of default :4.
#undef LOG
#define LOG(args) LOG5(args)
#undef LOG_ENABLED
#define LOG_ENABLED() LOG5_ENABLED()

namespace mozilla::net {

using happy_eyeballs::happy_eyeballs_process_connection_result;
using happy_eyeballs::happy_eyeballs_process_dns_response_a;
using happy_eyeballs::happy_eyeballs_process_dns_response_aaaa;
using happy_eyeballs::happy_eyeballs_process_dns_response_https;
using happy_eyeballs::happy_eyeballs_process_output;

static void NotifyConnectionActivity(nsHttpConnectionInfo* aConnInfo,
                                     uint32_t aSubtype) {
  HttpConnectionActivity activity(
      aConnInfo->HashKey(), aConnInfo->GetOrigin(), aConnInfo->OriginPort(),
      aConnInfo->EndToEndSSL(), !aConnInfo->GetEchConfig().IsEmpty(),
      aConnInfo->IsHttp3());
  gHttpHandler->ObserveHttpActivityWithArgs(
      activity, NS_ACTIVITY_TYPE_HTTP_CONNECTION, aSubtype, PR_Now(), 0, ""_ns);
}

NS_IMPL_ADDREF_INHERITED(HappyEyeballsConnectionAttempt, ConnectionAttempt)
NS_IMPL_RELEASE_INHERITED(HappyEyeballsConnectionAttempt, ConnectionAttempt)

NS_INTERFACE_MAP_BEGIN(HappyEyeballsConnectionAttempt)
  NS_INTERFACE_MAP_ENTRY(nsISupportsWeakReference)
  NS_INTERFACE_MAP_ENTRY(nsITimerCallback)
  NS_INTERFACE_MAP_ENTRY(nsINamed)
  NS_INTERFACE_MAP_ENTRY(nsIDNSListener)
  NS_INTERFACE_MAP_ENTRY_CONCRETE(HappyEyeballsConnectionAttempt)
NS_INTERFACE_MAP_END

HappyEyeballsConnectionAttempt::HappyEyeballsConnectionAttempt(
    nsHttpConnectionInfo* ci, nsAHttpTransaction* trans, uint32_t caps,
    bool speculative, bool urgentStart)
    : ConnectionAttempt(ci, trans, caps, speculative, urgentStart) {
  LOG(("HappyEyeballsConnectionAttempt ctor %p", this));
  if (mConnInfo->GetRoutedHost().IsEmpty()) {
    mHost = mConnInfo->GetOrigin();
  } else {
    mHost = mConnInfo->GetRoutedHost();
  }

  NotifyConnectionActivity(
      mConnInfo, mSpeculative
                     ? NS_HTTP_ACTIVITY_SUBTYPE_SPECULATIVE_DNSANDSOCKET_CREATED
                     : NS_HTTP_ACTIVITY_SUBTYPE_DNSANDSOCKET_CREATED);
}

HappyEyeballsConnectionAttempt::~HappyEyeballsConnectionAttempt() {
  LOG(("HappyEyeballsConnectionAttempt dtor %p", this));
}

nsresult HappyEyeballsConnectionAttempt::CreateHappyEyeballs(
    ConnectionEntry* ent) {
  happy_eyeballs::IpPreference ipPref =
      happy_eyeballs::IpPreference::DualStackPreferV6;
  if (mConnInfo->GetIPv6Disabled()) {
    ipPref = happy_eyeballs::IpPreference::Ipv4Only;
  } else if (ent->PreferenceKnown() && ent->mPreferIPv4) {
    ipPref = happy_eyeballs::IpPreference::DualStackPreferV4;
  }

  // Clamp delays to at least 10ms to avoid excessive connection attempts.
  uint32_t resolutionDelay = std::max(
      10u, StaticPrefs::network_http_happy_eyeballs_resolution_delay());
  uint32_t connectionAttemptDelay = std::max(
      10u, StaticPrefs::network_http_happy_eyeballs_connection_attempt_delay());

  LOG(
      ("CreateHappyEyeballs ipPref=%d resolutionDelay=%u "
       "connectionAttemptDelay=%u",
       static_cast<uint32_t>(ipPref), resolutionDelay, connectionAttemptDelay));

  if (mConnInfo->GetRoutedHost().IsEmpty()) {
    nsTArray<happy_eyeballs::AltSvc> emptyAltSvc;
    return HappyEyeballs::Init(getter_AddRefs(mHappyEyeballs), mHost,
                               static_cast<uint16_t>(mConnInfo->OriginPort()),
                               &emptyAltSvc, ipPref, resolutionDelay,
                               connectionAttemptDelay);
  }

  if (mConnInfo->IsHttp3()) {
    LOG(("HappyEyeballsConnectionAttempt for HTTP/3"));
    nsTArray<happy_eyeballs::AltSvc> altSvcArray;
    happy_eyeballs::AltSvc altsvc{};
    altsvc.http_version = happy_eyeballs::HttpVersion::H3;
    altsvc.port = static_cast<uint16_t>(mConnInfo->RoutedPort());
    altSvcArray.AppendElement(altsvc);
    return HappyEyeballs::Init(getter_AddRefs(mHappyEyeballs), mHost,
                               static_cast<uint16_t>(mConnInfo->OriginPort()),
                               &altSvcArray, ipPref, resolutionDelay,
                               connectionAttemptDelay);
  }

  nsTArray<happy_eyeballs::AltSvc> emptyAltSvc;
  return HappyEyeballs::Init(getter_AddRefs(mHappyEyeballs), mHost,
                             static_cast<uint16_t>(mConnInfo->RoutedPort()),
                             &emptyAltSvc, ipPref, resolutionDelay,
                             connectionAttemptDelay);
}

nsresult HappyEyeballsConnectionAttempt::Init(ConnectionEntry* ent) {
  mEntry = ent;
  nsresult rv = CreateHappyEyeballs(ent);
  if (NS_FAILED(rv)) {
    return rv;
  }
  return ProcessHappyEyeballsOutput();
}

static Result<NetAddr, nsresult> ToNetAddr(
    const happy_eyeballs::IpAddr& aIpAddr, uint16_t aPort) {
  NetAddr addr;
  memset(&addr, 0, sizeof(NetAddr));

  uint16_t port = htons(aPort);

  switch (aIpAddr.tag) {
    case happy_eyeballs::IpAddr::Tag::V4:
      addr.inet.family = AF_INET;
      addr.inet.port = port;
      memcpy(&addr.inet.ip, aIpAddr.v4._0, 4);
      break;
    case happy_eyeballs::IpAddr::Tag::V6:
      addr.inet6.family = AF_INET6;
      addr.inet6.port = port;
      memcpy(&addr.inet6.ip, aIpAddr.v6._0, 16);
      break;
    default:
      return Err(NS_ERROR_UNEXPECTED);
  }

  return addr;
}

nsresult HappyEyeballsConnectionAttempt::ProcessConnectionResult(
    const NetAddr& aAddr, nsresult aStatus, uint64_t aId) {
  LOG(
      ("HappyEyeballsConnectionAttempt::ProcessConnectionResult %p addr=[%s] "
       "id=%" PRIu64 " aStatus=%x",
       this, aAddr.ToString().get(), aId, static_cast<uint32_t>(aStatus)));

  // Keep |this| alive for the whole function: entry->RemoveConnectionAttempt
  // may drop the entry's last ref to us.
  RefPtr<HappyEyeballsConnectionAttempt> self(this);
  RefPtr<ConnectionEntry> entry(mEntry);

  // Remove the real txn from the pending queue and close it.  The queue
  // removal must come first so ProcessPendingQForEntry won't re-dispatch
  // it to a new connection while we are tearing this attempt down.
  auto closeTransaction = [&](nsresult aCloseReason) {
    if (mTransaction) {
      if (nsHttpTransaction* trans = mTransaction->QueryHttpTransaction()) {
        if (entry) {
          entry->RemoveTransFromPendingQ(trans);
        }
      }
      mTransaction->Close(aCloseReason);
    }
  };

  // Close the transaction and abandon all in-flight connection attempts.
  // Used for errors that are server-wide (not address-specific), where
  // trying another resolved address would fail identically.
  auto terminateWithError = [&](nsresult aCloseReason) {
    closeTransaction(aCloseReason);
    Abandon();
    if (entry) {
      entry->RemoveConnectionAttempt(this, false);
    }
  };

  if (PossibleZeroRTTRetryError(aStatus)) {
    if (entry) {
      entry->RemoveConnectionAttempt(this, true);
    }
    closeTransaction(aStatus);
    return NS_OK;
  }

  // H3/QUIC 0-RTT rejection: NS_ERROR_NET_RESET after early data was sent
  // likely means the server rejected the 0-RTT early data (mismatched QUIC
  // transport parameters from a PSK ticket belonging to a different server,
  // H3 protocol error, etc.).  Restart without 0-RTT instead of falling
  // through to a TCP fallback that may also be unavailable.
  if (aStatus == NS_ERROR_NET_RESET && mZeroRttHandle &&
      mZeroRttHandle->AnyStarted()) {
    if (entry) {
      entry->RemoveConnectionAttempt(this, true);
    }
    if (mTransaction) {
      if (nsHttpTransaction* trans = mTransaction->QueryHttpTransaction()) {
        // Set mResumptionAttempted + mDoNotTryEarlyData so that Close()
        // below triggers Restart() with 0-RTT disabled for the retry.
        trans->FinishAdopted0RTT(/* aRestart = */ true);
        // nsHttpTransaction::Restart() strips H3 from the connection info via
        // CloneAsDirectRoute() unless DoNotRemoveAltSvc() is set.  Preserve
        // it so the retry can still use H3 (without 0-RTT this time).
        trans->DoNotRemoveAltSvc();
      }
    }
    closeTransaction(NS_ERROR_NET_RESET);
    return NS_OK;
  }

  // Local Network Access denial: the target IP space is not permitted.
  // No address for this server will succeed; stop all attempts.
  if (aStatus == NS_ERROR_LOCAL_NETWORK_ACCESS_DENIED) {
    terminateWithError(aStatus);
    return NS_OK;
  }

  // NSS / TLS errors are server-state-specific (cert verification, PSK
  // resumption alert, transport-level alert during handshake, ...).
  // Trying another resolved address won't help — they'll all fail the same way.
  if (NS_ERROR_GET_MODULE(aStatus) == NS_ERROR_MODULE_SECURITY) {
    nsresult closeReason = aStatus;
    PRErrorCode prCode = -static_cast<PRErrorCode>(NS_ERROR_GET_CODE(aStatus));
    if (!mozilla::psm::IsNSSErrorCode(prCode)) {
      // NSPR-base error (e.g. PR_END_OF_FILE_ERROR): translate to the
      // network-module nsresult that nsSocketTransport would have produced.
      closeReason = ErrorAccordingToNSPR(prCode);
    }
    terminateWithError(closeReason);
    return NS_OK;
  }

  if (NS_FAILED(aStatus)) {
    mLastConnectionError = aStatus;
  }

  nsresult rv =
      happy_eyeballs_process_connection_result(mHappyEyeballs, aId, aStatus);
  if (NS_FAILED(rv)) {
    LOG(("process_connection_result failed rv=%x", static_cast<uint32_t>(rv)));
  }
  return ProcessHappyEyeballsOutput();
}

nsresult HappyEyeballsConnectionAttempt::ProcessHappyEyeballsOutput() {
  LOG(("HappyEyeballsConnectionAttempt::ProcessHappyEyeballsOutput %p", this));

  if (mDone) {
    return NS_OK;
  }

  nsresult rv = NS_OK;

  while (!mDone) {
    happy_eyeballs::Output event{};
    nsTArray<uint8_t> echConfig;
    nsCString dnsHostname;
    rv = happy_eyeballs_process_output(mHappyEyeballs, &event, &echConfig,
                                       &dnsHostname);
    if (NS_FAILED(rv)) {
      LOG(("process_output failed rv=%x", static_cast<uint32_t>(rv)));
      return rv;
    }

    switch (event.tag) {
      case happy_eyeballs::Output::Tag::SendDnsQuery: {
        LOG(("HappyEyeballsEvent::Tag::SendDnsQuery id=%" PRIu64 " hostname=%s",
             event.send_dns_query.id, dnsHostname.get()));
        DNSLookup(event.send_dns_query.record_type,
                  SetupDnsFlags(event.send_dns_query.record_type),
                  event.send_dns_query.id, dnsHostname);
        break;
      }

      case happy_eyeballs::Output::Tag::Timer: {
        SetupTimer(event.timer.duration_ms);
        return NS_OK;
      }

      case happy_eyeballs::Output::Tag::AttemptConnection: {
        LOG(("HappyEyeballsEvent::Tag::AttemptConnection id=%" PRIu64
             " protocol=%d port=%d ",
             event.attempt_connection.id,
             static_cast<uint32_t>(event.attempt_connection.http_version),
             event.attempt_connection.port));

        if (mFirstConnectionStart.IsNull()) {
          mFirstConnectionStart = TimeStamp::Now();
        }

        auto res = ToNetAddr(event.attempt_connection.addr,
                             event.attempt_connection.port);
        if (res.isErr()) {
          LOG(("Failed to convert to NetAddr"));
          // TODO: how to handle this error?
          MOZ_ASSERT(false, "Failed to convert to NetAddr");
          return res.unwrapErr();
        }

        LOG(("connect to:[%s] ech_config_len=%zu",
             res.unwrap().ToString().get(), echConfig.Length()));
        if (event.attempt_connection.http_version ==
            happy_eyeballs::ConnectionAttemptHttpVersions::H3) {
          EstablishUDPConnection(res.unwrap(), event.attempt_connection.port,
                                 std::move(echConfig),
                                 event.attempt_connection.id);
        } else {
          EstablishTCPConnection(res.unwrap(), event.attempt_connection.port,
                                 std::move(echConfig),
                                 event.attempt_connection.id);
        }
        break;
      }

      case happy_eyeballs::Output::Tag::CancelConnection: {
        LOG(("CancelConnection id=%" PRIu64, event.cancel_connection.id));
        CancelConnection(event.cancel_connection.id);
        break;
      }

      case happy_eyeballs::Output::Tag::Succeeded:
        LOG(("happy_eyeballs::Output::Tag::Succeeded"));
        OnSucceeded();
        return NS_OK;

      case happy_eyeballs::Output::Tag::Failed: {
        LOG(("happy_eyeballs::Output::Tag::Failed reason=%d",
             static_cast<uint32_t>(event.failed.reason)));
        MOZ_ASSERT(!mDone);
        mDone = true;
        RefPtr<HappyEyeballsConnectionAttempt> self(this);
        RefPtr<ConnectionEntry> entry(mEntry);

        if (nsHttpTransaction* trans = mTransaction->QueryHttpTransaction()) {
          if (entry) {
            entry->RemoveTransFromPendingQ(trans);
          }
        }

        CloseHttpTransaction(event.failed.reason);

        Abandon();
        if (entry) {
          entry->RemoveConnectionAttempt(this, false);
        }
        return NS_OK;
      }

      case happy_eyeballs::Output::Tag::None:
        LOG(("happy_eyeballs::Output::Tag::None"));
        // No more events to process
        return NS_OK;
    }
  }

  return NS_OK;
}

Result<nsIDNSService::DNSFlags, nsresult>
HappyEyeballsConnectionAttempt::SetupDnsFlags(
    happy_eyeballs::DnsRecordType aType) {
  LOG(("HappyEyeballsConnectionAttempt::SetupDnsFlags [this=%p aType=%d] ",
       this, static_cast<uint32_t>(aType)));

  nsIDNSService::DNSFlags dnsFlags = nsIDNSService::RESOLVE_DEFAULT_FLAGS;

  if (mCaps & NS_HTTP_REFRESH_DNS) {
    dnsFlags = nsIDNSService::RESOLVE_BYPASS_CACHE;
  }

  switch (aType) {
    case happy_eyeballs::DnsRecordType::Https:
      dnsFlags |= nsIDNSService::GetFlagsFromTRRMode(mConnInfo->GetTRRMode());
      return dnsFlags;
    case happy_eyeballs::DnsRecordType::Aaaa:
      if (mCaps & NS_HTTP_DISABLE_IPV6) {
        return Err(NS_ERROR_NOT_AVAILABLE);
      }
      dnsFlags |= nsIDNSService::RESOLVE_DISABLE_IPV4;
      break;
    case happy_eyeballs::DnsRecordType::A:
      if (mCaps & NS_HTTP_DISABLE_IPV4) {
        return Err(NS_ERROR_NOT_AVAILABLE);
      }
      dnsFlags |= nsIDNSService::RESOLVE_DISABLE_IPV6;
      break;
  }

  // Deal with IP hints later
  /*if (ent->mConnInfo->HasIPHintAddress()) {
    nsresult rv;
    nsCOMPtr<nsIDNSService> dns;
    dns = mozilla::components::DNS::Service(&rv);
    if (NS_FAILED(rv)) {
      return rv;
    }

    // The spec says: "If A and AAAA records for TargetName are locally
    // available, the client SHOULD ignore these hints.", so we check if the DNS
    // record is in cache before setting USE_IP_HINT_ADDRESS.
    nsCOMPtr<nsIDNSRecord> record;
    rv = dns->ResolveNative(
        mPrimaryTransport.mHost, nsIDNSService::RESOLVE_OFFLINE,
        mConnInfo->GetOriginAttributes(), getter_AddRefs(record));
    if (NS_FAILED(rv) || !record) {
      LOG(("Setting Socket to use IP hint address"));
      dnsFlags |= nsIDNSService::RESOLVE_IP_HINT;
    }
  }*/

  dnsFlags |=
      nsIDNSService::GetFlagsFromTRRMode(NS_HTTP_TRR_MODE_FROM_FLAGS(mCaps));

  // When we get here, we are not resolving using any configured proxy likely
  // because of individual proxy setting on the request or because the host is
  // excluded from proxying.  Hence, force resolution despite global proxy-DNS
  // configuration.
  dnsFlags |= nsIDNSService::RESOLVE_IGNORE_SOCKS_DNS;

  NS_ASSERTION(!(dnsFlags & nsIDNSService::RESOLVE_DISABLE_IPV6) ||
                   !(dnsFlags & nsIDNSService::RESOLVE_DISABLE_IPV4),
               "Setting both RESOLVE_DISABLE_IPV6 and RESOLVE_DISABLE_IPV4");

  LOG(("dnsFlags=%u", dnsFlags));
  return dnsFlags;
}

void HappyEyeballsConnectionAttempt::MaybeSendTransportStatus(
    nsresult aStatus, nsITransport* aTransport, int64_t aProgress) {
  if (!mSentTransportStatuses.EnsureInserted(static_cast<uint32_t>(aStatus)) ||
      !mTransaction) {
    return;
  }
  // Skip forwarding to NullTransaction/SpeculativeTransaction. They fire the
  // activity distributor themselves, causing duplicate events. The statuses
  // will be replayed to the real transaction when Claim() replaces it.
  if (mTransaction->IsNullTransaction()) {
    return;
  }
  mTransaction->OnTransportStatus(aTransport, aStatus, aProgress);
}

nsresult HappyEyeballsConnectionAttempt::CheckLNA(
    nsISocketTransport* aTransport) {
  if (!aTransport) {
    return NS_OK;
  }

  NetAddr peerAddr;
  if (NS_FAILED(aTransport->GetPeerAddr(&peerAddr))) {
    return NS_OK;
  }

  return CheckLNAForAddr(peerAddr);
}

nsresult HappyEyeballsConnectionAttempt::CheckLNAForAddr(const NetAddr& aAddr) {
  if (!mConnInfo->FirstHopSSL() || mConnInfo->UsingProxy()) {
    return NS_OK;
  }

  auto addrSpace = aAddr.GetIpAddressSpace();
  // Local targets are always checked pre-TLS. Private targets on HTTPS can
  // be deferred until after the TLS handshake succeeds (see
  // nsHttpConnection::HandshakeDoneInternal) when
  // network.lna.defer_https_check is set.
  // This is in order to prevent unactionable LNA prompts when captive portals
  // temporarily intercept DNS - See bug 2017712.
  bool deferPrivate = addrSpace == nsILoadInfo::IPAddressSpace::Private &&
                      StaticPrefs::network_lna_defer_https_check();
  if (addrSpace != nsILoadInfo::IPAddressSpace::Local &&
      (addrSpace != nsILoadInfo::IPAddressSpace::Private || deferPrivate)) {
    return NS_OK;
  }

  if (mTransaction &&
      !mTransaction->AllowedToConnectToIpAddressSpace(addrSpace)) {
    LOG((
        "HappyEyeballsConnectionAttempt::CheckLNAForAddr %p "
        "blocking connection to %s address space",
        this,
        addrSpace == nsILoadInfo::IPAddressSpace::Local ? "local" : "private"));
    return NS_ERROR_LOCAL_NETWORK_ACCESS_DENIED;
  }

  return NS_OK;
}

void HappyEyeballsConnectionAttempt::DNSLookup(
    happy_eyeballs::DnsRecordType aType,
    Result<nsIDNSService::DNSFlags, nsresult> aFlags, uint64_t aId,
    const nsACString& aHostname) {
  nsCOMPtr<nsIDNSService> dns = aFlags.isOk() ? GetOrInitDNSService() : nullptr;

  if (dns && mDomainLookupStart.IsNull() &&
      (aType == happy_eyeballs::DnsRecordType::A ||
       aType == happy_eyeballs::DnsRecordType::Aaaa)) {
    mDomainLookupStart = TimeStamp::Now();
    MaybeSendTransportStatus(NS_NET_STATUS_RESOLVING_HOST);
  }

  RefPtr<DnsRequestInfo> requestInfo = new DnsRequestInfo(aId, aType);
  nsCOMPtr<nsICancelable> request;
  nsresult rv = NS_ERROR_UNEXPECTED;
  if (dns) {
    nsIDNSService::DNSFlags flags = aFlags.unwrap();
    switch (aType) {
      case happy_eyeballs::DnsRecordType::Https: {
        // Skip the HTTPS RR lookup in two cases:
        //   1. Plain-HTTP origin (!FirstHopSSL). HTTPS RR is an HTTPS-upgrade
        //      mechanism; nsHttpChannel normally does the upgrade before
        //      creating connection, but some edge cases slip through with an
        //      http:// conn info.
        //   2. NS_HTTP_DISALLOW_HTTPS_RR is set.
        // Setting rv = NS_ERROR_NOT_AVAILABLE feeds an empty HTTPS RR to the
        // state machine instead of issuing a query.
        if (!mConnInfo->FirstHopSSL() ||
            (!StaticPrefs::network_dns_force_use_https_rr() &&
             (mCaps & NS_HTTP_DISALLOW_HTTPS_RR))) {
          rv = NS_ERROR_NOT_AVAILABLE;
        } else {
          nsCOMPtr<nsIDNSAdditionalInfo> info;
          if (mConnInfo->OriginPort() != NS_HTTPS_DEFAULT_PORT) {
            dns->NewAdditionalInfo(""_ns, mConnInfo->OriginPort(),
                                   getter_AddRefs(info));
          }
          rv = dns->AsyncResolveNative(
              aHostname, nsIDNSService::RESOLVE_TYPE_HTTPSSVC,
              flags | nsIDNSService::RESOLVE_WANT_RECORD_ON_ERROR, info, this,
              gSocketTransportService, mConnInfo->GetOriginAttributes(),
              getter_AddRefs(request));
        }
        break;
      }
      case happy_eyeballs::DnsRecordType::Aaaa:
        rv = dns->AsyncResolveNative(
            aHostname, nsIDNSService::RESOLVE_TYPE_DEFAULT,
            flags | nsIDNSService::RESOLVE_WANT_RECORD_ON_ERROR, nullptr, this,
            gSocketTransportService, mConnInfo->GetOriginAttributes(),
            getter_AddRefs(request));
        break;
      case happy_eyeballs::DnsRecordType::A:
        rv = dns->AsyncResolveNative(
            aHostname, nsIDNSService::RESOLVE_TYPE_DEFAULT,
            flags | nsIDNSService::RESOLVE_WANT_RECORD_ON_ERROR, nullptr, this,
            gSocketTransportService, mConnInfo->GetOriginAttributes(),
            getter_AddRefs(request));
        break;
    }
  }

  if (NS_SUCCEEDED(rv) && request) {
    requestInfo->SetRequest(request);
    mDnsRequestTable.InsertOrUpdate(request, requestInfo);
    return;
  }

  // Notify the state machine about DNS failure asynchronously.
  NS_DispatchToCurrentThread(
      NS_NewRunnableFunction("HappyEyeballsConnectionAttempt::DNSLookup",
                             [self = RefPtr{this}, rv, aType, aId]() {
                               switch (aType) {
                                 case happy_eyeballs::DnsRecordType::Https:
                                   (void)self->OnHTTPSRecord(nullptr, rv, aId);
                                   break;
                                 case happy_eyeballs::DnsRecordType::Aaaa:
                                   (void)self->OnAAAARecord(nullptr, rv, aId);
                                   break;
                                 case happy_eyeballs::DnsRecordType::A:
                                   (void)self->OnARecord(nullptr, rv, aId);
                                   break;
                               }
                             }));
}

void HappyEyeballsConnectionAttempt::MaybeForward0RTTSecurityInfo(
    ConnectionEstablisher* aEstablisher) {
  if (!mZeroRttHandle || !mZeroRttHandle->AnyStarted()) {
    return;
  }
  RefPtr<HttpConnectionBase> conn = aEstablisher->ResultConn();
  if (!conn) {
    return;
  }
  nsCOMPtr<nsITLSSocketControl> tlsCtrl;
  conn->GetTLSSocketControl(getter_AddRefs(tlsCtrl));
  nsCOMPtr<nsITransportSecurityInfo> secInfo;
  if (tlsCtrl) {
    tlsCtrl->GetSecurityInfo(getter_AddRefs(secInfo));
  }
  if (secInfo && mTransaction) {
    if (nsHttpTransaction* trans = mTransaction->QueryHttpTransaction()) {
      trans->SetSecurityInfo(secInfo);
    }
  }
}

void HappyEyeballsConnectionAttempt::HandleTCPConnectionResult(
    Result<RefPtr<HttpConnectionBase>, nsresult> aResult,
    TCPConnectionEstablisher* aEstablisher, uint64_t aId) {
  RefPtr<TCPConnectionEstablisher> establisher = aEstablisher;
  mConnectionEstablisherTable.Remove(aId);
  NetAddr addr = establisher->Addr();

  LOG(
      ("HappyEyeballsConnectionAttempt::HandleTCPConnectionResult %p addr=[%s] "
       "family=[%d] id=%" PRIu64,
       this, addr.ToString().get(), addr.raw.family, aId));

  if (aResult.isErr()) {
    MaybeForward0RTTSecurityInfo(establisher);
    establisher->Close(aResult.unwrapErr());
    ProcessConnectionResult(addr, aResult.unwrapErr(), aId);
    return;
  }

  if (mDone) {
    establisher->Close(NS_BASE_STREAM_CLOSED);
    ProcessConnectionResult(addr, NS_BASE_STREAM_CLOSED, aId);
    return;
  }

  mOutputConn = aResult.unwrap();
  mOutputTrans = establisher->Transaction();
  mOutputConnId = aId;
  mAddrFamily = addr.raw.family;
  // The ownership of connection is moved to HappyEyeballsConnectionAttempt now.
  establisher->ClearResultConnection();

  ProcessConnectionResult(addr, NS_OK, aId);
}

void HappyEyeballsConnectionAttempt::AdoptWinner(
    HappyEyeballsTransaction* aWinner) {
  MOZ_ASSERT(OnSocketThread());
  if (!aWinner || aWinner->IsAdopted()) {
    return;
  }

  nsHttpTransaction* realTxn = RealHttpTransaction();
  if (!realTxn) {
    LOG(
        ("HappyEyeballsConnectionAttempt::AdoptWinner %p no real txn; "
         "closing winner=%p",
         this, aWinner));
    aWinner->Close(NS_ERROR_ABORT);
    return;
  }

  // The trans must have been removed from the pending queue by
  // LockInRealTxnFromPendingQueue at Do0RTT time.
#ifdef DEBUG
  {
    RefPtr<ConnectionEntry> entry(mEntry);
    if (entry) {
      RefPtr<PendingTransactionInfo> pendingInfo =
          gHttpHandler->ConnMgr()->FindTransactionHelper(
              /*removeWhenFound*/ false, entry, realTxn);
      MOZ_ASSERT(!pendingInfo,
                 "real txn must have been removed from the pending queue "
                 "by LockInRealTxnFromPendingQueue");
    }
  }
#endif
  aWinner->Adopt(realTxn);
}

bool HappyEyeballsConnectionAttempt::LockInRealTxnFromPendingQueue() {
  nsHttpTransaction* realTxn = RealHttpTransaction();
  if (!realTxn) {
    return false;
  }
  RefPtr<ConnectionEntry> entry(mEntry);
  if (!entry) {
    return false;
  }
  RefPtr<PendingTransactionInfo> pendingInfo =
      gHttpHandler->ConnMgr()->FindTransactionHelper(
          /*removeWhenFound*/ true, entry, realTxn);
  LOG(
      ("HappyEyeballsConnectionAttempt::LockInRealTxnFromPendingQueue "
       "%p realTxn=%p removed=%d",
       this, realTxn, !!pendingInfo));
  return !!pendingInfo;
}

already_AddRefed<HappyEyeballsTransaction>
HappyEyeballsConnectionAttempt::CreateAttemptTransaction(
    nsHttpConnectionInfo* aInfo) {
  nsCOMPtr<nsIInterfaceRequestor> callbacks;
  if (mTransaction) {
    mTransaction->GetSecurityCallbacks(getter_AddRefs(callbacks));
  }
  if (!mZeroRttHandle) {
    mZeroRttHandle = new ZeroRttHandle(this);
  }
  RefPtr<HappyEyeballsTransaction> trans = new HappyEyeballsTransaction(
      aInfo, callbacks, mCaps,
      [self = RefPtr{this}](nsITransport* t, nsresult s, int64_t p) {
        self->MaybeSendTransportStatus(s, t, p);
      },
      mZeroRttHandle);
  return trans.forget();
}

nsresult HappyEyeballsConnectionAttempt::EstablishTCPConnection(
    NetAddr aAddr, uint16_t aPort, nsTArray<uint8_t>&& aEchConfig,
    uint64_t aId) {
  // Run the LNA check on the resolved address before opening any socket
  // so we don't leak SNI / TCP SYNs to LNA-denied peers.
  if (nsresult lna = CheckLNAForAddr(aAddr); NS_FAILED(lna)) {
    ProcessConnectionResult(aAddr, lna, aId);
    return NS_OK;
  }

  // TODO: we always use happy_eyeballs::ConnectionAttemptHttpVersions::H2OrH1
  // for now. Do we really want to race H2 and H1?
  RefPtr<nsHttpConnectionInfo> info = mConnInfo->CloneAndAdoptPortAndAlpn(
      aPort, happy_eyeballs::ConnectionAttemptHttpVersions::H2OrH1);
  if (!aEchConfig.IsEmpty()) {
    info->SetEchConfig(
        nsCString((const char*)aEchConfig.Elements(), aEchConfig.Length()));
    NotifyConnectionActivity(info, NS_HTTP_ACTIVITY_SUBTYPE_ECH_SET);
  }
  NotifyConnectionActivity(info, NS_HTTP_ACTIVITY_SUBTYPE_CONNECTION_CREATED);
  RefPtr<TCPConnectionEstablisher> establisher = new TCPConnectionEstablisher(
      info, aAddr, mCaps, mSpeculative, mAllow1918);
  establisher->SetDnsMetadata(mDnsMetadata);
  nsCOMPtr<nsIInterfaceRequestor> callbacks;
  mTransaction->GetSecurityCallbacks(getter_AddRefs(callbacks));
  establisher->SetSecurityCallbacks(callbacks);
  establisher->SetTransportStatusCallback(
      [self = RefPtr{this}](nsITransport* trans, nsresult status,
                            int64_t progress) {
        self->MaybeSendTransportStatus(status, trans, progress);
      });
  establisher->SetLnaCheckCallback(
      [self = RefPtr{this}](nsISocketTransport* aTransport) -> nsresult {
        return self->CheckLNA(aTransport);
      });

  RefPtr<HappyEyeballsTransaction> attempt = CreateAttemptTransaction(info);
  establisher->SetTransaction(attempt);

  auto callback = [self = RefPtr{this}, establisher,
                   aId](Result<RefPtr<HttpConnectionBase>, nsresult> aResult) {
    self->HandleTCPConnectionResult(std::move(aResult), establisher, aId);
  };

  if (establisher->Start(std::move(callback))) {
    mConnectionEstablisherTable.InsertOrUpdate(aId, std::move(establisher));
  } else {
    ProcessConnectionResult(aAddr, NS_ERROR_FAILURE, aId);
  }

  return NS_OK;
}

nsresult HappyEyeballsConnectionAttempt::EstablishUDPConnection(
    NetAddr aAddr, uint16_t aPort, nsTArray<uint8_t>&& aEchConfig,
    uint64_t aId) {
  // Same pre-connect LNA check as EstablishTCPConnection.
  if (nsresult lna = CheckLNAForAddr(aAddr); NS_FAILED(lna)) {
    ProcessConnectionResult(aAddr, lna, aId);
    return NS_OK;
  }

  RefPtr<nsHttpConnectionInfo> info = mConnInfo->CloneAndAdoptPortAndAlpn(
      aPort, happy_eyeballs::ConnectionAttemptHttpVersions::H3);
  if (!aEchConfig.IsEmpty()) {
    info->SetEchConfig(
        nsCString((const char*)aEchConfig.Elements(), aEchConfig.Length()));
    NotifyConnectionActivity(info, NS_HTTP_ACTIVITY_SUBTYPE_ECH_SET);
  }
  NotifyConnectionActivity(info, NS_HTTP_ACTIVITY_SUBTYPE_CONNECTION_CREATED);
  RefPtr<UDPConnectionEstablisher> establisher =
      new UDPConnectionEstablisher(info, aAddr, mCaps);
  establisher->SetDnsMetadata(mDnsMetadata);
  establisher->SetTransportStatusCallback(
      [self = RefPtr{this}](nsITransport* trans, nsresult status,
                            int64_t progress) {
        self->MaybeSendTransportStatus(status, trans, progress);
      });

  RefPtr<HappyEyeballsTransaction> attempt = CreateAttemptTransaction(info);
  establisher->SetTransaction(attempt);

  auto callback = [self = RefPtr{this}, establisher,
                   aId](Result<RefPtr<HttpConnectionBase>, nsresult> aResult) {
    self->HandleUDPConnectionResult(std::move(aResult), establisher, aId);
  };

  if (establisher->Start(std::move(callback))) {
    mConnectionEstablisherTable.InsertOrUpdate(aId, std::move(establisher));
  } else {
    ProcessConnectionResult(aAddr, NS_ERROR_FAILURE, aId);
  }

  return NS_OK;
}

void HappyEyeballsConnectionAttempt::HandleUDPConnectionResult(
    Result<RefPtr<HttpConnectionBase>, nsresult> aResult,
    UDPConnectionEstablisher* aEstablisher, uint64_t aId) {
  RefPtr<UDPConnectionEstablisher> establisher = aEstablisher;
  mConnectionEstablisherTable.Remove(aId);
  NetAddr addr = establisher->Addr();

  LOG(
      ("HappyEyeballsConnectionAttempt::HandleUDPConnectionResult %p addr=[%s] "
       "family=[%d] id=%" PRIu64,
       this, addr.ToString().get(), addr.raw.family, aId));

  if (aResult.isErr()) {
    MaybeForward0RTTSecurityInfo(establisher);
    establisher->Close(aResult.unwrapErr());
    ProcessConnectionResult(addr, aResult.unwrapErr(), aId);
    return;
  }

  if (mDone) {
    establisher->Close(NS_BASE_STREAM_CLOSED);
    ProcessConnectionResult(addr, NS_BASE_STREAM_CLOSED, aId);
    return;
  }

  mOutputConn = aResult.unwrap();
  mOutputTrans = establisher->Transaction();
  mOutputConnId = aId;
  mAddrFamily = addr.raw.family;
  // The ownership of connection is moved to HappyEyeballsConnectionAttempt now.
  establisher->ClearResultConnection();

  ProcessConnectionResult(addr, NS_OK, aId);
}

void HappyEyeballsConnectionAttempt::CancelConnection(uint64_t aId) {
  LOG(("HappyEyeballsConnectionAttempt::CancelConnection id=%" PRIu64, aId));

  RefPtr<ConnectionEstablisher> conn = mConnectionEstablisherTable.Get(aId);
  if (conn) {
    conn->Close(NS_ERROR_ABORT);
    mConnectionEstablisherTable.Remove(aId);
  } else {
    LOG(("No matching connection found for id=%" PRIu64, aId));
  }
}

void HappyEyeballsConnectionAttempt::CloseHttpTransaction(
    happy_eyeballs::FailureReason aReason) {
  LOG(("HappyEyeballsConnectionAttempt::CloseHttpTransaction %p reason=%d",
       this, static_cast<uint32_t>(aReason)));

  nsresult reason = NS_ERROR_ABORT;
  switch (aReason) {
    case happy_eyeballs::FailureReason::DnsResolution:
      reason = NS_FAILED(mLastDnsError) ? mLastDnsError : NS_ERROR_UNKNOWN_HOST;
      break;
    case happy_eyeballs::FailureReason::Connection:
      reason = (NS_FAILED(mLastConnectionError) &&
                mLastConnectionError != NS_ERROR_NET_RESET)
                   ? mLastConnectionError
                   : NS_ERROR_CONNECTION_REFUSED;
      break;
    default:
      MOZ_ASSERT_UNREACHABLE("Unknown FailureReason");
      break;
  }
  if (mTransaction) {
    mTransaction->Close(reason);
  }
}

void HappyEyeballsConnectionAttempt::Abandon() {
  LOG(("HappyEyeballsConnectionAttempt::Abandon %p", this));

  mDone = true;

  // Cancel all DNS requests
  for (auto iter = mDnsRequestTable.Iter(); !iter.Done(); iter.Next()) {
    iter.Data()->Cancel();
  }
  mDnsRequestTable.Clear();

  // Collect all connection establishers into a temporary array to avoid
  // iterator invalidation when Close() triggers callbacks that modify the table
  nsTArray<RefPtr<ConnectionEstablisher>> establishers;
  for (auto iter = mConnectionEstablisherTable.Iter(); !iter.Done();
       iter.Next()) {
    establishers.AppendElement(iter.Data());
  }
  mConnectionEstablisherTable.Clear();

  // Now close all the connections without worrying about iterator invalidation
  for (auto& conn : establishers) {
    conn->Close(NS_ERROR_ABORT);
  }

  if (mTimer) {
    mTimer->Cancel();
  }
  mTimer = nullptr;

  if (mZeroRttHandle) {
    mZeroRttHandle->Cleanup();
  }

  mEntry = nullptr;
}

void HappyEyeballsConnectionAttempt::ProcessTCPConn(
    nsHttpConnection* aConn, ConnectionEntry* aEntry,
    bool aTransactionAlreadyOnConn) {
  RefPtr<ConnectionEntry> entry(mEntry);
  if (!entry) {
    return;
  }

  RefPtr<nsHttpConnection> connTCP = aConn;
  LOG(("Got connTCP:%p transactionAlreadyOnConn=%d", connTCP.get(),
       aTransactionAlreadyOnConn));

  entry->InsertIntoActiveConns(connTCP);

  bool isHttp2 = connTCP->UsingSpdy();

  if (!aTransactionAlreadyOnConn) {
    RefPtr<PendingTransactionInfo> pendingTransInfo =
        gHttpHandler->ConnMgr()->FindTransactionHelper(true, entry,
                                                       mTransaction);
    if (pendingTransInfo) {
      MOZ_ASSERT(!mSpeculative, "Speculative Half Open found mTransaction");
      nsresult rv = gHttpHandler->ConnMgr()->DispatchTransaction(
          entry, pendingTransInfo->Transaction(), connTCP);
      if (NS_FAILED(rv)) {
        mTransaction->Close(rv);
      }
    } else if (!isHttp2) {
      // After about 1 second allow for the possibility of restarting a
      // transaction due to server close. Keep at sub 1 second as that is the
      // minimum granularity we can expect a server to be timing out with.
      connTCP->SetIsReusedAfter(950);

      LOG(
          ("ProcessTCPConn no transaction match "
           "returning conn %p to pool\n",
           connTCP.get()));
      gHttpHandler->ConnMgr()->OnMsgReclaimConnection(connTCP);
    }
  }

  connTCP->SetIsRacing(false);
  if (isHttp2) {
    gHttpHandler->ConnMgr()->ReportSpdyConnection(
        connTCP, true, (mCaps & NS_HTTP_DISALLOW_HTTP3));
  } else {
    gHttpHandler->ConnMgr()->ReportSpdyConnection(connTCP, false, false);
  }
}

void HappyEyeballsConnectionAttempt::ProcessUDPConn(
    HttpConnectionUDP* aConn, ConnectionEntry* aEntry,
    bool aTransactionAlreadyOnConn) {
  RefPtr<ConnectionEntry> entry(mEntry);
  if (!entry) {
    return;
  }

  LOG(("Got connUDP:%p transactionAlreadyOnConn=%d", aConn,
       aTransactionAlreadyOnConn));

  if (!mFirstConnectionStart.IsNull()) {
    TimeStamp now = TimeStamp::Now();
    aConn->SetConnectBootstrapTimings(mFirstConnectionStart, TimeStamp(),
                                      mFirstConnectionStart, now);

    if (aTransactionAlreadyOnConn) {
      // Activate already ran before timings were set on the connection,
      // so transfer them directly to the transaction.
      nsHttpTransaction* trans = mTransaction->QueryHttpTransaction();
      if (trans) {
        TimingStruct timings;
        timings.domainLookupStart = mDomainLookupStart;
        timings.domainLookupEnd = mDomainLookupEnd;
        timings.connectStart = mFirstConnectionStart;
        timings.secureConnectionStart = mFirstConnectionStart;
        timings.connectEnd = now;
        trans->BootstrapTimings(timings);
      }
    }
  }

  entry->InsertIntoActiveConns(aConn);

  if (!aTransactionAlreadyOnConn) {
    RefPtr<PendingTransactionInfo> pendingTransInfo =
        gHttpHandler->ConnMgr()->FindTransactionHelper(true, entry,
                                                       mTransaction);
    nsresult rv = NS_OK;
    if (pendingTransInfo) {
      MOZ_ASSERT(!mSpeculative, "Speculative Half Open found mTransaction");
      rv = gHttpHandler->ConnMgr()->DispatchTransaction(
          entry, pendingTransInfo->Transaction(), aConn);
      if (NS_FAILED(rv)) {
        mTransaction->Close(rv);
      }
    } else {
      nsHttpTransaction* trans = mTransaction->QueryHttpTransaction();
      if (trans && trans->IsDone()) {
        LOG(("ProcessUDPConn transaction already done, not activating"));
      } else {
        rv = aConn->Activate(mTransaction, mCaps, 0);
      }
    }
  }

  aConn->SetIsRacing(false);
  gHttpHandler->ConnMgr()->ReportHttp3Connection(aConn, entry);
}

void HappyEyeballsConnectionAttempt::OnSucceeded() {
  LOG(("HappyEyeballsConnectionAttempt::OnSucceeded %p", this));

  MOZ_ASSERT(!mDone);
  mDone = true;

  RefPtr<HappyEyeballsConnectionAttempt> self(this);
  RefPtr<ConnectionEntry> entry(mEntry);
  MOZ_ASSERT(entry);

  entry->RecordIPFamilyPreference(mAddrFamily);

  if (!mDomainLookupStart.IsNull()) {
    mOutputConn->SetDnsBootstrapTimings(mDomainLookupStart, mDomainLookupEnd);
  }

  // Transfer the winning attempt's handshake timings to the real
  // transaction before dispatch. We preserve transactionPending
  // explicitly — BootstrapTimings does a full struct overwrite, and
  // DispatchTransaction will read the pending time to record wait-time
  // metrics.
  if (mOutputTrans && mTransaction) {
    if (nsHttpTransaction* realTxn = mTransaction->QueryHttpTransaction()) {
      TimingStruct timings = mOutputTrans->Timings();
      timings.transactionPending = realTxn->GetPendingTime();
      realTxn->BootstrapTimings(timings);
    }
  }
  mOutputTrans = nullptr;

  // Fallback for the case where ShouldDisqualify didn't fire. A racer that did
  // 0-RTT advanced the real txn's request stream; its flags are half-set and
  // the winner isn't a 0-RTT racer. Tell the real txn the 0-RTT attempt was
  // effectively rejected — FinishAdopted0RTT(restart=true) rewinds the stream
  // to 0 and marks mDoNotTryEarlyData / mEarlyDataWasAvailable so the real txn
  // re-sends a fresh request on the winning conn.
  bool restartedFallback0Rtt = false;
  if (mZeroRttHandle && mZeroRttHandle->AnyStarted() &&
      (!mZeroRttHandle->Winner() || !mZeroRttHandle->Winner()->IsAdopted())) {
    if (nsHttpTransaction* realTxn = mTransaction->QueryHttpTransaction()) {
      realTxn->FinishAdopted0RTT(/*aRestart=*/true);
      // LockInRealTxnFromPendingQueue removed the real txn from the pending
      // queue when 0-RTT was entered. Re-queue it so the conn manager can
      // dispatch it on the winning conn or open a new connection. Guard
      // against double-queuing (which would trip CheckTransInPendingQueue's
      // assertion in AddTransaction) by checking first.
      RefPtr<PendingTransactionInfo> existing;
      if (entry) {
        existing = gHttpHandler->ConnMgr()->FindTransactionHelper(
            /*removeWhenFound=*/false, entry, realTxn);
      }
      if (!existing) {
        gHttpHandler->ConnMgr()->AddTransaction(realTxn, realTxn->Priority());
      }
      restartedFallback0Rtt = true;
    }
  }

  // Adopted: real txn is on the conn and already out of the pending
  // queue. Skip ProcessTCPConn's pending-queue branch — on H1 it
  // would otherwise reclaim the live conn to the idle pool; on H2/H3
  // it's a no-op.
  // Also skip FindTransactionHelper for the fallback restart case: the
  // re-inserted trans will be dispatched by ReportSpdyConnection →
  // ProcessPendingQ once the conn is in the active pool.
  bool alreadyOnConn = (mZeroRttHandle && mZeroRttHandle->Winner() &&
                        mZeroRttHandle->Winner()->IsAdopted()) ||
                       restartedFallback0Rtt;
  RefPtr<nsHttpConnection> connTCP = do_QueryObject(mOutputConn);
  if (connTCP) {
    // If the original request had an alt-svc route but a direct TCP
    // connection won, remove the Alt-Used header since we're not using
    // the alt-svc route.
    if (!mConnInfo->GetRoutedHost().IsEmpty()) {
      if (nsHttpTransaction* trans = mTransaction->QueryHttpTransaction()) {
        trans->RemoveAltSvcUsedHeader();
      }
    }

    ProcessTCPConn(connTCP, entry, alreadyOnConn);
  } else {
    RefPtr<HttpConnectionUDP> connUDP = do_QueryObject(mOutputConn);
    ProcessUDPConn(connUDP, entry, alreadyOnConn);
  }

  mOutputConn = nullptr;

  // Make sure everything is released.
  Abandon();

  entry->RemoveConnectionAttempt(this, false);
}

double HappyEyeballsConnectionAttempt::Duration(TimeStamp epoch) {
  if (mFirstConnectionStart.IsNull()) {
    return 0;
  }
  return (epoch - mFirstConnectionStart).ToMilliseconds();
}

void HappyEyeballsConnectionAttempt::OnTimeout() {
  LOG(("HappyEyeballsConnectionAttempt::OnTimeout %p" PRIx32, this));
  if (mTransaction) {
    mTransaction->Close(NS_ERROR_NET_TIMEOUT);
  }
  Abandon();
}

void HappyEyeballsConnectionAttempt::PrintDiagnostics(nsCString& log) {}

uint32_t HappyEyeballsConnectionAttempt::UnconnectedUDPConnsLength() const {
  uint32_t len = 0;
  for (auto iter = mConnectionEstablisherTable.ConstIter(); !iter.Done();
       iter.Next()) {
    if (iter.Data()->IsUDP()) {
      len++;
    }
  }

  if (len == 0) {
    if (mConnInfo->IsHttp3()) {
      return 1;
    }
  }
  return len;
}

bool HappyEyeballsConnectionAttempt::Claim(nsHttpTransaction* newTransaction) {
  if (mSpeculative) {
    mSpeculative = false;
    mAllow1918 = true;
    for (auto iter = mConnectionEstablisherTable.Iter(); !iter.Done();
         iter.Next()) {
      RefPtr<ConnectionEstablisher> conn = iter.Data();
      conn->ResetSpeculativeFlags();
    }
  }

  if (mFreeToUse) {
    mFreeToUse = false;
    if (newTransaction && mTransaction &&
        mTransaction->QueryNullTransaction()) {
      LOG(
          ("HappyEyeballsConnectionAttempt::Claim %p replacing null "
           "transaction %p with %p",
           this, mTransaction.get(), newTransaction));
      mTransaction->Close(NS_ERROR_ABORT);
      mTransaction = newTransaction;
      // Replay transport statuses that were sent while the null transaction
      // was in place, in the correct order.
      static const nsresult kStatusOrder[] = {
          NS_NET_STATUS_RESOLVING_HOST, NS_NET_STATUS_RESOLVED_HOST,
          NS_NET_STATUS_CONNECTING_TO, NS_NET_STATUS_CONNECTED_TO};
      for (nsresult status : kStatusOrder) {
        if (mSentTransportStatuses.Contains(static_cast<uint32_t>(status))) {
          mTransaction->OnTransportStatus(nullptr, status, 0);
        }
      }
    }
    return true;
  }

  return false;
}

NS_IMETHODIMP
HappyEyeballsConnectionAttempt::OnLookupComplete(nsICancelable* request,
                                                 nsIDNSRecord* rec,
                                                 nsresult status) {
  LOG(("HappyEyeballsConnectionAttempt::OnLookupComplete"));

  if (!request) {
    return NS_OK;
  }

  RefPtr<DnsRequestInfo> info = mDnsRequestTable.Get(request);
  if (!info) {
    LOG(("OnLookupComplete: Unknown DNS request"));
    return NS_OK;
  }

  uint64_t id = info->Id();
  happy_eyeballs::DnsRecordType type = info->Type();
  mDnsRequestTable.Remove(request);

  switch (type) {
    case happy_eyeballs::DnsRecordType::A:
      return OnARecord(rec, status, id);
    case happy_eyeballs::DnsRecordType::Aaaa:
      return OnAAAARecord(rec, status, id);
    case happy_eyeballs::DnsRecordType::Https:
      return OnHTTPSRecord(rec, status, id);
  }

  return NS_OK;
}

nsresult HappyEyeballsConnectionAttempt::OnARecord(nsIDNSRecord* aRecord,
                                                   nsresult status,
                                                   uint64_t aId) {
  LOG(("HappyEyeballsConnectionAttempt::OnARecord: this=%p status %" PRIx32
       " id=%" PRIu64,
       this, static_cast<uint32_t>(status), aId));
  if (NS_SUCCEEDED(status)) {
    mDomainLookupEnd = TimeStamp::Now();
    MaybeSendTransportStatus(NS_NET_STATUS_RESOLVED_HOST);
  } else if (NS_FAILED(status)) {
    mLastDnsError = status;
  }

  // TODO: use NS_ERROR_UNKNOWN_PROXY_HOST if stasus is failed and proxy is used

  nsCOMPtr<nsIDNSAddrRecord> addrRecord = do_QueryInterface(aRecord);
  if (addrRecord) {
    mDnsMetadata.Fill(addrRecord);
    if (mTransaction && !mTRRInfoForwarded) {
      mTransaction->SetTRRInfo(mDnsMetadata.mEffectiveTRRMode,
                               mDnsMetadata.mTrrSkipReason);
      mTRRInfoForwarded = true;
    }
  }

  nsresult rv;
  if (NS_FAILED(status) || !addrRecord) {
    nsTArray<NetAddr> emptyArray;
    rv =
        happy_eyeballs_process_dns_response_a(mHappyEyeballs, aId, &emptyArray);
    if (NS_FAILED(rv)) {
      return rv;
    }
    return ProcessHappyEyeballsOutput();
  }

  nsTArray<NetAddr> addresses;
  addrRecord->GetAddresses(addresses);

  // Filter to only IPv4 addresses
  nsTArray<NetAddr> ipv4Addresses;
  for (const auto& addr : addresses) {
    if (addr.raw.family == AF_INET) {
      LOG(("Addr=[%s]", addr.ToString().get()));
      ipv4Addresses.AppendElement(addr);
    }
  }

  rv = happy_eyeballs_process_dns_response_a(mHappyEyeballs, aId,
                                             &ipv4Addresses);
  if (NS_FAILED(rv)) {
    return rv;
  }
  return ProcessHappyEyeballsOutput();
}

nsresult HappyEyeballsConnectionAttempt::OnAAAARecord(nsIDNSRecord* aRecord,
                                                      nsresult status,
                                                      uint64_t aId) {
  LOG(("HappyEyeballsConnectionAttempt::OnAAAARecord: this=%p status %" PRIx32
       " id=%" PRIu64,
       this, static_cast<uint32_t>(status), aId));
  if (NS_SUCCEEDED(status)) {
    mDomainLookupEnd = TimeStamp::Now();
    MaybeSendTransportStatus(NS_NET_STATUS_RESOLVED_HOST);
  } else if (NS_FAILED(status)) {
    mLastDnsError = status;
  }

  // TODO: use NS_ERROR_UNKNOWN_PROXY_HOST if stasus is failed and proxy is used

  nsCOMPtr<nsIDNSAddrRecord> addrRecord = do_QueryInterface(aRecord);

  nsresult rv;
  if (NS_FAILED(status) || !addrRecord) {
    nsTArray<NetAddr> emptyArray;
    rv = happy_eyeballs_process_dns_response_aaaa(mHappyEyeballs, aId,
                                                  &emptyArray);
    if (NS_FAILED(rv)) {
      return rv;
    }
    return ProcessHappyEyeballsOutput();
  }

  nsTArray<NetAddr> addresses;
  addrRecord->GetAddresses(addresses);

  // Filter to only IPv6 addresses
  nsTArray<NetAddr> ipv6Addresses;
  for (const auto& addr : addresses) {
    if (addr.raw.family == AF_INET6) {
      LOG(("Addr=[%s]", addr.ToString().get()));
      ipv6Addresses.AppendElement(addr);
    }
  }

  rv = happy_eyeballs_process_dns_response_aaaa(mHappyEyeballs, aId,
                                                &ipv6Addresses);
  if (NS_FAILED(rv)) {
    return rv;
  }
  return ProcessHappyEyeballsOutput();
}

// Helper function to convert ALPN string to HttpVersion enum
static Maybe<happy_eyeballs::HttpVersion> AlpnStringToProtocol(
    const nsACString& aAlpn) {
  if (aAlpn.EqualsLiteral("h3")) {
    return Some(happy_eyeballs::HttpVersion::H3);
  }
  if (aAlpn.EqualsLiteral("h2")) {
    return Some(happy_eyeballs::HttpVersion::H2);
  }
  if (aAlpn.EqualsLiteral("http/1.1")) {
    return Some(happy_eyeballs::HttpVersion::H1);
  }
  // Unknown ALPN protocol
  return Nothing();
}

nsresult HappyEyeballsConnectionAttempt::OnHTTPSRecord(nsIDNSRecord* aRecord,
                                                       nsresult status,
                                                       uint64_t aId) {
  LOG(("HappyEyeballsConnectionAttempt::OnHTTPSRecord %p status=%x id=%" PRIu64,
       this, static_cast<uint32_t>(status), aId));
  nsCOMPtr<nsIDNSHTTPSSVCRecord> httpsRecord = do_QueryInterface(aRecord);
  if (!httpsRecord || NS_FAILED(status)) {
    nsTArray<happy_eyeballs::ServiceInfo> emptyArray;
    (void)happy_eyeballs_process_dns_response_https(mHappyEyeballs, aId,
                                                    &emptyArray);
    return ProcessHappyEyeballsOutput();
  }

  bool httpsIsTRR = false;
  (void)httpsRecord->IsTRR(&httpsIsTRR);
  if (httpsIsTRR) {
    mDnsMetadata.mIsTRR = true;
    mDnsMetadata.mEffectiveTRRMode =
        static_cast<nsIRequest::TRRMode>(StaticPrefs::network_trr_mode());
    mDnsMetadata.mTrrSkipReason = nsITRRSkipReason::TRR_OK;
    if (mTransaction && !mTRRInfoForwarded) {
      mTransaction->SetTRRInfo(mDnsMetadata.mEffectiveTRRMode,
                               mDnsMetadata.mTrrSkipReason);
      mTRRInfoForwarded = true;
    }
  }

  nsTArray<RefPtr<nsISVCBRecord>> svcbRecords;
  // TODO: Handle aNoHttp2, aNoHttp3, and aCname.
  (void)httpsRecord->GetRecords(svcbRecords);
  if (svcbRecords.IsEmpty()) {
    nsTArray<happy_eyeballs::ServiceInfo> emptyArray;
    (void)happy_eyeballs_process_dns_response_https(mHappyEyeballs, aId,
                                                    &emptyArray);
    return ProcessHappyEyeballsOutput();
  }

  nsTArray<happy_eyeballs::ServiceInfo> serviceInfos;

  for (const auto& svcbRecord : svcbRecords) {
    happy_eyeballs::ServiceInfo svcInfo;
    (void)svcbRecord->GetPriority(&svcInfo.priority);
    (void)svcbRecord->GetName(svcInfo.target_name);
    svcInfo.port = svcbRecord->GetPort().valueOr(0);

    nsTArray<RefPtr<nsISVCParam>> values;
    (void)svcbRecord->GetValues(values);

    nsTArray<nsCString> alpn;
    nsTArray<RefPtr<nsINetAddr>> ipv4Hint;
    nsTArray<RefPtr<nsINetAddr>> ipv6Hint;

    for (const auto& value : values) {
      uint16_t type;
      (void)value->GetType(&type);
      switch (type) {
        case SvcParamKeyAlpn: {
          nsCOMPtr<nsISVCParamAlpn> alpnParam = do_QueryInterface(value);
          (void)alpnParam->GetAlpn(alpn);
          break;
        }
        case SvcParamKeyNoDefaultAlpn:
          break;
        case SvcParamKeyIpv4Hint: {
          nsCOMPtr<nsISVCParamIPv4Hint> ipv4Param = do_QueryInterface(value);
          (void)ipv4Param->GetIpv4Hint(ipv4Hint);
          break;
        }
        case SvcParamKeyIpv6Hint: {
          nsCOMPtr<nsISVCParamIPv6Hint> ipv6Param = do_QueryInterface(value);
          (void)ipv6Param->GetIpv6Hint(ipv6Hint);
          break;
        }
        case SvcParamKeyEchConfig: {
          nsCOMPtr<nsISVCParamEchConfig> echConfigParam =
              do_QueryInterface(value);
          nsCString echConfig;
          (void)echConfigParam->GetEchconfig(echConfig);
          svcInfo.ech_config.AppendElements(
              reinterpret_cast<const uint8_t*>(echConfig.BeginReading()),
              echConfig.Length());
          break;
        }
        default:
          break;
      }
    }

    for (const auto& alpnStr : alpn) {
      auto protocol = AlpnStringToProtocol(alpnStr);
      if (protocol) {
        svcInfo.alpn_http_versions.AppendElement(protocol.ref());
      }
    }

    for (const auto& addr : ipv4Hint) {
      NetAddr netAddr;
      addr->GetNetAddr(&netAddr);
      svcInfo.ipv4_hints.AppendElement(netAddr);
    }

    for (const auto& addr : ipv6Hint) {
      NetAddr netAddr;
      addr->GetNetAddr(&netAddr);
      svcInfo.ipv6_hints.AppendElement(netAddr);
    }

    serviceInfos.AppendElement(std::move(svcInfo));
  }

  (void)happy_eyeballs_process_dns_response_https(mHappyEyeballs, aId,
                                                  &serviceInfos);
  return ProcessHappyEyeballsOutput();
}

NS_IMETHODIMP  // method for nsITimerCallback
HappyEyeballsConnectionAttempt::Notify(nsITimer* timer) {
  return ProcessHappyEyeballsOutput();
}

NS_IMETHODIMP  // method for nsINamed
HappyEyeballsConnectionAttempt::GetName(nsACString& aName) {
  aName.AssignLiteral("HappyEyeballsConnectionAttempt");
  return NS_OK;
}

void HappyEyeballsConnectionAttempt::SetupTimer(uint64_t aTimeout) {
  if (!aTimeout) {
    MOZ_ASSERT(false, "aTimeout should not be 0");
    return;
  }

  LOG(("HappyEyeballsConnectionAttempt::SetupTimer to %" PRIu64 "ms [this=%p].",
       aTimeout, this));

  if (!mTimer) {
    // This can only fail on OOM and we'd crash.
    mTimer = NS_NewTimer();
  }

  DebugOnly<nsresult> rv =
      mTimer->InitWithCallback(this, aTimeout, nsITimer::TYPE_ONE_SHOT);
  // There is no meaningful error handling we can do here. But an error here
  // should only be possible if the timer thread did already shut down.
  MOZ_ASSERT(NS_SUCCEEDED(rv));
}

}  // namespace mozilla::net
