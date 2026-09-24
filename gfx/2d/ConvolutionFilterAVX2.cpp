// Copyright (c) 2011-2016 Google Inc.
// Use of this source code is governed by a BSD-style license that can be
// found in the gfx/skia/LICENSE file.

#include <immintrin.h>

#include <cstdint>
#include <cstring>

#include "SkConvolver.h"
#include "mozilla/Attributes.h"

namespace skia {

// Load one pixel (4 bytes) and zero-extend each channel into a 32-bit lane:
// [ch0, ch1, ch2, ch3].
static MOZ_ALWAYS_INLINE __m128i LoadPixelU32(const unsigned char* pixel) {
#if defined(__GNUC__) && !defined(__clang__) && __GNUC__ < 12
  // GCC has no usable _mm_loadu_si32 before 12: it is absent in 10.x, and
  // 11.1/11.2 define it as _mm_set_epi32(*(int*)P, 0, 0, 0), which does an
  // aligned int load and lands the value in the high lane instead of the low
  // one (PR99754, fixed by r12-7640 and on the 11 branch after 11.2). We still
  // support GCC 10.1, so open-code the load here. Once that floor reaches 12,
  // delete this branch and keep only the #else.
  int32_t bytes;
  memcpy(&bytes, pixel, sizeof(bytes));
  return _mm_cvtepu8_epi32(_mm_cvtsi32_si128(bytes));
#else
  return _mm_cvtepu8_epi32(_mm_loadu_si32(pixel));
#endif
}

static MOZ_ALWAYS_INLINE void AccumRemainder(
    const unsigned char* pixelsLeft,
    const SkConvolutionFilter1D::ConvolutionFixed* filterValues, __m128i& accum,
    int r) {
  __m128i t = _mm_setzero_si128();
  for (int i = 0; i < r; i++) {
    // Widening the four channels to 32-bit lanes leaves each lane holding
    // [0, channel] as 16-bit halves, so madd's odd term is always zero and the
    // lane result is exactly coeff * channel, as in the scalar form. Splatting
    // the coefficient at 16-bit width lets the load fold into the broadcast.
    __m128i px = LoadPixelU32(pixelsLeft + i * 4);
    __m128i coeff = _mm_set1_epi16(filterValues[i]);
    t = _mm_add_epi32(t, _mm_madd_epi16(coeff, px));
  }
  accum = _mm_add_epi32(accum, t);
}

// Convolves horizontally along a single row. The row data is given in
// |srcData| and continues for the numValues() of the filter.
//
// This is a 256-bit widening of convolve_horizontally_sse2: it produces one
// output pixel per outer iteration and consumes eight filter taps at a time,
// processing four taps in each of the __m256i's two 128-bit lanes exactly as
// the SSE2 kernel processes four taps in an __m128i. The two lanes carry
// independent partial sums (the low lane accumulates taps 0-3 of each block,
// the high lane taps 4-7) which are combined once, after the loop. The result
// is bit-identical to convolve_horizontally_sse2.
void convolve_horizontally_avx2(const unsigned char* srcData,
                                const SkConvolutionFilter1D& filter,
                                unsigned char* outRow, bool /*hasAlpha*/) {
  int numValues = filter.numValues();
  for (int outX = 0; outX < numValues; outX++) {
    // Get the filter that determines the current output pixel.
    int filterOffset, filterLength;
    const SkConvolutionFilter1D::ConvolutionFixed* filterValues =
        filter.FilterForValue(outX, &filterOffset, &filterLength);

    // Compute the first pixel in this row that the filter affects. It will
    // touch |filterLength| pixels (4 bytes each) after this.
    const unsigned char* rowToFilter = &srcData[filterOffset * 4];

    const __m256i zero = _mm256_setzero_si256();
    __m256i accum = zero;

    // We will load and accumulate with eight coefficients per iteration.
    for (int filterX = 0; filterX < filterLength >> 3; filterX++) {
      // Load eight coefficients: [16] c7 c6 c5 c4 c3 c2 c1 c0
      __m128i coeff8 =
          _mm_loadu_si128(reinterpret_cast<const __m128i*>(filterValues));
      // Place the low four coefficients in the low lane and the high four in
      // the high lane, each in the low 64 bits of its lane:
      //   lane0 low = [c3 c2 c1 c0], lane1 low = [c7 c6 c5 c4]
      __m256i coeff = _mm256_permute4x64_epi64(
          _mm256_broadcastsi128_si256(coeff8), _MM_SHUFFLE(3, 1, 2, 0));

      // Broadcast the first two coefficients of each lane across all channels:
      //   lane0 = [c1 c1 c1 c1 c0 c0 c0 c0], lane1 = [c5 c5 c5 c5 c4 c4 c4 c4]
      __m256i coeff16 = _mm256_shufflelo_epi16(coeff, _MM_SHUFFLE(1, 1, 0, 0));
      coeff16 = _mm256_unpacklo_epi16(coeff16, coeff16);

      // Load eight pixels (32 bytes): lane0 = pixels 0-3, lane1 = pixels 4-7.
      // [8] ... a1 b1 g1 r1 a0 b0 g0 r0
      __m256i src8 =
          _mm256_loadu_si256(reinterpret_cast<const __m256i*>(rowToFilter));
      // Unpack the low two pixels of each lane to 16 bits => multiply with
      // coefficients => accumulate the convolution result.
      //   lane0 = [pixel1 pixel0], lane1 = [pixel5 pixel4]
      __m256i src16 = _mm256_unpacklo_epi8(src8, zero);
      __m256i mul_hi = _mm256_mulhi_epi16(src16, coeff16);
      __m256i mul_lo = _mm256_mullo_epi16(src16, coeff16);
      // [32] lane0 = pixel0, lane1 = pixel4
      accum = _mm256_add_epi32(accum, _mm256_unpacklo_epi16(mul_lo, mul_hi));
      // [32] lane0 = pixel1, lane1 = pixel5
      accum = _mm256_add_epi32(accum, _mm256_unpackhi_epi16(mul_lo, mul_hi));

      // Broadcast the third and fourth coefficients of each lane, unpack the
      // high two pixels of each lane, multiply and accumulate.
      //   lane0 = [c3 c3 c3 c3 c2 c2 c2 c2], lane1 = [c7 c7 c7 c7 c6 c6 c6 c6]
      coeff16 = _mm256_shufflelo_epi16(coeff, _MM_SHUFFLE(3, 3, 2, 2));
      coeff16 = _mm256_unpacklo_epi16(coeff16, coeff16);
      //   lane0 = [pixel3 pixel2], lane1 = [pixel7 pixel6]
      src16 = _mm256_unpackhi_epi8(src8, zero);
      mul_hi = _mm256_mulhi_epi16(src16, coeff16);
      mul_lo = _mm256_mullo_epi16(src16, coeff16);
      // [32] lane0 = pixel2, lane1 = pixel6
      accum = _mm256_add_epi32(accum, _mm256_unpacklo_epi16(mul_lo, mul_hi));
      // [32] lane0 = pixel3, lane1 = pixel7
      accum = _mm256_add_epi32(accum, _mm256_unpackhi_epi16(mul_lo, mul_hi));

      // Advance the pixel and coefficient pointers.
      rowToFilter += 32;
      filterValues += 8;
    }

    // Combine the two lanes' partial sums into four 32-bit accumulators.
    __m128i accum128 = _mm_add_epi32(_mm256_castsi256_si128(accum),
                                     _mm256_extracti128_si256(accum, 1));

    // When |filterLength| is not divisible by 8, we accumulate the last 1 - 7
    // coefficients one at a time.
    int r = filterLength & 7;
    if (r) {
      int remainderOffset = (filterOffset + filterLength - r) * 4;
      AccumRemainder(srcData + remainderOffset, filterValues, accum128, r);
    }

    // Shift right for fixed point implementation, with rounding.
    __m128i round =
        _mm_set1_epi32(1 << (SkConvolutionFilter1D::kShiftBits - 1));
    accum128 = _mm_add_epi32(accum128, round);
    accum128 = _mm_srai_epi32(accum128, SkConvolutionFilter1D::kShiftBits);

    // Packing 32 bits |accum128| to 16 bits per channel (signed saturation),
    // then to 8 bits per channel (unsigned saturation).
    __m128i zero128 = _mm_setzero_si128();
    accum128 = _mm_packs_epi32(accum128, zero128);
    accum128 = _mm_packus_epi16(accum128, zero128);

    // Store the pixel value of 32 bits.
    *(reinterpret_cast<int*>(outRow)) = _mm_cvtsi128_si32(accum128);
    outRow += 4;
  }
}

void convolve_vertically_avx2(
    const SkConvolutionFilter1D::ConvolutionFixed* filter, int filterLen,
    unsigned char* const* srcRows, int width, unsigned char* out,
    bool hasAlpha) {
  // It's simpler to work with the output array in terms of 4-byte pixels.
  auto* dst = (int*)out;

  // Output up to eight pixels per iteration.
  for (int x = 0; x < width; x += 8) {
    // Accumulated result for 4 (non-adjacent) pairs of pixels,
    // with each channel in signed 17.14 fixed point.
    auto accum04 = _mm256_setzero_si256(), accum15 = _mm256_setzero_si256(),
         accum26 = _mm256_setzero_si256(), accum37 = _mm256_setzero_si256();

    // Convolve with the filter.  (This inner loop is where we spend ~all our
    // time.) While we can, we consume 2 filter coefficients and 2 rows of 8
    // pixels each at a time.
    auto convolve_16_pixels = [&](__m256i interlaced_coeffs,
                                  __m256i pixels_01234567,
                                  __m256i pixels_89ABCDEF) {
      // Interlaced R0R8 G0G8 B0B8 A0A8 R1R9 G1G9... 32 8-bit values each.
      auto _08194C5D = _mm256_unpacklo_epi8(pixels_01234567, pixels_89ABCDEF),
           _2A3B6E7F = _mm256_unpackhi_epi8(pixels_01234567, pixels_89ABCDEF);

      // Still interlaced R0R8 G0G8... as above, each channel expanded to 16-bit
      // lanes.
      auto _084C = _mm256_unpacklo_epi8(_08194C5D, _mm256_setzero_si256()),
           _195D = _mm256_unpackhi_epi8(_08194C5D, _mm256_setzero_si256()),
           _2A6E = _mm256_unpacklo_epi8(_2A3B6E7F, _mm256_setzero_si256()),
           _3B7F = _mm256_unpackhi_epi8(_2A3B6E7F, _mm256_setzero_si256());

      // accum0_R += R0*coeff0 + R8*coeff1, etc.
      accum04 = _mm256_add_epi32(accum04,
                                 _mm256_madd_epi16(_084C, interlaced_coeffs));
      accum15 = _mm256_add_epi32(accum15,
                                 _mm256_madd_epi16(_195D, interlaced_coeffs));
      accum26 = _mm256_add_epi32(accum26,
                                 _mm256_madd_epi16(_2A6E, interlaced_coeffs));
      accum37 = _mm256_add_epi32(accum37,
                                 _mm256_madd_epi16(_3B7F, interlaced_coeffs));
    };

    int i = 0;
    if (i < filterLen && (reinterpret_cast<uintptr_t>(filter) & 2) != 0) {
      // _mm256_set1_epi32 may generate instructions that require 4-byte align
      // for the memory load. ConvolutionFixed is 2 bytes, so a random offset
      // into the filter array might be only 2-byte aligned. Process the first
      // entry individually so that subsequent blocks will be 4-byte aligned.
      convolve_16_pixels(
          _mm256_set1_epi32(*(const int16_t*)(filter + i)),
          _mm256_loadu_si256((const __m256i*)(srcRows[i] + x * 4)),
          _mm256_setzero_si256());
      i++;
    }
    for (; i + 1 < filterLen; i += 2) {
      convolve_16_pixels(
          _mm256_set1_epi32(*(const int32_t*)(filter + i)),
          _mm256_loadu_si256((const __m256i*)(srcRows[i + 0] + x * 4)),
          _mm256_loadu_si256((const __m256i*)(srcRows[i + 1] + x * 4)));
    }
    if (i < filterLen) {
      convolve_16_pixels(
          _mm256_set1_epi32(*(const int16_t*)(filter + i)),
          _mm256_loadu_si256((const __m256i*)(srcRows[i] + x * 4)),
          _mm256_setzero_si256());
    }

    // Round and trim the fractional parts off the accumulators.
    __m256i round = _mm256_set1_epi32(1 << 13);
    accum04 = _mm256_srai_epi32(_mm256_add_epi32(accum04, round), 14);
    accum15 = _mm256_srai_epi32(_mm256_add_epi32(accum15, round), 14);
    accum26 = _mm256_srai_epi32(_mm256_add_epi32(accum26, round), 14);
    accum37 = _mm256_srai_epi32(_mm256_add_epi32(accum37, round), 14);

    // Pack back down to 8-bit channels.
    auto pixels = _mm256_packus_epi16(_mm256_packs_epi32(accum04, accum15),
                                      _mm256_packs_epi32(accum26, accum37));

    if (hasAlpha) {
      // Clamp alpha to the max of r,g,b to make sure we stay premultiplied.
      __m256i max_rg = _mm256_max_epu8(pixels, _mm256_srli_epi32(pixels, 8)),
              max_rgb = _mm256_max_epu8(max_rg, _mm256_srli_epi32(pixels, 16));
      pixels = _mm256_max_epu8(pixels, _mm256_slli_epi32(max_rgb, 24));
    } else {
      // Force opaque.
      pixels = _mm256_or_si256(pixels, _mm256_set1_epi32(0xff000000));
    }

    // Normal path to store 8 pixels.
    if (x + 8 <= width) {
      _mm256_storeu_si256((__m256i*)dst, pixels);
      dst += 8;
      continue;
    }

    // Store one pixel at a time on the last iteration.
    for (int i = x; i < width; i++) {
      *dst++ = _mm_cvtsi128_si32(_mm256_castsi256_si128(pixels));
      pixels = _mm256_permutevar8x32_epi32(
          pixels, _mm256_setr_epi32(1, 2, 3, 4, 5, 6, 7, 0));
    }
  }
}

}  // namespace skia
