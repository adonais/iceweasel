/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <limits>

#include "ImageContainer.h"
#include "YUVBufferGenerator.h"
#include "gtest/gtest.h"
#include "mozilla/EnumeratedRange.h"
#include "mozilla/Maybe.h"
#include "mozilla/RefPtr.h"
#include "mozilla/gfx/Types.h"

using mozilla::ImagePixelFormat;
using mozilla::gfx::ChromaSubsampling;
using mozilla::gfx::ColorDepth;
using mozilla::gfx::IntPoint;
using mozilla::gfx::IntRect;
using mozilla::gfx::IntSize;
using mozilla::layers::Image;
using mozilla::layers::PlanarYCbCrData;
using mozilla::layers::PlanarYCbCrImage;

// Init() sizes its source buffer from the luma plane length, but the image
// creators lay out two chroma planes of ceil(width / 2) x ceil(height / 2).
// Those two sizes agree only for even dimensions, so at odd dimensions the
// second plane does not fit in what Init() reserved. The shortfall is
// observable because the affected bytes do not hold the value Init() filled
// with.
TEST(YUVBufferGenerator, I420ChromaPlanesAreFullyInitialised)
{
  static const IntSize kSizes[] = {
      {65, 64}, {64, 65}, {65, 65}, {64, 64}, {66, 66}};

  for (const IntSize& size : kSizes) {
    YUVBufferGenerator generator;
    generator.Init(size);

    RefPtr<mozilla::layers::Image> image = generator.GenerateI420Image();
    ASSERT_TRUE(!!image)
    << size.width << "x" << size.height << ": failed to generate an image";

    PlanarYCbCrImage* planar = image->AsPlanarYCbCrImage();
    ASSERT_TRUE(!!planar)
    << size.width << "x" << size.height << ": image is not planar YCbCr";

    const PlanarYCbCrImage::Data* data = planar->GetData();
    ASSERT_TRUE(!!data)
    << size.width << "x" << size.height << ": no data";

    const auto sizes = data->GetPlaneSizes();
    ASSERT_TRUE(sizes)
    << size.width << "x" << size.height << ": invalid plane sizes";
    const IntSize chromaSize = sizes->mCbCr;
    ASSERT_GT(chromaSize.width, 0);
    ASSERT_GT(chromaSize.height, 0);

    // GenerateI420Image() fills everything Init() reserved, so every byte
    // within the chroma region holds one repeated value. Cb is the first
    // chroma plane and always fits, so its first byte is the fill value either
    // way. Reading it rather than hardcoding keeps this test independent of
    // that value, and comparing both planes against it means a non-uniform fill
    // fails on Cb.
    const uint8_t expectedFill = data->mCbChannel[0];

    const uint8_t* planes[] = {data->mCbChannel, data->mCrChannel};
    const char* names[] = {"Cb", "Cr"};

    for (size_t p = 0; p < 2; ++p) {
      size_t mismatches = 0;
      int32_t firstBadRow = -1;
      int32_t firstBadCol = -1;
      uint8_t firstBadValue = 0;

      for (int32_t row = 0; row < chromaSize.height; ++row) {
        const uint8_t* rowPtr = planes[p] + row * data->mCbCrStride;
        for (int32_t col = 0; col < chromaSize.width; ++col) {
          const uint8_t actual = rowPtr[col];
          if (actual != expectedFill) {
            if (firstBadRow < 0) {
              firstBadRow = row;
              firstBadCol = col;
              firstBadValue = actual;
            }
            ++mismatches;
          }
        }
      }

      EXPECT_EQ(mismatches, size_t(0))
          << size.width << "x" << size.height << ": " << mismatches << " of "
          << (chromaSize.width * chromaSize.height) << " bytes in the "
          << names[p] << " plane do not match the fill value 0x" << std::hex
          << int(expectedFill) << std::dec << "; first at row " << firstBadRow
          << " col " << firstBadCol << " = 0x" << std::hex << int(firstBadValue)
          << std::dec
          << ". Either the source buffer is short of "
             "2 * ceil(width / 2) * ceil(height / 2), or the generator no "
             "longer fills "
             "the chroma region with a single repeated byte.";
    }
  }
}

static void ExpectPlaneValues(const uint8_t* aChannel, int32_t aStride,
                              int32_t aSkip, const IntSize& aSize,
                              uint8_t aExpected) {
  ASSERT_NE(aChannel, nullptr);
  for (int32_t row = 0; row < aSize.height; ++row) {
    for (int32_t column = 0; column < aSize.width; ++column) {
      EXPECT_EQ(aChannel[row * aStride + column * (aSkip + 1)], aExpected)
          << "row " << row << ", column " << column;
    }
  }
}

