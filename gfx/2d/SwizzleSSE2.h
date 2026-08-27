/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_SWIZZLE_SSE2_H_
#define MOZILLA_GFX_SWIZZLE_SSE2_H_

#ifdef MOZILLA_GFX_SWIZZLE_GENERIC_H_
#  error "SwizzleSSE2.h must be included before SwizzleGeneric.h"
#endif

#include <emmintrin.h>
#include <immintrin.h>
#include <tmmintrin.h>

#include "SwizzleGenericDecls.h"

namespace mozilla::gfx {

template <class Arch>
  requires std::same_as<Arch, xsimd::sse2> || std::same_as<Arch, xsimd::ssse3>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> LoadRemainder_SIMD(
    const uint8_t* aSrc, size_t aLength) {
  __m128i px;
  if (aLength >= 2) {
    // Load first 2 pixels
    px = _mm_loadl_epi64(reinterpret_cast<const __m128i*>(aSrc));
    // Load third pixel
    if (aLength >= 3) {
      px = _mm_unpacklo_epi64(
          px,
          _mm_cvtsi32_si128(*reinterpret_cast<const uint32_t*>(aSrc + 2 * 4)));
    }
  } else {
    // Load single pixel
    px = _mm_cvtsi32_si128(*reinterpret_cast<const uint32_t*>(aSrc));
  }
  return px;
}

template <class Arch>
  requires std::same_as<Arch, xsimd::avx2>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> LoadRemainder_SIMD(
    const uint8_t* aSrc, size_t aLength) {
  if (aLength < 4) {
    __m128i px = LoadRemainder_SIMD<xsimd::sse2>(aSrc, aLength);
    return _mm256_castsi128_si256(px);
  }
  __m128i px = _mm_loadu_si128(reinterpret_cast<const __m128i*>(aSrc));
  if (aLength == 4) {
    return _mm256_castsi128_si256(px);
  }
  __m128i px2 = LoadRemainder_SIMD<xsimd::sse2>(aSrc + 4 * 4, aLength - 4);
  return _mm256_set_m128i(px2, px);
}

template <class Arch>
  requires std::same_as<Arch, xsimd::sse2> || std::same_as<Arch, xsimd::ssse3>
static MOZ_ALWAYS_INLINE void StoreRemainder_SIMD(
    uint8_t* aDst, size_t aLength, const xsimd::batch<uint8_t, Arch>& aSrc) {
  if (aLength >= 2) {
    // Store first 2 pixels
    _mm_storel_epi64(reinterpret_cast<__m128i*>(aDst), aSrc);
    // Store third pixel
    if (aLength >= 3) {
      *reinterpret_cast<uint32_t*>(aDst + 2 * 4) =
          _mm_cvtsi128_si32(_mm_srli_si128(aSrc, 2 * 4));
    }
  } else {
    // Store single pixel
    *reinterpret_cast<uint32_t*>(aDst) = _mm_cvtsi128_si32(aSrc);
  }
}

template <class Arch>
  requires std::same_as<Arch, xsimd::avx2>
static MOZ_ALWAYS_INLINE void StoreRemainder_SIMD(
    uint8_t* aDst, size_t aLength, const xsimd::batch<uint8_t, Arch>& aSrc) {
  if (aLength < 4) {
    StoreRemainder_SIMD<xsimd::sse2>(aDst, aLength,
                                     _mm256_extractf128_si256(aSrc, 0));
    return;
  }
  _mm_storeu_si128(reinterpret_cast<__m128i*>(aDst),
                   _mm256_castsi256_si128(aSrc));
  if (aLength > 4) {
    StoreRemainder_SIMD<xsimd::sse2>(aDst + 4 * 4, aLength - 4,
                                     _mm256_extractf128_si256(aSrc, 1));
  }
}

template <class Arch>
  requires std::same_as<Arch, xsimd::sse2> || std::same_as<Arch, xsimd::ssse3>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> LoadRemainderRGB_SIMD(
    const uint8_t* aSrc, size_t aLength) {
  // Load aLength (1-4) packed RGB pixels (3-12 bytes) without reading past the
  // 3*aLength valid source bytes. Bytes beyond the loaded pixels are unused by
  // the expand swizzle and dropped by StoreRemainder_SIMD.
  if (aLength >= 2) {
    if (aLength >= 3) {
      // Bytes 0-7: pixels 0-1 (RGB) and pixel 2's RG.
      __m128i px = _mm_loadl_epi64(reinterpret_cast<const __m128i*>(aSrc));
      if (aLength >= 4) {
        // Bytes 8-11: pixel 2's B and pixel 3 (RGB).
        return _mm_unpacklo_epi64(
            px,
            _mm_cvtsi32_si128(*reinterpret_cast<const uint32_t*>(aSrc + 8)));
      }
      // 3 pixels = 9 bytes; byte 8 is pixel 2's B.
      return _mm_insert_epi16(px, aSrc[8], 4);
    }
    // 2 pixels = 6 bytes: bytes 0-3 then bytes 4-5.
    return _mm_insert_epi16(
        _mm_cvtsi32_si128(*reinterpret_cast<const uint32_t*>(aSrc)),
        *reinterpret_cast<const uint16_t*>(aSrc + 4), 2);
  }
  // 1 pixel = 3 bytes: bytes 0-1 then byte 2.
  return _mm_cvtsi32_si128(*reinterpret_cast<const uint16_t*>(aSrc) |
                           (static_cast<uint32_t>(aSrc[2]) << 16));
}

template <class Arch>
  requires std::same_as<Arch, xsimd::avx2>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> LoadRemainderRGB_SIMD(
    const uint8_t* aSrc, size_t aLength) {
  // Load aLength (1-8) packed RGB pixels (3-24 bytes) contiguously without
  // reading past the valid source bytes; the low lane holds the first 16 bytes.
  if (aLength <= 4) {
    return _mm256_castsi128_si256(
        LoadRemainderRGB_SIMD<xsimd::sse2>(aSrc, aLength));
  }
  if (aLength == 5) {
    // 15 bytes: bytes 0-11, then 12-13, then 14.
    __m128i lo = _mm_unpacklo_epi64(
        _mm_loadl_epi64(reinterpret_cast<const __m128i*>(aSrc)),
        _mm_cvtsi32_si128(*reinterpret_cast<const uint32_t*>(aSrc + 8)));
    lo = _mm_insert_epi16(lo, *reinterpret_cast<const uint16_t*>(aSrc + 12), 6);
    lo = _mm_insert_epi8(lo, aSrc[14], 14);
    return _mm256_castsi128_si256(lo);
  }
  // aLength 6-8: low lane is a full 16-byte load, high lane is the remainder.
  __m128i lo = _mm_loadu_si128(reinterpret_cast<const __m128i*>(aSrc));
  __m128i hi;
  if (aLength == 6) {
    // Bytes 16-17.
    hi = _mm_cvtsi32_si128(*reinterpret_cast<const uint16_t*>(aSrc + 16));
  } else if (aLength == 7) {
    // Bytes 16-20.
    hi = _mm_cvtsi32_si128(*reinterpret_cast<const uint32_t*>(aSrc + 16));
    hi = _mm_insert_epi8(hi, aSrc[20], 4);
  } else {
    // Bytes 16-23.
    hi = _mm_loadl_epi64(reinterpret_cast<const __m128i*>(aSrc + 16));
  }
  return _mm256_set_m128i(hi, lo);
}

template <class Arch>
  requires std::same_as<Arch, xsimd::sse2>
static MOZ_ALWAYS_INLINE xsimd::batch<uint16_t, Arch> ExtractAlpha_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc,
    const xsimd::batch<uint16_t, Arch>& aGreenAlpha) {
  return _mm_shufflehi_epi16(
      _mm_shufflelo_epi16(aGreenAlpha, _MM_SHUFFLE(3, 3, 1, 1)),
      _MM_SHUFFLE(3, 3, 1, 1));
}

