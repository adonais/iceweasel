/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SharedTextureDMABuf.h"

#include "mozilla/gfx/Logging.h"
#include "mozilla/webgpu/WebGPUParent.h"
#include "mozilla/widget/DMABufDevice.h"
#include "mozilla/widget/DMABufSurface.h"

namespace mozilla::webgpu {

// static
UniquePtr<SharedTextureDMABuf> SharedTextureDMABuf::Create(
    WebGPUParent* aParent, const ffi::WGPUDeviceId aDeviceId,
    const uint32_t aWidth, const uint32_t aHeight,
    const struct ffi::WGPUTextureFormat aFormat,
    const ffi::WGPUTextureUsages aUsage) {
  if (aFormat.tag != ffi::WGPUTextureFormat_Bgra8Unorm) {
    gfxCriticalNoteOnce << "Non supported format: " << aFormat.tag;
    return nullptr;
  }

  auto* context = aParent->GetContext();
  int32_t rawFd = -1;
  ffi::WGPUDMABufInfo dmaBufInfo = ffi::wgpu_vkimage_create_with_dma_buf(
      context, aDeviceId, aWidth, aHeight, &rawFd);
  if (!dmaBufInfo.is_valid || rawFd < 0) {
    gfxCriticalNoteOnce << "Failed to create dma-buf backed VkImage";
    return nullptr;
  }

  RefPtr<gfx::FileHandleWrapper> fd =
      new gfx::FileHandleWrapper(UniqueFileHandle(rawFd));

  MOZ_ASSERT(dmaBufInfo.plane_count <= 3);

  if (dmaBufInfo.plane_count > 3) {
    gfxCriticalNoteOnce << "Invalid plane count";
    return nullptr;
  }

  RefPtr<DMABufSurface> surface = DMABufSurfaceRGBA::CreateDMABufSurface(
      std::move(fd), dmaBufInfo, aWidth, aHeight);
  if (!surface) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }

  layers::SurfaceDescriptor desc;
  if (!surface->Serialize(desc)) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }

  const auto sdType = desc.type();
  if (sdType != layers::SurfaceDescriptor::TSurfaceDescriptorDMABuf) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return nullptr;
  }

  return MakeUnique<SharedTextureDMABuf>(
      aWidth, aHeight, aFormat, aUsage, std::move(surface),
      desc.get_SurfaceDescriptorDMABuf(), dmaBufInfo);
}

SharedTextureDMABuf::SharedTextureDMABuf(
    const uint32_t aWidth, const uint32_t aHeight,
    const struct ffi::WGPUTextureFormat aFormat,
    const ffi::WGPUTextureUsages aUsage, RefPtr<DMABufSurface>&& aSurface,
    const layers::SurfaceDescriptorDMABuf& aSurfaceDescriptor,
    const ffi::WGPUDMABufInfo& aDMABufInfo)
    : SharedTexture(aWidth, aHeight, aFormat, aUsage),
      mSurface(std::move(aSurface)),
      mSurfaceDescriptor(aSurfaceDescriptor),
      mDMABufInfo(aDMABufInfo) {}

SharedTextureDMABuf::~SharedTextureDMABuf() = default;

void SharedTextureDMABuf::CleanForRecycling() {
  SharedTexture::CleanForRecycling();
  mSemaphoreFd = nullptr;
}

Maybe<layers::SurfaceDescriptor> SharedTextureDMABuf::ToSurfaceDescriptor() {
  MOZ_ASSERT(mSubmissionIndex > 0);

  layers::SurfaceDescriptor sd;
  if (!mSurface->Serialize(sd)) {
    return Nothing();
  }

  if (sd.type() != layers::SurfaceDescriptor::TSurfaceDescriptorDMABuf) {
    return Nothing();
  }

  auto& sdDMABuf = sd.get_SurfaceDescriptorDMABuf();
  sdDMABuf.semaphoreFd() = mSemaphoreFd;

  return Some(sd);
}

void SharedTextureDMABuf::GetSnapshot(const ipc::Shmem& aDestShmem,
                                      size_t aDestStride) {
  const RefPtr<gfx::SourceSurface> surface = mSurface->GetAsSourceSurface();
  if (!surface) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    gfxCriticalNoteOnce << "Failed to get SourceSurface from DMABufSurface";
    return;
  }

  const RefPtr<gfx::DataSourceSurface> dataSurface = surface->GetDataSurface();
  if (!dataSurface) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  gfx::DataSourceSurface::ScopedMap map(dataSurface,
                                        gfx::DataSourceSurface::READ);
  if (!map.IsMapped()) {
    MOZ_ASSERT_UNREACHABLE("unexpected to be called");
    return;
  }

  uint8_t* src = static_cast<uint8_t*>(map.GetData());
  uint8_t* dst = aDestShmem.get<uint8_t>();

  const size_t src_stride = static_cast<size_t>(map.GetStride());
  const size_t bytesPerRow = static_cast<size_t>(mWidth) * 4;
  MOZ_RELEASE_ASSERT(src_stride >= bytesPerRow);
  MOZ_RELEASE_ASSERT(aDestStride >= bytesPerRow);

  for (uint32_t y = 0; y < mHeight; y++) {
    memcpy(dst, src, bytesPerRow);
    if (bytesPerRow < aDestStride) {
      memset(dst + bytesPerRow, 0, aDestStride - bytesPerRow);
    }
    src += src_stride;
    dst += aDestStride;
  }
}

UniqueFileHandle SharedTextureDMABuf::CloneDmaBufFd() {
  return mSurfaceDescriptor.fds()[0]->ClonePlatformHandle();
}

void SharedTextureDMABuf::onBeforeQueueSubmit(
    const ffi::WGPUGlobal* aContext, RawId aDeviceId, RawId aQueueId,
    nsTArray<ffi::WGPUVkSemaphoreHandle>& aSignalSemaphores) {
  SharedTexture::onBeforeQueueSubmit(aContext, aDeviceId, aQueueId,
                                     aSignalSemaphores);

  int32_t rawFd = -1;
  auto semaphore = ffi::wgpu_vksemaphore_create_signal_semaphore(
      aContext, aDeviceId, aQueueId, &rawFd);
  if (!semaphore) {
    gfxCriticalNoteOnce << "Failed to create VkSemaphore";
    return;
  }

  // Ownership transfers to wgpu_server_queue_submit(), which destroys the
  // semaphore once the submission that signals it has completed.
  aSignalSemaphores.AppendElement(semaphore);

  if (rawFd < 0) {
    gfxCriticalNoteOnce << "Failed to get fd from VkSemaphore";
    return;
  }

  mSemaphoreFd = new gfx::FileHandleWrapper(UniqueFileHandle(rawFd));
}

}  // namespace mozilla::webgpu
