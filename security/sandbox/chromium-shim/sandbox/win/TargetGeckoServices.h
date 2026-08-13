/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef SANDBOX_WIN_TARGETGECKOSERVICES_H_
#define SANDBOX_WIN_TARGETGECKOSERVICES_H_

#include <string_view>

namespace mozilla::sandboxing {

using MarkIntervalStartFn = void (*)(std::string_view aName);
using MarkIntervalEndFn = void (*)(std::string_view aName);
using MarkSyscallBrokeringIntervalEndFn = void (*)(std::string_view aName,
                                                   std::wstring_view aContext,
                                                   bool aBrokered);

struct TargetGeckoServices {
  MarkIntervalStartFn markIntervalStart = nullptr;
  MarkIntervalEndFn markIntervalEnd = nullptr;
  MarkSyscallBrokeringIntervalEndFn markSyscallBrokeringIntervalEnd = nullptr;
};

using SetTargetGeckoServicesCb = void (*)(const TargetGeckoServices&);

void SetTargetGeckoServices(const TargetGeckoServices& aServices);

}  // namespace mozilla::sandboxing

#endif  // SANDBOX_WIN_TARGETGECKOSERVICES_H_
