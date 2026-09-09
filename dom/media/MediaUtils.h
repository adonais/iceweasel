/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MediaUtils_h
#define mozilla_dom_MediaUtils_h

#include "jsapi.h"

namespace mozilla::MediaUtils {

// Check if the context is chrome or has the debugger or tabs permission
bool HasDebuggerOrTabsPrivilege(JSContext* aCx, JSObject* aObj);

}  // namespace mozilla::MediaUtils

#endif  // mozilla_dom_MediaUtils_h
