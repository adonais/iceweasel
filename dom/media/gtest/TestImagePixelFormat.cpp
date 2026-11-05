/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "GPUVideoImage.h"
#include "ImageContainer.h"
#include "ImagePixelFormat.h"
#include "MockGPUVideoSurfaceManager.h"
#include "SourceSurfaceRawData.h"
#include "YUVBufferGenerator.h"
#include "gtest/gtest.h"
#include "mozilla/EnumeratedRange.h"
#include "mozilla/gfx/Types.h"
#include "mozilla/layers/LayersSurfaces.h"

#ifdef XP_MACOSX
#  include "MacIOSurfaceImage.h"
#  include "mozilla/gfx/MacIOSurface.h"
#endif

using namespace mozilla;
using namespace mozilla::gfx;
using namespace mozilla::layers;
using Alpha = YUVBufferGenerator::Alpha;

static const IntSize kSize(4, 4);

static RefPtr<SourceSurfaceImage> MakeSurfaceImage(SurfaceFormat aFormat) {
  auto surface = MakeRefPtr<SourceSurfaceAlignedRawData>();
  if (!surface->Init(kSize, aFormat, /* aClearMem */ true, 0, 0)) {
    return nullptr;
  }
  return MakeRefPtr<SourceSurfaceImage>(kSize, surface);
}

static RefPtr<GPUVideoImage> MakeRemoteImage(ColorDepth aDepth) {
  RefPtr<MockGPUVideoSurfaceManager> manager = new MockGPUVideoSurfaceManager();
  SurfaceDescriptorGPUVideo sd{SurfaceDescriptorRemoteDecoder()};
  return MakeRefPtr<GPUVideoImage>(
      manager, sd, kSize, aDepth, YUVColorSpace::BT709, ColorSpace2::BT709,
      TransferFunction::BT709, ColorRange::LIMITED);
}

TEST(TestImagePixelFormat, NullImage)
{
  EXPECT_EQ(ImageToPixelFormat(nullptr), Nothing());
}

TEST(TestImagePixelFormat, GeneratedImagesRoundTrip)
{
  YUVBufferGenerator generator;
  ASSERT_TRUE(generator.Init(kSize));
  for (auto format : MakeInclusiveEnumeratedRange(kHighestImagePixelFormat)) {
    RefPtr<Image> image = generator.GenerateImage(format);
    if (IsRGB(format)) {
      EXPECT_FALSE(image) << EnumValueToString(format);
      continue;
    }
    ASSERT_TRUE(image)
    << EnumValueToString(format);
    EXPECT_EQ(ImageToPixelFormat(image), Some(format))
        << EnumValueToString(format);
  }
}

// Layouts no member names; CopyData zeroes skips, so the Y skip is adopted.
TEST(TestImagePixelFormat, UnnamedPlanarLayouts)
{
  YUVBufferGenerator generator;
  ASSERT_TRUE(generator.Init(kSize));
  for (auto subsampling :
       {ChromaSubsampling::HALF_WIDTH_AND_HEIGHT, ChromaSubsampling::FULL}) {
    for (auto alpha : {Alpha::No, Alpha::Yes}) {
      RefPtr<Image> image = generator.GeneratePlanarImage(
          subsampling, ColorDepth::COLOR_16, alpha);
      ASSERT_TRUE(image);
      EXPECT_EQ(ImageToPixelFormat(image), Nothing());
    }
  }

  const IntSize chroma =
      ChromaSize(kSize, ChromaSubsampling::HALF_WIDTH_AND_HEIGHT);
  nsTArray<uint8_t> buffer;
  buffer.SetLength(kSize.width * kSize.height * 2 +
                   chroma.width * chroma.height * 2);
  PlanarYCbCrData data;
  data.mPictureRect = IntRect(IntPoint(), kSize);
  data.mYChannel = buffer.Elements();
  data.mYStride = kSize.width * 2;
  data.mYSkip = 1;
  data.mCbChannel = data.mYChannel + kSize.width * kSize.height * 2;
  data.mCrChannel = data.mCbChannel + chroma.width * chroma.height;
  data.mCbCrStride = chroma.width;
  data.mChromaSubsampling = ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
  auto skipping = MakeRefPtr<RecyclingPlanarYCbCrImage>(new BufferRecycleBin());
  ASSERT_EQ(skipping->AdoptData(data), NS_OK);
  EXPECT_EQ(ImageToPixelFormat(skipping), Nothing());
}

