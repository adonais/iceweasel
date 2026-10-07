/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ConnectionAllowlistsService.h"

#include "ConnectionAllowlists.h"
#include "PolicyContainer.h"
#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsILoadInfo.h"

namespace mozilla::dom {

NS_IMPL_ISUPPORTS(ConnectionAllowlistsService, nsIContentPolicy)

NS_IMETHODIMP
ConnectionAllowlistsService::ShouldLoad(nsIURI* aContentLocation,
                                        nsILoadInfo* aLoadInfo,
                                        int16_t* aDecision) {
  *aDecision = nsIContentPolicy::ACCEPT;

  nsCOMPtr<nsIPolicyContainer> policyContainer =
      aLoadInfo->GetPolicyContainer();
  RefPtr<ConnectionAllowlists> allowlists =
      PolicyContainer::GetConnectionAllowlists(policyContainer);
  if (!allowlists) {
    return NS_OK;
  }

  if (!allowlists->ShouldLoad(aContentLocation, aLoadInfo)) {
    *aDecision = nsIContentPolicy::REJECT_REQUEST;
  }

  return NS_OK;
}

NS_IMETHODIMP
ConnectionAllowlistsService::ShouldProcess(nsIURI* aContentLocation,
                                           nsILoadInfo* aLoadInfo,
                                           int16_t* aDecision) {
  *aDecision = nsIContentPolicy::ACCEPT;
  return NS_OK;
}

}  // namespace mozilla::dom
