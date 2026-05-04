/* vim:set ts=4 sw=2 sts=2 et cin: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef HappyEyeballsTransaction_h_
#define HappyEyeballsTransaction_h_

#include "nsAHttpConnection.h"

namespace mozilla {
namespace net {

class nsHttpTransaction;

// Proxy transaction that wraps a real nsHttpTransaction for use during
// Happy Eyeballs connection racing. When the connection fails and Close()
// is called, the proxy re-queues the real transaction instead of closing it.
class HappyEyeballsTransaction final : public nsAHttpTransaction {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSAHTTPTRANSACTION

  explicit HappyEyeballsTransaction(nsHttpTransaction* aTrans);

  nsHttpTransaction* QueryHttpTransaction() override {
    return mTransaction.get();
  }

  void OnActivated() override;
  bool Do0RTT() override;
  nsresult Finish0RTT(bool aRestart, bool aAlpnChanged) override;
  uint64_t BrowserId() override;
  nsIRequestContext* RequestContext() override;
  void DisableSpdy() override;
  void DisableHttp2ForProxy() override;
  void DisableHttp3(bool aAllowRetryHTTPSRR) override;
  void MakeNonSticky() override;
  void MakeRestartable() override;
  void ReuseConnectionOnRestartOK(bool reuseOk) override;
  void SetIsHttp2Websocket(bool h2ws) override;
  bool IsHttp2Websocket() override;
  void SetTRRInfo(nsIRequest::TRRMode aMode,
                  TRRSkippedReason aSkipReason) override;
  void DoNotRemoveAltSvc() override;
  void DoNotResetIPFamilyPreference() override;
  void OnProxyConnectComplete(int32_t aResponseCode) override;
  nsresult OnHTTPSRRAvailable(nsIDNSHTTPSSVCRecord* aHTTPSSVCRecord,
                              nsISVCBRecord* aHighestPriorityRecord,
                              const nsACString& aCname) override;
  bool IsForWebTransport() override;
  bool IsResettingForTunnelConn() override;
  void SetResettingForTunnelConn(bool aValue) override;
  bool AllowedToConnectToIpAddressSpace(
      nsILoadInfo::IPAddressSpace aTargetIpAddressSpace) override;

  void SetConnectedCallback(std::function<void(nsresult)>&& aCallback);

  // Detach the wrapped transaction so Close() becomes a no-op.
  void Detach();
  bool IsDetached() const { return !mTransaction; }

  void Cancel(nsresult aReason) override {
    mCancelled = true;
    mCancelReason = aReason;
  }

 private:
  ~HappyEyeballsTransaction();

  void MaybeInvokeConnectedCallback(nsresult aStatus);

  RefPtr<nsHttpTransaction> mTransaction;
  std::function<void(nsresult)> mConnectedCallback;
  bool mConnectedCallbackInvoked = false;
  bool mCancelled = false;
  nsresult mCancelReason = NS_OK;
};

}  // namespace net
}  // namespace mozilla

#endif
