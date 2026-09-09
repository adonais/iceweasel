/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_ProxyConfigLookup_h
#define mozilla_net_ProxyConfigLookup_h

#include <functional>

#include "nsCOMPtr.h"
#include "nsIProtocolProxyCallback.h"

class nsIURI;

namespace mozilla {
namespace net {

class ProxyConfigLookup final : public nsIProtocolProxyCallback {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIPROTOCOLPROXYCALLBACK

  // aIsTRRServiceChannel marks the channel this lookup resolves against as a
  // TRR service channel, so that proxy filters can tell DoH traffic apart.
  static nsresult Create(
      std::function<void(nsIProxyInfo*, nsresult)>&& aCallback, nsIURI* aURI,
      uint32_t aProxyResolveFlags, bool aIsTRRServiceChannel = false,
      nsICancelable** aLookupCancellable = nullptr);

 private:
  explicit ProxyConfigLookup(
      std::function<void(nsIProxyInfo*, nsresult)>&& aCallback, nsIURI* aURI,
      uint32_t aProxyResolveFlags, bool aIsTRRServiceChannel);
  virtual ~ProxyConfigLookup();
  nsresult DoProxyResolve(nsICancelable** aLookupCancellable);

  std::function<void(nsIProxyInfo*, nsresult)> mCallback;
  nsCOMPtr<nsIURI> mURI;
  uint32_t mProxyResolveFlags;
  bool mIsTRRServiceChannel;
};

}  // namespace net
}  // namespace mozilla

#endif  // mozilla_net_ProxyConfigLookup_h
