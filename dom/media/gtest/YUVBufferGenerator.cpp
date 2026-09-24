/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "YUVBufferGenerator.h"

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
  return Init(aSize, ChannelColor{aLuma, aChroma, aChroma});
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

void YUVBufferGenerator::FillI420SourceBuffer() {
  memset(mSourceBuffer.Elements(), mColor.mY, mYPlaneLength);
  memset(mSourceBuffer.Elements() + mYPlaneLength, mColor.mCb,
         mChromaPlaneLength);
  memset(mSourceBuffer.Elements() + mYPlaneLength + mChromaPlaneLength,
         mColor.mCr, mChromaPlaneLength);
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

already_AddRefed<Image> YUVBufferGenerator::GenerateI420Image() {
  if (mSourceBuffer.IsEmpty()) {
    return nullptr;
  }
  FillI420SourceBuffer();

  RefPtr<PlanarYCbCrImage> image =
      new RecyclingPlanarYCbCrImage(new BufferRecycleBin());
  PlanarYCbCrData data;
  data.mPictureRect = mPictureRect;

  // Y plane.
  uint8_t* y = mSourceBuffer.Elements();
  data.mYChannel = y;
  data.mYStride = mYDataSize.width;
  data.mYSkip = 0;

  // Cr plane (aka V).
  uint8_t* cr = y + mYPlaneLength + mChromaPlaneLength;
  data.mCrChannel = cr;
  data.mCrSkip = 0;

  // Cb plane (aka U).
  uint8_t* cb = y + mYPlaneLength;
  data.mCbChannel = cb;
  data.mCbSkip = 0;

  // CrCb plane vectors.
  data.mCbCrStride = mChromaSize.width;
  data.mChromaSubsampling = gfx::ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;

  data.mYUVColorSpace = DefaultColorSpace(mPictureRect.Size());

  if (NS_FAILED(image->CopyData(data))) {
    return nullptr;
  }
  return image.forget();
}

already_AddRefed<Image> YUVBufferGenerator::GenerateNV12Image() {
  if (mSourceBuffer.IsEmpty()) {
    return nullptr;
  }
  FillNVSourceBuffer(mColor.mCb, mColor.mCr);

  RefPtr<NVImage> image = new NVImage();
  PlanarYCbCrData data;
  data.mPictureRect = mPictureRect;

  // Y plane.
  uint8_t* y = mSourceBuffer.Elements();
  data.mYChannel = y;
  data.mYStride = mYDataSize.width;
  data.mYSkip = 0;

  // Cb plane (aka U).
  uint8_t* cb = y + mYPlaneLength;
  data.mCbChannel = cb;
  data.mCbSkip = 1;

  // Cr plane (aka V).
  uint8_t* cr = y + mYPlaneLength + 1;
  data.mCrChannel = cr;
  data.mCrSkip = 1;

  // 4:2:0.
  data.mCbCrStride = 2 * mChromaSize.width;
  data.mChromaSubsampling = gfx::ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;

  if (NS_FAILED(image->SetData(data))) {
    return nullptr;
  }
  return image.forget();
}

already_AddRefed<Image> YUVBufferGenerator::GenerateNV21Image() {
  if (mSourceBuffer.IsEmpty()) {
    return nullptr;
  }
  FillNVSourceBuffer(mColor.mCr, mColor.mCb);

  RefPtr<NVImage> image = new NVImage();
  PlanarYCbCrData data;
  data.mPictureRect = mPictureRect;

  // Y plane.
  uint8_t* y = mSourceBuffer.Elements();
  data.mYChannel = y;
  data.mYStride = mYDataSize.width;
  data.mYSkip = 0;

  // Cb plane (aka U).
  uint8_t* cb = y + mYPlaneLength + 1;
  data.mCbChannel = cb;
  data.mCbSkip = 1;

  // Cr plane (aka V).
  uint8_t* cr = y + mYPlaneLength;
  data.mCrChannel = cr;
  data.mCrSkip = 1;

  // 4:2:0.
  data.mCbCrStride = 2 * mChromaSize.width;
  data.mChromaSubsampling = gfx::ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;

  data.mYUVColorSpace = DefaultColorSpace(mPictureRect.Size());

  if (NS_FAILED(image->SetData(data))) {
    return nullptr;
  }
  return image.forget();
}
