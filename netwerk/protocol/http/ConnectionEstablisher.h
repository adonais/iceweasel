/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ConnectionEstablisher_h_
#define ConnectionEstablisher_h_

#include <functional>
#include "ConnectionHandle.h"
#include "mozilla/Result.h"
#include "mozilla/net/DNS.h"
#include "nsAHttpConnection.h"
#include "nsHttpConnection.h"
#include "nsIAsyncOutputStream.h"

class nsIDNSAddrRecord;

namespace mozilla {
namespace net {

class ConnectionEstablisher : public nsITransportEventSink,
                              public nsIInterfaceRequestor {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  NS_DECL_NSITRANSPORTEVENTSINK
  NS_DECL_NSIINTERFACEREQUESTOR

  using DoneCallback =
      std::function<void(Result<RefPtr<HttpConnectionBase>, nsresult>)>;
  using TransportStatusCallback =
      std::function<void(nsITransport*, nsresult, int64_t)>;

  ConnectionEstablisher(nsHttpConnectionInfo* aConnInfo, const NetAddr& aAddr,
                        uint32_t aCaps);

  virtual bool Start(DoneCallback&& aCallback) = 0;
  void SetSecurityCallbacks(nsIInterfaceRequestor* aCallbacks) {
    mSecurityCallbacks = aCallbacks;
  }
  void SetTransportStatusCallback(TransportStatusCallback&& aCallback) {
    mTransportStatusCallback = std::move(aCallback);
  }

  virtual void Close(nsresult aReason) = 0;
  virtual void ResetSpeculativeFlags() = 0;
  const NetAddr& Addr() const { return mAddr; }
  void ClearResultConnection();
  virtual bool IsUDP() const { return false; }

 protected:
  virtual ~ConnectionEstablisher();

  // Common implementation for activating a connection with a transaction
  nsresult ActivateConnectionWithTransaction(
      RefPtr<HttpConnectionBase> aConn,
      std::function<void(nsresult)> aOnActivated);

  // Common implementation for finishing the establisher
  void FinishInternal(nsresult aResult);

  virtual void Finish(nsresult aResult) = 0;
  void SetConnecting();
  void MaybeSetConnectingDone();

  RefPtr<nsHttpConnectionInfo> mConnInfo;
  NetAddr mAddr;
  nsCOMPtr<nsIDNSAddrRecord> mAddrRecord;
  uint32_t mCaps = 0;
  bool mFinished = false;
  bool mWaitingForConnect = false;
  bool mHasConnected = false;
  bool mConnectedOK = false;

  TimeStamp mConnectStart;
  TimeStamp mTcpConnectEnd;

  DoneCallback mCallback;
  TransportStatusCallback mTransportStatusCallback;
  nsCOMPtr<nsIInterfaceRequestor> mSecurityCallbacks;
  RefPtr<ConnectionHandle> mHandle;
  RefPtr<HttpConnectionBase> mResultConn;
};

class TCPConnectionEstablisher : public ConnectionEstablisher,
                                 public nsIOutputStreamCallback {
 public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIOUTPUTSTREAMCALLBACK

  TCPConnectionEstablisher(nsHttpConnectionInfo* aConnInfo, NetAddr aAddr,
                           uint32_t aCaps, bool aSpeculative, bool aAllow1918);

  // Starts creating the socket transport + streams, and arms AsyncWait.
  // If it fails synchronously, the callback is invoked before returning.
  bool Start(DoneCallback&& aCallback) override;
  void ResetSpeculativeFlags() override;
  void Close(nsresult aReason) override;

 private:
  ~TCPConnectionEstablisher();

  nsresult CreateAndConfigureSocketTransport();
  void Finish(nsresult aResult) override;

  TimeStamp mSynStarted;
  bool mSpeculative = false;
  bool mAllow1918 = false;

  nsCOMPtr<nsISocketTransport> mSocketTransport;
  nsCOMPtr<nsIAsyncOutputStream> mStreamOut;
  nsCOMPtr<nsIAsyncInputStream> mStreamIn;
};

class UDPConnectionEstablisher : public ConnectionEstablisher {
 public:
  NS_INLINE_DECL_REFCOUNTING_INHERITED(UDPConnectionEstablisher,
                                       ConnectionEstablisher)

  UDPConnectionEstablisher(nsHttpConnectionInfo* aConnInfo, NetAddr aAddr,
                           uint32_t aCaps);

  bool Start(DoneCallback&& aCallback) override;
  void ResetSpeculativeFlags() override {}
  void Close(nsresult aReason) override;
  bool IsUDP() const override { return true; }

 private:
  ~UDPConnectionEstablisher();

  nsresult CreateAndConfigureUDPConn();
  void Finish(nsresult aResult) override;
};

}  // namespace net
}  // namespace mozilla

#endif
