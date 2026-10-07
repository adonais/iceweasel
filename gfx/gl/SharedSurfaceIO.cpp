/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SharedSurfaceIO.h"

#include "GLContextCGL.h"
#include "GLContextEGL.h"
#include "MozFramebuffer.h"
#include "ScopedGLHelpers.h"
#include "mozilla/gfx/MacIOSurface.h"
#include "mozilla/layers/CompositeProcessFencesHolderMap.h"
#include "mozilla/layers/GpuFence.h"
#include "mozilla/layers/GpuFenceMTLSharedEvent.h"
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
                                             false, *target, tex->name);
  if (!fb) {
    return nullptr;
  }

  Maybe<layers::CompositeProcessFencesHolderId> fencesHolderId;
  auto* fencesHolderMap = layers::CompositeProcessFencesHolderMap::Get();

  const bool useFence = [&]() -> bool {
    if (desc.gl->GetContextType() != GLContextType::EGL) {
      return false;
    }
    const auto& gle = GLContextEGL::Cast(desc.gl);
    const auto& egl = gle->mEgl;
    return fencesHolderMap && egl->IsExtensionSupported(
                                  EGLExtension::ANGLE_metal_shared_event_sync);
  }();

  if (useFence) {
    fencesHolderId = Some(layers::CompositeProcessFencesHolderId::GetNext());
    fencesHolderMap->Register(fencesHolderId.ref());
  }

  return AsUnique(new SharedSurface_IOSurface(
      desc, std::move(fb), std::move(tex), ioSurf, fencesHolderId));
}

SharedSurface_IOSurface::SharedSurface_IOSurface(
    const SharedSurfaceDesc& aDesc, UniquePtr<MozFramebuffer> aFb,
    UniquePtr<Texture> aTex, const RefPtr<MacIOSurface>& aIOSurf,
    const Maybe<layers::CompositeProcessFencesHolderId> aFencesHolderId)
    : SharedSurface(aDesc, std::move(aFb)),
      mTex(std::move(aTex)),
      mIOSurf(aIOSurf),
      mFencesHolderId(aFencesHolderId) {}

SharedSurface_IOSurface::~SharedSurface_IOSurface() {
  if (mFencesHolderId.isSome()) {
    auto* fencesHolderMap = layers::CompositeProcessFencesHolderMap::Get();
    if (fencesHolderMap) {
      fencesHolderMap->Unregister(mFencesHolderId.ref());
    } else {
      gfxCriticalNoteOnce << "CompositeProcessFencesHolderMap does not exist";
    }
  }
}

void SharedSurface_IOSurface::ProducerAcquireImpl() {
  if (mFencesHolderId.isNothing()) {
    return;
  }

  auto* fencesHolderMap = layers::CompositeProcessFencesHolderMap::Get();
  MOZ_ASSERT(fencesHolderMap);
  // XXX Add previous fences handling
  auto fences = fencesHolderMap->TakeAllFencesAndForget(mFencesHolderId.ref());
}

void SharedSurface_IOSurface::ProducerReleaseImpl() {
  const auto& gl = mDesc.gl;
  if (!gl) return;
  gl->MakeCurrent();

  if (mFencesHolderId.isSome()) {
    MOZ_ASSERT(gl->GetContextType() == GLContextType::EGL);

    const auto& gle = GLContextEGL::Cast(gl);
    const auto& egl = gle->mEgl;

    MOZ_ASSERT(
        egl->IsExtensionSupported(EGLExtension::ANGLE_metal_shared_event_sync));

    const uint64_t signalValue = 1;
    const EGLAttrib attribs[] = {
        LOCAL_EGL_SYNC_METAL_SHARED_EVENT_SIGNAL_VALUE_LO_ANGLE,
        static_cast<EGLAttrib>(signalValue & 0xFFFFFFFF),
        LOCAL_EGL_SYNC_METAL_SHARED_EVENT_SIGNAL_VALUE_HI_ANGLE,
        static_cast<EGLAttrib>(signalValue >> 32), LOCAL_EGL_NONE};
    const EGLSync sync =
        egl->fCreateSyncEGL15(LOCAL_EGL_SYNC_METAL_SHARED_EVENT_ANGLE, attribs);
    if (!sync) {
      gfxCriticalNote << "Creating EGL_SYNC_METAL_SHARED_EVENT sync failed";
      gl->fFinish();
      return;
    }
    void* const sharedEvent = egl->fCopyMetalSharedEventANGLE(sync);
    egl->fDestroySync(sync);

    if (!sharedEvent) {
      gfxCriticalNote << "eglCopyMetalSharedEventANGLE failed";
      gl->fFinish();
      return;
    }
    RefPtr<layers::GpuFence> writeFence =
        layers::GpuFenceMTLSharedEvent::Create(sharedEvent, signalValue);
    if (!writeFence) {
      gfxCriticalNote << "GpuFenceMTLSharedEvent::Create failed";
      gl->fFinish();
      return;
    }

    // We must flush here else the shared event may never be signalled.
    gl->fFlush();

    auto* fencesHolderMap = layers::CompositeProcessFencesHolderMap::Get();
    MOZ_ASSERT(fencesHolderMap);
    fencesHolderMap->SetWriteFence(mFencesHolderId.ref(), writeFence);
    return;
  }

  gl->fFlush();
}

Maybe<layers::SurfaceDescriptor>
SharedSurface_IOSurface::ToSurfaceDescriptor() {
  const bool isOpaque = false;  // RGBA
  return Some(layers::SurfaceDescriptorMacIOSurface(
      mIOSurf->GetIOSurfaceID(), isOpaque, mIOSurf->GetYUVColorSpace(),
      mIOSurf->GetTransferFunction(), mFencesHolderId));
}

}  // namespace gl
}  // namespace mozilla
