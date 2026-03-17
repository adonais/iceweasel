/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// HttpLog.h should generally be included first
#include "HttpLog.h"

#include "HappyEyeballsConnectionAttempt.h"
#include "ConnectionEntry.h"
#include "HttpConnectionUDP.h"
#include "nsIDNSAdditionalInfo.h"
#include "nsDNSService2.h"
#include "nsHttpConnectionMgr.h"
#include "nsHttpHandler.h"
#include "nsQueryObject.h"
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

NS_IMPL_ADDREF_INHERITED(HappyEyeballsConnectionAttempt, ConnectionAttempt)
NS_IMPL_RELEASE_INHERITED(HappyEyeballsConnectionAttempt, ConnectionAttempt)

NS_INTERFACE_MAP_BEGIN(HappyEyeballsConnectionAttempt)
  NS_INTERFACE_MAP_ENTRY(nsISupportsWeakReference)
  NS_INTERFACE_MAP_ENTRY(nsITimerCallback)
  NS_INTERFACE_MAP_ENTRY(nsINamed)
  NS_INTERFACE_MAP_ENTRY(nsIDNSListener)
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
}

HappyEyeballsConnectionAttempt::~HappyEyeballsConnectionAttempt() {
  LOG(("HappyEyeballsConnectionAttempt dtor %p", this));
}

