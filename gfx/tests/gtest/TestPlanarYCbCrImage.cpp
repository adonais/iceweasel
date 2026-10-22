/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <limits>

#include "ImageContainer.h"
#include "gtest/gtest.h"
#include "mozilla/Assertions.h"
#include "mozilla/CheckedInt.h"
#include "mozilla/RefPtr.h"
#include "mozilla/layers/SharedPlanarYCbCrImage.h"
#include "nsTArray.h"

using mozilla::CheckedInt;
using mozilla::MakeRefPtr;
using mozilla::gfx::ChromaSize;
using mozilla::gfx::ChromaSubsampling;
using mozilla::gfx::IntPoint;
using mozilla::gfx::IntRect;
using mozilla::gfx::IntSize;
using mozilla::layers::BufferRecycleBin;
using mozilla::layers::NVImage;
using mozilla::layers::PlanarYCbCrData;
using mozilla::layers::RecyclingPlanarYCbCrImage;
using mozilla::layers::SharedPlanarYCbCrImage;
using mozilla::layers::TextureClientRecycleAllocator;

class PlanarYCbCrBuffer {
 public:
  struct ChannelColor {
    uint8_t mY;
    uint8_t mCb;
    uint8_t mCr;
  };

  enum class ChannelColorIndex : std::size_t {
    Black,
    White,
    Red,
  };

  // BT.601 color space values for YUV channels.
  inline static constexpr ChannelColor kChannelColors[] = {
      {0x10, 0x80, 0x80},  // Black
      {0xFF, 0x80, 0x80},  // White
      {0x51, 0x5A, 0xF0},  // Red
  };

  PlanarYCbCrBuffer(
      const IntSize& aYDataSize, const IntRect& aPictureRect,
      const ChannelColor& aColor =
          kChannelColors[static_cast<std::size_t>(ChannelColorIndex::Black)])
      : mYDataSize(aYDataSize),
        mChromaSize(
            ChromaSize(aYDataSize, ChromaSubsampling::HALF_WIDTH_AND_HEIGHT)),
        mPictureRect(aPictureRect) {
    mY.SetLength(PlaneLength(mYDataSize));
    mCb.SetLength(PlaneLength(mChromaSize));
    mCr.SetLength(PlaneLength(mChromaSize));
    mNV12.SetLength(NV12Length(mYDataSize, mChromaSize));

    std::fill(mY.begin(), mY.end(), aColor.mY);
    std::fill(mCb.begin(), mCb.end(), aColor.mCb);
    std::fill(mCr.begin(), mCr.end(), aColor.mCr);
    std::fill_n(mNV12.begin(), mY.Length(), aColor.mY);
    uint8_t* nvChroma = mNV12.Elements() + mY.Length();
    for (size_t i = 0; i < mCb.Length(); ++i) {
      *nvChroma++ = aColor.mCb;
      *nvChroma++ = aColor.mCr;
    }
  }

  PlanarYCbCrData LumaData() {
    PlanarYCbCrData data;
    data.mYChannel = mY.Elements();
    data.mYStride = mYDataSize.width;
    data.mPictureRect = mPictureRect;
    return data;
  }

  PlanarYCbCrData I420Data() {
    PlanarYCbCrData data = LumaData();
    data.mCbChannel = mCb.Elements();
    data.mCrChannel = mCr.Elements();
    data.mCbCrStride = mChromaSize.width;
    data.mChromaSubsampling = ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
    return data;
  }

  PlanarYCbCrData NV12Data() {
    PlanarYCbCrData data = LumaData();
    data.mYChannel = mNV12.Elements();
    data.mCbChannel = mNV12.Elements() + mY.Length();
    data.mCrChannel = data.mCbChannel + 1;
    data.mCbCrStride = 2 * mChromaSize.width;
    data.mCbSkip = 1;
    data.mCrSkip = 1;
    data.mChromaSubsampling = ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
    return data;
  }

 private:
  static size_t PlaneLength(const IntSize& aSize) {
    MOZ_ASSERT(aSize.width > 0 && aSize.height > 0);
    const CheckedInt<size_t> length =
        CheckedInt<size_t>(aSize.width) * aSize.height;
    return length.value();
  }

  static size_t NV12Length(const IntSize& aYDataSize,
                           const IntSize& aChromaSize) {
    CheckedInt<size_t> length(PlaneLength(aYDataSize));
    length += CheckedInt<size_t>(PlaneLength(aChromaSize)) * 2;
    return length.value();
  }

  const IntSize mYDataSize;
  const IntSize mChromaSize;
  const IntRect mPictureRect;
  nsTArray<uint8_t> mY;
  nsTArray<uint8_t> mCb;
  nsTArray<uint8_t> mCr;
  nsTArray<uint8_t> mNV12;
};

constexpr IntSize kYDataSize(2, 2);

