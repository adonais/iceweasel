/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef BROWSER_COMPONENTS_SHELL_NSSHELLSERVICE_H_
#define BROWSER_COMPONENTS_SHELL_NSSHELLSERVICE_H_

#include "nsIToolkitShellService.h"

#define PREF_CHECKDEFAULTBROWSER "browser.shell.checkDefaultBrowser"
#define PREF_DEFAULTBROWSERCHECKCOUNT "browser.shell.defaultBrowserCheckCount"

#define SHELL_BRAND_PROPERTIES_URI "chrome://branding/locale/brand.properties"

struct JSContext;

namespace mozilla::dom {
class Promise;
}

/**
 * Base class for platform-specific shell service implementations.
 *
 * This class provides the shared nsIToolkitShellService implementation and
 * common helpers used to implement nsIShellService functionality.
 *
 * It intentionally does not implement nsIShellService. Platform-specific shell
 * interfaces inherit from nsIShellService separately.
 */
class nsShellService : public nsIToolkitShellService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSITOOLKITSHELLSERVICE

 protected:
  virtual ~nsShellService() = default;

  /**
   * Matches nsIShellService::IsDefaultBrowser() and is declared here as a pure
   * virtual hook so shared implementations can call the platform-specific
   * implementation provided by subclasses.
   */
  NS_IMETHOD IsDefaultBrowser(bool aForAllTypes, bool* aIsDefaultBrowser) = 0;

  /**
   * Trivial implementation that calls IsDefaultBrowser() and immediately
   * resolves the promise with the result.
   *
   * This can be used on platforms where IsDefaultBrowser() is not expected to
   * block for a significant amount of time.
   */
  nsresult IsDefaultBrowserAsync(bool aForAllTypes, JSContext* aContext,
                                 mozilla::dom::Promise** _retval);
};

#endif  // BROWSER_COMPONENTS_SHELL_NSSHELLSERVICE_H_
