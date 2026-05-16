/* vim:set ts=4 sw=2 sts=2 et cin: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// HttpLog.h should generally be included first
#include "HttpLog.h"

#include "HappyEyeballsTransaction.h"
#include "nsHttpHandler.h"
#include "nsHttpTransaction.h"

// Log on level :5, instead of default :4.
#undef LOG
#define LOG(args) LOG5(args)
#undef LOG_ENABLED
#define LOG_ENABLED() LOG5_ENABLED()

namespace mozilla::net {

NS_IMPL_ISUPPORTS(HappyEyeballsTransaction, nsISupportsWeakReference)

HappyEyeballsTransaction::HappyEyeballsTransaction(nsHttpTransaction* aTrans)
    : mTransaction(aTrans) {
  MOZ_ASSERT(mTransaction);
  LOG(("HappyEyeballsTransaction ctor %p trans=%p", this, mTransaction.get()));
}

HappyEyeballsTransaction::~HappyEyeballsTransaction() {
  LOG(("HappyEyeballsTransaction dtor %p", this));
}

void HappyEyeballsTransaction::SetConnection(nsAHttpConnection* conn) {
  if (mTransaction) {
    mTransaction->SetConnection(conn);
  }
}

nsAHttpConnection* HappyEyeballsTransaction::Connection() {
  return mTransaction ? mTransaction->Connection() : nullptr;
}

void HappyEyeballsTransaction::GetSecurityCallbacks(
    nsIInterfaceRequestor** cb) {
  if (mTransaction) {
    mTransaction->GetSecurityCallbacks(cb);
  } else {
    *cb = nullptr;
  }
}

void HappyEyeballsTransaction::OnTransportStatus(nsITransport* transport,
                                                 nsresult status,
                                                 int64_t progress) {
  if (mTransaction) {
    mTransaction->OnTransportStatus(transport, status, progress);
  }
}

bool HappyEyeballsTransaction::IsDone() {
  return mTransaction ? mTransaction->IsDone() : true;
}

nsresult HappyEyeballsTransaction::Status() {
  return mTransaction ? mTransaction->Status() : NS_ERROR_ABORT;
}

uint32_t HappyEyeballsTransaction::Caps() {
  return mTransaction ? mTransaction->Caps() : 0;
}

void HappyEyeballsTransaction::MaybeInvokeConnectedCallback(nsresult aStatus) {
  if (mConnectedCallbackInvoked || !mConnectedCallback) {
    return;
  }
  if (NS_FAILED(aStatus) || (mTransaction && mTransaction->Connected())) {
    LOG(
        ("HappyEyeballsTransaction::MaybeInvokeConnectedCallback %p "
         "status=%x",
         this, static_cast<uint32_t>(aStatus)));
    mConnectedCallbackInvoked = true;
    auto cb = std::move(mConnectedCallback);
    cb(aStatus);
  }
}

nsresult HappyEyeballsTransaction::ReadSegments(nsAHttpSegmentReader* reader,
                                                uint32_t count,
                                                uint32_t* countRead) {
  if (!mTransaction) {
    return NS_BASE_STREAM_CLOSED;
  }
  nsresult rv = mTransaction->ReadSegments(reader, count, countRead);
  LOG(("HappyEyeballsTransaction::ReadSegments %p rv=%x connected=%d", this,
       static_cast<uint32_t>(rv),
       mTransaction ? mTransaction->Connected() : 0));
  MaybeInvokeConnectedCallback(NS_OK);
  return rv;
}

nsresult HappyEyeballsTransaction::Finish0RTT(bool aRestart,
                                              bool aAlpnChanged) {
  LOG(("HappyEyeballsTransaction::Finish0RTT %p restart=%d alpnChanged=%d",
       this, aRestart, aAlpnChanged));
  if (!mTransaction) {
    return NS_ERROR_NOT_AVAILABLE;
  }
  nsresult rv = mTransaction->Finish0RTT(aRestart, aAlpnChanged);
  if (!aRestart) {
    MaybeInvokeConnectedCallback(NS_OK);
  }
  return rv;
}

nsresult HappyEyeballsTransaction::WriteSegments(nsAHttpSegmentWriter* writer,
                                                 uint32_t count,
                                                 uint32_t* countWritten) {
  if (!mTransaction) {
    return NS_BASE_STREAM_CLOSED;
  }
  return mTransaction->WriteSegments(writer, count, countWritten);
}

void HappyEyeballsTransaction::Close(nsresult reason) {
  LOG(("HappyEyeballsTransaction::Close %p reason=%x trans=%p cancelled=%d",
       this, static_cast<uint32_t>(reason), mTransaction.get(), mCancelled));

  RefPtr<nsHttpTransaction> trans = mTransaction;
  mTransaction = nullptr;

  if (!trans) {
    return;
  }

  trans->SetHappyEyeballsProxy(nullptr);

  if (NS_SUCCEEDED(reason) || mConnectedCallbackInvoked ||
      reason == NS_ERROR_LOCAL_NETWORK_ACCESS_DENIED || mCancelled) {
    trans->Close(mCancelled ? mCancelReason : reason);
    return;
  }

  // Cancel any pending token bucket entry so the raw ATokenBucketEvent*
  // pointer in EventTokenBucket::mEvents doesn't dangle after we drop
  // our reference to the inner transaction.
  trans->CancelPacing(mCancelled ? mCancelReason : reason);

  // Clear the inner transaction's connection reference to avoid leaking the
  // Http3Session. The connection was set by Http3Stream to point to the
  // Http3Session, and if we don't clear it here, the transaction will keep
  // the session alive indefinitely.
  trans->SetConnection(nullptr);

  // Notify the ConnectionEstablisher about the failure. The
  // HappyEyeballsConnectionAttempt still holds a reference to the inner
  // transaction and will either retry on another connection or close it
  // when all attempts have failed.
  MaybeInvokeConnectedCallback(mCancelled ? mCancelReason : reason);
}

void HappyEyeballsTransaction::SetConnectedCallback(
    std::function<void(nsresult)>&& aCallback) {
  LOG(("HappyEyeballsTransaction::SetConnectedCallback %p hasCallback=%d", this,
       !!aCallback));
  mConnectedCallback = std::move(aCallback);
}

nsHttpConnectionInfo* HappyEyeballsTransaction::ConnectionInfo() {
  return mTransaction ? mTransaction->ConnectionInfo() : nullptr;
}

void HappyEyeballsTransaction::SetProxyConnectFailed() {
  if (mTransaction) {
    mTransaction->SetProxyConnectFailed();
  }
}

nsHttpRequestHead* HappyEyeballsTransaction::RequestHead() {
  return mTransaction ? mTransaction->RequestHead() : nullptr;
}

uint32_t HappyEyeballsTransaction::Http1xTransactionCount() {
  return mTransaction ? mTransaction->Http1xTransactionCount() : 0;
}

nsresult HappyEyeballsTransaction::TakeSubTransactions(
    nsTArray<RefPtr<nsAHttpTransaction>>& outTransactions) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

void HappyEyeballsTransaction::OnActivated() {
  LOG(("HappyEyeballsTransaction::OnActivated %p trans=%p", this,
       mTransaction.get()));
  if (mTransaction) {
    mTransaction->OnActivated();
  }
}

uint64_t HappyEyeballsTransaction::BrowserId() {
  return mTransaction ? mTransaction->BrowserId() : 0;
}

nsIRequestContext* HappyEyeballsTransaction::RequestContext() {
  return mTransaction ? mTransaction->RequestContext() : nullptr;
}

bool HappyEyeballsTransaction::Do0RTT() {
  return mTransaction ? mTransaction->Do0RTT() : false;
}

void HappyEyeballsTransaction::DisableSpdy() {
  if (mTransaction) {
    mTransaction->DisableSpdy();
  }
}

void HappyEyeballsTransaction::DisableHttp2ForProxy() {
  if (mTransaction) {
    mTransaction->DisableHttp2ForProxy();
  }
}

void HappyEyeballsTransaction::DisableHttp3(bool aAllowRetryHTTPSRR) {
  if (mTransaction) {
    mTransaction->DisableHttp3(aAllowRetryHTTPSRR);
  }
}

void HappyEyeballsTransaction::MakeNonSticky() {
  if (mTransaction) {
    mTransaction->MakeNonSticky();
  }
}

void HappyEyeballsTransaction::MakeRestartable() {
  if (mTransaction) {
    mTransaction->MakeRestartable();
  }
}

void HappyEyeballsTransaction::ReuseConnectionOnRestartOK(bool reuseOk) {
  if (mTransaction) {
    static_cast<nsAHttpTransaction*>(mTransaction.get())
        ->ReuseConnectionOnRestartOK(reuseOk);
  }
}

void HappyEyeballsTransaction::SetIsHttp2Websocket(bool h2ws) {
  if (mTransaction) {
    mTransaction->SetIsHttp2Websocket(h2ws);
  }
}

bool HappyEyeballsTransaction::IsHttp2Websocket() {
  return mTransaction ? mTransaction->IsHttp2Websocket() : false;
}

void HappyEyeballsTransaction::SetTRRInfo(nsIRequest::TRRMode aMode,
                                          TRRSkippedReason aSkipReason) {
  if (mTransaction) {
    mTransaction->SetTRRInfo(aMode, aSkipReason);
  }
}

void HappyEyeballsTransaction::DoNotRemoveAltSvc() {
  if (mTransaction) {
    mTransaction->DoNotRemoveAltSvc();
  }
}

void HappyEyeballsTransaction::DoNotResetIPFamilyPreference() {
  if (mTransaction) {
    mTransaction->DoNotResetIPFamilyPreference();
  }
}

void HappyEyeballsTransaction::OnProxyConnectComplete(int32_t aResponseCode) {
  if (mTransaction) {
    mTransaction->OnProxyConnectComplete(aResponseCode);
  }
}

nsresult HappyEyeballsTransaction::OnHTTPSRRAvailable(
    nsIDNSHTTPSSVCRecord* aHTTPSSVCRecord,
    nsISVCBRecord* aHighestPriorityRecord, const nsACString& aCname) {
  MOZ_ASSERT_UNREACHABLE("Should not be called");
  return NS_ERROR_NOT_IMPLEMENTED;
}

bool HappyEyeballsTransaction::IsForWebTransport() {
  return mTransaction ? mTransaction->IsForWebTransport() : false;
}

bool HappyEyeballsTransaction::IsResettingForTunnelConn() {
  return mTransaction ? mTransaction->IsResettingForTunnelConn() : false;
}

void HappyEyeballsTransaction::SetResettingForTunnelConn(bool aValue) {
  if (mTransaction) {
    mTransaction->SetResettingForTunnelConn(aValue);
  }
}

bool HappyEyeballsTransaction::AllowedToConnectToIpAddressSpace(
    nsILoadInfo::IPAddressSpace aTargetIpAddressSpace) {
  MOZ_ASSERT_UNREACHABLE("Should not be called");
  return false;
}

void HappyEyeballsTransaction::Detach() {
  LOG(("HappyEyeballsTransaction::Detach %p trans=%p", this,
       mTransaction.get()));
  if (mTransaction) {
    mTransaction->SetHappyEyeballsProxy(nullptr);
  }
  mTransaction = nullptr;
  mConnectedCallback = nullptr;
}

}  // namespace mozilla::net
