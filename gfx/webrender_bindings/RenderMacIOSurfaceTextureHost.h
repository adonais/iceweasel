/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_RENDERMACIOSURFACETEXTUREHOST_H
#define MOZILLA_GFX_RENDERMACIOSURFACETEXTUREHOST_H

#include "RenderTextureHostSWGL.h"
#include "mozilla/gfx/MacIOSurface.h"
#include "mozilla/layers/GpuFence.h"
#include "mozilla/layers/TextureHostOGL.h"

namespace mozilla {

namespace layers {
class SurfaceDescriptorMacIOSurface;
}  // namespace layers

namespace wr {

class RenderMacIOSurfaceTextureHost final : public RenderTextureHostSWGL {
 public:
  explicit RenderMacIOSurfaceTextureHost(
      MacIOSurface* aSurface,
      const Maybe<layers::CompositeProcessFencesHolderId>& aFencesHolderId);

  wr::WrExternalImage Lock(uint8_t aChannelIndex, gl::GLContext* aGL) override;
  void Unlock() override;

  gfx::IntSize GetSize(uint8_t aChannelIndex) const;
  GLuint GetGLHandle(uint8_t aChannelIndex) const;

  RenderMacIOSurfaceTextureHost* AsRenderMacIOSurfaceTextureHost() override {
    return this;
  }

  size_t Bytes() override;

  MacIOSurface* GetSurface() { return mSurface; }

  // RenderTextureHostSWGL
  size_t GetPlaneCount() const override;
  gfx::SurfaceFormat GetFormat() const override;
  gfx::ColorDepth GetColorDepth() const override;
  gfx::YUVRangedColorSpace GetYUVColorSpace() const override;
  gfx::TransferFunction GetTransferFunction() const override;
  bool MapPlane(RenderCompositor* aCompositor, uint8_t aChannelIndex,
                PlaneInfo& aPlaneInfo) override;
  void UnmapPlanes() override;

  RefPtr<layers::GpuFence> GetGpuFence();

  const RefPtr<MacIOSurface> mSurface;
  const Maybe<layers::CompositeProcessFencesHolderId> mFencesHolderId;

 private:
  virtual ~RenderMacIOSurfaceTextureHost();
  void DeleteTextureHandle();

  RefPtr<gl::GLContext> mGL;
  GLuint mTextureHandles[3];
};

}  // namespace wr
}  // namespace mozilla

#endif  // MOZILLA_GFX_RENDERMACIOSURFACETEXTUREHOST_H
