/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MediaUtils.h"

#include "nsContentUtils.h"
#include "nsGkAtoms.h"

namespace mozilla::MediaUtils {

bool HasDebuggerOrTabsPrivilege(JSContext* aCx, JSObject* aObj) {
  if (!NS_IsMainThread()) {
    return false;
  }
  return nsContentUtils::CallerHasPermission(aCx, nsGkAtoms::debugger) ||
         nsContentUtils::CallerHasPermission(aCx, nsGkAtoms::tabs);
}

}  // namespace mozilla::MediaUtils
