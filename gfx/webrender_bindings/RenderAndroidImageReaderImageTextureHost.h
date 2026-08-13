/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_RenderAndroidImageReaderImageTextureHost_H
#define MOZILLA_GFX_RenderAndroidImageReaderImageTextureHost_H

#include "GLContextTypes.h"
#include "GLTypes.h"
#include "RenderTextureHostSWGL.h"

namespace mozilla {

namespace layers {
class AndroidImageConsumer;
class AndroidHardwareBuffer;
}  // namespace layers

namespace wr {

class RenderAndroidImageReaderImageTextureHost final
    : public RenderTextureHostSWGL {
 public:
  explicit RenderAndroidImageReaderImageTextureHost(
      const layers::GpuProcessAndroidImageReaderId aImageReaderId,
      const layers::AndroidMediaCodecFrameId aFrameId, const gfx::IntSize aSize,
      const gfx::SurfaceFormat aFormat);

  wr::WrExternalImage Lock(uint8_t aChannelIndex, gl::GLContext* aGL) override;
  void Unlock() override;
  size_t Bytes() override;
  RenderAndroidImageReaderImageTextureHost*
  AsRenderAndroidImageReaderImageTextureHost() override {
    return this;
  }
  RefPtr<layers::TextureSource> CreateTextureSource(
      layers::TextureSourceProvider* aProvider) override;

  // RenderTextureHostSWGL
  gfx::SurfaceFormat GetFormat() const override;
  gfx::ColorDepth GetColorDepth() const override {
    return gfx::ColorDepth::COLOR_8;
  }
  size_t GetPlaneCount() const override { return 1; }
  bool MapPlane(RenderCompositor* aCompositor, uint8_t aChannelIndex,
                PlaneInfo& aPlaneInfo) override;
  void UnmapPlanes() override;

  gfx::IntSize GetSize() const;

  const layers::GpuProcessAndroidImageReaderId mImageReaderId;
  const layers::AndroidMediaCodecFrameId mFrameId;
  const gfx::IntSize mSize;
  const gfx::SurfaceFormat mFormat;

 private:
  virtual ~RenderAndroidImageReaderImageTextureHost();
  bool EnsureLockable();
  already_AddRefed<gfx::DataSourceSurface> ReadTexImage();

  RefPtr<gl::GLContext> mGL;

  RefPtr<layers::AndroidImageConsumer> mAndroidImageConsumer;

  RefPtr<gfx::DataSourceSurface> mReadback;
};

}  // namespace wr
}  // namespace mozilla

#endif  // MOZILLA_GFX_RenderAndroidImageReaderImageTextureHost_H
