/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_DNSRequestBase_h
#define mozilla_net_DNSRequestBase_h

#include "mozilla/net/PDNSRequestParent.h"
#include "nsICancelable.h"
#include "nsIDNSByTypeRecord.h"
#include "nsIDNSListener.h"
#include "nsIDNSRecord.h"
#include "nsIEventTarget.h"

namespace mozilla {
namespace net {

class DNSRequestChild;
class DNSRequestParent;

// DNSRequestSender is used to send an IPC request to DNSRequestHandler and
// deliver the result to nsIDNSListener.
// Note this class is used in the content process.
class DNSRequestSender final : public nsICancelable {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSICANCELABLE

  DNSRequestSender(const nsACString& aHost, const nsACString& aTrrServer,
                   int32_t aPort, const uint16_t& aType,
                   const OriginAttributes& aOriginAttributes,
                   const nsIDNSService::DNSFlags& aFlags,
                   nsIDNSListener* aListener, nsIEventTarget* target);

  void SetIPCActor(DNSRequestChild* aActor);
  bool OnRecvLookupCompleted(const DNSRequestResponse& reply);
  void OnIPCActorDestroy();

  // Sends IPDL request to DNSRequestHandler
  void StartRequest();
  void CallOnLookupComplete();

 private:
  friend class ChildDNSService;
  virtual ~DNSRequestSender();

  RefPtr<DNSRequestChild> mIPCActor;
  nsCOMPtr<nsIDNSListener> mListener;
  nsCOMPtr<nsIEventTarget> mTarget;
  nsCOMPtr<nsIDNSRecord> mResultRecord;
  nsresult mResultStatus = NS_OK;
  nsCString mHost;
  nsCString mTrrServer;
  int32_t mPort;
  uint16_t mType = 0;
  const OriginAttributes mOriginAttributes;
  nsIDNSService::DNSFlags mFlags = nsIDNSService::RESOLVE_DEFAULT_FLAGS;
};

// DNSRequestHandler handles the dns request and sends the result back via IPC.
// Note this class is only used in the parent process.
class DNSRequestHandler final : public nsIDNSListener {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIDNSLISTENER

  DNSRequestHandler() = default;

  void SetIPCActor(DNSRequestParent* aActor);
  void DoAsyncResolve(const nsACString& hostname, const nsACString& trrServer,
                      int32_t port, uint16_t type,
                      const OriginAttributes& originAttributes,
                      nsIDNSService::DNSFlags flags);

  void OnRecvCancelDNSRequest(const nsCString& hostName,
                              const nsCString& trrServer, const int32_t& port,
                              const uint16_t& type,
                              const OriginAttributes& originAttributes,
                              const nsIDNSService::DNSFlags& flags,
                              const nsresult& reason);
  void OnIPCActorDestroy();

 private:
  virtual ~DNSRequestHandler();

  RefPtr<DNSRequestParent> mIPCActor;
  nsIDNSService::DNSFlags mFlags = nsIDNSService::RESOLVE_DEFAULT_FLAGS;
};

}  // namespace net
}  // namespace mozilla

#endif  // mozilla_net_DNSRequestBase_h
