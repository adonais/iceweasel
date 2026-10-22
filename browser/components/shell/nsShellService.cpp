/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsShellService.h"

#include "mozilla/dom/Promise.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/Try.h"
#include "xpcpublic.h"

NS_IMPL_ISUPPORTS(nsShellService, nsIToolkitShellService)

NS_IMETHODIMP nsShellService::IsDefaultApplication(bool* aIsDefaultBrowser) {
  // Only care about the http(s) protocol. This only matters on Windows.
  return IsDefaultBrowser(false, aIsDefaultBrowser);
}

nsresult nsShellService::IsDefaultBrowserAsync(
    bool aForAllTypes, JSContext* aContext, mozilla::dom::Promise** aRetVal) {
  mozilla::ErrorResult rv;
  RefPtr<mozilla::dom::Promise> promise =
      mozilla::dom::Promise::Create(xpc::CurrentNativeGlobal(aContext), rv);
  if (rv.Failed()) [[unlikely]] {
    return rv.StealNSResult();
  }

  bool isDefaultBrowser;
  MOZ_TRY(IsDefaultBrowser(aForAllTypes, &isDefaultBrowser));

  promise->MaybeResolve(isDefaultBrowser);

  promise.forget(aRetVal);
  return NS_OK;
}
