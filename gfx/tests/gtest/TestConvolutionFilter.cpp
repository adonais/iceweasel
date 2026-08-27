/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SkConvolver.h"
#include "gtest/gtest.h"
#include "mozilla/SSE.h"

// The horizontal convolution kernels are SIMD-specialized only on x86; this
// mirrors the CONFIG["INTEL_ARCHITECTURE"] guard that compiles them.
#if defined(MOZILLA_MAY_SUPPORT_SSE2)

#  include <algorithm>
#  include <array>
#  include <cstdint>
#  include <functional>
#  include <random>
#  include <vector>

using skia::SkConvolutionFilter1D;

// These have external linkage but are not declared in a public header; the
// dispatcher in SkConvolver.cpp forward-declares them the same way.
namespace skia {
void convolve_horizontally_sse2(const unsigned char* srcData,
                                const SkConvolutionFilter1D& filter,
                                unsigned char* outRow, bool hasAlpha);
void convolve_horizontally_avx2(const unsigned char* srcData,
                                const SkConvolutionFilter1D& filter,
                                unsigned char* outRow, bool hasAlpha);
}  // namespace skia

namespace {

// A straightforward scalar reference that reproduces the fixed-point
// arithmetic, rounding and saturation performed by the SIMD kernels.
void ConvolveHorizontallyReference(const uint8_t* aSrc,
                                   const SkConvolutionFilter1D& aFilter,
                                   uint8_t* aOut) {
  constexpr int kShift = SkConvolutionFilter1D::kShiftBits;
  int numValues = aFilter.numValues();
  for (int outX = 0; outX < numValues; ++outX) {
    int filterOffset, filterLength;
    const SkConvolutionFilter1D::ConvolutionFixed* filterValues =
        aFilter.FilterForValue(outX, &filterOffset, &filterLength);
    for (int ch = 0; ch < 4; ++ch) {
      int accum = 0;
      for (int i = 0; i < filterLength; ++i) {
        accum += int(filterValues[i]) * int(aSrc[(filterOffset + i) * 4 + ch]);
      }
      accum = (accum + (1 << (kShift - 1))) >> kShift;
      // Matches _mm_packs_epi32 (signed) followed by _mm_packus_epi16
      // (unsigned): for any int32 this is equivalent to clamping to [0, 255].
      accum = std::clamp(accum, 0, 255);
      aOut[outX * 4 + ch] = uint8_t(accum);
    }
  }
}

// Builds a filter with |aNumValues| output pixels. Output pixel x reads
// |aLengthFor(x)| source pixels starting at source pixel x, with coefficients
// (including some negative lobes, like a real Lanczos filter) drawn from
// |aRng|. The maximum source pixel touched is returned via |aOutSrcWidth|.
void BuildFilter(SkConvolutionFilter1D& aFilter, int aNumValues,
                 const std::function<int(int)>& aLengthFor, std::mt19937& aRng,
                 int* aOutSrcWidth) {
  std::uniform_real_distribution<float> weight(-0.2f, 1.0f);
  int maxSrc = 0;
  for (int x = 0; x < aNumValues; ++x) {
    int len = aLengthFor(x);
    int offset = x;
    std::vector<SkConvolutionFilter1D::ConvolutionFixed> coeffs(len);
    for (int i = 0; i < len; ++i) {
      // No normalization: keeps coefficients in [-0.2, 1.0] << kShiftBits (well
      // within int16 and far from int32 accumulation overflow) while still
      // exercising both the common and the saturating output paths.
      coeffs[i] = SkConvolutionFilter1D::ToFixed(weight(aRng));
    }
    aFilter.AddFilter(offset, coeffs.data(), len);
    maxSrc = std::max(maxSrc, offset + len);
  }
  *aOutSrcWidth = maxSrc;
}

std::vector<uint8_t> RandomPixels(int aNumPixels, std::mt19937& aRng) {
  // Pad by eight pixels (32 bytes) so the widest (AVX2) load cannot read past
  // the allocation, mirroring ConvolutionFilter::PadBytesForSIMD.
  std::vector<uint8_t> buf(size_t(aNumPixels + 8) * 4, 0);
  std::uniform_int_distribution<int> byte(0, 255);
  for (int i = 0; i < aNumPixels * 4; ++i) {
    buf[i] = uint8_t(byte(aRng));
  }
  return buf;
}

}  // namespace

// Verifies that the SSE2 and AVX2 horizontal convolution kernels produce
// bit-identical results to a scalar reference across a range of filter lengths,
// including every tail remainder (length mod 8), lengths shorter than one SIMD
// block, and filters whose length varies per output pixel.
TEST(Moz2D, ConvolveHorizontallySIMDMatchesReference)
{
  std::mt19937 rng(0x5eed5eed);

  const std::vector<std::function<int(int)>> lengthFns = {
      [](int) { return 1; },  [](int) { return 2; },
      [](int) { return 3; },  [](int) { return 7; },
      [](int) { return 8; },  [](int) { return 9; },
      [](int) { return 12; }, [](int) { return 15; },
      [](int) { return 16; }, [](int) { return 17; },
      [](int) { return 24; }, [](int x) { return 1 + (x % 23); },
  };

  const bool haveAvx2 = mozilla::supports_avx2();

  constexpr int kNumValues = 41;
  constexpr size_t kOutBytes = size_t(kNumValues) * 4;

  for (const auto& lengthFor : lengthFns) {
    int srcWidth = 0;
    SkConvolutionFilter1D filter;
    BuildFilter(filter, kNumValues, lengthFor, rng, &srcWidth);
    std::vector<uint8_t> src = RandomPixels(srcWidth, rng);

    std::array<uint8_t, kOutBytes> ref{};
    ConvolveHorizontallyReference(src.data(), filter, ref.data());

    std::array<uint8_t, kOutBytes> outSse2;
    outSse2.fill(0xAB);
    skia::convolve_horizontally_sse2(src.data(), filter, outSse2.data(),
                                     /* hasAlpha */ true);
    EXPECT_EQ(ref, outSse2);

    if (haveAvx2) {
      std::array<uint8_t, kOutBytes> outAvx2;
      outAvx2.fill(0xCD);
      skia::convolve_horizontally_avx2(src.data(), filter, outAvx2.data(),
                                       /* hasAlpha */ true);
      EXPECT_EQ(ref, outAvx2);
    }
  }
}

#endif  // MOZILLA_MAY_SUPPORT_SSE2