MOZ_RUNINIT static const IntRect kPlanarYCbCrMalformedPictureRects[] = {
    IntRect(0, 0, 0, 1),
    IntRect(0, 0, 1, 0),
    IntRect(2, 0, -1, 1),
    IntRect(0, 2, 1, -1),
    IntRect(-1, 0, 2, 1),
    IntRect(0, -1, 1, 2),
    IntRect(std::numeric_limits<int32_t>::max() - 1, 0, 4, 1),
    IntRect(0, std::numeric_limits<int32_t>::max() - 1, 1, 4),
};

MOZ_RUNINIT static const IntRect kPlanarYCbCrSmallMalformedPictureRects[] = {
    IntRect(0, 0, 0, 2),  IntRect(0, 0, 2, 0),  IntRect(2, 0, -1, 2),
    IntRect(0, 2, 2, -1), IntRect(-1, 0, 2, 2), IntRect(0, -1, 2, 2),
};

static RefPtr<RecyclingPlanarYCbCrImage> MakeRecyclingPlanarYCbCrImage() {
  return MakeRefPtr<RecyclingPlanarYCbCrImage>(
      MakeRefPtr<BufferRecycleBin>().get());
}

class SharedPlanarYCbCrImageForTest final : public SharedPlanarYCbCrImage {
 public:
  SharedPlanarYCbCrImageForTest()
      : SharedPlanarYCbCrImage(
            static_cast<TextureClientRecycleAllocator*>(nullptr)) {}

  nsresult CreateEmptyBuffer(const PlanarYCbCrData&, const IntSize&,
                             const IntSize&) override {
    mCreateEmptyBufferCalled = true;
    return NS_ERROR_NOT_IMPLEMENTED;
  }

  bool CreateEmptyBufferCalled() const { return mCreateEmptyBufferCalled; }

 private:
  ~SharedPlanarYCbCrImageForTest() override = default;

  bool mCreateEmptyBufferCalled = false;
};

TEST(PlanarYCbCrImage, AdoptDataRejectsMalformedPictureRects)
{
  for (const auto& pictureRect : kPlanarYCbCrMalformedPictureRects) {
    SCOPED_TRACE(testing::Message()
                 << pictureRect.X() << "," << pictureRect.Y() << " "
                 << pictureRect.Width() << "x" << pictureRect.Height());
    PlanarYCbCrData data;
    data.mPictureRect = pictureRect;
    RefPtr image = MakeRecyclingPlanarYCbCrImage();
    EXPECT_EQ(image->AdoptData(data), NS_ERROR_INVALID_ARG);
  }
}

TEST(PlanarYCbCrImage, AdoptDataAcceptsLargestRepresentableEndpoint)
{
  const IntRect pictureRect(std::numeric_limits<int32_t>::max() - 1, 0, 1, 1);
  PlanarYCbCrData data;
  data.mPictureRect = pictureRect;
  RefPtr image = MakeRecyclingPlanarYCbCrImage();
  ASSERT_EQ(image->AdoptData(data), NS_OK);
  EXPECT_EQ(image->GetPictureRect(), pictureRect);
  EXPECT_EQ(image->GetOrigin(), pictureRect.TopLeft());
  EXPECT_EQ(image->GetSize(), pictureRect.Size());
  EXPECT_EQ(image->GetData()->YDataSize(),
            IntSize(std::numeric_limits<int32_t>::max(), 1));
}

TEST(PlanarYCbCrImage, InvalidAdoptionDoesNotMutateImage)
{
  PlanarYCbCrBuffer validBuffer(kYDataSize, IntRect(0, 0, 2, 2));
  RefPtr image = MakeRecyclingPlanarYCbCrImage();
  ASSERT_EQ(image->AdoptData(validBuffer.I420Data()), NS_OK);

  const IntRect pictureRect = image->GetPictureRect();
  const IntPoint origin = image->GetOrigin();
  const IntSize size = image->GetSize();
  const uint8_t* yChannel = image->GetData()->mYChannel;

  PlanarYCbCrBuffer invalidBuffer(kYDataSize, IntRect(-1, 0, 2, 2));
  EXPECT_EQ(image->AdoptData(invalidBuffer.I420Data()), NS_ERROR_INVALID_ARG);
  EXPECT_EQ(image->GetPictureRect(), pictureRect);
  EXPECT_EQ(image->GetOrigin(), origin);
  EXPECT_EQ(image->GetSize(), size);
  EXPECT_EQ(image->GetData()->mYChannel, yChannel);
}

TEST(PlanarYCbCrData, ChromaSizeHandlesLargestRepresentableEndpoint)
{
  const int32_t max = std::numeric_limits<int32_t>::max();
  EXPECT_EQ(
      ChromaSize(IntSize(max, max), ChromaSubsampling::HALF_WIDTH_AND_HEIGHT),
      IntSize(max / 2 + 1, max / 2 + 1));
}