TEST(YUVBufferGenerator, OwnsOddCroppedImageData)
{
  // A non-zero origin and odd extents exercise endpoint and 4:2:0 rounding.
  const IntRect pictureRect(16, 16, 289, 209);
  const IntSize yDataSize(pictureRect.XMost(), pictureRect.YMost());
  const IntSize chromaSize = mozilla::gfx::ChromaSize(
      yDataSize, mozilla::gfx::ChromaSubsampling::HALF_WIDTH_AND_HEIGHT);
  constexpr auto color =
      YUVBufferGenerator::kChannelColors[static_cast<std::size_t>(
          YUVBufferGenerator::ChannelColorIndex::Red)];
  static_assert(color.mY != color.mCb && color.mY != color.mCr &&
                color.mCb != color.mCr);

  RefPtr<Image> i420;
  RefPtr<Image> nv12;
  RefPtr<Image> nv21;
  {
    YUVBufferGenerator generator;
    ASSERT_TRUE(generator.Init(pictureRect, color));
    EXPECT_EQ(generator.GetSize(), pictureRect.Size());
    i420 = generator.GenerateI420Image();
    nv12 = generator.GenerateNV12Image();
    nv21 = generator.GenerateNV21Image();
  }

  ASSERT_TRUE(i420);
  ASSERT_TRUE(nv12);
  ASSERT_TRUE(nv21);
  EXPECT_EQ(nv12->GetOrigin(), IntPoint());
  EXPECT_EQ(nv21->GetOrigin(), IntPoint());
  EXPECT_EQ(i420->GetAddressableSize(), mozilla::Some(yDataSize));
  EXPECT_EQ(nv12->GetAddressableSize(), mozilla::Some(yDataSize));
  EXPECT_EQ(nv21->GetAddressableSize(), mozilla::Some(yDataSize));

  EXPECT_EQ(i420->GetPictureRect(), pictureRect);
  EXPECT_EQ(i420->GetSize(), pictureRect.Size());
  EXPECT_EQ(i420->GetOrigin(), pictureRect.TopLeft());
  const PlanarYCbCrData* i420Data = i420->AsPlanarYCbCrImage()->GetData();
  ASSERT_NE(i420Data, nullptr);
  const auto i420Sizes = i420Data->GetPlaneSizes();
  ASSERT_TRUE(i420Sizes);
  EXPECT_EQ(i420Sizes->mY, yDataSize);
  EXPECT_EQ(i420Sizes->mCbCr, chromaSize);
  EXPECT_EQ(i420Data->mYStride, yDataSize.width);
  EXPECT_EQ(i420Data->mCbCrStride, chromaSize.width);
  ExpectPlaneValues(i420Data->mYChannel, i420Data->mYStride, i420Data->mYSkip,
                    yDataSize, color.mY);
  ExpectPlaneValues(i420Data->mCbChannel, i420Data->mCbCrStride,
                    i420Data->mCbSkip, chromaSize, color.mCb);
  ExpectPlaneValues(i420Data->mCrChannel, i420Data->mCbCrStride,
                    i420Data->mCrSkip, chromaSize, color.mCr);

  for (const auto& image : {nv12, nv21}) {
    EXPECT_EQ(image->GetPictureRect(), pictureRect);
    EXPECT_EQ(image->GetSize(), pictureRect.Size());
    const PlanarYCbCrData* data = image->AsNVImage()->GetData();
    ASSERT_NE(data, nullptr);
    const auto sizes = data->GetPlaneSizes();
    ASSERT_TRUE(sizes);
    EXPECT_EQ(sizes->mY, yDataSize);
    EXPECT_EQ(sizes->mCbCr, chromaSize);
    EXPECT_EQ(data->mYStride, yDataSize.width);
    EXPECT_EQ(data->mCbCrStride, 2 * chromaSize.width);
    ExpectPlaneValues(data->mYChannel, data->mYStride, data->mYSkip, yDataSize,
                      color.mY);
    ExpectPlaneValues(data->mCbChannel, data->mCbCrStride, data->mCbSkip,
                      chromaSize, color.mCb);
    ExpectPlaneValues(data->mCrChannel, data->mCbCrStride, data->mCrSkip,
                      chromaSize, color.mCr);
  }

  const PlanarYCbCrData* nv12Data = nv12->AsNVImage()->GetData();
  const PlanarYCbCrData* nv21Data = nv21->AsNVImage()->GetData();
  EXPECT_EQ(nv12Data->mCbChannel + 1, nv12Data->mCrChannel);
  EXPECT_EQ(nv21Data->mCrChannel + 1, nv21Data->mCbChannel);
}

