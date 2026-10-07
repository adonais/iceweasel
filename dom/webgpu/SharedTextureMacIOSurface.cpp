/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SharedTextureMacIOSurface.h"

#include "mozilla/gfx/Logging.h"
#include "mozilla/gfx/MacIOSurface.h"
#include "mozilla/layers/CompositeProcessFencesHolderMap.h"
#include "mozilla/layers/GpuFenceMTLSharedEvent.h"
#include "mozilla/webgpu/WebGPUParent.h"

namespace mozilla::webgpu {

// static
UniquePtr<SharedTextureMacIOSurface> SharedTextureMacIOSurface::Create(
    WebGPUParent* aParent, const ffi::WGPUDeviceId aDeviceId,
    const uint32_t aWidth, const uint32_t aHeight,
    const struct ffi::WGPUTextureFormat aFormat,
    const ffi::WGPUTextureUsages aUsage) {
  if (aFormat.tag != ffi::WGPUTextureFormat_Bgra8Unorm) {
    gfxCriticalNoteOnce << "Non supported format: " << aFormat.tag;
    return nullptr;
  }

  if (aWidth > MacIOSurface::GetMaxWidth() ||
      aHeight > MacIOSurface::GetMaxHeight()) {
    gfxCriticalNoteOnce << "Requested MacIOSurface is too large: (" << aWidth
                        << ", " << aHeight << ")";
    return nullptr;
  }

  RefPtr<MacIOSurface> surface = MacIOSurface::CreateIOSurface(
      aWidth, aHeight, MacIOSurface::AllowAlpha::Yes);
  if (!surface) {
    gfxCriticalNoteOnce << "Failed to create MacIOSurface: (" << aWidth << ", "
                        << aHeight << ")";
    return nullptr;
  }

  auto fencesHolderId = layers::CompositeProcessFencesHolderId::GetNext();
  auto* fencesHolderMap = layers::CompositeProcessFencesHolderMap::Get();
  MOZ_ASSERT(fencesHolderMap);
  fencesHolderMap->Register(fencesHolderId);

  return MakeUnique<SharedTextureMacIOSurface>(
      aParent, aDeviceId, aWidth, aHeight, aFormat, aUsage, std::move(surface),
      fencesHolderId);
}

SharedTextureMacIOSurface::SharedTextureMacIOSurface(
    WebGPUParent* aParent, const ffi::WGPUDeviceId aDeviceId,
    const uint32_t aWidth, const uint32_t aHeight,
    const struct ffi::WGPUTextureFormat aFormat,
    const ffi::WGPUTextureUsages aUsage, RefPtr<MacIOSurface>&& aSurface,
    const layers::CompositeProcessFencesHolderId aFencesHolderId)
    : SharedTexture(aWidth, aHeight, aFormat, aUsage),
      mParent(aParent),
      mDeviceId(aDeviceId),
      mSurface(std::move(aSurface)),
      mFencesHolderId(aFencesHolderId) {}

SharedTextureMacIOSurface::~SharedTextureMacIOSurface() {
  auto* fencesHolderMap = layers::CompositeProcessFencesHolderMap::Get();
  if (fencesHolderMap) {
    fencesHolderMap->Unregister(mFencesHolderId);
  } else {
    gfxCriticalNoteOnce << "CompositeProcessFencesHolderMap does not exist";
  }
}

uint32_t SharedTextureMacIOSurface::GetIOSurfaceId() {
  auto* fencesHolderMap = layers::CompositeProcessFencesHolderMap::Get();
  MOZ_ASSERT(fencesHolderMap);
  // XXX Add previous fences handling
  auto fences = fencesHolderMap->TakeAllFencesAndForget(mFencesHolderId);

  return mSurface->GetIOSurfaceID();
}

Maybe<layers::SurfaceDescriptor>
SharedTextureMacIOSurface::ToSurfaceDescriptor() {
  MOZ_ASSERT(mSubmissionIndex > 0);

  void* const eventHandle = wgpu_server_get_device_fence_metal_shared_event(
      mParent->GetContext(), mDeviceId);
  if (eventHandle) {
    RefPtr<layers::GpuFence> writeFence =
        layers::GpuFenceMTLSharedEvent::Create(eventHandle, mSubmissionIndex);
    auto* fencesHolderMap = layers::CompositeProcessFencesHolderMap::Get();
    MOZ_ASSERT(fencesHolderMap);
    fencesHolderMap->SetWriteFence(mFencesHolderId, writeFence);
  } else {
    gfxCriticalNoteOnce << "Failed to get MetalSharedEventHandle";
  }

  return Some(layers::SurfaceDescriptorMacIOSurface(
      mSurface->GetIOSurfaceID(), !mSurface->HasAlpha(),
      mSurface->GetYUVColorSpace(), mSurface->GetTransferFunction(),
      Some(mFencesHolderId)));
}

void SharedTextureMacIOSurface::GetSnapshot(const ipc::Shmem& aDestShmem,
                                            size_t aDestStride) {
  if (!mSurface->Lock()) {
    gfxCriticalNoteOnce << "Failed to lock MacIOSurface";
    return;
  }

  const size_t src_stride = mSurface->GetBytesPerRow();
  uint8_t* src = (uint8_t*)mSurface->GetBaseAddress();
  uint8_t* dst = aDestShmem.get<uint8_t>();

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

  mSurface->Unlock();
}

}  // namespace mozilla::webgpu
