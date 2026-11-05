/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "YUVBufferGenerator.h"

#include <algorithm>

#include "VideoUtils.h"
#include "mozilla/CheckedInt.h"

using namespace mozilla::layers;
using namespace mozilla;

bool YUVBufferGenerator::Init(const mozilla::gfx::IntSize& aSize,
                              const ChannelColor& aColor) {
  return Init(gfx::IntRect(gfx::IntPoint(), aSize), aColor);
}

bool YUVBufferGenerator::Init(const mozilla::gfx::IntSize& aSize, uint8_t aLuma,
                              uint8_t aChroma) {
  return Init(aSize, ChannelColor{aLuma, aChroma, aChroma, 0xFF});
}

bool YUVBufferGenerator::Init(const mozilla::gfx::IntRect& aPictureRect,
                              const ChannelColor& aColor) {
  mPictureRect = {};
  mYDataSize = {};
  mChromaSize = {};
  mYPlaneLength = 0;
  mChromaPlaneLength = 0;
  mSourceBuffer.Clear();

  if (aPictureRect.IsEmpty() || aPictureRect.X() < 0 || aPictureRect.Y() < 0) {
    return false;
  }

  CheckedInt32 width(aPictureRect.X());
  width += aPictureRect.Width();
  CheckedInt32 height(aPictureRect.Y());
  height += aPictureRect.Height();
  if (!width.isValid() || !height.isValid()) {
    return false;
  }

  const gfx::IntSize yDataSize(width.value(), height.value());
  if (yDataSize.width > PlanarYCbCrImage::MAX_DIMENSION ||
      yDataSize.height > PlanarYCbCrImage::MAX_DIMENSION) {
    return false;
  }
  const gfx::IntSize chromaSize =
      gfx::ChromaSize(yDataSize, gfx::ChromaSubsampling::HALF_WIDTH_AND_HEIGHT);
  CheckedInt32 nvChromaStride(chromaSize.width);
  nvChromaStride *= 2;

  CheckedInt<size_t> yPlaneLength(width.value());
  yPlaneLength *= height.value();
  CheckedInt<size_t> chromaPlaneLength(chromaSize.width);
  chromaPlaneLength *= chromaSize.height;
  CheckedInt<size_t> frameLength(chromaPlaneLength);
  frameLength *= 2;
  frameLength += yPlaneLength;
  if (!nvChromaStride.isValid() || !yPlaneLength.isValid() ||
      !chromaPlaneLength.isValid() || !frameLength.isValid() ||
      !mSourceBuffer.SetLength(frameLength.value(), mozilla::fallible)) {
    return false;
  }

  mPictureRect = aPictureRect;
  mYDataSize = yDataSize;
  mChromaSize = chromaSize;
  mYPlaneLength = yPlaneLength.value();
  mChromaPlaneLength = chromaPlaneLength.value();
  mColor = aColor;
  return true;
}

mozilla::gfx::IntSize YUVBufferGenerator::GetSize() const {
  return mPictureRect.Size();
}

static uint16_t SampleAtDepth(uint8_t aValue, gfx::ColorDepth aDepth) {
  return uint16_t(aValue) << (gfx::BitDepthForColorDepth(aDepth) - 8);
}

// Alpha is full range, so 0xFF stays opaque at every depth.
static uint16_t FullRangeSampleAtDepth(uint8_t aValue, gfx::ColorDepth aDepth) {
  const uint32_t max = (1u << gfx::BitDepthForColorDepth(aDepth)) - 1;
  return uint16_t((aValue * max + 127) / 255);
}

void YUVBufferGenerator::FillPlane(uint8_t* aPlane, size_t aBytes,
                                   uint16_t aValue, size_t aBytesPerSample) {
  if (aBytesPerSample == 1) {
    memset(aPlane, uint8_t(aValue), aBytes);
    return;
  }
  std::fill_n(reinterpret_cast<uint16_t*>(aPlane), aBytes / 2, aValue);
}

