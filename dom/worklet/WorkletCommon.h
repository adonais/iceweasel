/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_WORKLET_WORKLETCOMMON_H
#define DOM_WORKLET_WORKLETCOMMON_H

#include "js/TypeDecls.h"

namespace mozilla::dom {

// Implemented in WorkletGlobalScope.cpp
bool IsWorkletGlobal(JSObject* aObj);

}  // namespace mozilla::dom

#endif  // DOM_WORKLET_WORKLETCOMMON_H
