/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// HttpLog.h should generally be included first
#include "HttpLog.h"

#include "ConnectionEstablisher.h"
#include "mozilla/Components.h"
#include "nsSocketTransportService2.h"
#include "nsHttpConnectionMgr.h"
#include "nsHttpHandler.h"
#include "nsIDNSRecord.h"
#include "HttpConnectionUDP.h"

// Log on level :5, instead of default :4.
#undef LOG
#define LOG(args) LOG5(args)
#undef LOG_ENABLED
#define LOG_ENABLED() LOG5_ENABLED()

namespace mozilla::net {

// -------------------- SingleDNSAddrRecord --------------------

class SingleDNSAddrRecord final : public nsIDNSAddrRecord {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIDNSRECORD
  NS_DECL_NSIDNSADDRRECORD

  SingleDNSAddrRecord(NetAddr aAddr, nsIDNSAddrRecord* aRecord)
      : mAddress(aAddr) {
    LOG(("SingleDNSAddrRecord ctor:%p", this));
    if (aRecord) {
      aRecord->GetCanonicalName(mCanonicalName);
      aRecord->IsTRR(&mIsTRR);
      aRecord->ResolvedInSocketProcess(&mResolvedInSocketProcess);
      aRecord->GetTrrFetchDuration(&mTrrFetchDuration);
      aRecord->GetTrrFetchDurationNetworkOnly(&mTrrFetchDurationNetworkOnly);
      aRecord->GetEffectiveTRRMode(&mEffectiveTRRMode);
      aRecord->GetTrrSkipReason(&mTrrSkipReason);
      aRecord->GetTtl(&mTTL);
      aRecord->GetLastUpdate(&mLastUpdate);
    }
  }

 private:
  ~SingleDNSAddrRecord() { LOG(("SingleDNSAddrRecord dtor:%p", this)); }

  nsCString mCanonicalName;
  NetAddr mAddress;

