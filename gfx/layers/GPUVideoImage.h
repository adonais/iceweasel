/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef GFX_GPU_VIDEO_IMAGE_H
#define GFX_GPU_VIDEO_IMAGE_H

#include "ImageContainer.h"
#include "mozilla/Mutex.h"
#include "mozilla/RefPtr.h"
#include "mozilla/ThreadSafeWeakPtr.h"
#include "mozilla/layers/CompositableClient.h"
#include "mozilla/layers/GPUVideoTextureClient.h"
#include "mozilla/layers/ImageBridgeChild.h"

namespace mozilla {
namespace gl {
class GLBlitHelper;
}
namespace layers {

class IGPUVideoSurfaceManager {
 protected:
  virtual ~IGPUVideoSurfaceManager() = default;

 public:
  NS_INLINE_DECL_PURE_VIRTUAL_REFCOUNTING

  virtual already_AddRefed<gfx::SourceSurface> Readback(
      const SurfaceDescriptorGPUVideo& aSD) = 0;
  virtual already_AddRefed<Image> TransferToImage(
      const SurfaceDescriptorGPUVideo& aSD, const gfx::IntSize& aSize,
      const gfx::ColorDepth& aColorDepth, gfx::YUVColorSpace aYUVColorSpace,
      gfx::ColorSpace2 aColorPrimaries, gfx::TransferFunction aTransferFunction,
      gfx::ColorRange aColorRange) = 0;
  virtual void DeallocateSurfaceDescriptor(
      const SurfaceDescriptorGPUVideo& aSD) = 0;
  virtual void OnSetCurrent(const SurfaceDescriptorGPUVideo& aSD) = 0;
};

// Represents an animated Image that is known to the GPU process.
class GPUVideoImage final : public Image {
  friend class gl::GLBlitHelper;

 public:
  GPUVideoImage(IGPUVideoSurfaceManager* aManager,
                const SurfaceDescriptorGPUVideo& aSD, const gfx::IntSize& aSize,
                const gfx::ColorDepth& aColorDepth,
                gfx::YUVColorSpace aYUVColorSpace,
                gfx::ColorSpace2 aColorPrimaries,
                gfx::TransferFunction aTransferFunction,
                gfx::ColorRange aColorRange)
      : Image(nullptr, ImageFormat::GPU_VIDEO),
        mSize(aSize),
        mColorDepth(aColorDepth),
        mColorSpace(aColorPrimaries),
        mYUVColorSpace(aYUVColorSpace),
        mManager(aManager),
        mSD(aSD),
        // Create the TextureClient immediately since the GPUVideoTextureData
        // is responsible for deallocating the SurfaceDescriptor.
        //
        // Use the RECYCLE texture flag, since it's likely that our 'real'
        // TextureData (in the decoder thread of the GPU process) is using
        // it too, and we want to make sure we don't send the delete message
        // until we've stopped being used on the compositor.
        mTextureClient(TextureClient::CreateWithData(
            new GPUVideoTextureData(aManager, aSD, aSize),
            TextureFlags::RECYCLE, ImageBridgeChild::GetSingleton().get())),
        mTransferFunction(aTransferFunction),
        mColorRange(aColorRange) {}

  virtual ~GPUVideoImage() = default;

  GPUVideoImage* AsGPUVideoImage() override { return this; }

  gfx::IntSize GetSize() const override { return mSize; }

  gfx::ColorDepth GetColorDepth() const override { return mColorDepth; }
  gfx::ColorSpace2 GetColorPrimaries() const { return mColorSpace; }
  gfx::YUVColorSpace GetYUVColorSpace() const { return mYUVColorSpace; }
  gfx::TransferFunction GetTransferFunction() const {
    return mTransferFunction;
  }
  gfx::ColorRange GetColorRange() const { return mColorRange; }

  Maybe<SurfaceDescriptor> GetDesc() override {
    return Some(SurfaceDescriptor(mSD));
  }

  const SurfaceDescriptorGPUVideo& SD() const { return mSD; }

  void OnSetCurrent() override {
    if (NS_WARN_IF(!mManager)) {
      return;
    }
    mManager->OnSetCurrent(mSD);
  }

  already_AddRefed<gfx::SourceSurface> GetAsSourceSurface() override {
    if (!mManager) {
      return nullptr;
    }
    MutexAutoLock lock(mReadbackMutex);
    RefPtr<gfx::SourceSurface> surface(mReadbackSurface);
    if (!surface) {
      surface = mManager->Readback(mSD);
      mReadbackSurface = surface;
    }
    return surface.forget();
  }

  TextureClient* GetTextureClient(KnowsCompositor* aKnowsCompositor) override {
    MOZ_ASSERT(aKnowsCompositor == ImageBridgeChild::GetSingleton(),
               "Must only use GPUVideo on ImageBridge");
    return mTextureClient;
  }

 private:
  const gfx::IntSize mSize;
  const gfx::ColorDepth mColorDepth;
  const gfx::ColorSpace2 mColorSpace;
  const gfx::YUVColorSpace mYUVColorSpace;
  const RefPtr<IGPUVideoSurfaceManager> mManager;
  const SurfaceDescriptorGPUVideo mSD;
  const RefPtr<TextureClient> mTextureClient;
  const gfx::TransferFunction mTransferFunction;
  const gfx::ColorRange mColorRange;
  Mutex mReadbackMutex{"GPUVideoImage::mReadbackMutex"};
  ThreadSafeWeakPtr<gfx::SourceSurface> mReadbackSurface
      MOZ_GUARDED_BY(mReadbackMutex);
};

}  // namespace layers
}  // namespace mozilla

#endif  // GFX_GPU_VIDEO_IMAGE_H
