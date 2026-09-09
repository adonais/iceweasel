/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/Services.h"

#include "mozilla/Likely.h"
#include "nsIObserverService.h"
#include "nsServiceManagerUtils.h"
#include "nsXPCOMPrivate.h"

static nsIObserverService* gObserverService = nullptr;

namespace mozilla::services {

already_AddRefed<nsIObserverService> GetObserverService() {
  if (MOZ_UNLIKELY(gXPCOMShuttingDown)) {
    return nullptr;
  }
  if (!gObserverService) {
    nsCOMPtr<nsIObserverService> os =
        do_GetService("@mozilla.org/observer-service;1");
    os.swap(gObserverService);
  }
  return do_AddRef(gObserverService);
}

void Shutdown() {
  gXPCOMShuttingDown = true;
  NS_IF_RELEASE(gObserverService);
}

}  // namespace mozilla::services
