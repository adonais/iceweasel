/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Types.h"

#include <ostream>

#include "nsPrintfCString.h"

namespace mozilla {

std::ostream& operator<<(std::ostream& aOut, const Side& aSide) {
#define Emit(x) \
  case x:       \
    aOut << #x; \
    break

  switch (aSide) {
    Emit(eSideTop);
    Emit(eSideBottom);
    Emit(eSideLeft);
    Emit(eSideRight);
  }

#undef Emit
  return aOut;
}

namespace gfx {

std::ostream& operator<<(std::ostream& aOut, const SurfaceFormat& aFormat) {
#define Emit(x) \
  case x:       \
    aOut << #x; \
    break

  switch (aFormat) {
    Emit(SurfaceFormat::B8G8R8A8);
    Emit(SurfaceFormat::B8G8R8X8);
    Emit(SurfaceFormat::R8G8B8A8);
    Emit(SurfaceFormat::R8G8B8X8);
    Emit(SurfaceFormat::A8R8G8B8);
    Emit(SurfaceFormat::X8R8G8B8);
    Emit(SurfaceFormat::R8G8B8);
    Emit(SurfaceFormat::B8G8R8);
    Emit(SurfaceFormat::R5G6B5_UINT16);
    Emit(SurfaceFormat::R10G10B10A2_UINT32);
    Emit(SurfaceFormat::R10G10B10X2_UINT32);
    Emit(SurfaceFormat::R16G16B16A16F);
    Emit(SurfaceFormat::A8);
    Emit(SurfaceFormat::A16);
    Emit(SurfaceFormat::R8G8);
    Emit(SurfaceFormat::R16G16);
    Emit(SurfaceFormat::YUV420);
    Emit(SurfaceFormat::YUV420P10);
    Emit(SurfaceFormat::YUV422P10);
    Emit(SurfaceFormat::NV12);
    Emit(SurfaceFormat::P016);
    Emit(SurfaceFormat::P010);
    Emit(SurfaceFormat::NV16);
    Emit(SurfaceFormat::P210);
    Emit(SurfaceFormat::YUY2);
    Emit(SurfaceFormat::HSV);
    Emit(SurfaceFormat::Lab);
    Emit(SurfaceFormat::Depth);
    Emit(SurfaceFormat::CMYK);
    Emit(SurfaceFormat::InvertedCMYK);
    Emit(SurfaceFormat::UNKNOWN);
  }

#undef Emit

  return aOut;
}

std::ostream& operator<<(std::ostream& aOut, const DeviceColor& aColor) {
  aOut << nsPrintfCString("dev_rgba(%d, %d, %d, %f)", uint8_t(aColor.r * 255.f),
                          uint8_t(aColor.g * 255.f), uint8_t(aColor.b * 255.f),
                          aColor.a)
              .get();
  return aOut;
}

std::ostream& operator<<(std::ostream& aOut, const SamplingFilter& aFilter) {
  switch (aFilter) {
    case SamplingFilter::GOOD:
      aOut << "SamplingFilter::GOOD";
      break;
    case SamplingFilter::LINEAR:
      aOut << "SamplingFilter::LINEAR";
      break;
    case SamplingFilter::POINT:
      aOut << "SamplingFilter::POINT";
      break;
    case SamplingFilter::SENTINEL:
      aOut << "???";
      break;
  }
  return aOut;
}

std::ostream& operator<<(std::ostream& aOut,
                         const YUVColorSpace& aYUVColorSpace) {
#define Emit(x) \
  case x:       \
    aOut << #x; \
    break

  switch (aYUVColorSpace) {
    Emit(YUVColorSpace::BT601);
    Emit(YUVColorSpace::BT709);
    Emit(YUVColorSpace::BT2020);
    Emit(YUVColorSpace::Identity);
  }

#undef Emit

  return aOut;
}

std::ostream& operator<<(std::ostream& aOut, const ColorDepth& aColorDepth) {
  switch (aColorDepth) {
    case ColorDepth::COLOR_8:
      aOut << "ColorDepth::COLOR_8";
      break;
    case ColorDepth::COLOR_10:
      aOut << "ColorDepth::COLOR_10";
      break;
    case ColorDepth::COLOR_12:
      aOut << "ColorDepth::COLOR_12";
      break;
    case ColorDepth::COLOR_16:
      aOut << "ColorDepth::COLOR_16";
      break;
  }
  return aOut;
}

std::ostream& operator<<(std::ostream& aOut,
                         const TransferFunction& aTransferFunction) {
#define Emit(x) \
  case x:       \
    aOut << #x; \
    break

  switch (aTransferFunction) {
    Emit(TransferFunction::BT709);
    Emit(TransferFunction::SRGB);
    Emit(TransferFunction::PQ);
    Emit(TransferFunction::HLG);
    Emit(TransferFunction::LINEAR);
  }

#undef Emit

  return aOut;
}

std::ostream& operator<<(std::ostream& aOut, const ColorRange& aColorRange) {
  switch (aColorRange) {
    case ColorRange::FULL:
      aOut << "ColorRange::FULL";
      break;
    case ColorRange::LIMITED:
      aOut << "ColorRange::LIMITED";
      break;
  }
  return aOut;
}

std::ostream& operator<<(std::ostream& aOut, const ColorSpace2& aColorSpace2) {
#define Emit(x) \
  case x:       \
    aOut << #x; \
    break

  switch (aColorSpace2) {
    Emit(ColorSpace2::UNKNOWN);
    Emit(ColorSpace2::SRGB);
    Emit(ColorSpace2::DISPLAY_P3);
    Emit(ColorSpace2::BT601_525);
    Emit(ColorSpace2::BT709);
    Emit(ColorSpace2::BT2020);
  }

#undef Emit

  return aOut;
}

std::ostream& operator<<(std::ostream& aOut,
                         const ChromaSubsampling& aChromaSubsampling) {
#define Emit(x) \
  case x:       \
    aOut << #x; \
    break

  switch (aChromaSubsampling) {
    Emit(ChromaSubsampling::FULL);
    Emit(ChromaSubsampling::HALF_WIDTH);
    Emit(ChromaSubsampling::HALF_WIDTH_AND_HEIGHT);
  }

#undef Emit

  return aOut;
}

}  // namespace gfx
}  // namespace mozilla
