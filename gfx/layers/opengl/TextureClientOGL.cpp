/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/TextureClientOGL.h"

#include "GLContext.h"  // for GLContext, etc
#include "GLLibraryEGL.h"
#include "mozilla/Assertions.h"  // for MOZ_ASSERT, etc
#include "mozilla/gfx/2D.h"      // for Factory
#include "mozilla/gfx/Point.h"   // for IntSize
#include "mozilla/layers/ISurfaceAllocator.h"

#ifdef MOZ_WIDGET_ANDROID
#  include <sys/socket.h>

#  include "mozilla/UniquePtrExtensions.h"
#  include "mozilla/ipc/FileDescriptor.h"
#  include "mozilla/layers/AndroidHardwareBuffer.h"
#endif

using namespace mozilla::gl;

namespace mozilla {
namespace layers {

class CompositableForwarder;

////////////////////////////////////////////////////////////////////////
// AndroidSurface

#ifdef MOZ_WIDGET_ANDROID

already_AddRefed<TextureClient> AndroidSurfaceTextureData::CreateTextureClient(
    AndroidSurfaceTextureHandle aHandle, gfx::IntSize aSize, bool aContinuous,
    gl::OriginPos aOriginPos, bool aHasAlpha, bool aForceBT709ColorSpace,
    Maybe<gfx::Matrix4x4> aTransformOverride, LayersIPCChannel* aAllocator,
    TextureFlags aFlags) {
  if (aOriginPos == gl::OriginPos::BottomLeft) {
    aFlags |= TextureFlags::ORIGIN_BOTTOM_LEFT;
  }

  return TextureClient::CreateWithData(
      new AndroidSurfaceTextureData(aHandle, aSize, aContinuous, aHasAlpha,
                                    aForceBT709ColorSpace, aTransformOverride),
      aFlags, aAllocator);
}

AndroidSurfaceTextureData::AndroidSurfaceTextureData(
    AndroidSurfaceTextureHandle aHandle, gfx::IntSize aSize, bool aContinuous,
    bool aHasAlpha, bool aForceBT709ColorSpace,
    Maybe<gfx::Matrix4x4> aTransformOverride)
    : mHandle(aHandle),
      mSize(aSize),
      mContinuous(aContinuous),
      mHasAlpha(aHasAlpha),
      mForceBT709ColorSpace(aForceBT709ColorSpace),
      mTransformOverride(aTransformOverride) {
  MOZ_ASSERT(mHandle);
}

AndroidSurfaceTextureData::~AndroidSurfaceTextureData() {}

void AndroidSurfaceTextureData::FillInfo(TextureData::Info& aInfo) const {
  aInfo.size = mSize;
  aInfo.format = gfx::SurfaceFormat::UNKNOWN;
  aInfo.hasSynchronization = false;
  aInfo.supportsMoz2D = false;
  aInfo.canExposeMappedData = false;
}

bool AndroidSurfaceTextureData::Serialize(SurfaceDescriptor& aOutDescriptor) {
  aOutDescriptor = SurfaceTextureDescriptor(
      mHandle, mSize,
      mHasAlpha ? gfx::SurfaceFormat::R8G8B8A8 : gfx::SurfaceFormat::R8G8B8X8,
      mContinuous, mForceBT709ColorSpace, mTransformOverride);
  return true;
}

AndroidHardwareBufferTextureData* AndroidHardwareBufferTextureData::Create(
    gfx::IntSize aSize, gfx::SurfaceFormat aFormat) {
  RefPtr<AndroidHardwareBuffer> buffer =
      AndroidHardwareBuffer::Create(aSize, aFormat);
  if (!buffer) {
    return nullptr;
  }
  return new AndroidHardwareBufferTextureData(buffer, aSize, aFormat);
}

AndroidHardwareBufferTextureData::AndroidHardwareBufferTextureData(
    AndroidHardwareBuffer* aAndroidHardwareBuffer, gfx::IntSize aSize,
    gfx::SurfaceFormat aFormat)
    : mAndroidHardwareBuffer(aAndroidHardwareBuffer),
      mSize(aSize),
      mFormat(aFormat),
      mAddress(nullptr),
      mIsLocked(false) {}

AndroidHardwareBufferTextureData::~AndroidHardwareBufferTextureData() {}

void AndroidHardwareBufferTextureData::FillInfo(
    TextureData::Info& aInfo) const {
  aInfo.size = mSize;
  aInfo.format = mFormat;
  aInfo.hasSynchronization = true;
  aInfo.supportsMoz2D = true;
  aInfo.canExposeMappedData = false;
  aInfo.canConcurrentlyReadLock = true;
}

bool AndroidHardwareBufferTextureData::Serialize(
    SurfaceDescriptor& aOutDescriptor) {
  aOutDescriptor = SurfaceDescriptorAndroidHardwareBuffer(
      mAndroidHardwareBuffer->mId, mSize, mFormat);
  return true;
}

bool AndroidHardwareBufferTextureData::Lock(OpenMode aMode) {
  if (!mIsLocked) {
    MOZ_ASSERT(!mAddress);

    uint64_t usage = 0;
    if (aMode & OpenMode::OPEN_READ) {
      usage |= AHARDWAREBUFFER_USAGE_CPU_READ_OFTEN;
    }
    if (aMode & OpenMode::OPEN_WRITE) {
      usage |= AHARDWAREBUFFER_USAGE_CPU_WRITE_OFTEN;
    }

    int ret = mAndroidHardwareBuffer->Lock(usage, 0, &mAddress);
    if (ret) {
      mAddress = nullptr;
      return false;
    }
    mIsLocked = true;
  }
  return true;
}

void AndroidHardwareBufferTextureData::Unlock() {
  // The TextureClient may want to call Lock again before handing ownership
  // to the host, so we cannot call AHardwareBuffer_unlock yet.
}

void AndroidHardwareBufferTextureData::Forget(LayersIPCChannel*) {
  MOZ_ASSERT(!mIsLocked);
  mAndroidHardwareBuffer = nullptr;
  mAddress = nullptr;
}

already_AddRefed<gfx::DrawTarget>
AndroidHardwareBufferTextureData::BorrowDrawTarget() {
  MOZ_ASSERT(mIsLocked);

  const int bpp = (mFormat == gfx::SurfaceFormat::R5G6B5_UINT16) ? 2 : 4;

  return gfx::Factory::CreateDrawTargetForData(
      gfx::BackendType::SKIA, static_cast<unsigned char*>(mAddress),
      gfx::IntSize(mAndroidHardwareBuffer->mSize.width,
                   mAndroidHardwareBuffer->mSize.height),
      mAndroidHardwareBuffer->mStride * bpp, mFormat, true);
}

void AndroidHardwareBufferTextureData::OnForwardedToHost() {
  if (mIsLocked) {
    mAndroidHardwareBuffer->Unlock();
    mAddress = nullptr;
    mIsLocked = false;
  }
}

TextureFlags AndroidHardwareBufferTextureData::GetTextureFlags() const {
  return TextureFlags::WAIT_HOST_USAGE_END;
}

Maybe<uint64_t> AndroidHardwareBufferTextureData::GetBufferId() const {
  return Some(mAndroidHardwareBuffer->mId);
}

UniqueFileHandle AndroidHardwareBufferTextureData::GetAcquireFence() {
  if (!mAndroidHardwareBuffer) {
    return UniqueFileHandle();
  }

  return mAndroidHardwareBuffer->GetAcquireFence();
}

already_AddRefed<TextureClient>
AndroidImageReaderImageTextureData::CreateTextureClient(
    const layers::GpuProcessAndroidImageReaderId aImageReaderId,
    const layers::AndroidMediaCodecFrameId aFrameId, gfx::IntSize aSize,
    gl::OriginPos aOriginPos, bool aHasAlpha, LayersIPCChannel* aAllocator,
    TextureFlags aFlags) {
  if (aOriginPos == gl::OriginPos::BottomLeft) {
    aFlags |= TextureFlags::ORIGIN_BOTTOM_LEFT;
  }

  return TextureClient::CreateWithData(
      new AndroidImageReaderImageTextureData(aImageReaderId, aFrameId, aSize,
                                             aHasAlpha),
      aFlags, aAllocator);
}

AndroidImageReaderImageTextureData::AndroidImageReaderImageTextureData(
    const layers::GpuProcessAndroidImageReaderId aImageReaderId,
    const layers::AndroidMediaCodecFrameId aFrameId, gfx::IntSize aSize,
    bool aHasAlpha)
    : mImageReaderId(aImageReaderId),
      mFrameId(aFrameId),
      mSize(aSize),
      mHasAlpha(aHasAlpha) {}

AndroidImageReaderImageTextureData::~AndroidImageReaderImageTextureData() {}

void AndroidImageReaderImageTextureData::FillInfo(
    TextureData::Info& aInfo) const {
  aInfo.size = mSize;
  aInfo.format = gfx::SurfaceFormat::UNKNOWN;
  aInfo.hasSynchronization = false;
  aInfo.supportsMoz2D = false;
  aInfo.canExposeMappedData = false;
}

bool AndroidImageReaderImageTextureData::Serialize(
    SurfaceDescriptor& aOutDescriptor) {
  aOutDescriptor = AndroidImageReaderImageDescriptor(
      mImageReaderId, mFrameId, mSize,
      mHasAlpha ? gfx::SurfaceFormat::R8G8B8A8 : gfx::SurfaceFormat::R8G8B8X8);
  return true;
}

#endif  // MOZ_WIDGET_ANDROID

}  // namespace layers
}  // namespace mozilla
