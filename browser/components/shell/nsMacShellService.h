/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsmacshellservice_h_
#define nsmacshellservice_h_

#include "nsCOMPtr.h"
#include "nsIFile.h"
#include "nsIMacShellService.h"
#include "nsIWebProgressListener.h"
#include "nsShellService.h"

class nsMacShellService : public nsShellService, public nsIMacShellService {
 public:
  nsMacShellService() = default;

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSISHELLSERVICE
  NS_DECL_NSIMACSHELLSERVICE

 protected:
  virtual ~nsMacShellService() = default;
};

#endif  // nsmacshellservice_h_
