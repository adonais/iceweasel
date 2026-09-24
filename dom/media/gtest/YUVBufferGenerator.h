/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef YUVBufferGenerator_h
#define YUVBufferGenerator_h

#include <cstddef>
#include <cstdint>

#include "ImageContainer.h"
#include "Point.h"  // mozilla::gfx::IntSize
#include "Rect.h"   // mozilla::gfx::IntRect
#include "mozilla/AlreadyAddRefed.h"
#include "nsTArray.h"

// A helper object to generate of different YUV planes.
class YUVBufferGenerator {
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
  // 8-bit limited-range values from ITU-R BT.601-7, Table 4 and section 2.5:
  // https://www.itu.int/dms_pubrec/itu-r/rec/bt/r-rec-bt.601-7-201103-i!!pdf-e.pdf
  inline static constexpr ChannelColor kChannelColors[] = {
      {0x10, 0x80, 0x80},  // Black
      {0xEB, 0x80, 0x80},  // White
      {0x51, 0x5A, 0xF0},  // Red
  };

  bool Init(
      const mozilla::gfx::IntSize& aSize,
      const ChannelColor& aColor =
          kChannelColors[static_cast<std::size_t>(ChannelColorIndex::Black)]);
  bool Init(const mozilla::gfx::IntSize& aSize, uint8_t aLuma, uint8_t aChroma);
  bool Init(
      const mozilla::gfx::IntRect& aPictureRect,
      const ChannelColor& aColor =
          kChannelColors[static_cast<std::size_t>(ChannelColorIndex::Black)]);
  mozilla::gfx::IntSize GetSize() const;
  already_AddRefed<mozilla::layers::Image> GenerateI420Image();
  already_AddRefed<mozilla::layers::Image> GenerateNV12Image();
  already_AddRefed<mozilla::layers::Image> GenerateNV21Image();

 private:
  void FillI420SourceBuffer();
  void FillNVSourceBuffer(uint8_t aFirstChromaValue,
                          uint8_t aSecondChromaValue);

  mozilla::gfx::IntRect mPictureRect;
  mozilla::gfx::IntSize mYDataSize;
  // Init checks that twice its width fits in int32_t, so NV12 and NV21 chroma
  // strides are representable.
  mozilla::gfx::IntSize mChromaSize;
  size_t mYPlaneLength = 0;
  size_t mChromaPlaneLength = 0;
  ChannelColor mColor =
      kChannelColors[static_cast<std::size_t>(ChannelColorIndex::Black)];
  nsTArray<uint8_t> mSourceBuffer;
};

#endif  // YUVBufferGenerator_h