TEST(TestImagePixelFormat, SurfaceImages)
{
  struct Case {
    SurfaceFormat mFormat;
    Maybe<ImagePixelFormat> mExpected;
  };
  const Case kCases[] = {
      {SurfaceFormat::B8G8R8A8, Some(ImagePixelFormat::BGRA)},
      {SurfaceFormat::B8G8R8X8, Some(ImagePixelFormat::BGRX)},
      {SurfaceFormat::R8G8B8A8, Some(ImagePixelFormat::RGBA)},
      {SurfaceFormat::R8G8B8X8, Some(ImagePixelFormat::RGBX)},
      {SurfaceFormat::R8G8B8, Nothing()},
      {SurfaceFormat::R5G6B5_UINT16, Nothing()},
      {SurfaceFormat::A8, Nothing()},
  };
  for (const Case& c : kCases) {
    RefPtr<SourceSurfaceImage> image = MakeSurfaceImage(c.mFormat);
    ASSERT_TRUE(image);
    EXPECT_EQ(ImageToPixelFormat(image), c.mExpected)
        << "format=" << static_cast<int>(c.mFormat);
  }
}

TEST(TestImagePixelFormat, RemoteImages)
{
  RefPtr<GPUVideoImage> image = MakeRemoteImage(ColorDepth::COLOR_8);
  EXPECT_EQ(ImageToPixelFormat(image), Some(ImagePixelFormat::BGRX));

  RefPtr<GPUVideoImage> image10 = MakeRemoteImage(ColorDepth::COLOR_10);
  EXPECT_EQ(ImageToPixelFormat(image10), Some(ImagePixelFormat::BGRX));
}

#ifdef XP_MACOSX
static RefPtr<MacIOSurfaceImage> MakeBiPlanarImage(
    ChromaSubsampling aSubsampling, ColorDepth aDepth) {
  RefPtr<MacIOSurface> surface = MacIOSurface::CreateBiPlanarSurface(
      kSize, ChromaSize(kSize, aSubsampling), aSubsampling,
      YUVColorSpace::BT709, TransferFunction::BT709, ColorRange::LIMITED,
      aDepth, MacIOSurface::AllowAlpha::No);
  return surface ? MakeRefPtr<MacIOSurfaceImage>(surface) : nullptr;
}

static RefPtr<MacIOSurfaceImage> MakeBGRAImage(
    MacIOSurface::AllowAlpha aAllowAlpha) {
  RefPtr<MacIOSurface> surface =
      MacIOSurface::CreateIOSurface(kSize.width, kSize.height, aAllowAlpha);
  return surface ? MakeRefPtr<MacIOSurfaceImage>(surface) : nullptr;
}

TEST(TestImagePixelFormat, MacIOSurfaceImages)
{
  RefPtr<MacIOSurfaceImage> bgra = MakeBGRAImage(MacIOSurface::AllowAlpha::Yes);
  ASSERT_TRUE(bgra);
  EXPECT_EQ(ImageToPixelFormat(bgra), Some(ImagePixelFormat::BGRA));

  RefPtr<MacIOSurfaceImage> bgrx = MakeBGRAImage(MacIOSurface::AllowAlpha::No);
  ASSERT_TRUE(bgrx);
  EXPECT_EQ(ImageToPixelFormat(bgrx), Some(ImagePixelFormat::BGRX));

  RefPtr<MacIOSurfaceImage> nv12 = MakeBiPlanarImage(
      ChromaSubsampling::HALF_WIDTH_AND_HEIGHT, ColorDepth::COLOR_8);
  ASSERT_TRUE(nv12);
  EXPECT_EQ(ImageToPixelFormat(nv12), Some(ImagePixelFormat::NV12));

  RefPtr<MacIOSurfaceImage> p010 = MakeBiPlanarImage(
      ChromaSubsampling::HALF_WIDTH_AND_HEIGHT, ColorDepth::COLOR_10);
  ASSERT_TRUE(p010);
  EXPECT_EQ(ImageToPixelFormat(p010), Nothing());

  RefPtr<MacIOSurfaceImage> nv16 =
      MakeBiPlanarImage(ChromaSubsampling::HALF_WIDTH, ColorDepth::COLOR_8);
  ASSERT_TRUE(nv16);
  EXPECT_EQ(ImageToPixelFormat(nv16), Nothing());
}
#endif
