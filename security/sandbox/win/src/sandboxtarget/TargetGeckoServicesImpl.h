/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef SECURITY_SANDBOX_WIN_SRC_SANDBOXTARGET_TARGETGECKOSERVICESIMPL_H_
#define SECURITY_SANDBOX_WIN_SRC_SANDBOXTARGET_TARGETGECKOSERVICESIMPL_H_

#include "mozilla/sandboxing/TargetGeckoServices.h"

namespace mozilla::sandboxing {

void InitTargetGeckoServices(SetTargetGeckoServicesCb aSetServicesCb);

}  // namespace mozilla::sandboxing

#endif  // SECURITY_SANDBOX_WIN_SRC_SANDBOXTARGET_TARGETGECKOSERVICESIMPL_H_
