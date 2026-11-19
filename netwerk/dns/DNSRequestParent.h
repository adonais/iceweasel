/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_DNSRequestParent_h
#define mozilla_net_DNSRequestParent_h

#include "mozilla/net/DNSRequestBase.h"
#include "mozilla/net/PDNSRequestParent.h"
#include "nsIDNSListener.h"

namespace mozilla {
namespace net {

class DNSRequestParent : public PDNSRequestParent {
 public:
  friend class PDNSRequestParent;
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(DNSRequestParent, override)

  explicit DNSRequestParent(DNSRequestHandler* aRequest);

  DNSRequestHandler* GetDNSRequest() { return mDNSRequest; }

 private:
  virtual ~DNSRequestParent() = default;

  // Pass args here rather than storing them in the parent; they are only
  // needed if the request is to be canceled.
  mozilla::ipc::IPCResult RecvCancelDNSRequest(
      const nsCString& hostName, const nsCString& trrServer,
      const int32_t& port, const uint16_t& type,
      const OriginAttributes& originAttributes,
      const nsIDNSService::DNSFlags& flags, const nsresult& reason);
  void ActorDestroy(ActorDestroyReason) override;

  RefPtr<DNSRequestHandler> mDNSRequest;
};

}  // namespace net
}  // namespace mozilla

#endif  // mozilla_net_DNSRequestParent_h
