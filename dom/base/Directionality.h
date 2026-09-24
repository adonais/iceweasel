/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_Directionality_h
#define mozilla_Directionality_h

#include <cstdint>

namespace mozilla {

enum class Directionality : uint8_t { Unset, Rtl, Ltr, Auto };

}  // namespace mozilla

#endif  // mozilla_Directionality_h
