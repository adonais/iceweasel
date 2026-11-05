/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_NavigationUtils_h_
#define mozilla_dom_NavigationUtils_h_

#include "mozilla/Maybe.h"

class nsIChannel;

namespace mozilla::dom {
enum class NavigationType : uint8_t;
enum class NavigationHistoryBehavior : uint8_t;
class SessionHistoryInfo;

class NavigationUtils {
 public:
  static Maybe<enum NavigationHistoryBehavior> NavigationHistoryBehavior(
      NavigationType aNavigationType);

  static Maybe<NavigationType> NavigationTypeFromNavigationHistoryBehavior(
      enum NavigationHistoryBehavior aBehavior);

  static Maybe<NavigationType> NavigationTypeFromLoadType(uint32_t aLoadType);

  // Whether aChannel's load involved a cross-origin redirect (any
  // redirect-chain entry not same-origin with the final result principal).
  static bool HasCrossOriginRedirect(nsIChannel* aChannel);

  // https://drafts.csswg.org/css-view-transitions-2/#navigation-can-trigger-a-cross-document-view-transition
  // Steps 3 to 8. SetupOutboundCrossDocumentViewTransition checks step 2, the
  // opt-in.
  static bool CanInitiateOutboundCrossDocumentViewTransition(
      uint32_t aLoadType, bool aSameOrigin, nsIChannel* aChannel);
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_NavigationUtils_h_