void YUVBufferGenerator::FillNVSourceBuffer(uint8_t aFirstChromaValue,
                                            uint8_t aSecondChromaValue) {
  memset(mSourceBuffer.Elements(), mColor.mY, mYPlaneLength);
  uint8_t* chroma = mSourceBuffer.Elements() + mYPlaneLength;
  for (size_t i = 0; i < mChromaPlaneLength; ++i) {
    *chroma++ = aFirstChromaValue;
    *chroma++ = aSecondChromaValue;
  }
}

already_AddRefed<Image> YUVBufferGenerator::GeneratePlanarImage(
    gfx::ChromaSubsampling aSubsampling, gfx::ColorDepth aDepth, Alpha aAlpha) {
  if (mYDataSize.IsEmpty()) {
    return nullptr;
  }
  const size_t bytes = aDepth == gfx::ColorDepth::COLOR_8 ? 1 : 2;
  const gfx::IntSize chromaSize = gfx::ChromaSize(mYDataSize, aSubsampling);
  const CheckedInt<size_t> yLength =
      CheckedInt<size_t>(mYDataSize.width) * mYDataSize.height * bytes;
  const CheckedInt<size_t> chromaLength =
      CheckedInt<size_t>(chromaSize.width) * chromaSize.height * bytes;
  CheckedInt<size_t> total = yLength + chromaLength * 2;
  if (aAlpha == Alpha::Yes) {
    total += yLength;
  }
  if (!total.isValid() ||
      !mSourceBuffer.SetLength(total.value(), mozilla::fallible)) {
    return nullptr;
  }

  uint8_t* y = mSourceBuffer.Elements();
  uint8_t* cb = y + yLength.value();
  uint8_t* cr = cb + chromaLength.value();
  uint8_t* alpha = cr + chromaLength.value();
  FillPlane(y, yLength.value(), SampleAtDepth(mColor.mY, aDepth), bytes);
  FillPlane(cb, chromaLength.value(), SampleAtDepth(mColor.mCb, aDepth), bytes);
  FillPlane(cr, chromaLength.value(), SampleAtDepth(mColor.mCr, aDepth), bytes);

  PlanarYCbCrData data;
  data.mPictureRect = mPictureRect;
  data.mYChannel = y;
  data.mYStride = int32_t(mYDataSize.width * bytes);
  data.mCbChannel = cb;
  data.mCrChannel = cr;
  data.mCbCrStride = int32_t(chromaSize.width * bytes);
  data.mChromaSubsampling = aSubsampling;
  data.mColorDepth = aDepth;
  data.mYUVColorSpace = DefaultColorSpace(mPictureRect.Size());
  if (aAlpha == Alpha::Yes) {
    FillPlane(alpha, yLength.value(), FullRangeSampleAtDepth(mColor.mA, aDepth),
              bytes);
    data.mAlpha.emplace();
    data.mAlpha->mChannel = alpha;
    data.mAlpha->mSize = mYDataSize;
    data.mAlpha->mDepth = aDepth;
  }

  RefPtr<PlanarYCbCrImage> image =
      new RecyclingPlanarYCbCrImage(new BufferRecycleBin());
  if (NS_FAILED(image->CopyData(data))) {
    return nullptr;
  }
  return image.forget();
}

