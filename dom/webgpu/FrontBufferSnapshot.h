/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GPU_FrontBufferSnapshot_H_
#define GPU_FrontBufferSnapshot_H_

#include "mozilla/ipc/SharedMemoryHandle.h"

namespace mozilla {
namespace webgpu {

struct FrontBufferSnapshot {
  ipc::MutableSharedMemoryHandle handle;
  uint32_t width = 0;
  uint32_t height = 0;
  size_t byteStride = 0;
};

}  // namespace webgpu
}  // namespace mozilla

#endif  // GPU_FrontBufferSnapshot_H_
