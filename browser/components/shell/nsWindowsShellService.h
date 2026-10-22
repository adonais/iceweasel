/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nswindowsshellservice_h_
#define nswindowsshellservice_h_

#include <windows.h>
#include <ole2.h>

#include "nscore.h"
#include "nsIShellService.h"
#include "nsIWindowsShellService.h"
#include "nsShellService.h"
#include "nsString.h"

class nsWindowsShellService : public nsShellService,
                              public nsIWindowsShellService {
  virtual ~nsWindowsShellService() = default;

 public:
  nsWindowsShellService() = default;

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSISHELLSERVICE
  NS_DECL_NSIWINDOWSSHELLSERVICE

 protected:
  nsresult LaunchControlPanelDefaultsSelectionUI();
};

#endif  // nswindowsshellservice_h_
