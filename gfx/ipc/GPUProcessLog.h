/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_gfx_GPUProcessLog_h
#define mozilla_gfx_GPUProcessLog_h

#include "mozilla/Logging.h"

namespace mozilla::gfx {

// Logs GPU process launches, losses, device resets and fallbacks.
extern LazyLogModule gGPUProcessLog;

}  // namespace mozilla::gfx

#define GPUPROCESS_LOG(...)                                           \
  MOZ_LOG_FMT(mozilla::gfx::gGPUProcessLog, mozilla::LogLevel::Debug, \
              __VA_ARGS__)

#endif  // mozilla_gfx_GPUProcessLog_h