nsresult HappyEyeballsConnectionAttempt::CreateHappyEyeballs(
    ConnectionEntry* ent) {
  happy_eyeballs::IpPreference ipPref =
      happy_eyeballs::IpPreference::DualStackPreferV6;
  if (ent->PreferenceKnown() && ent->mPreferIPv4) {
    ipPref = happy_eyeballs::IpPreference::DualStackPreferV4;
  }

  if (mConnInfo->GetRoutedHost().IsEmpty()) {
    nsTArray<happy_eyeballs::AltSvc> emptyAltSvc;
    return HappyEyeballs::Init(getter_AddRefs(mHappyEyeballs), mHost,
                               static_cast<uint16_t>(mConnInfo->OriginPort()),
                               &emptyAltSvc, ipPref);
  }

  if (mConnInfo->IsHttp3()) {
    LOG(("HappyEyeballsConnectionAttempt for HTTP/3"));
    nsTArray<happy_eyeballs::AltSvc> altSvcArray;
    happy_eyeballs::AltSvc altsvc{};
    altsvc.http_version = happy_eyeballs::HttpVersion::H3;
    altSvcArray.AppendElement(altsvc);
    return HappyEyeballs::Init(getter_AddRefs(mHappyEyeballs), mHost,
                               static_cast<uint16_t>(mConnInfo->RoutedPort()),
                               &altSvcArray, ipPref);
  }

  nsTArray<happy_eyeballs::AltSvc> emptyAltSvc;
  return HappyEyeballs::Init(getter_AddRefs(mHappyEyeballs), mHost,
                             static_cast<uint16_t>(mConnInfo->RoutedPort()),
                             &emptyAltSvc, ipPref);
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
       "id=%" PRIu64,
       this, aAddr.ToString().get(), aId));

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
    rv = happy_eyeballs_process_output(mHappyEyeballs, &event, &echConfig);
    if (NS_FAILED(rv)) {
      LOG(("process_output failed rv=%x", static_cast<uint32_t>(rv)));
      return rv;
    }

    switch (event.tag) {
      case happy_eyeballs::Output::Tag::SendDnsQuery: {
        LOG(("HappyEyeballsEvent::Tag::SendDnsQuery id=%" PRIu64,
             event.send_dns_query.id));
        auto dnsFlags = SetupDnsFlags(event.send_dns_query.record_type);
        if (dnsFlags.isOk()) {
          rv = DNSLookup(event.send_dns_query.record_type, dnsFlags.unwrap(),
                         event.send_dns_query.id);
          if (NS_FAILED(rv)) {
            Abandon();
            return rv;
          }
        }
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
        LOG(("happy_eyeballs::Output::Tag::Failed"));
        RefPtr<HappyEyeballsConnectionAttempt> self(this);
        RefPtr<ConnectionEntry> entry(mEntry);

        if (nsHttpTransaction* trans = mTransaction->QueryHttpTransaction()) {
          if (entry) {
            entry->RemoveTransFromPendingQ(trans);
          }
        }
        mTransaction->Close(NS_ERROR_CONNECTION_REFUSED);

        Abandon();
        if (entry) {
          entry->RemoveConnectionAttempt(this, false);
        }
        return NS_ERROR_CONNECTION_REFUSED;
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
  mTransaction->OnTransportStatus(aTransport, aStatus, aProgress);
}

nsresult HappyEyeballsConnectionAttempt::DNSLookup(
    happy_eyeballs::DnsRecordType aType, nsIDNSService::DNSFlags aFlags,
    uint64_t aId) {
  nsCOMPtr<nsIDNSService> dns = GetOrInitDNSService();
  if (!dns) {
    return NS_ERROR_UNEXPECTED;
  }

  if (mDomainLookupStart.IsNull() &&
      (aType == happy_eyeballs::DnsRecordType::A ||
       aType == happy_eyeballs::DnsRecordType::Aaaa)) {
    mDomainLookupStart = TimeStamp::Now();
    MaybeSendTransportStatus(NS_NET_STATUS_RESOLVING_HOST);
  }

  RefPtr<DnsRequestInfo> requestInfo = new DnsRequestInfo(aId, aType);
  nsCOMPtr<nsICancelable> request;
  nsresult rv = NS_OK;
  switch (aType) {
    case happy_eyeballs::DnsRecordType::Https: {
      if (mCaps & NS_HTTP_DISALLOW_HTTPS_RR) {
        rv = NS_ERROR_NOT_AVAILABLE;
      } else {
        nsCOMPtr<nsIDNSAdditionalInfo> info;
        if (mConnInfo->OriginPort() != NS_HTTPS_DEFAULT_PORT) {
          dns->NewAdditionalInfo(""_ns, mConnInfo->OriginPort(),
                                 getter_AddRefs(info));
        }
        rv = dns->AsyncResolveNative(
            mHost, nsIDNSService::RESOLVE_TYPE_HTTPSSVC,
            aFlags | nsIDNSService::RESOLVE_WANT_RECORD_ON_ERROR, info, this,
            gSocketTransportService, mConnInfo->GetOriginAttributes(),
            getter_AddRefs(request));
      }
      break;
    }
    case happy_eyeballs::DnsRecordType::Aaaa:
      rv = dns->AsyncResolveNative(
          mHost, nsIDNSService::RESOLVE_TYPE_DEFAULT,
          aFlags | nsIDNSService::RESOLVE_WANT_RECORD_ON_ERROR, nullptr, this,
          gSocketTransportService, mConnInfo->GetOriginAttributes(),
          getter_AddRefs(request));
      break;
    case happy_eyeballs::DnsRecordType::A:
      rv = dns->AsyncResolveNative(
          mHost, nsIDNSService::RESOLVE_TYPE_DEFAULT,
          aFlags | nsIDNSService::RESOLVE_WANT_RECORD_ON_ERROR, nullptr, this,
          gSocketTransportService, mConnInfo->GetOriginAttributes(),
          getter_AddRefs(request));
      break;
  }

  if (NS_SUCCEEDED(rv) && request) {
    requestInfo->SetRequest(request);
    mDnsRequestTable.InsertOrUpdate(request, requestInfo);
  } else {
    // Notify the DNS response synchronously on failure.
    NS_DispatchToCurrentThread(NS_NewRunnableFunction(
        "HappyEyeballsConnectionAttempt::DNSLookup",
        [self = RefPtr{this}, aType, aId]() {
          switch (aType) {
            case happy_eyeballs::DnsRecordType::Https:
              (void)self->OnHTTPSRecord(nullptr, NS_ERROR_UNKNOWN_HOST, aId);
              break;
            case happy_eyeballs::DnsRecordType::Aaaa:
              (void)self->OnAAAARecord(nullptr, NS_ERROR_UNKNOWN_HOST, aId);
              break;
            case happy_eyeballs::DnsRecordType::A:
              (void)self->OnARecord(nullptr, NS_ERROR_UNKNOWN_HOST, aId);
              break;
          }
        }));
  }

  return NS_OK;
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
  mAddrFamily = addr.raw.family;
  // The ownership of connection is moved to HappyEyeballsConnectionAttempt now.
  establisher->ClearResultConnection();

  ProcessConnectionResult(addr, NS_OK, aId);
}

nsresult HappyEyeballsConnectionAttempt::EstablishTCPConnection(
    NetAddr aAddr, uint16_t aPort, nsTArray<uint8_t>&& aEchConfig,
    uint64_t aId) {
  // TODO: we always use happy_eyeballs::ConnectionAttemptHttpVersions::H2OrH1
  // for now. Do we really want to race H2 and H1?
  RefPtr<nsHttpConnectionInfo> info = mConnInfo->CloneAndAdoptPortAndAlpn(
      aPort, happy_eyeballs::ConnectionAttemptHttpVersions::H2OrH1);
  if (!aEchConfig.IsEmpty()) {
    info->SetEchConfig(
        nsCString((const char*)aEchConfig.Elements(), aEchConfig.Length()));
  }
  RefPtr<TCPConnectionEstablisher> establisher = new TCPConnectionEstablisher(
      info, aAddr, mCaps, mSpeculative, mAllow1918);
  nsCOMPtr<nsIInterfaceRequestor> callbacks;
  mTransaction->GetSecurityCallbacks(getter_AddRefs(callbacks));
  establisher->SetSecurityCallbacks(callbacks);
  establisher->SetTransportStatusCallback(
      [self = RefPtr{this}](nsITransport* trans, nsresult status,
                            int64_t progress) {
        self->MaybeSendTransportStatus(status, trans, progress);
      });
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
  RefPtr<nsHttpConnectionInfo> info = mConnInfo->CloneAndAdoptPortAndAlpn(
      aPort, happy_eyeballs::ConnectionAttemptHttpVersions::H3);
  if (!aEchConfig.IsEmpty()) {
    info->SetEchConfig(
        nsCString((const char*)aEchConfig.Elements(), aEchConfig.Length()));
  }
  RefPtr<UDPConnectionEstablisher> establisher =
      new UDPConnectionEstablisher(info, aAddr, mCaps);
  establisher->SetTransportStatusCallback(
      [self = RefPtr{this}](nsITransport* trans, nsresult status,
                            int64_t progress) {
        self->MaybeSendTransportStatus(status, trans, progress);
      });
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

  mEntry = nullptr;
}

void HappyEyeballsConnectionAttempt::ProcessTCPConn(nsHttpConnection* aConn,
                                                    ConnectionEntry* aEntry) {
  RefPtr<ConnectionEntry> entry(mEntry);
  if (!entry) {
    return;
  }

  RefPtr<nsHttpConnection> connTCP = aConn;
  LOG(("Got connTCP:%p", connTCP.get()));

  entry->InsertIntoActiveConns(connTCP);

  RefPtr<PendingTransactionInfo> pendingTransInfo =
      gHttpHandler->ConnMgr()->FindTransactionHelper(true, entry, mTransaction);
  bool isHttp2 = connTCP->UsingSpdy();
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

  connTCP->SetIsRacing(false);
  if (isHttp2) {
    gHttpHandler->ConnMgr()->ReportSpdyConnection(
        connTCP, true, (mCaps & NS_HTTP_DISALLOW_HTTP3));
  } else {
    gHttpHandler->ConnMgr()->ReportSpdyConnection(connTCP, false, false);
  }
}

void HappyEyeballsConnectionAttempt::ProcessUDPConn(HttpConnectionUDP* aConn,
                                                    ConnectionEntry* aEntry) {
  RefPtr<ConnectionEntry> entry(mEntry);
  if (!entry) {
    return;
  }

  LOG(("Got connUDP:%p", aConn));

  entry->InsertIntoActiveConns(aConn);

  RefPtr<PendingTransactionInfo> pendingTransInfo =
      gHttpHandler->ConnMgr()->FindTransactionHelper(true, entry, mTransaction);
  nsresult rv = NS_OK;
  if (pendingTransInfo) {
    MOZ_ASSERT(!mSpeculative, "Speculative Half Open found mTransaction");
    rv = gHttpHandler->ConnMgr()->DispatchTransaction(
        entry, pendingTransInfo->Transaction(), aConn);
    if (NS_FAILED(rv)) {
      mTransaction->Close(rv);
    }
  } else {
    rv = aConn->Activate(mTransaction, mCaps, 0);
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

  RefPtr<nsHttpConnection> connTCP = do_QueryObject(mOutputConn);
  if (connTCP) {
    ProcessTCPConn(connTCP, entry);
  } else {
    RefPtr<HttpConnectionUDP> connUDP = do_QueryObject(mOutputConn);
    ProcessUDPConn(connUDP, entry);
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
  }

  // TODO: use NS_ERROR_UNKNOWN_PROXY_HOST if stasus is failed and proxy is used

  nsCOMPtr<nsIDNSAddrRecord> addrRecord = do_QueryInterface(aRecord);
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

  LOG3(("HappyEyeballsConnectionAttempt::SetupTimer to %" PRIu64
        "ms [this=%p].",
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
