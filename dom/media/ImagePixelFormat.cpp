/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ImagePixelFormat.h"

#include "ImageContainer.h"
#include "mozilla/Assertions.h"
#include "mozilla/gfx/Types.h"

#ifdef XP_MACOSX
#  include "MacIOSurfaceImage.h"
#elif MOZ_WAYLAND
#  include "mozilla/layers/DMABUFSurfaceImage.h"
#  include "mozilla/widget/DMABufSurface.h"
#endif

namespace mozilla {

using gfx::ChromaSubsampling;
using gfx::ColorDepth;
using gfx::SourceSurface;
using gfx::SurfaceFormat;
using layers::Image;
using layers::PlanarYCbCrData;

// 16-bit samples have no name.
static Maybe<ImagePixelFormat> PlanarYCbCrToPixelFormat(
    ChromaSubsampling aSubsampling, ColorDepth aColorDepth, bool aHasAlpha) {
  switch (aColorDepth) {
    case ColorDepth::COLOR_8:
      switch (aSubsampling) {
        case ChromaSubsampling::HALF_WIDTH_AND_HEIGHT:
          return Some(aHasAlpha ? ImagePixelFormat::I420A
                                : ImagePixelFormat::I420);
        case ChromaSubsampling::HALF_WIDTH:
          return Some(aHasAlpha ? ImagePixelFormat::I422A
                                : ImagePixelFormat::I422);
        case ChromaSubsampling::FULL:
          return Some(aHasAlpha ? ImagePixelFormat::I444A
                                : ImagePixelFormat::I444);
      }
      break;
    case ColorDepth::COLOR_10:
      switch (aSubsampling) {
        case ChromaSubsampling::HALF_WIDTH_AND_HEIGHT:
          return Some(aHasAlpha ? ImagePixelFormat::I420AP10
                                : ImagePixelFormat::I420P10);
        case ChromaSubsampling::HALF_WIDTH:
          return Some(aHasAlpha ? ImagePixelFormat::I422AP10
                                : ImagePixelFormat::I422P10);
        case ChromaSubsampling::FULL:
          return Some(aHasAlpha ? ImagePixelFormat::I444AP10
                                : ImagePixelFormat::I444P10);
      }
      break;
    case ColorDepth::COLOR_12:
      switch (aSubsampling) {
        case ChromaSubsampling::HALF_WIDTH_AND_HEIGHT:
          return Some(aHasAlpha ? ImagePixelFormat::I420AP12
                                : ImagePixelFormat::I420P12);
        case ChromaSubsampling::HALF_WIDTH:
          return Some(aHasAlpha ? ImagePixelFormat::I422AP12
                                : ImagePixelFormat::I422P12);
        case ChromaSubsampling::FULL:
          return Some(aHasAlpha ? ImagePixelFormat::I444AP12
                                : ImagePixelFormat::I444P12);
      }
      break;
    case ColorDepth::COLOR_16:
      break;
  }
  return Nothing();
}

static Maybe<ImagePixelFormat> PlanarYCbCrDataToPixelFormat(
    const PlanarYCbCrData& aData) {
  if (aData.mYSkip) {
    return Nothing();
  }
  if (!aData.mCbSkip && !aData.mCrSkip) {
    return PlanarYCbCrToPixelFormat(aData.mChromaSubsampling, aData.mColorDepth,
                                    aData.mAlpha.isSome());
  }
  if (aData.mCbSkip != 1 || aData.mCrSkip != 1 ||
      aData.mChromaSubsampling != ChromaSubsampling::HALF_WIDTH_AND_HEIGHT ||
      aData.mColorDepth != ColorDepth::COLOR_8 || aData.mAlpha.isSome()) {
    return Nothing();
  }
  if (aData.mCrChannel == aData.mCbChannel + 1) {
    return Some(ImagePixelFormat::NV12);
  }
  if (aData.mCbChannel == aData.mCrChannel + 1) {
    return Some(ImagePixelFormat::NV21);
  }
  return Nothing();
}

static Maybe<ImagePixelFormat> SurfaceFormatToPixelFormat(
    SurfaceFormat aFormat) {
  switch (aFormat) {
    case SurfaceFormat::B8G8R8A8:
      return Some(ImagePixelFormat::BGRA);
    case SurfaceFormat::B8G8R8X8:
      return Some(ImagePixelFormat::BGRX);
    case SurfaceFormat::R8G8B8A8:
      return Some(ImagePixelFormat::RGBA);
    case SurfaceFormat::R8G8B8X8:
      return Some(ImagePixelFormat::RGBX);
    case SurfaceFormat::YUV420:
      return Some(ImagePixelFormat::I420);
    case SurfaceFormat::YUV420P10:
      return Some(ImagePixelFormat::I420P10);
    case SurfaceFormat::YUV422P10:
      return Some(ImagePixelFormat::I422P10);
    case SurfaceFormat::NV12:
      return Some(ImagePixelFormat::NV12);
    default:
      break;
  }
  return Nothing();
}

static const PlanarYCbCrData* GetPlanarYCbCrData(Image* aImage) {
  if (layers::PlanarYCbCrImage* image = aImage->AsPlanarYCbCrImage()) {
    return image->GetData();
  }
  if (layers::NVImage* image = aImage->AsNVImage()) {
    return image->GetData();
  }
  return nullptr;
}

Maybe<ImagePixelFormat> ImageToPixelFormat(Image* aImage) {
  if (!aImage) {
    return Nothing();
  }
  switch (aImage->GetFormat()) {
    case ImageFormat::PLANAR_YCBCR:
    case ImageFormat::NV_IMAGE: {
      const PlanarYCbCrData* data = GetPlanarYCbCrData(aImage);
      return data ? PlanarYCbCrDataToPixelFormat(*data) : Nothing();
    }
    case ImageFormat::GPU_VIDEO:
      // This process only reads a remote image back as RGB.
      return Some(ImagePixelFormat::BGRX);
    case ImageFormat::MOZ2D_SURFACE: {
      RefPtr<SourceSurface> surface = aImage->GetAsSourceSurface();
      return surface ? SurfaceFormatToPixelFormat(surface->GetFormat())
                     : Nothing();
    }
#ifdef XP_MACOSX
    case ImageFormat::MAC_IOSURFACE: {
      MacIOSurface* surface = aImage->AsMacIOSurfaceImage()->GetSurface();
      return surface ? SurfaceFormatToPixelFormat(surface->GetFormat())
                     : Nothing();
    }
#endif
#ifdef MOZ_WAYLAND
    case ImageFormat::DMABUF: {
      auto* surface = aImage->AsDMABUFSurfaceImage()->GetSurface();
      return surface ? SurfaceFormatToPixelFormat(surface->GetFormat())
                     : Nothing();
    }
#endif
    default:
      return Nothing();
  }
}

bool IsRGB(ImagePixelFormat aFormat) {
  switch (aFormat) {
    case ImagePixelFormat::RGBA:
    case ImagePixelFormat::RGBX:
    case ImagePixelFormat::BGRA:
    case ImagePixelFormat::BGRX:
      return true;
    case ImagePixelFormat::I420:
    case ImagePixelFormat::I420P10:
    case ImagePixelFormat::I420P12:
    case ImagePixelFormat::I420A:
    case ImagePixelFormat::I420AP10:
    case ImagePixelFormat::I420AP12:
    case ImagePixelFormat::I422:
    case ImagePixelFormat::I422P10:
    case ImagePixelFormat::I422P12:
    case ImagePixelFormat::I422A:
    case ImagePixelFormat::I422AP10:
    case ImagePixelFormat::I422AP12:
    case ImagePixelFormat::I444:
    case ImagePixelFormat::I444P10:
    case ImagePixelFormat::I444P12:
    case ImagePixelFormat::I444A:
    case ImagePixelFormat::I444AP10:
    case ImagePixelFormat::I444AP12:
    case ImagePixelFormat::NV12:
    case ImagePixelFormat::NV21:
      return false;
  }
  MOZ_ASSERT_UNREACHABLE("unsupported ImagePixelFormat");
  return false;
}

}  // namespace mozilla
