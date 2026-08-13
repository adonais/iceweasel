/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsDirectoryServiceUtils_h_
#define nsDirectoryServiceUtils_h_

#include "nsCOMPtr.h"
#include "nsIFile.h"
#include "nsIProperties.h"
#include "nsServiceManagerUtils.h"
#include "nsXPCOMCID.h"

inline nsresult NS_GetSpecialDirectory(const char* aSpecialDirName,
                                       nsIFile** aResult) {
  nsresult rv;
  nsCOMPtr<nsIProperties> serv(
      do_GetService(NS_DIRECTORY_SERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) {
    return rv;
  }

  return serv->Get(aSpecialDirName, NS_GET_IID(nsIFile),
                   reinterpret_cast<void**>(aResult));
}

#endif
