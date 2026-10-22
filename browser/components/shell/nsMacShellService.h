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

class nsMacShellService : public nsShellService,
                          public nsIMacShellService,
                          public nsIWebProgressListener {
 public:
  nsMacShellService() = default;

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSISHELLSERVICE
  NS_DECL_NSIMACSHELLSERVICE
  NS_DECL_NSIWEBPROGRESSLISTENER

 protected:
  virtual ~nsMacShellService() = default;

 private:
  nsCOMPtr<nsIFile> mBackgroundFile;
};

#endif  // nsmacshellservice_h_
