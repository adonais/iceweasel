/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef SHMBufSurface_h_
#define SHMBufSurface_h_

#include "Units.h"
#include "mozilla/RefPtr.h"
#include "mozilla/gfx/2D.h"
#include "mozilla/gfx/Types.h"
#include "mozilla/ipc/SharedMemoryHandle.h"
#include "mozilla/ipc/SharedMemoryMapping.h"
#include "mozilla/widget/BufferSurface.h"

struct wl_shm_pool;

namespace mozilla::widget {

// SHMBufSurface is backed by shared memory (wl_shm_pool) and provides a
// CPU-accessible buffer we can draw into. The shared memory pool is created
// and owned directly by the surface.
class SHMBufSurface final : public BufferSurface {
 public:
  static RefPtr<SHMBufSurface> Create(const LayoutDeviceIntSize& aSize,
                                      int32_t aFOURCCFormat);

  already_AddRefed<gfx::DataSourceSurface> GetAsSourceSurface() override;

  already_AddRefed<mozilla::gfx::DrawTarget> Lock() override;
  void* GetImageData() override;

  int GetWidth(int aPlane = 0) override { return mSize.width; }
  int GetHeight(int aPlane = 0) override { return mSize.height; }

  void Clear();

  wl_buffer* CreateWlBuffer() override;

 private:
  bool CreateImpl(const LayoutDeviceIntSize& aSize, int32_t aFOURCCFormat);

  SHMBufSurface() = default;
  ~SHMBufSurface() override;

  LayoutDeviceIntSize mSize;
  wl_shm_pool* mShmPool = nullptr;
  mozilla::ipc::MutableSharedMemoryHandle mShmHandle;
  mozilla::ipc::SharedMemoryMapping mShm;
};

}  // namespace mozilla::widget

#endif