TEST(YUVBufferGenerator, RejectsInvalidGeometry)
{
  const IntRect invalidRects[] = {
      IntRect(0, 0, 0, 1),
      IntRect(-1, 0, 1, 1),
      IntRect(std::numeric_limits<int32_t>::max() - 1, 0, 4, 1),
      IntRect(0, 0, mozilla::layers::PlanarYCbCrImage::MAX_DIMENSION + 1, 1),
  };

  YUVBufferGenerator generator;
  for (const auto& rect : invalidRects) {
    EXPECT_FALSE(generator.Init(rect));
    for (auto format : mozilla::MakeInclusiveEnumeratedRange(
             mozilla::kHighestImagePixelFormat)) {
      RefPtr<Image> image = generator.GenerateImage(format);
      EXPECT_FALSE(image) << mozilla::EnumValueToString(format);
    }
    RefPtr<Image> planar = generator.GeneratePlanarImage(
        ChromaSubsampling::FULL, ColorDepth::COLOR_16);
    EXPECT_FALSE(planar);
  }
}

TEST(YUVBufferGenerator, GeneratesHighDepthPlanarImages)
{
  const IntSize size(4, 4);
  const YUVBufferGenerator::ChannelColor& red =
      YUVBufferGenerator::kChannelColors[static_cast<size_t>(
          YUVBufferGenerator::ChannelColorIndex::Red)];
  YUVBufferGenerator generator;
  ASSERT_TRUE(generator.Init(size, red));

  RefPtr<Image> image = generator.GeneratePlanarImage(
      ChromaSubsampling::FULL, ColorDepth::COLOR_10,
      YUVBufferGenerator::Alpha::Yes);
  ASSERT_TRUE(image);
  const PlanarYCbCrData* data = image->AsPlanarYCbCrImage()->GetData();
  ASSERT_NE(data, nullptr);
  EXPECT_EQ(data->mChromaSubsampling, ChromaSubsampling::FULL);
  EXPECT_EQ(data->mColorDepth, ColorDepth::COLOR_10);
  const auto sizes = data->GetPlaneSizes();
  ASSERT_TRUE(sizes);
  EXPECT_EQ(sizes->mCbCr, size);
  EXPECT_EQ(data->mYStride, 2 * size.width);
  EXPECT_EQ(data->mCbCrStride, 2 * size.width);
  ASSERT_TRUE(data->mAlpha.isSome());
  EXPECT_EQ(data->mAlpha->mDepth, ColorDepth::COLOR_10);

  const auto* y = reinterpret_cast<const uint16_t*>(data->mYChannel);
  const auto* cb = reinterpret_cast<const uint16_t*>(data->mCbChannel);
  const auto* cr = reinterpret_cast<const uint16_t*>(data->mCrChannel);
  const auto* alpha = reinterpret_cast<const uint16_t*>(data->mAlpha->mChannel);
  EXPECT_EQ(y[0], uint16_t(red.mY << 2));
  EXPECT_EQ(cb[0], uint16_t(red.mCb << 2));
  EXPECT_EQ(cr[0], uint16_t(red.mCr << 2));
  EXPECT_EQ(alpha[0], uint16_t(1023));
}

TEST(YUVBufferGenerator, ScalesTranslucentAlpha)
{
  const IntSize size(4, 4);
  const YUVBufferGenerator::ChannelColor translucent{0x51, 0x5A, 0xF0, 0x80};
  YUVBufferGenerator generator;
  ASSERT_TRUE(generator.Init(size, translucent));

  RefPtr<Image> image8 = generator.GeneratePlanarImage(
      ChromaSubsampling::HALF_WIDTH_AND_HEIGHT, ColorDepth::COLOR_8,
      YUVBufferGenerator::Alpha::Yes);
  ASSERT_TRUE(image8);
  const PlanarYCbCrData* data8 = image8->AsPlanarYCbCrImage()->GetData();
  ASSERT_TRUE(data8 && data8->mAlpha.isSome());
  EXPECT_EQ(data8->mAlpha->mChannel[0], 0x80);

  RefPtr<Image> image10 = generator.GeneratePlanarImage(
      ChromaSubsampling::HALF_WIDTH_AND_HEIGHT, ColorDepth::COLOR_10,
      YUVBufferGenerator::Alpha::Yes);
  ASSERT_TRUE(image10);
  const PlanarYCbCrData* data10 = image10->AsPlanarYCbCrImage()->GetData();
  ASSERT_TRUE(data10 && data10->mAlpha.isSome());
  EXPECT_EQ(reinterpret_cast<const uint16_t*>(data10->mAlpha->mChannel)[0],
            uint16_t(514));
}

