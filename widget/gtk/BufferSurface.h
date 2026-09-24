
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef BufferSurface_h_
#define BufferSurface_h_

#include <stdint.h>

#include "GLTypes.h"
#include "mozilla/RefPtr.h"
#include "mozilla/gfx/Types.h"
#include "nsISupportsImpl.h"

typedef void* EGLImageKHR;
struct wl_buffer;

// The files bellow has exact description of all formats:
// media/ffvpx/libavutil/pixdesc.h
// media/ffvpx/libavutil/pixdesc.c

#ifndef VA_FOURCC_NV12
#  define VA_FOURCC_NV12 0x3231564E
#endif
#ifndef VA_FOURCC_I420
#  define VA_FOURCC_I420 0x30323449
#endif
#ifndef VA_FOURCC_YV12
#  define VA_FOURCC_YV12 0x32315659
#endif
#ifndef VA_FOURCC_P010
#  define VA_FOURCC_P010 0x30313050
#endif
#ifndef VA_FOURCC_P016
#  define VA_FOURCC_P016 0x36313050
#endif

namespace mozilla {
namespace gfx {
class DrawTarget;
class FileHandleWrapper;
class DataSourceSurface;
}  // namespace gfx
namespace gl {
class GLContext;
}  // namespace gl
}  // namespace mozilla

class BufferSurface {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(BufferSurface)

  enum SurfaceType {
    SURFACE_RGBA = 0,
    SURFACE_YUV = 1,
  };

#ifdef MOZ_LOGGING
  constexpr static const char* sSurfaceTypeNames[] = {"RGBA", "YUV"};
#endif

  // WidthAligned/HeightAligned is size of buffer while
  // Width/Height is size of actual content.
  virtual int GetWidth(int aPlane = 0) = 0;
  virtual int GetHeight(int aPlane = 0) = 0;

  // CPU (shared memory) access to the surface. Default implementations are
  // no-op for surfaces which don't provide CPU-accessible memory (like DMABuf).
  virtual already_AddRefed<mozilla::gfx::DrawTarget> Lock() { return nullptr; }
  virtual void* GetImageData() { return nullptr; }

  // GPU (GL texture) access to the surface. Default implementations are no-op
  // for surfaces which aren't backed by GL textures (like shared memory).
  virtual bool CreateTexture(mozilla::gl::GLContext* aGLContext,
                             int aPlane = 0) {
    return false;
  }
  virtual void ReleaseTextures() {}
  virtual GLuint GetTexture(int aPlane = 0) { return 0; }
  virtual EGLImageKHR GetEGLImage(int aPlane = 0) { return nullptr; }
  virtual int GetTextureCount() { return 0; }

  SurfaceType GetSurfaceType() const;
  const char* GetSurfaceTypeName() const {
    return sSurfaceTypeNames[static_cast<int>(GetSurfaceType())];
  };

  bool HasAlpha() const;
  mozilla::gfx::SurfaceFormat GetFormat() const;
  int32_t GetFOURCCFormat() const { return mFOURCCFormat; };
  int GetFormatBPP() const;
#ifdef MOZ_WAYLAND
  int GetWLFormat() const;
#endif

  virtual already_AddRefed<mozilla::gfx::DataSourceSurface>
  GetAsSourceSurface() = 0;

#ifdef MOZ_LOGGING
  void DumpToFile(const char* aFileName);
#endif

  void SetYUVColorSpace(mozilla::gfx::YUVColorSpace aColorSpace) {
    mColorSpace = aColorSpace;
  }
  mozilla::gfx::YUVColorSpace GetYUVColorSpace() { return mColorSpace; }
  void SetColorPrimaries(mozilla::gfx::ColorSpace2 aColorPrimaries) {
    mColorPrimaries = aColorPrimaries;
  }
  void SetTransferFunction(mozilla::gfx::TransferFunction aTransferFunction) {
    mTransferFunction = aTransferFunction;
  }
  mozilla::gfx::TransferFunction GetTransferFunction() {
    return mTransferFunction;
  }
  bool IsHDRSurface() {
    return mTransferFunction == mozilla::gfx::TransferFunction::PQ ||
           mTransferFunction == mozilla::gfx::TransferFunction::HLG;
  }

  void SetHDRMetadata(mozilla::gfx::HDRMetadata aHDRMetadata) {
    mHDRMetadata = aHDRMetadata;
  }

  mozilla::gfx::HDRMetadata GetHDRMetadata() { return mHDRMetadata; }

  bool IsFullRange() { return mColorRange == mozilla::gfx::ColorRange::FULL; };
  void SetColorRange(mozilla::gfx::ColorRange aColorRange) {
    mColorRange = aColorRange;
  };

#ifdef MOZ_WAYLAND
  // Create wl_buffer over BufferSurface, ownership is transfered to caller.
  // If underlying BufferSurface is deleted before wl_buffer destroy,
  // behaviour is undefined and may lead to rendering artifacts as
  // GPU memory may be reused.
  //
  // Every CreateWlBuffer() creates new wl_buffer and one BufferSurface
  // can have multiple wl_buffers created over it.
  // That's correct as one BufferSurfacemay be attached and rendred by
  // more wl_surfaces at the same time.
  virtual wl_buffer* CreateWlBuffer() { return nullptr; }
#endif

 protected:
  BufferSurface() = default;
  virtual ~BufferSurface();

  size_t GetUsedMemory(int aWidth, int aHeight) const;

  // Actual FOURCC format of whole surface (includes all planes).
  int32_t mFOURCCFormat = 0;

  // mGL is tied to textures/eglimages created over surface and it's null for
  // surface without textures/eglimages.
  RefPtr<mozilla::gl::GLContext> mGL;

  mozilla::gfx::ColorRange mColorRange = mozilla::gfx::ColorRange::LIMITED;
  mozilla::gfx::YUVColorSpace mColorSpace =
      mozilla::gfx::YUVColorSpace::Default;
  mozilla::gfx::ColorSpace2 mColorPrimaries =
      mozilla::gfx::ColorSpace2::UNKNOWN;
  mozilla::gfx::TransferFunction mTransferFunction =
      mozilla::gfx::TransferFunction::Default;
  mozilla::gfx::HDRMetadata mHDRMetadata{};
};

#endif