template <class Arch>
  requires std::same_as<Arch, xsimd::sse2>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> SwapRB8_SIMD(
    const xsimd::batch<uint8_t, Arch>& aPx) {
  // Swap R<->B (bytes 0 and 2 of each pixel) with a 32-bit rotate + masks
  // rather than a byte permute. SSE2 has no pshufb, so xsimd's portable byte
  // shuffle emulates it via unpack/pshuflw/pshufhw/packuswb -- 7 ops all on the
  // single shuffle port. The shift/mask/or form spreads across ports 0/1/5 and
  // matches the code clang auto-vectorizes the scalar fallback into.
  auto x = xsimd::bitwise_cast<uint32_t>(aPx);
  auto rb = ((x << 16) | (x >> 16)) & xsimd::batch<uint32_t, Arch>(0x00FF00FFu);
  auto ga = x & xsimd::batch<uint32_t, Arch>(0xFF00FF00u);
  return xsimd::bitwise_cast<uint8_t>(rb | ga);
}

template <class Arch>
  requires std::same_as<Arch, xsimd::sse2>
static MOZ_ALWAYS_INLINE xsimd::batch<uint16_t, Arch> SwapRB16_SIMD(
    const xsimd::batch<uint16_t, Arch>& aRb) {
  return _mm_shufflehi_epi16(_mm_shufflelo_epi16(aRb, _MM_SHUFFLE(2, 3, 0, 1)),
                             _MM_SHUFFLE(2, 3, 0, 1));
}

