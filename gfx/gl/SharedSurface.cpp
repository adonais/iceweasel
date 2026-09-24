/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SharedSurface.h"

#include "../2d/2D.h"
#include "GLBlitHelper.h"
#include "GLContext.h"
#include "GLReadTexImageHelper.h"
#include "GLScreenBuffer.h"
#include "ScopedGLHelpers.h"
#include "SharedSurfaceEGL.h"
#include "SharedSurfaceGL.h"
#include "VRManagerChild.h"
#include "mozilla/StaticPrefs_webgl.h"
#include "mozilla/gfx/CanvasRenderThread.h"
#include "mozilla/gfx/Logging.h"
#include "mozilla/gfx/gfxVars.h"
#include "mozilla/layers/CompositorTypes.h"
#include "mozilla/layers/TextureClientSharedSurface.h"
#include "mozilla/layers/TextureForwarder.h"
#include "mozilla/layers/TextureHost.h"
#include "nsThreadUtils.h"

#ifdef XP_WIN
#  include "SharedSurfaceANGLE.h"
#  include "SharedSurfaceD3D11Interop.h"
#endif

#ifdef XP_MACOSX
#  include "SharedSurfaceIO.h"
#endif

#ifdef MOZ_WIDGET_GTK
#  include "SharedSurfaceDMABUF.h"
#  include "gfxPlatformGtk.h"
#  include "mozilla/widget/DMABufDevice.h"
#endif

#ifdef MOZ_WIDGET_ANDROID
#  include "SharedSurfaceAndroidHardwareBuffer.h"
#endif

namespace mozilla {
namespace gl {

////////////////////////////////////////////////////////////////////////
// SharedSurface

SharedSurface::SharedSurface(const SharedSurfaceDesc& desc,
                             UniquePtr<MozFramebuffer> fb)
    : mDesc(desc), mFb(std::move(fb)) {}

SharedSurface::~SharedSurface() {
  MOZ_ASSERT_IF(mTextureHost,
                gfx::CanvasRenderThread::IsInCanvasRenderThread());
}

RefPtr<layers::TextureHost> SharedSurface::GetTextureHost() {
  return mTextureHost;
}

void SharedSurface::SetTextureHost(layers::TextureHost* aTextureHost) {
  MOZ_ASSERT(aTextureHost);
  MOZ_ASSERT(!mTextureHost);

  mTextureHost = aTextureHost;
}

void SharedSurface::ClearTextureHost() { mTextureHost = nullptr; }

void SharedSurface::LockProd() {
  MOZ_ASSERT(!mIsLocked);

  LockProdImpl();

  mDesc.gl->LockSurface(this);
  mIsLocked = true;
}

void SharedSurface::UnlockProd() {
  if (!mIsLocked) return;

  UnlockProdImpl();

  mDesc.gl->UnlockSurface(this);
  mIsLocked = false;
}

////////////////////////////////////////////////////////////////////////
// SurfaceFactory

/* static */
UniquePtr<SurfaceFactory> SurfaceFactory::Create(
    GLContext* const pGl, const layers::TextureType consumerType) {
  auto& gl = *pGl;

  switch (consumerType) {
    case layers::TextureType::D3D11:
#ifdef XP_WIN
      if (gl.IsANGLE()) {
        return SurfaceFactory_ANGLEShareHandle::Create(gl);
      }
      if (StaticPrefs::webgl_dxgl_enabled()) {
        return SurfaceFactory_D3D11Interop::Create(gl);
      }
#endif
      break;

    case layers::TextureType::MacIOSurface:
#ifdef XP_MACOSX
      return MakeUnique<SurfaceFactory_IOSurface>(gl);
#else
      break;
#endif

    case layers::TextureType::DMABUF:
#ifdef MOZ_WIDGET_GTK
      if (gl.GetContextType() == GLContextType::EGL &&
          widget::DMABufDevice::IsDMABufWebGLEnabled()) {
        return SurfaceFactory_DMABUF::Create(gl);
      }
#endif
      break;

    case layers::TextureType::AndroidNativeWindow:
#ifdef MOZ_WIDGET_ANDROID
      MOZ_ASSERT(!gfx::gfxVars::UseWebRenderANGLE());
      if (!gfx::gfxVars::UseWebRenderANGLE()) {
        return MakeUnique<SurfaceFactory_SurfaceTexture>(gl);
      }
#endif
      break;

    case layers::TextureType::AndroidHardwareBuffer:
#ifdef MOZ_WIDGET_ANDROID
      if (XRE_IsGPUProcess()) {
        // Enable SharedSurface of AndroidHardwareBuffer only in GPU process.
        return SurfaceFactory_AndroidHardwareBuffer::Create(gl);
      }
#endif
      break;

    case layers::TextureType::EGLImage:
#ifdef MOZ_WIDGET_ANDROID
      // EGLImages cannot be shared cross-process, so only create them if we are
      // in the process that will consume them.
      if ((XRE_IsParentProcess() && !gfx::gfxVars::GPUProcessEnabled()) ||
          XRE_IsGPUProcess()) {
        MOZ_ASSERT(!gfx::gfxVars::UseWebRenderANGLE());
        return SurfaceFactory_EGLImage::Create(gl);
      }
#endif
      break;

    case layers::TextureType::Unknown:
    case layers::TextureType::Last:
      break;
  }

  // Silence a warning.
  (void)gl;

  return nullptr;
}

SurfaceFactory::SurfaceFactory(const PartialSharedSurfaceDesc& partialDesc)
    : mDesc(partialDesc), mMutex("SurfaceFactor::mMutex") {}

SurfaceFactory::~SurfaceFactory() = default;

}  // namespace gl
}  // namespace mozilla
