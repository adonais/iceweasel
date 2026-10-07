/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_LocationBase_h
#define mozilla_dom_LocationBase_h

#include "mozilla/dom/NavigationBinding.h"
#include "nsStringFwd.h"

class nsIDocShell;
class nsIPrincipal;
class nsIURI;
class nsDocShellLoadState;

namespace mozilla {
class ErrorResult;

namespace dom {
class BrowsingContext;

//*****************************************************************************
// Location: Script "location" object
//*****************************************************************************

class LocationBase {
 public:
  // WebIDL API:
  MOZ_CAN_RUN_SCRIPT
  void Replace(const nsACString& aUrl, nsIPrincipal& aSubjectPrincipal,
               ErrorResult& aRv);

  MOZ_CAN_RUN_SCRIPT
  void SetHref(const nsACString& aHref, nsIPrincipal& aSubjectPrincipal,
               ErrorResult& aRv);

 protected:
  virtual BrowsingContext* GetBrowsingContext() = 0;
  virtual nsIDocShell* GetDocShell() = 0;

  MOZ_CAN_RUN_SCRIPT
  void Navigate(nsIURI* aURI, nsIPrincipal& aSubjectPrincipal, ErrorResult& aRv,
                NavigationHistoryBehavior aHistoryHandling =
                    NavigationHistoryBehavior::Auto);
  MOZ_CAN_RUN_SCRIPT
  void SetHrefWithBase(const nsACString& aHref, nsIURI* aBase,
                       nsIPrincipal& aSubjectPrincipal, bool aReplace,
                       ErrorResult& aRv);

  // Helper for Assign/SetHref/Replace
  MOZ_CAN_RUN_SCRIPT
  void DoSetHref(const nsACString& aHref, nsIPrincipal& aSubjectPrincipal,
                 bool aReplace, ErrorResult& aRv);

  // Get the base URL we should be using for our relative URL
  // resolution for SetHref/Assign/Replace.
  nsIURI* GetSourceBaseURL();
};

}  // namespace dom
}  // namespace mozilla

#endif  // mozilla_dom_LocationBase_h
