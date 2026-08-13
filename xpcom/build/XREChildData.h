/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef XREChildData_h
#define XREChildData_h

#if defined(XP_WIN) && defined(MOZ_SANDBOX)
#  include "mozilla/sandboxing/TargetGeckoServices.h"

namespace sandbox {
class BrokerServices;
class TargetServices;
}  // namespace sandbox
#endif

/**
 * Data needed to start a child process.
 */
struct XREChildData {
#if defined(XP_WIN) && defined(MOZ_SANDBOX)
  /**
   * Chromium sandbox TargetServices.
   */
  sandbox::TargetServices* sandboxTargetServices = nullptr;

  /**
   * Callback to set TargetGeckoServices in the chromium sandbox code.
   */
  mozilla::sandboxing::SetTargetGeckoServicesCb setTargetGeckoServices =
      nullptr;
#endif
};

#endif  // XREChildData_h
