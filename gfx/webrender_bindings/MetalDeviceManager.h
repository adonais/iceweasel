/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_webrender_MetalDeviceManager_h
#define mozilla_webrender_MetalDeviceManager_h

#include <cstdint>

#include "mozilla/Maybe.h"

namespace mozilla::wr {

class MetalDeviceManager {
 public:
  // Returns the registry ID of the system default Metal device, or Nothing on
  // failure. Note that on macOS devices that have multiple GPUs the system
  // default is the discrete GPU.
  static Maybe<uint64_t> GetSystemDefaultDeviceRegistryId();
};

}  // namespace mozilla::wr

#endif  // mozilla_webrender_MetalDeviceManager_h