TEST(YUVBufferGenerator, GeneratesNamedLayouts)
{
  struct Case {
    ImagePixelFormat mFormat;
    ChromaSubsampling mSubsampling;
    ColorDepth mDepth;
    bool mAlpha;
  };
  const Case kCases[] = {
      {ImagePixelFormat::I420, ChromaSubsampling::HALF_WIDTH_AND_HEIGHT,
       ColorDepth::COLOR_8, false},
      {ImagePixelFormat::I420P10, ChromaSubsampling::HALF_WIDTH_AND_HEIGHT,
       ColorDepth::COLOR_10, false},
      {ImagePixelFormat::I420P12, ChromaSubsampling::HALF_WIDTH_AND_HEIGHT,
       ColorDepth::COLOR_12, false},
      {ImagePixelFormat::I420A, ChromaSubsampling::HALF_WIDTH_AND_HEIGHT,
       ColorDepth::COLOR_8, true},
      {ImagePixelFormat::I420AP10, ChromaSubsampling::HALF_WIDTH_AND_HEIGHT,
       ColorDepth::COLOR_10, true},
      {ImagePixelFormat::I420AP12, ChromaSubsampling::HALF_WIDTH_AND_HEIGHT,
       ColorDepth::COLOR_12, true},
      {ImagePixelFormat::I422, ChromaSubsampling::HALF_WIDTH,
       ColorDepth::COLOR_8, false},
      {ImagePixelFormat::I422P10, ChromaSubsampling::HALF_WIDTH,
       ColorDepth::COLOR_10, false},
      {ImagePixelFormat::I422P12, ChromaSubsampling::HALF_WIDTH,
       ColorDepth::COLOR_12, false},
      {ImagePixelFormat::I422A, ChromaSubsampling::HALF_WIDTH,
       ColorDepth::COLOR_8, true},
      {ImagePixelFormat::I422AP10, ChromaSubsampling::HALF_WIDTH,
       ColorDepth::COLOR_10, true},
      {ImagePixelFormat::I422AP12, ChromaSubsampling::HALF_WIDTH,
       ColorDepth::COLOR_12, true},
      {ImagePixelFormat::I444, ChromaSubsampling::FULL, ColorDepth::COLOR_8,
       false},
      {ImagePixelFormat::I444P10, ChromaSubsampling::FULL, ColorDepth::COLOR_10,
       false},
      {ImagePixelFormat::I444P12, ChromaSubsampling::FULL, ColorDepth::COLOR_12,
       false},
      {ImagePixelFormat::I444A, ChromaSubsampling::FULL, ColorDepth::COLOR_8,
       true},
      {ImagePixelFormat::I444AP10, ChromaSubsampling::FULL,
       ColorDepth::COLOR_10, true},
      {ImagePixelFormat::I444AP12, ChromaSubsampling::FULL,
       ColorDepth::COLOR_12, true},
  };
  YUVBufferGenerator generator;
  ASSERT_TRUE(generator.Init(IntSize(4, 4)));
  for (const Case& c : kCases) {
    RefPtr<Image> image = generator.GenerateImage(c.mFormat);
    ASSERT_TRUE(image)
    << mozilla::EnumValueToString(c.mFormat);
    const PlanarYCbCrData* data = image->AsPlanarYCbCrImage()->GetData();
    ASSERT_NE(data, nullptr) << mozilla::EnumValueToString(c.mFormat);
    EXPECT_EQ(data->mChromaSubsampling, c.mSubsampling)
        << mozilla::EnumValueToString(c.mFormat);
    EXPECT_EQ(data->mColorDepth, c.mDepth)
        << mozilla::EnumValueToString(c.mFormat);
    EXPECT_EQ(data->mAlpha.isSome(), c.mAlpha)
        << mozilla::EnumValueToString(c.mFormat);
    EXPECT_EQ(data->mCbSkip, 0) << mozilla::EnumValueToString(c.mFormat);
    EXPECT_EQ(data->mCrSkip, 0) << mozilla::EnumValueToString(c.mFormat);
  }

  RefPtr<Image> nv12 = generator.GenerateImage(ImagePixelFormat::NV12);
  ASSERT_TRUE(nv12);
  const PlanarYCbCrData* nv12Data = nv12->AsNVImage()->GetData();
  EXPECT_EQ(nv12Data->mCbChannel + 1, nv12Data->mCrChannel);

  RefPtr<Image> nv21 = generator.GenerateImage(ImagePixelFormat::NV21);
  ASSERT_TRUE(nv21);
  const PlanarYCbCrData* nv21Data = nv21->AsNVImage()->GetData();
  EXPECT_EQ(nv21Data->mCrChannel + 1, nv21Data->mCbChannel);

  for (auto format : {ImagePixelFormat::RGBA, ImagePixelFormat::RGBX,
                      ImagePixelFormat::BGRA, ImagePixelFormat::BGRX}) {
    RefPtr<Image> rgb = generator.GenerateImage(format);
    EXPECT_FALSE(rgb) << mozilla::EnumValueToString(format);
  }
}
