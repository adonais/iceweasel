/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SharedSurfaceIO.h"

#include "GLContextCGL.h"
#include "MozFramebuffer.h"
#include "ScopedGLHelpers.h"
#include "mozilla/gfx/MacIOSurface.h"
#include "mozilla/layers/LayersSurfaces.h"  // for SurfaceDescriptor, etc
#include "mozilla/layers/LayersTypes.h"

namespace mozilla {
namespace gl {

// -
// Factory

SurfaceFactory_IOSurface::SurfaceFactory_IOSurface(GLContext& gl)
    : SurfaceFactory({&gl, SharedSurfaceType::IOSurface,
                      layers::TextureType::MacIOSurface, true}),
      mMaxDims(gfx::IntSize::Truncate(MacIOSurface::GetMaxWidth(),
                                      MacIOSurface::GetMaxHeight())) {}

// -
// Surface

static Maybe<GLenum> BackTextureWithIOSurf(GLContext* const gl,
                                           const GLuint tex,
                                           MacIOSurface* const ioSurf) {
  MOZ_ASSERT(gl->IsCurrent());

  const GLenum target = gl->GetPreferredMacIOSurfaceTextureTarget();

  ScopedBindTexture texture(gl, tex, target);

  gl->fTexParameteri(target, LOCAL_GL_TEXTURE_MIN_FILTER, LOCAL_GL_LINEAR);
  gl->fTexParameteri(target, LOCAL_GL_TEXTURE_MAG_FILTER, LOCAL_GL_LINEAR);
  gl->fTexParameteri(target, LOCAL_GL_TEXTURE_WRAP_S, LOCAL_GL_CLAMP_TO_EDGE);
  gl->fTexParameteri(target, LOCAL_GL_TEXTURE_WRAP_T, LOCAL_GL_CLAMP_TO_EDGE);

  if (!ioSurf->BindTexImage(gl, 0)) {
    return Nothing();
  }
  return Some(target);
}

/*static*/
UniquePtr<SharedSurface_IOSurface> SharedSurface_IOSurface::Create(
    const SharedSurfaceDesc& desc) {
  const auto& size = desc.size;
  const RefPtr<MacIOSurface> ioSurf = MacIOSurface::CreateIOSurface(
      size.width, size.height, MacIOSurface::AllowAlpha::Yes);
  if (!ioSurf) {
    NS_WARNING("Failed to create MacIOSurface.");
    return nullptr;
  }

  ioSurf->SetColorSpace(desc.colorSpace);

  // -

  auto tex = MakeUnique<Texture>(*desc.gl);
  Maybe<GLenum> target = BackTextureWithIOSurf(desc.gl, tex->name, ioSurf);
  if (!target) {
    return nullptr;
  }

  auto fb = MozFramebuffer::CreateForBacking(desc.gl, desc.size, 0, false,
                                             *target, tex->name);
  if (!fb) return nullptr;

  return AsUnique(
      new SharedSurface_IOSurface(desc, std::move(fb), std::move(tex), ioSurf));
}

SharedSurface_IOSurface::SharedSurface_IOSurface(
    const SharedSurfaceDesc& desc, UniquePtr<MozFramebuffer> fb,
    UniquePtr<Texture> tex, const RefPtr<MacIOSurface>& ioSurf)
    : SharedSurface(desc, std::move(fb)),
      mTex(std::move(tex)),
      mIOSurf(ioSurf) {}

SharedSurface_IOSurface::~SharedSurface_IOSurface() = default;

void SharedSurface_IOSurface::ProducerReleaseImpl() {
  const auto& gl = mDesc.gl;
  if (!gl) return;
  gl->MakeCurrent();
  gl->fFlush();
}

Maybe<layers::SurfaceDescriptor>
SharedSurface_IOSurface::ToSurfaceDescriptor() {
  const bool isOpaque = false;  // RGBA
  return Some(layers::SurfaceDescriptorMacIOSurface(
      mIOSurf->GetIOSurfaceID(), isOpaque, mIOSurf->GetYUVColorSpace(),
      mIOSurf->GetTransferFunction(), (layers::GpuFence*)nullptr));
}

}  // namespace gl
}  // namespace mozilla
