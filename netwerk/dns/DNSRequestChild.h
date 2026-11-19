/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_DNSRequestChild_h
#define mozilla_net_DNSRequestChild_h

#include "mozilla/net/DNSRequestBase.h"
#include "mozilla/net/PDNSRequestChild.h"

namespace mozilla {
namespace net {

class DNSRequestChild final : public PDNSRequestChild {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(DNSRequestChild, override)
  friend class PDNSRequestChild;

  explicit DNSRequestChild(DNSRequestSender* aRequest);

 private:
  virtual ~DNSRequestChild() = default;

  mozilla::ipc::IPCResult RecvLookupCompleted(const DNSRequestResponse& reply);
  virtual void ActorDestroy(ActorDestroyReason why) override;

  RefPtr<DNSRequestSender> mDNSRequest;
};

}  // namespace net
}  // namespace mozilla

#endif  // mozilla_net_DNSRequestChild_h
