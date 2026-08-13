/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <limits>

#include "ImageContainer.h"
#include "MediaData.h"
#include "VideoUtils.h"
#include "gtest/gtest.h"
#include "mozilla/DefineEnum.h"
#include "mozilla/UniquePtr.h"
using namespace mozilla;
using namespace mozilla::gfx;

MOZ_DEFINE_ENUM_CLASS_WITH_TOSTRING(PixFormatParam, (I420, I422, I444))

class QuantizableBufferTest : public testing::TestWithParam<PixFormatParam> {
 public:
  using TenBit = uint16_t;
  static constexpr uint32_t kVGAWidth = 640;
  static constexpr uint32_t kVGAHeight = 480;

  template <typename DataType>
  struct TestBuffer {
    TestBuffer(const uint32_t aWidth, const uint32_t aHeight,
               const PixFormatParam aPixFormat, const ColorDepth aColorDepth,
               UniquePtr<AlignedBuffer<DataType>>&& aSourceData =
                   UniquePtr<AlignedBuffer<DataType>>{}) {
      EXPECT_NE(aColorDepth, ColorDepth::COLOR_8);

      const uint32_t yWidth{aWidth};
      const uint32_t yHeight{aHeight};
      auto toCbCr = [&aPixFormat](uint32_t aSize, bool aIsWidth) -> uint32_t {
        uint64_t size{aSize};
        if (aPixFormat == PixFormatParam::I420 ||
            (aPixFormat == PixFormatParam::I422 && aIsWidth)) {
          size = (size + 1) / 2;
        }
        EXPECT_TRUE(CheckedUint32(size).isValid());
        return static_cast<uint32_t>(size);
      };
      const uint32_t cbcrWidth{toCbCr(aWidth, true)};
      const uint32_t cbcrHeight{toCbCr(aHeight, false)};
      mBuffer.mPlanes[0].mWidth = yWidth;
      mBuffer.mPlanes[0].mHeight = yHeight;
      mBuffer.mPlanes[1].mWidth = mBuffer.mPlanes[2].mWidth = cbcrWidth;
      mBuffer.mPlanes[1].mHeight = mBuffer.mPlanes[2].mHeight = cbcrHeight;
      auto toStride = [](uint32_t aWidth) -> uint32_t {
        CheckedUint32 x{aWidth};
        x *= sizeof(DataType);  // -> bytes.
        // Invalid value (stride should always >= 2 * width) when out of range.
        return x.isValid() ? x.value() : 1;
      };
      mBuffer.mPlanes[0].mStride = toStride(yWidth);
      mBuffer.mPlanes[1].mStride = mBuffer.mPlanes[2].mStride =
          toStride(cbcrWidth);
      // If not supplied, allocate buffer based on provided width/height, or
      // create an empty one for invalid sizes. (To8BitPerChannel() will reject
      // before accessing buffer so it should be safe.)
      CheckedInt<size_t> checkedYLength =
          CheckedInt<size_t>(mBuffer.mPlanes[0].mStride) * yHeight;
      CheckedInt<size_t> checkedCbLength =
          CheckedInt<size_t>(mBuffer.mPlanes[1].mStride) * cbcrHeight;
      CheckedInt<size_t> bufferSize =
          checkedYLength + checkedCbLength * sizeof(DataType);
      mData = aSourceData ? std::move(aSourceData)
                          : MakeUnique<AlignedBuffer<DataType>>(
                                bufferSize.isValid() ? bufferSize.value() : 0);
      if (mData->Data()) {
        // Use checked arithmetic to ensure no memory address overflow.
        CheckedInt<uintptr_t> checkedAddr{
            reinterpret_cast<uintptr_t>(mData->Data())};  // Y
        mBuffer.mPlanes[0].mData =
            reinterpret_cast<uint8_t*>(checkedAddr.value());
        checkedAddr += checkedYLength * sizeof(DataType);  // Cb
        mBuffer.mPlanes[1].mData =
            checkedAddr.isValid()
                ? reinterpret_cast<uint8_t*>(checkedAddr.value())
                : reinterpret_cast<uint8_t*>(mData->Data());
        checkedAddr += checkedCbLength * sizeof(DataType);  // Cr
        mBuffer.mPlanes[2].mData =
            checkedAddr.isValid()
                ? reinterpret_cast<uint8_t*>(checkedAddr.value())
                : reinterpret_cast<uint8_t*>(mData->Data());
      }
      mBuffer.mPlanes[0].mSkip = mBuffer.mPlanes[1].mSkip =
          mBuffer.mPlanes[2].mSkip = 0;
      mBuffer.mYUVColorSpace = DefaultColorSpace(IntSize{aWidth, aHeight});
      mBuffer.mColorPrimaries = ColorSpace2::Display;
      mBuffer.mColorDepth = aColorDepth;
      mBuffer.mChromaSubsampling = [&aPixFormat]() -> ChromaSubsampling {
        switch (aPixFormat) {
          case PixFormatParam::I420:
            return ChromaSubsampling::HALF_WIDTH_AND_HEIGHT;
          case PixFormatParam::I422:
            return ChromaSubsampling::HALF_WIDTH;
          case PixFormatParam::I444:
            return ChromaSubsampling::FULL;
        }
        MOZ_MAKE_COMPILER_ASSUME_IS_UNREACHABLE();
      }();
    }