already_AddRefed<Image> YUVBufferGenerator::GenerateImage(
    ImagePixelFormat aFormat) {
  constexpr auto k420 = gfx::ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
  constexpr auto k422 = gfx::ChromaSubsampling::HALF_WIDTH;
  constexpr auto k444 = gfx::ChromaSubsampling::FULL;
  constexpr auto k8 = gfx::ColorDepth::COLOR_8;
  constexpr auto k10 = gfx::ColorDepth::COLOR_10;
  constexpr auto k12 = gfx::ColorDepth::COLOR_12;
  switch (aFormat) {
    case ImagePixelFormat::I420:
      return GeneratePlanarImage(k420, k8, Alpha::No);
    case ImagePixelFormat::I420P10:
      return GeneratePlanarImage(k420, k10, Alpha::No);
    case ImagePixelFormat::I420P12:
      return GeneratePlanarImage(k420, k12, Alpha::No);
    case ImagePixelFormat::I420A:
      return GeneratePlanarImage(k420, k8, Alpha::Yes);
    case ImagePixelFormat::I420AP10:
      return GeneratePlanarImage(k420, k10, Alpha::Yes);
    case ImagePixelFormat::I420AP12:
      return GeneratePlanarImage(k420, k12, Alpha::Yes);
    case ImagePixelFormat::I422:
      return GeneratePlanarImage(k422, k8, Alpha::No);
    case ImagePixelFormat::I422P10:
      return GeneratePlanarImage(k422, k10, Alpha::No);
    case ImagePixelFormat::I422P12:
      return GeneratePlanarImage(k422, k12, Alpha::No);
    case ImagePixelFormat::I422A:
      return GeneratePlanarImage(k422, k8, Alpha::Yes);
    case ImagePixelFormat::I422AP10:
      return GeneratePlanarImage(k422, k10, Alpha::Yes);
    case ImagePixelFormat::I422AP12:
      return GeneratePlanarImage(k422, k12, Alpha::Yes);
    case ImagePixelFormat::I444:
      return GeneratePlanarImage(k444, k8, Alpha::No);
    case ImagePixelFormat::I444P10:
      return GeneratePlanarImage(k444, k10, Alpha::No);
    case ImagePixelFormat::I444P12:
      return GeneratePlanarImage(k444, k12, Alpha::No);
    case ImagePixelFormat::I444A:
      return GeneratePlanarImage(k444, k8, Alpha::Yes);
    case ImagePixelFormat::I444AP10:
      return GeneratePlanarImage(k444, k10, Alpha::Yes);
    case ImagePixelFormat::I444AP12:
      return GeneratePlanarImage(k444, k12, Alpha::Yes);
    case ImagePixelFormat::NV12:
      return GenerateInterleavedImage(ChromaOrder::CbCr);
    case ImagePixelFormat::NV21:
      return GenerateInterleavedImage(ChromaOrder::CrCb);
    case ImagePixelFormat::RGBA:
    case ImagePixelFormat::RGBX:
    case ImagePixelFormat::BGRA:
    case ImagePixelFormat::BGRX:
      return nullptr;
  }
  MOZ_ASSERT_UNREACHABLE("unsupported ImagePixelFormat");
  return nullptr;
}

already_AddRefed<Image> YUVBufferGenerator::GenerateInterleavedImage(
    ChromaOrder aOrder) {
  if (mSourceBuffer.IsEmpty()) {
    return nullptr;
  }
  const bool cbFirst = aOrder == ChromaOrder::CbCr;
  FillNVSourceBuffer(cbFirst ? mColor.mCb : mColor.mCr,
                     cbFirst ? mColor.mCr : mColor.mCb);

  uint8_t* y = mSourceBuffer.Elements();
  uint8_t* chroma = y + mYPlaneLength;

  PlanarYCbCrData data;
  data.mPictureRect = mPictureRect;
  data.mYChannel = y;
  data.mYStride = mYDataSize.width;
  data.mCbChannel = cbFirst ? chroma : chroma + 1;
  data.mCrChannel = cbFirst ? chroma + 1 : chroma;
  data.mCbSkip = 1;
  data.mCrSkip = 1;
  data.mCbCrStride = 2 * mChromaSize.width;
  data.mChromaSubsampling = gfx::ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
  data.mYUVColorSpace = DefaultColorSpace(mPictureRect.Size());

  RefPtr<NVImage> image = new NVImage();
  if (NS_FAILED(image->SetData(data))) {
    return nullptr;
  }
  return image.forget();
}
