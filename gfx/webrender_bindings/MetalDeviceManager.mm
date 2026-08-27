/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MetalDeviceManager.h"

#import <Metal/Metal.h>

namespace mozilla::wr {

Maybe<uint64_t> MetalDeviceManager::GetSystemDefaultDeviceRegistryId() {
  id<MTLDevice> device = MTLCreateSystemDefaultDevice();
  if (!device) {
    return Nothing();
  }

  const uint64_t registryID = device.registryID;
  [device release];
  return Some(registryID);
}

}  // namespace mozilla::wr
