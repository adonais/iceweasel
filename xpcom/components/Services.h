/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_Services_h
#define mozilla_Services_h

#include "mozilla/AlreadyAddRefed.h"

class nsIObserverService;

namespace mozilla::services {

/**
 * NOTE: This method is deprecated. Please use components::Observer::Service()
 * instead.
 *
 * WARNING: This method is _not_ threadsafe!
 *
 * Fetch a cached instance of the ObserverService. This function will
 * return nullptr during XPCOM shutdown.
 *
 */
already_AddRefed<nsIObserverService> GetObserverService();

}  // namespace mozilla::services

#endif  // !defined(mozilla_Services_h)
