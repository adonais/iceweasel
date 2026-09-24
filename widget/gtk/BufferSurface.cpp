/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "BufferSurface.h"

#include <gbm.h>

#ifdef MOZ_LOGGING
#  include "gfxUtils.h"
#  include "mozilla/gfx/Logging.h"
#endif

#ifdef MOZ_WAYLAND
#  include "nsWaylandDisplay.h"
#endif
#include "GLContextEGL.h"
#include "GLContextProvider.h"

using namespace mozilla;
using namespace mozilla::widget;
using namespace mozilla::gfx;

BufferSurface::~BufferSurface() = default;

bool BufferSurface::HasAlpha() const {
  return mFOURCCFormat == GBM_FORMAT_ARGB8888 ||
         mFOURCCFormat == GBM_FORMAT_ABGR8888 ||
         mFOURCCFormat == GBM_FORMAT_RGBA8888 ||
         mFOURCCFormat == GBM_FORMAT_BGRA8888 ||
         mFOURCCFormat == GBM_FORMAT_ABGR2101010;
}

BufferSurface::SurfaceType BufferSurface::GetSurfaceType() const {
  switch (mFOURCCFormat) {
    case GBM_FORMAT_ARGB8888:
    case GBM_FORMAT_ABGR8888:
    case GBM_FORMAT_BGRA8888:
    case GBM_FORMAT_RGBA8888:
    case GBM_FORMAT_XRGB8888:
    case GBM_FORMAT_XBGR8888:
    case GBM_FORMAT_BGRX8888:
    case GBM_FORMAT_RGBX8888:
      return SURFACE_RGBA;
    case VA_FOURCC_P010:
    case VA_FOURCC_P016:
    case VA_FOURCC_NV12:
    case VA_FOURCC_YV12:
    case VA_FOURCC_I420:
      return SURFACE_YUV;
    default:
      gfxCriticalNoteOnce << "BufferSurface::GetSurfaceType(): unknown format: "
                          << mFOURCCFormat;
      return SURFACE_RGBA;
  }
}

mozilla::gfx::SurfaceFormat BufferSurface::GetFormat() const {
  switch (mFOURCCFormat) {
    case GBM_FORMAT_ARGB8888:
      return gfx::SurfaceFormat::B8G8R8A8;
    case GBM_FORMAT_ABGR8888:
      return gfx::SurfaceFormat::R8G8B8A8;
    case GBM_FORMAT_BGRA8888:
      return gfx::SurfaceFormat::A8R8G8B8;
    case GBM_FORMAT_RGBA8888:
      gfxCriticalError() << "DMABufSurfaceRGBA::GetFormat(): Unsupported "
                            "format GBM_FORMAT_RGBA8888";
      return gfx::SurfaceFormat::UNKNOWN;
    case GBM_FORMAT_XRGB8888:
      return gfx::SurfaceFormat::B8G8R8X8;
    case GBM_FORMAT_XBGR8888:
      return gfx::SurfaceFormat::R8G8B8X8;
    case GBM_FORMAT_BGRX8888:
      return gfx::SurfaceFormat::X8R8G8B8;
    case GBM_FORMAT_RGBX8888:
      gfxCriticalError() << "DMABufSurfaceRGBA::GetFormat(): Unsupported "
                            "format GBM_FORMAT_RGBX8888";
      return gfx::SurfaceFormat::UNKNOWN;
    case VA_FOURCC_P010:
      return gfx::SurfaceFormat::P010;
    case VA_FOURCC_P016:
      return gfx::SurfaceFormat::P016;
    case VA_FOURCC_NV12:
      return gfx::SurfaceFormat::NV12;
    case VA_FOURCC_YV12:
    case VA_FOURCC_I420:
      return gfx::SurfaceFormat::YUV420;
    case GBM_FORMAT_ABGR2101010:
      return gfx::SurfaceFormat::R10G10B10A2_UINT32;
    default:
      gfxCriticalNoteOnce << "DMABufSurfaceYUV::GetFormat() unknown format: "
                          << mFOURCCFormat;
      return gfx::SurfaceFormat::UNKNOWN;
  }
}

int BufferSurface::GetFormatBPP() const {
  switch (mFOURCCFormat) {
    case GBM_FORMAT_ARGB8888:
    case GBM_FORMAT_ABGR8888:
    case GBM_FORMAT_BGRA8888:
    case GBM_FORMAT_RGBA8888:
    case GBM_FORMAT_XRGB8888:
    case GBM_FORMAT_XBGR8888:
    case GBM_FORMAT_BGRX8888:
    case GBM_FORMAT_RGBX8888:
      return 4;
    default:
      gfxCriticalNoteOnce
          << "BufferSurface::GetFormatBPP() unsupported format: "
          << mFOURCCFormat;
      MOZ_DIAGNOSTIC_CRASH("unsupported format");
      return 0;
  }
}

#ifdef MOZ_WAYLAND
int BufferSurface::GetWLFormat() const {
  switch (mFOURCCFormat) {
    case GBM_FORMAT_ARGB8888:
      return WL_SHM_FORMAT_ARGB8888;
    case GBM_FORMAT_XRGB8888:
      return WL_SHM_FORMAT_XRGB8888;
    case GBM_FORMAT_ABGR8888:
    case GBM_FORMAT_BGRA8888:
    case GBM_FORMAT_XBGR8888:
    case GBM_FORMAT_BGRX8888:
    case VA_FOURCC_P010:
    case VA_FOURCC_P016:
    case VA_FOURCC_NV12:
    case VA_FOURCC_YV12:
    case VA_FOURCC_I420:
      return mFOURCCFormat;
    default:
      gfxCriticalNoteOnce << "BufferSurface::GetWLFormat() unknown format: "
                          << mFOURCCFormat;
      return 0;
  }
}
#endif

size_t BufferSurface::GetUsedMemory(int aWidth, int aHeight) const {
  switch (mFOURCCFormat) {
    case VA_FOURCC_P010:
    case VA_FOURCC_P016:
      // one plane 16b + two planes 16b (half sized).
      return aWidth * aHeight * 2 + (aWidth >> 1) * (aHeight >> 1) * 4;
    case VA_FOURCC_NV12:
    case VA_FOURCC_YV12:
    case VA_FOURCC_I420:
      // one plane 8b + two planes 8b (half sized).
      return aWidth * aHeight + (aWidth >> 1) * (aHeight >> 1) * 2;
    default:
      return aWidth * aHeight * GetFormatBPP();
  }
}

#ifdef MOZ_LOGGING
void BufferSurface::DumpToFile(const char* aFileName) {
  RefPtr<gfx::DataSourceSurface> surf = GetAsSourceSurface();
  gfxUtils::WriteAsPNG(surf, aFileName);
}

#  if 0
// A direct mapping version without GL.
// Does not work on AMD/NVIDIA
void DMABufSurfaceRGBA::DumpToFile(const char* pFileName) {
  uint32_t stride;

  if (!MapReadOnly(&stride)) {
    return;
  }
  cairo_surface_t* surface = nullptr;

  auto unmap = MakeScopeExit([&] {
    if (surface) {
      cairo_surface_destroy(surface);
    }
    Unmap();
  });

  surface = cairo_image_surface_create_for_data(
      (unsigned char*)mMappedRegion[0], CAIRO_FORMAT_ARGB32, mWidth, mHeight,
      stride);
  if (cairo_surface_status(surface) == CAIRO_STATUS_SUCCESS) {
    cairo_surface_write_to_png(surface, pFileName);
  }
}
#  endif
#endif
