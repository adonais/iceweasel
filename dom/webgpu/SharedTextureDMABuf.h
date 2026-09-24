/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GPU_SharedTextureDMABuf_H_
#define GPU_SharedTextureDMABuf_H_

#include "mozilla/gfx/FileHandleWrapper.h"
#include "mozilla/webgpu/SharedTexture.h"
#include "nsTArrayForwardDeclare.h"

class DMABufSurface;

namespace mozilla {

namespace webgpu {

class SharedTextureDMABuf final : public SharedTexture {
 public:
  static UniquePtr<SharedTextureDMABuf> Create(
      WebGPUParent* aParent, const ffi::WGPUDeviceId aDeviceId,
      const uint32_t aWidth, const uint32_t aHeight,
      const struct ffi::WGPUTextureFormat aFormat,
      const ffi::WGPUTextureUsages aUsage);

  SharedTextureDMABuf(const uint32_t aWidth, const uint32_t aHeight,
                      const struct ffi::WGPUTextureFormat aFormat,
                      const ffi::WGPUTextureUsages aUsage,
                      RefPtr<DMABufSurface>&& aSurface,
                      const layers::SurfaceDescriptorDMABuf& aSurfaceDescriptor,
                      const ffi::WGPUDMABufInfo& aDMABufInfo);
  virtual ~SharedTextureDMABuf();

  Maybe<layers::SurfaceDescriptor> ToSurfaceDescriptor() override;

  void GetSnapshot(const ipc::Shmem& aDestShmem, size_t aDestStride) override;

  SharedTextureDMABuf* AsSharedTextureDMABuf() override { return this; }

  void onBeforeQueueSubmit(
      const ffi::WGPUGlobal* aContext, RawId aDeviceId, RawId aQueueId,
      nsTArray<ffi::WGPUVkSemaphoreHandle>& aSignalSemaphores) override;

  void CleanForRecycling() override;

  UniqueFileHandle CloneDmaBufFd();

  const ffi::WGPUDMABufInfo& GetDMABufInfo() const { return mDMABufInfo; }

 protected:
  RefPtr<DMABufSurface> mSurface;
  const layers::SurfaceDescriptorDMABuf mSurfaceDescriptor;
  const ffi::WGPUDMABufInfo mDMABufInfo;
  RefPtr<gfx::FileHandleWrapper> mSemaphoreFd;
};

}  // namespace webgpu
}  // namespace mozilla

#endif  // GPU_Texture_H_
