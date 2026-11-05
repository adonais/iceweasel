/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/NavigationUtils.h"

#include "mozilla/dom/NavigationBinding.h"
#include "mozilla/dom/SessionHistoryEntry.h"
#include "nsContentUtils.h"
#include "nsDocShellLoadTypes.h"
#include "nsIChannel.h"
#include "nsILoadInfo.h"
#include "nsIPrincipal.h"
#include "nsIRedirectHistoryEntry.h"
#include "nsIScriptSecurityManager.h"

namespace mozilla::dom {

/* static */ Maybe<NavigationHistoryBehavior>
NavigationUtils::NavigationHistoryBehavior(NavigationType aNavigationType) {
  switch (aNavigationType) {
    case NavigationType::Push:
      return Some(NavigationHistoryBehavior::Push);
    case NavigationType::Replace:
      return Some(NavigationHistoryBehavior::Replace);
    default:
      break;
  }
  return Nothing();
}

/*static*/ Maybe<NavigationType>
NavigationUtils::NavigationTypeFromNavigationHistoryBehavior(
    enum NavigationHistoryBehavior aBehavior) {
  switch (aBehavior) {
    case NavigationHistoryBehavior::Push:
      return Some(NavigationType::Push);
    case NavigationHistoryBehavior::Replace:
      return Some(NavigationType::Replace);
    default:
      break;
  }
  return Nothing();
}

/* static */
Maybe<NavigationType> NavigationUtils::NavigationTypeFromLoadType(
    uint32_t aLoadType) {
  MOZ_ASSERT(IsValidLoadType(aLoadType));

  switch (aLoadType) {
    case LOAD_HISTORY:
      return Some(NavigationType::Traverse);

    case LOAD_NORMAL:
    case LOAD_NORMAL_BYPASS_CACHE:
    case LOAD_NORMAL_BYPASS_PROXY:
    case LOAD_NORMAL_BYPASS_PROXY_AND_CACHE:
    case LOAD_PUSHSTATE:
    case LOAD_LINK:
    case LOAD_STOP_CONTENT:
    case LOAD_ERROR_PAGE:
    case LOAD_BYPASS_HISTORY:
      return Some(NavigationType::Push);

    case LOAD_RELOAD_NORMAL:
    case LOAD_RELOAD_CHARSET_CHANGE:
    case LOAD_RELOAD_CHARSET_CHANGE_BYPASS_PROXY_AND_CACHE:
    case LOAD_RELOAD_CHARSET_CHANGE_BYPASS_CACHE:
    case LOAD_RELOAD_BYPASS_CACHE:
    case LOAD_RELOAD_BYPASS_PROXY:
    case LOAD_RELOAD_BYPASS_PROXY_AND_CACHE:
    case LOAD_REFRESH:
      return Some(NavigationType::Reload);

    case LOAD_STOP_CONTENT_AND_REPLACE:
    case LOAD_NORMAL_REPLACE:
    case LOAD_REFRESH_REPLACE:
    case LOAD_REPLACE_BYPASS_CACHE:
      return Some(NavigationType::Replace);

    default:
      // This is an invalid load type.
      return {};
  }
}

/* static */ bool NavigationUtils::HasCrossOriginRedirect(
    nsIChannel* aChannel) {
  if (!aChannel) {
    return false;
  }
  nsCOMPtr<nsILoadInfo> loadInfo = aChannel->LoadInfo();
  if (!loadInfo || loadInfo->RedirectChain().IsEmpty()) {
    return false;
  }
  nsCOMPtr<nsIPrincipal> resultPrincipal;
  if (NS_FAILED(nsContentUtils::GetSecurityManager()->GetChannelResultPrincipal(
          aChannel, getter_AddRefs(resultPrincipal))) ||
      !resultPrincipal) {
    return false;
  }
  for (const nsCOMPtr<nsIRedirectHistoryEntry>& entry :
       loadInfo->RedirectChain()) {
    nsCOMPtr<nsIPrincipal> entryPrincipal;
    entry->GetPrincipal(getter_AddRefs(entryPrincipal));
    bool sameOrigin = false;
    if (entryPrincipal &&
        NS_SUCCEEDED(entryPrincipal->Equals(resultPrincipal, &sameOrigin)) &&
        !sameOrigin) {
      return true;
    }
  }
  return false;
}

/* static */ bool
NavigationUtils::CanInitiateOutboundCrossDocumentViewTransition(
    uint32_t aLoadType, bool aSameOrigin, nsIChannel* aChannel) {
  // https://drafts.csswg.org/css-view-transitions-2/#navigation-can-trigger-a-cross-document-view-transition
  // Step 1 is up to the user agent, and the callers check step 2.
  Maybe<NavigationType> navType = NavigationTypeFromLoadType(aLoadType);
  // Step 3.
  if (navType.isNothing() || *navType == NavigationType::Reload) {
    return false;
  }
  // Step 4.
  if (!aSameOrigin) {
    return false;
  }
  // Step 5. The channel creates a new document, so its latest entry is null.
  if (HasCrossOriginRedirect(aChannel)) {
    return false;
  }
  // Step 6.
  if (*navType == NavigationType::Traverse) {
    return true;
  }
  // Step 7.
  UserNavigationInvolvement involvement = UserNavigationInvolvement::None;
  if (aChannel) {
    nsCOMPtr<nsILoadInfo> loadInfo = aChannel->LoadInfo();
    involvement = loadInfo->GetUserNavigationInvolvement();
  }
  // Step 8.
  return involvement != UserNavigationInvolvement::BrowserUI;
}

}  // namespace mozilla::dom