template <class Arch>
  requires std::same_as<Arch, xsimd::sse2> || std::same_as<Arch, xsimd::ssse3>
static MOZ_ALWAYS_INLINE xsimd::batch<uint32_t, Arch> UnpremultiplyLookup_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc,
    const xsimd::batch<uint16_t, Arch>& aGa) {
  // Extract the alphas for the 4 pixels from the now isolated words.
  alignas(Arch::alignment())
      uint16_t alphaBuf[xsimd::batch<uint16_t, Arch>::size];
  aGa.store_aligned(alphaBuf);

  // Load the full 8.16 reciprocals from the table for each alpha and gather
  // them into 32-bit lanes Q0 Q1 Q2 Q3.
  __m128i q12 =
      _mm_unpacklo_epi32(_mm_cvtsi32_si128(sUnpremultiplyTable[alphaBuf[1]]),
                         _mm_cvtsi32_si128(sUnpremultiplyTable[alphaBuf[3]]));
  __m128i q34 =
      _mm_unpacklo_epi32(_mm_cvtsi32_si128(sUnpremultiplyTable[alphaBuf[5]]),
                         _mm_cvtsi32_si128(sUnpremultiplyTable[alphaBuf[7]]));
  return _mm_unpacklo_epi64(q12, q34);
}

template <class Arch>
  requires std::same_as<Arch, xsimd::avx2>
static MOZ_ALWAYS_INLINE xsimd::batch<uint32_t, Arch> UnpremultiplyLookup_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc,
    const xsimd::batch<uint16_t, Arch>& aGa) {
  // We do this to avoid vpgatherdd, which was often slow to begin with, is
  // worsened by the Downfall microcode mitigations, and its best effort matches
  // the more naive approach here.
  alignas(Arch::alignment())
      uint16_t alphaBuf[xsimd::batch<uint16_t, Arch>::size];
  aGa.store_aligned(alphaBuf);

  // Load the full 8.16 reciprocal from the table for each alpha, gathered into
  // 32-bit lanes Q0..Q7.
  alignas(Arch::alignment())
      uint32_t recipBuf[xsimd::batch<uint32_t, Arch>::size];
  for (size_t i = 0; i < xsimd::batch<uint32_t, Arch>::size; ++i) {
    recipBuf[i] = sUnpremultiplyTable[alphaBuf[2 * i + 1]];
  }
  return xsimd::batch<uint32_t, Arch>::load_aligned(recipBuf);
}

}  // namespace mozilla::gfx

#endif /* MOZILLA_GFX_SWIZZLE_SSE2_H_ */