    VideoData::QuantizableBuffer mBuffer;

   private:
    UniquePtr<AlignedBuffer<DataType>> mData;
  };

  RefPtr<layers::BufferRecycleBin> mRecycleBin =
      MakeRefPtr<layers::BufferRecycleBin>();
};

INSTANTIATE_TEST_SUITE_P(
    Format, QuantizableBufferTest,
    ::testing::Values<PixFormatParam>(PixFormatParam::I420,
                                      PixFormatParam::I422,
                                      PixFormatParam::I444),
    [](const ::testing::TestParamInfo<PixFormatParam>& info) {
      return std::string(EnumValueToString(info.param));
    });

TEST_P(QuantizableBufferTest, VariousSizes) {
  TestBuffer<TenBit> vga{kVGAWidth, kVGAHeight, GetParam(),
                         ColorDepth::COLOR_10};
  EXPECT_EQ(vga.mBuffer.To8BitPerChannel(mRecycleBin), NS_OK);

  TestBuffer<TenBit> oddCbCrWidth{1, kVGAHeight, GetParam(),
                                  ColorDepth::COLOR_10};
  EXPECT_EQ(oddCbCrWidth.mBuffer.To8BitPerChannel(mRecycleBin), NS_OK);

  TestBuffer<TenBit> oddCbCrHeight{kVGAWidth, 1, GetParam(),
                                   ColorDepth::COLOR_10};
  EXPECT_EQ(oddCbCrHeight.mBuffer.To8BitPerChannel(mRecycleBin), NS_OK);
}

TEST_P(QuantizableBufferTest, InvalidSizes) {
  TestBuffer zeroWidth{0, kVGAHeight, GetParam(), ColorDepth::COLOR_10,
                       MakeUnique<AlignedBuffer<TenBit>>(kVGAHeight)};
  EXPECT_EQ(zeroWidth.mBuffer.To8BitPerChannel(mRecycleBin),
            NS_ERROR_ILLEGAL_VALUE);
  TestBuffer zeroHeight{kVGAWidth, 0, GetParam(), ColorDepth::COLOR_10,
                        MakeUnique<AlignedBuffer<TenBit>>(kVGAWidth)};
  EXPECT_EQ(zeroHeight.mBuffer.To8BitPerChannel(mRecycleBin),
            NS_ERROR_ILLEGAL_VALUE);

  TestBuffer invalidWidth{std::numeric_limits<uint32_t>::max(), kVGAHeight,
                          GetParam(), ColorDepth::COLOR_10,
                          MakeUnique<AlignedBuffer<TenBit>>(kVGAHeight)};
  EXPECT_EQ(invalidWidth.mBuffer.To8BitPerChannel(mRecycleBin),
            NS_ERROR_ILLEGAL_VALUE);
  TestBuffer invalidHeight{kVGAWidth, std::numeric_limits<uint32_t>::max(),
                           GetParam(), ColorDepth::COLOR_10,
                           MakeUnique<AlignedBuffer<TenBit>>(kVGAWidth)};
  EXPECT_EQ(invalidHeight.mBuffer.To8BitPerChannel(mRecycleBin),
            NS_ERROR_ILLEGAL_VALUE);

  TestBuffer invalidDestLength{
      std::numeric_limits<int>::max(), std::numeric_limits<int>::max(),
      GetParam(), ColorDepth::COLOR_10,
      MakeUnique<AlignedBuffer<TenBit>>(kVGAWidth * kVGAHeight)};
  EXPECT_EQ(invalidDestLength.mBuffer.To8BitPerChannel(mRecycleBin),
            NS_ERROR_ILLEGAL_VALUE);
};

TEST_P(QuantizableBufferTest, NoData) {
  TestBuffer noData{kVGAWidth, kVGAHeight, GetParam(), ColorDepth::COLOR_10,
                    MakeUnique<AlignedBuffer<TenBit>>()};

  EXPECT_EQ(noData.mBuffer.To8BitPerChannel(mRecycleBin),
            NS_ERROR_ILLEGAL_VALUE);
}