  bool mIsTRR = false;
  bool mResolvedInSocketProcess = false;
  double mTrrFetchDuration = 0.0;
  double mTrrFetchDurationNetworkOnly = 0.0;
  nsIRequest::TRRMode mEffectiveTRRMode = nsIRequest::TRR_DEFAULT_MODE;
  nsITRRSkipReason::value mTrrSkipReason = nsITRRSkipReason::TRR_UNSET;
  uint32_t mTTL = 60;
  mozilla::TimeStamp mLastUpdate = TimeStamp::Now();
  bool mDone = false;
};

NS_IMPL_ISUPPORTS(SingleDNSAddrRecord, nsIDNSRecord, nsIDNSAddrRecord)

NS_IMETHODIMP
SingleDNSAddrRecord::GetCanonicalName(nsACString& aResult) {
  aResult.Assign(mCanonicalName);
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::IsTRR(bool* aRetval) {
  *aRetval = mIsTRR;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::ResolvedInSocketProcess(bool* aRetval) {
  *aRetval = mResolvedInSocketProcess;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetTrrFetchDuration(double* aTime) {
  *aTime = mTrrFetchDuration;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetTrrFetchDurationNetworkOnly(double* aTime) {
  *aTime = mTrrFetchDurationNetworkOnly;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetScriptableNextAddr(uint16_t aPort,
                                           nsINetAddr** aResult) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetNextAddrAsString(nsACString& aResult) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
SingleDNSAddrRecord::HasMore(bool* aResult) { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP
SingleDNSAddrRecord::Rewind() { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP
SingleDNSAddrRecord::ReportUnusable(uint16_t aPort) {
  // TODO: should we block this address?
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetEffectiveTRRMode(nsIRequest::TRRMode* aMode) {
  *aMode = mEffectiveTRRMode;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetTrrSkipReason(nsITRRSkipReason::value* aReason) {
  *aReason = mTrrSkipReason;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetTtl(uint32_t* aTtl) {
  *aTtl = mTTL;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetLastUpdate(mozilla::TimeStamp* aLastUpdate) {
  *aLastUpdate = mLastUpdate;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetNextAddr(uint16_t aPort, NetAddr* aAddr) {
  if (mDone) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  *aAddr = mAddress;
  mDone = true;
  return NS_OK;
}

NS_IMETHODIMP
SingleDNSAddrRecord::GetAddresses(nsTArray<NetAddr>& aAddressArray) {
  MOZ_ASSERT_UNREACHABLE("unexpected to be called");
  return NS_ERROR_NOT_IMPLEMENTED;
}

// -------------------- ConnectionEstablisher --------------------

NS_IMPL_ISUPPORTS(ConnectionEstablisher, nsITransportEventSink,
                  nsIInterfaceRequestor)

ConnectionEstablisher::ConnectionEstablisher(nsHttpConnectionInfo* aConnInfo,
                                             const NetAddr& aAddr,
                                             uint32_t aCaps)
    : mConnInfo(aConnInfo), mAddr(aAddr), mCaps(aCaps) {
  LOG(("ConnectionEstablisher ctor:%p", this));
}

ConnectionEstablisher::~ConnectionEstablisher() {
  LOG(("ConnectionEstablisher dtor:%p", this));
  MaybeSetConnectingDone();
}

void ConnectionEstablisher::SetConnecting() {
  MOZ_ASSERT(!mWaitingForConnect);
  mWaitingForConnect = true;
  gHttpHandler->ConnMgr()->StartedConnect();
}

void ConnectionEstablisher::MaybeSetConnectingDone() {
  if (mWaitingForConnect) {
    mWaitingForConnect = false;
    gHttpHandler->ConnMgr()->RecvdConnect();
  }
}

void ConnectionEstablisher::ClearResultConnection() { mResultConn = nullptr; }

nsresult ConnectionEstablisher::ActivateConnectionWithTransaction(
    RefPtr<HttpConnectionBase> aConn,
    std::function<void(nsresult)> aOnActivated) {
  LOG(("ConnectionEstablisher::ActivateConnectionWithTransaction %p conn=%p",
       this, aConn.get()));

  aConn->SetIsRacing(true);

  mHasConnected = true;
  mResultConn = aConn;

  auto callback = [self = RefPtr{this},
                   onActivated = std::move(aOnActivated)](nsresult aResult) {
    NS_DispatchToCurrentThread(NS_NewRunnableFunction(
        "ConnectionEstablisher::ActivateCallback",
        [self, aResult, onActivated = std::move(onActivated)]() {
          if (NS_FAILED(aResult)) {
            self->Finish(aResult);
            return;
          }

          onActivated(NS_OK);
        }));
  };

  RefPtr<SpeculativeTransaction> trans =
      new SpeculativeTransaction(mConnInfo, this, mCaps, std::move(callback));

  LOG(("speculative transaction %p will be used to finish handshake on conn %p",
       trans.get(), aConn.get()));

  mHandle = new ConnectionHandle(aConn);
  trans->SetConnection(mHandle);

  nsresult rv = aConn->Activate(trans, mCaps, 0);
  if (NS_FAILED(rv)) {
    Finish(rv);
    return rv;
  }

  return NS_OK;
}

void ConnectionEstablisher::FinishInternal(nsresult aResult) {
  LOG(("ConnectionEstablisher::FinishInternal %p result=%x", this,
       static_cast<uint32_t>(aResult)));

  if (mFinished) {
    return;
  }
  mFinished = true;

  MaybeSetConnectingDone();
  mTransportStatusCallback = nullptr;
  mAddrRecord = nullptr;

  if (mCallback) {
    auto cb = std::move(mCallback);
    mCallback = nullptr;
    if (mHandle && mHandle->Conn() && !mHandle->Conn()->UsingSpdy() &&
        !mHandle->Conn()->UsingHttp3()) {
      mHandle->Reset();
    }

    if (NS_SUCCEEDED(aResult) && mResultConn) {
      if (!mConnectStart.IsNull()) {
        mResultConn->SetConnectBootstrapTimings(mConnectStart, mTcpConnectEnd);
      }
      cb(std::move(mResultConn));
    } else {
      cb(Err(aResult));
    }
  }
}

NS_IMETHODIMP
ConnectionEstablisher::GetInterface(const nsIID& iid, void** result) {
  if (mSecurityCallbacks) {
    return mSecurityCallbacks->GetInterface(iid, result);
  }
  return NS_ERROR_NO_INTERFACE;
}

NS_IMETHODIMP
ConnectionEstablisher::OnTransportStatus(nsITransport* trans, nsresult status,
                                         int64_t progress,
                                         int64_t progressMax) {
  if (status == NS_NET_STATUS_CONNECTING_TO) {
    mConnectStart = TimeStamp::Now();
  } else if (status == NS_NET_STATUS_CONNECTED_TO) {
    mConnectedOK = true;
    mTcpConnectEnd = TimeStamp::Now();
  }

  if (mTransportStatusCallback) {
    mTransportStatusCallback(trans, status, progress);
  }

  return NS_OK;
}

NS_IMPL_ISUPPORTS_INHERITED(TCPConnectionEstablisher, ConnectionEstablisher,
                            nsIOutputStreamCallback)

TCPConnectionEstablisher::TCPConnectionEstablisher(
    nsHttpConnectionInfo* aConnInfo, NetAddr aAddr, uint32_t aCaps,
    bool aSpeculative, bool aAllow1918)
    : ConnectionEstablisher(aConnInfo, aAddr, aCaps),
      mSpeculative(aSpeculative),
      mAllow1918(aAllow1918) {}

TCPConnectionEstablisher::~TCPConnectionEstablisher() = default;

bool TCPConnectionEstablisher::Start(DoneCallback&& aCallback) {
  mCallback = std::move(aCallback);
  mAddrRecord = new SingleDNSAddrRecord(mAddr, nullptr);

  nsresult rv = CreateAndConfigureSocketTransport();
  if (NS_FAILED(rv)) {
    return false;
  }

  return true;
}

void TCPConnectionEstablisher::ResetSpeculativeFlags() {
  uint32_t flags = 0;
  if (!mSocketTransport ||
      NS_FAILED(mSocketTransport->GetConnectionFlags(&flags))) {
    return;
  }

  flags &= ~nsISocketTransport::DISABLE_RFC1918;
  flags &= ~nsISocketTransport::IS_SPECULATIVE_CONNECTION;
  mSocketTransport->SetConnectionFlags(flags);
}

void TCPConnectionEstablisher::Close(nsresult aReason) {
  LOG(("TCPConnectionEstablisher::Close %p aReason=%x", this,
       static_cast<uint32_t>(aReason)));

  mHandle = nullptr;
  if (mResultConn) {
    LOG(("TCPConnectionEstablisher::Close closing connection %p",
         mResultConn.get()));
    mResultConn->Close(aReason);
    mResultConn = nullptr;
  }

  if (mSocketTransport) {
    mSocketTransport->SetEventSink(nullptr, nullptr);
    mSocketTransport->SetSecurityCallbacks(nullptr);
    mSocketTransport = nullptr;
  }

  // Tell output stream (and backup) to forget the half open socket.
  if (mStreamOut) {
    mStreamOut->AsyncWait(nullptr, 0, 0, nullptr);
    mStreamOut = nullptr;
  }

  // Lose references to input stream (and backup).
  if (mStreamIn) {
    mStreamIn->AsyncWait(nullptr, 0, 0, nullptr);
    mStreamIn = nullptr;
  }

  // Release the DNS address record to avoid leaking SingleDNSAddrRecord
  mAddrRecord = nullptr;

  mConnectedOK = false;
  Finish(aReason);
}

nsresult TCPConnectionEstablisher::CreateAndConfigureSocketTransport() {
  nsresult rv = NS_OK;
  nsTArray<nsCString> socketTypes;
  if (mConnInfo->FirstHopSSL()) {
    socketTypes.AppendElement("ssl"_ns);
  } else {
    const nsCString& defaultType = gHttpHandler->DefaultSocketType();
    if (!defaultType.IsVoid()) {
      socketTypes.AppendElement(defaultType);
    }
  }

  nsCOMPtr<nsISocketTransport> socketTransport;
  nsCOMPtr<nsISocketTransportService> sts =
      components::SocketTransport::Service();
  if (!sts) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  LOG(
      ("TCPConnectionEstablisher::CreateAndConfigureSocketTransport [this=%p "
       "info=%s] "
       "setup routed transport to origin %s:%d via %s:%d\n",
       this, mConnInfo->HashKey().get(), mConnInfo->Origin(),
       mConnInfo->OriginPort(), mConnInfo->RoutedHost(),
       mConnInfo->RoutedPort()));

  nsCOMPtr<nsIRoutedSocketTransportService> routedSTS(do_QueryInterface(sts));
  if (routedSTS) {
    rv = routedSTS->CreateRoutedTransport(
        socketTypes, mConnInfo->GetOrigin(), mConnInfo->OriginPort(),
        mConnInfo->GetRoutedHost(), mConnInfo->RoutedPort(),
        mConnInfo->ProxyInfo(), mAddrRecord, getter_AddRefs(socketTransport));
  } else {
    if (!mConnInfo->GetRoutedHost().IsEmpty()) {
      // There is a route requested, but the legacy nsISocketTransportService
      // can't handle it.
      // Origin should be reachable on origin host name, so this should
      // not be a problem - but log it.
      LOG(
          ("%p using legacy nsISocketTransportService "
           "means explicit route %s:%d will be ignored.\n",
           this, mConnInfo->RoutedHost(), mConnInfo->RoutedPort()));
    }

    rv = sts->CreateTransport(socketTypes, mConnInfo->GetOrigin(),
                              mConnInfo->OriginPort(), mConnInfo->ProxyInfo(),
                              mAddrRecord, getter_AddRefs(socketTransport));
  }

  if (NS_FAILED(rv)) {
    return rv;
  }

  uint32_t tmpFlags = 0;
  if (mCaps & NS_HTTP_REFRESH_DNS) {
    tmpFlags = nsISocketTransport::BYPASS_CACHE;
  }

  tmpFlags |= nsISocketTransport::GetFlagsFromTRRMode(
      NS_HTTP_TRR_MODE_FROM_FLAGS(mCaps));

  if (mCaps & NS_HTTP_LOAD_ANONYMOUS) {
    tmpFlags |= nsISocketTransport::ANONYMOUS_CONNECT;
  }

  // When we are making a speculative connection we do not propagate all flags
  // in mCaps, so we need to query nsHttpConnectionInfo directly as well.
  if ((mCaps & NS_HTTP_LOAD_ANONYMOUS_CONNECT_ALLOW_CLIENT_CERT) ||
      mConnInfo->GetAnonymousAllowClientCert()) {
    tmpFlags |= nsISocketTransport::ANONYMOUS_CONNECT_ALLOW_CLIENT_CERT;
  }

  if (mConnInfo->GetPrivate()) {
    tmpFlags |= nsISocketTransport::NO_PERMANENT_STORAGE;
  }

  (void)socketTransport->SetIsPrivate(mConnInfo->GetPrivate());

  if (mCaps & NS_HTTP_DISALLOW_ECH) {
    tmpFlags |= nsISocketTransport::DONT_TRY_ECH;
  }

  if (mCaps & NS_HTTP_IS_RETRY) {
    tmpFlags |= nsISocketTransport::IS_RETRY;
  }

  if (((mCaps & NS_HTTP_BE_CONSERVATIVE) || mConnInfo->GetBeConservative()) &&
      gHttpHandler->ConnMgr()->BeConservativeIfProxied(
          mConnInfo->ProxyInfo())) {
    LOG(("Setting Socket to BE_CONSERVATIVE"));
    tmpFlags |= nsISocketTransport::BE_CONSERVATIVE;
  }

  // IP hint addresses from HTTPS records are handled by the Happy Eyeballs
  // state machine.

  if (!mAllow1918) {
    tmpFlags |= nsISocketTransport::DISABLE_RFC1918;
  }

  if (mSpeculative) {
    tmpFlags |= nsISocketTransport::IS_SPECULATIVE_CONNECTION;
  }

  socketTransport->SetConnectionFlags(tmpFlags);
  socketTransport->SetTlsFlags(mConnInfo->GetTlsFlags());
  socketTransport->SetOriginAttributes(mConnInfo->GetOriginAttributes());

  socketTransport->SetQoSBits(gHttpHandler->GetQoSBits());

  rv = socketTransport->SetEventSink(this, nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = socketTransport->SetSecurityCallbacks(this);
  NS_ENSURE_SUCCESS(rv, rv);

  if (nsHttpHandler::EchConfigEnabled() &&
      !mConnInfo->GetEchConfig().IsEmpty()) {
    LOG(("Setting ECH"));
    rv = socketTransport->SetEchConfig(mConnInfo->GetEchConfig());
    NS_ENSURE_SUCCESS(rv, rv);
  }

  mSynStarted = TimeStamp::Now();

  nsCOMPtr<nsIOutputStream> sout;
  rv = socketTransport->OpenOutputStream(nsITransport::OPEN_UNBUFFERED, 0, 0,
                                         getter_AddRefs(sout));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIInputStream> sin;
  rv = socketTransport->OpenInputStream(nsITransport::OPEN_UNBUFFERED, 0, 0,
                                        getter_AddRefs(sin));
  NS_ENSURE_SUCCESS(rv, rv);

  mSocketTransport = socketTransport.forget();
  mStreamIn = do_QueryInterface(sin);
  mStreamOut = do_QueryInterface(sout);

  rv = mStreamOut->AsyncWait(this, 0, 0, nullptr);
  if (NS_SUCCEEDED(rv)) {
    SetConnecting();
  }
  return rv;
}

void TCPConnectionEstablisher::Finish(nsresult aResult) {
  // Release TCP-specific resources first
  mStreamOut = nullptr;
  mStreamIn = nullptr;
  mSocketTransport = nullptr;

  FinishInternal(aResult);
}

NS_IMETHODIMP
TCPConnectionEstablisher::OnOutputStreamReady(nsIAsyncOutputStream* aOut) {
  MOZ_DIAGNOSTIC_ASSERT(mStreamOut == aOut, "stream mismatch");
  LOG(("TCPConnectionEstablisher::OnOutputStreamReady %p mFinished=%d", this,
       mFinished));

  if (mFinished) {
    return NS_OK;
  }

  // Create nsHttpConnection when the output stream is ready.
  RefPtr<nsHttpConnection> conn = new nsHttpConnection();
  conn->SetTransactionCaps(mCaps);
  // TODO:
  // 1. BootstrapTimings
  // 2. SetTransactionCaps
  // 3. SetSecurityCallbacks
  // 4. RecordIPFamilyPreference

  nsresult rv = conn->Init(
      mConnInfo, gHttpHandler->ConnMgr()->mMaxRequestDelay, mSocketTransport,
      mStreamIn, mStreamOut, mConnectedOK, NS_OK, this,
      PR_MillisecondsToInterval(static_cast<uint32_t>(
          (TimeStamp::Now() - mSynStarted).ToMilliseconds())),
      mCaps & NS_HTTP_ALLOW_SPDY_WITHOUT_KEEPALIVE);

  if (NS_FAILED(rv)) {
    Finish(rv);
    return NS_OK;
  }

  // Clear TCP-specific resources before activation
  mSocketTransport = nullptr;
  mStreamOut = nullptr;
  mStreamIn = nullptr;

  rv = ActivateConnectionWithTransaction(
      conn, [self = RefPtr{this}](nsresult aResult) { self->Finish(aResult); });

  return rv;
}

// -------------------- UDPConnectionEstablisher --------------------

UDPConnectionEstablisher::UDPConnectionEstablisher(
    nsHttpConnectionInfo* aConnInfo, NetAddr aAddr, uint32_t aCaps)
    : ConnectionEstablisher(aConnInfo, aAddr, aCaps) {
  LOG(("UDPConnectionEstablisher ctor:%p", this));
}

UDPConnectionEstablisher::~UDPConnectionEstablisher() {
  LOG(("UDPConnectionEstablisher dtor:%p", this));
}

bool UDPConnectionEstablisher::Start(DoneCallback&& aCallback) {
  LOG(("UDPConnectionEstablisher::Start %p", this));
  mCallback = std::move(aCallback);
  mAddrRecord = new SingleDNSAddrRecord(mAddr, nullptr);

  nsresult rv = CreateAndConfigureUDPConn();
  if (NS_FAILED(rv)) {
    Finish(rv);
    return false;
  }

  return true;
}

void UDPConnectionEstablisher::Close(nsresult aReason) {
  LOG(("UDPConnectionEstablisher::Close %p aReason=%x", this,
       static_cast<uint32_t>(aReason)));

  mHandle = nullptr;
  if (mResultConn) {
    LOG(("UDPConnectionEstablisher::Close closing connection %p",
         mResultConn.get()));
    // TODO: for some cases we might want to exclude HTTP/3.
    mResultConn->SetDontExclude();
    mResultConn->Close(aReason);
    mResultConn = nullptr;
  }

  // Release the DNS address record to avoid leaking SingleDNSAddrRecord
  mAddrRecord = nullptr;

  Finish(aReason);
}

nsresult UDPConnectionEstablisher::CreateAndConfigureUDPConn() {
  LOG(
      ("UDPConnectionEstablisher::CreateAndConfigureUDPConn [this=%p "
       "info=%s]",
       this, mConnInfo->HashKey().get()));

  RefPtr<HttpConnectionUDP> connUDP = new HttpConnectionUDP();
  connUDP->SetTransactionCaps(mCaps);

  nsresult rv = connUDP->Init(mConnInfo, mAddrRecord, NS_OK, this, mCaps);
  if (NS_FAILED(rv)) {
    return rv;
  }

  SetConnecting();

  rv = ActivateConnectionWithTransaction(
      connUDP,
      [self = RefPtr{this}](nsresult aResult) { self->Finish(aResult); });

  return rv;
}

void UDPConnectionEstablisher::Finish(nsresult aResult) {
  LOG(("UDPConnectionEstablisher::Finish %p result=%x", this,
       static_cast<uint32_t>(aResult)));

  FinishInternal(aResult);
}

}  // namespace mozilla::net