TEST(RecyclingPlanarYCbCrImage, CopyDataRejectsMalformedPictureRects)
{
  for (const auto& pictureRect : kPlanarYCbCrSmallMalformedPictureRects) {
    SCOPED_TRACE(testing::Message()
                 << pictureRect.X() << "," << pictureRect.Y() << " "
                 << pictureRect.Width() << "x" << pictureRect.Height());
    PlanarYCbCrBuffer buffer(kYDataSize, pictureRect);
    RefPtr image = MakeRecyclingPlanarYCbCrImage();
    EXPECT_EQ(image->CopyData(buffer.I420Data()), NS_ERROR_INVALID_ARG);
  }
}

TEST(RecyclingPlanarYCbCrImage, InvalidGeometryDoesNotMutateImage)
{
  PlanarYCbCrBuffer validBuffer(kYDataSize, IntRect(0, 0, 2, 2));
  RefPtr image = MakeRecyclingPlanarYCbCrImage();
  ASSERT_EQ(image->CopyData(validBuffer.I420Data()), NS_OK);

  const IntRect pictureRect = image->GetPictureRect();
  const IntPoint origin = image->GetOrigin();
  const IntSize size = image->GetSize();
  const uint8_t* yChannel = image->GetData()->mYChannel;
  const uint32_t dataSize = image->GetDataSize();

  PlanarYCbCrBuffer invalidBuffer(kYDataSize, IntRect(-1, 0, 2, 2));
  EXPECT_EQ(image->CopyData(invalidBuffer.I420Data()), NS_ERROR_INVALID_ARG);
  EXPECT_EQ(image->GetPictureRect(), pictureRect);
  EXPECT_EQ(image->GetOrigin(), origin);
  EXPECT_EQ(image->GetSize(), size);
  EXPECT_EQ(image->GetData()->mYChannel, yChannel);
  EXPECT_EQ(image->GetDataSize(), dataSize);
}

TEST(NVImage, SetDataRejectsMalformedPictureRects)
{
  for (const auto& pictureRect : kPlanarYCbCrSmallMalformedPictureRects) {
    SCOPED_TRACE(testing::Message()
                 << pictureRect.X() << "," << pictureRect.Y() << " "
                 << pictureRect.Width() << "x" << pictureRect.Height());
    PlanarYCbCrBuffer buffer(kYDataSize, pictureRect);
    RefPtr image = MakeRefPtr<NVImage>();
    EXPECT_EQ(image->SetData(buffer.NV12Data()), NS_ERROR_INVALID_ARG);
  }
}

TEST(NVImage, InvalidGeometryDoesNotMutateImage)
{
  PlanarYCbCrBuffer validBuffer(kYDataSize, IntRect(0, 0, 2, 2));
  RefPtr image = MakeRefPtr<NVImage>();
  ASSERT_EQ(image->SetData(validBuffer.NV12Data()), NS_OK);

  const IntRect pictureRect = image->GetPictureRect();
  const IntSize size = image->GetSize();
  const uint8_t* yChannel = image->GetData()->mYChannel;
  const uint32_t bufferSize = image->GetBufferSize();

  PlanarYCbCrBuffer invalidBuffer(kYDataSize, IntRect(-1, 0, 2, 2));
  EXPECT_EQ(image->SetData(invalidBuffer.NV12Data()), NS_ERROR_INVALID_ARG);
  EXPECT_EQ(image->GetPictureRect(), pictureRect);
  EXPECT_EQ(image->GetSize(), size);
  EXPECT_EQ(image->GetData()->mYChannel, yChannel);
  EXPECT_EQ(image->GetBufferSize(), bufferSize);
}

TEST(SharedPlanarYCbCrImage, RejectsMalformedPictureRectsBeforeBackendAccess)
{
  for (const auto& pictureRect : kPlanarYCbCrMalformedPictureRects) {
    SCOPED_TRACE(testing::Message()
                 << pictureRect.X() << "," << pictureRect.Y() << " "
                 << pictureRect.Width() << "x" << pictureRect.Height());
    PlanarYCbCrBuffer buffer(kYDataSize, pictureRect);
    RefPtr image = MakeRefPtr<SharedPlanarYCbCrImageForTest>();
    EXPECT_EQ(image->CopyData(buffer.LumaData()), NS_ERROR_INVALID_ARG);
    EXPECT_FALSE(image->CreateEmptyBufferCalled());
  }
}

TEST(SharedPlanarYCbCrImage, ValidPictureRectReachesBackend)
{
  PlanarYCbCrBuffer buffer(kYDataSize, IntRect(0, 0, 2, 2));
  RefPtr image = MakeRefPtr<SharedPlanarYCbCrImageForTest>();
  EXPECT_EQ(image->CopyData(buffer.I420Data()), NS_ERROR_NOT_IMPLEMENTED);
  EXPECT_TRUE(image->CreateEmptyBufferCalled());
}
