/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_SWIZZLE_GENERIC_H_
#define MOZILLA_GFX_SWIZZLE_GENERIC_H_

#include "SwizzleGenericDecls.h"

namespace mozilla::gfx {

// We should generally prefer to specialize LoadRemainder_SIMD and
// StoreRemainder_SIMD to avoid the memcpy call which doesn't get optimized out.
// The implementations below should provide an acceptable baseline though.
template <class Arch>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> LoadRemainder_SIMD(
    const uint8_t* aSrc, size_t aLength) {
  alignas(Arch::alignment()) uint8_t buffer[xsimd::batch<uint8_t, Arch>::size];
  memcpy(buffer, aSrc, aLength * 4);
  return xsimd::batch<uint8_t, Arch>::load_aligned(buffer);
}

template <class Arch>
static MOZ_ALWAYS_INLINE void StoreRemainder_SIMD(
    uint8_t* aDst, size_t aLength, const xsimd::batch<uint8_t, Arch>& aSrc) {
  alignas(Arch::alignment()) uint8_t buffer[xsimd::batch<uint8_t, Arch>::size];
  aSrc.store_aligned(buffer);
  memcpy(aDst, buffer, aLength * 4);
}

template <class Arch>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> LoadRemainderRGB_SIMD(
    const uint8_t* aSrc, size_t aLength) {
  alignas(Arch::alignment()) uint8_t buffer[xsimd::batch<uint8_t, Arch>::size];
  memcpy(buffer, aSrc, aLength * 3);
  return xsimd::batch<uint8_t, Arch>::load_aligned(buffer);
}

template <class Arch>
static MOZ_ALWAYS_INLINE xsimd::batch<uint16_t, Arch> ExtractAlpha_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc,
    const xsimd::batch<uint16_t, Arch>& aGreenAlpha) {
  auto a32 = xsimd::bitwise_cast<uint32_t>(aSrc) >> 24;
  return xsimd::bitwise_cast<uint16_t>(a32 | (a32 << 16));
}

template <class Arch, auto Op, bool Unroll = false>
static MOZ_ALWAYS_INLINE void ProcessChunk_SIMD(const uint8_t*& aSrc,
                                                uint8_t*& aDst,
                                                int32_t aAlignedRow,
                                                int32_t aRemainder) {
  static constexpr int32_t batchBytes = xsimd::batch<uint8_t, Arch>::size;

  const uint8_t* end = aSrc + aAlignedRow;

  if constexpr (Unroll) {
    // Process two vectors per iteration. clang unrolls the loop on the fallback
    // path with SSE2 and does better than our algorithm can without unrolling.
    const uint8_t* end2 = aSrc + (aAlignedRow & ~(2 * batchBytes - 1));
    while (aSrc < end2) {
      auto px0 = xsimd::batch<uint8_t, Arch>::load_unaligned(aSrc);
      auto px1 = xsimd::batch<uint8_t, Arch>::load_unaligned(aSrc + batchBytes);
      px0 = Op(px0);
      px1 = Op(px1);
      px0.store_unaligned(aDst);
      px1.store_unaligned(aDst + batchBytes);
      aSrc += 2 * batchBytes;
      aDst += 2 * batchBytes;
    }

    // Process the last full vector, if any.
    if (aSrc < end) {
      auto px = xsimd::batch<uint8_t, Arch>::load_unaligned(aSrc);
      px = Op(px);
      px.store_unaligned(aDst);
      aSrc += batchBytes;
      aDst += batchBytes;
    }
  } else {
    for (const uint8_t* end = aSrc + aAlignedRow; aSrc < end;) {
      auto px = xsimd::batch<uint8_t, Arch>::load_unaligned(aSrc);
      px = Op(px);
      px.store_unaligned(aDst);
      aSrc += batchBytes;
      aDst += batchBytes;
    }
  }

  // Handle any remaining pixels that could not fit in one vector.
  if (aRemainder) {
    auto px = LoadRemainder_SIMD<Arch>(aSrc, aRemainder);
    px = Op(px);
    StoreRemainder_SIMD<Arch>(aDst, aRemainder, px);
  }
}

template <class Arch, auto Op, bool Unroll = false>
static MOZ_ALWAYS_INLINE void ProcessRow_SIMD(const uint8_t* aSrc,
                                              uint8_t* aDst, int32_t aLength) {
  static constexpr int32_t batchPixels = xsimd::batch<uint32_t, Arch>::size;
  int32_t alignedRow = 4 * (aLength & ~(batchPixels - 1));
  int32_t remainder = aLength & (batchPixels - 1);
  ProcessChunk_SIMD<Arch, Op, Unroll>(aSrc, aDst, alignedRow, remainder);
}

template <class Arch, auto Op, bool Unroll = false>
static MOZ_ALWAYS_INLINE void Process_SIMD(const uint8_t* aSrc, int32_t aSrcGap,
                                           uint8_t* aDst, int32_t aDstGap,
                                           IntSize aSize) {
  static constexpr int32_t batchPixels = xsimd::batch<uint32_t, Arch>::size;
  int32_t alignedRow = 4 * (aSize.width & ~(batchPixels - 1));
  int32_t remainder = aSize.width & (batchPixels - 1);
  // Fold remainder into stride gap.
  aSrcGap += 4 * remainder;
  aDstGap += 4 * remainder;

  for (int32_t height = aSize.height; height > 0; height--) {
    ProcessChunk_SIMD<Arch, Op, Unroll>(aSrc, aDst, alignedRow, remainder);
    aSrc += aSrcGap;
    aDst += aDstGap;
  }
}

struct SwizzleVectorSwapRbMask {
  static constexpr uint8_t get(uint8_t i, uint8_t) {
    uint8_t channel = i % 4;
    switch (channel) {
      case 0:
        return i + 2;
      case 2:
        return i - 2;
      default:
        return i;
    }
    return i;
  }
};

// Swaps 8-bit R and B channels within each pixel. If the target supports byte
// shuffle, then this is likely ideal. Otherwise it should be specialized.
template <class Arch>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> SwapRB8_SIMD(
    const xsimd::batch<uint8_t, Arch>& aPx) {
  constexpr auto swapRbMask =
      xsimd::make_batch_constant<uint8_t, SwizzleVectorSwapRbMask, Arch>();
  return xsimd::shuffle(aPx, aPx, swapRbMask);
}

// Swaps 16-bit R and B channels within each pixel. This doesn't require a byte
// shuffle, and instead can be a 16-bit rotate of each 32-bit lane.
template <class Arch>
static MOZ_ALWAYS_INLINE xsimd::batch<uint16_t, Arch> SwapRB16_SIMD(
    const xsimd::batch<uint16_t, Arch>& aRb) {
  auto rb32 = xsimd::bitwise_cast<uint32_t>(aRb);
  return xsimd::bitwise_cast<uint16_t>((rb32 << 16) | (rb32 >> 16));
}

// Forces the A channel to 0xFF.
template <class Arch>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> OpaqueAlpha_SIMD(
    const xsimd::batch<uint8_t, Arch>& aPx) {
  return xsimd::bitwise_cast<uint8_t>(xsimd::bitwise_cast<uint32_t>(aPx) |
                                      xsimd::batch<uint32_t, Arch>(0xFF000000));
}

// Swizzle a vector of pixels, swapping and making opaque as desired.
template <class Arch, bool aSwapRB, bool aOpaqueAlpha>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> SwizzleVector_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc) {
  auto px = aSrc;
  if constexpr (aSwapRB) {
    px = SwapRB8_SIMD<Arch>(px);
  }
  if constexpr (aOpaqueAlpha) {
    px = OpaqueAlpha_SIMD<Arch>(px);
  }
  return px;
}

template <class Arch, bool aSwapRB, bool aOpaqueAlpha>
static MOZ_ALWAYS_INLINE void SwizzleRow_SIMD(const uint8_t* aSrc,
                                              uint8_t* aDst, int32_t aLength) {
  ProcessRow_SIMD<Arch, SwizzleVector_SIMD<Arch, aSwapRB, aOpaqueAlpha>,
                  /* Unroll */ true>(aSrc, aDst, aLength);
}

template <class Arch, bool aSwapRB, bool aOpaqueAlpha>
static MOZ_ALWAYS_INLINE void Swizzle_SIMD(const uint8_t* aSrc, int32_t aSrcGap,
                                           uint8_t* aDst, int32_t aDstGap,
                                           IntSize aSize) {
  Process_SIMD<Arch, SwizzleVector_SIMD<Arch, aSwapRB, aOpaqueAlpha>,
               /* Unroll */ true>(aSrc, aSrcGap, aDst, aDstGap, aSize);
}

// Convert from CMYK to BGRX/RGBX, swapping and inverting as desired.
template <class Arch, bool aSwapRB, bool aInverted>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> SwizzleCmykVector_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc) {
  xsimd::batch<uint8_t, Arch> src;
  // Invert if necessary, as the math expects inverted CMYK.
  if constexpr (!aInverted) {
    src = ~aSrc;
  } else {
    src = aSrc;
  }
  // Isolate iC and iY with mask.
  auto px16 = xsimd::bitwise_cast<uint16_t>(src);
  const xsimd::batch<uint16_t, Arch> lowByte(0x00FF);
  auto icy = px16 & lowByte;
  // Isolate iM and iK by shifting down to bottom of word.
  auto imk = px16 >> 8;
  auto ik16 = ExtractAlpha_SIMD<Arch>(src, imk);
  // Multiply each channel by the iK, add 1, divide by 255, all in place. This
  // is equivalent to iC * iK / 255.
  icy = icy * ik16;
  icy = (icy + (icy >> 8) + xsimd::batch<uint16_t, Arch>(1)) >> 8;
  imk = imk * ik16;
  imk = (imk + (imk >> 8) + xsimd::batch<uint16_t, Arch>(1)) >> 8;
  // Swap R and B if necessary.
  if constexpr (aSwapRB) {
    icy = SwapRB16_SIMD<Arch>(icy);
  }
  // Combine back to final pixel.
  return OpaqueAlpha_SIMD<Arch>(xsimd::bitwise_cast<uint8_t>(icy | (imk << 8)));
}

template <class Arch, bool aSwapRB, bool aInverted>
void MOZ_ALWAYS_INLINE SwizzleCmykRow_SIMD(const uint8_t* aSrc, uint8_t* aDst,
                                           int32_t aLength) {
  ProcessRow_SIMD<Arch, SwizzleCmykVector_SIMD<Arch, aSwapRB, aInverted>>(
      aSrc, aDst, aLength);
}

// Premultiply a vector of pixels, swapping and making opaque as desired.
template <class Arch, bool aSwapRB, bool aOpaqueAlpha>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> PremultiplyVector_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc) {
  // Isolate R and B with mask.
  auto px16 = xsimd::bitwise_cast<uint16_t>(aSrc);
  const xsimd::batch<uint16_t, Arch> lowByte(0x00FF);
  auto rb = px16 & lowByte;
  // Isolate G and A by shifting down to bottom of word.
  auto ga = px16 >> 8;
  auto a16 = ExtractAlpha_SIMD<Arch>(aSrc, ga);
  // If format is not opaque, force A to 255 so that A*alpha/255 = alpha.
  if constexpr (!aOpaqueAlpha) {
    ga =
        xsimd::bitwise_cast<uint16_t>(xsimd::bitwise_cast<uint32_t>(ga) |
                                      xsimd::batch<uint32_t, Arch>(0x00FF0000));
  }
  // Multiply each channel by the alpha, add 255, divide by 255, all in place.
  rb = xsimd::fma(rb, a16, xsimd::batch<uint16_t, Arch>(0xFF));
  rb = (rb + (rb >> 8)) >> 8;
  ga = xsimd::fma(ga, a16, xsimd::batch<uint16_t, Arch>(0xFF));
  ga = (ga + (ga >> 8)) >> 8;
  // Swap R and B if necessary.
  if constexpr (aSwapRB) {
    rb = SwapRB16_SIMD<Arch>(rb);
  }
  // Combine back to final pixel.
  auto px = xsimd::bitwise_cast<uint8_t>(rb | (ga << 8));
  if constexpr (aOpaqueAlpha) {
    px = OpaqueAlpha_SIMD<Arch>(px);
  }
  return px;
}

template <class Arch, bool aSwapRB, bool aOpaqueAlpha>
static MOZ_ALWAYS_INLINE void PremultiplyRow_SIMD(const uint8_t* aSrc,
                                                  uint8_t* aDst,
                                                  int32_t aLength) {
  ProcessRow_SIMD<Arch, PremultiplyVector_SIMD<Arch, aSwapRB, aOpaqueAlpha>>(
      aSrc, aDst, aLength);
}

template <class Arch, bool aSwapRB, bool aOpaqueAlpha>
static MOZ_ALWAYS_INLINE void Premultiply_SIMD(const uint8_t* aSrc,
                                               int32_t aSrcGap, uint8_t* aDst,
                                               int32_t aDstGap, IntSize aSize) {
  Process_SIMD<Arch, PremultiplyVector_SIMD<Arch, aSwapRB, aOpaqueAlpha>>(
      aSrc, aSrcGap, aDst, aDstGap, aSize);
}

template <class Arch>
static MOZ_ALWAYS_INLINE xsimd::batch<uint32_t, Arch> UnpremultiplyLookup_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc,
    const xsimd::batch<uint16_t, Arch>& aGa) {
  auto alpha = xsimd::bitwise_cast<uint32_t>(aSrc) >> 24;
  return xsimd::batch<uint32_t, Arch>::gather(sUnpremultiplyTable, alpha);
}

template <class Arch>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> UnpremultiplyReverse_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc,
    const xsimd::batch<uint32_t, Arch>& aRecip,
    const xsimd::batch<uint16_t, Arch>& aRb,
    const xsimd::batch<uint16_t, Arch>& aGa) {
  // Split each reciprocal into low and high 16-bit halves, each duplicated into
  // both 16-bit words of its lane to line up with the R/B and G/A word layout
  // (Qn Qn per pixel): qLo = Q & 0xFFFF, qHi = Q >> 16.
  auto qLo = aRecip & xsimd::batch<uint32_t, Arch>(0x0000FFFF);
  qLo = qLo | (qLo << 16);
  auto qHi = aRecip >> 16;
  qHi = qHi | (qHi << 16);
  auto qLo16 = xsimd::bitwise_cast<uint16_t>(qLo);
  auto qHi16 = xsimd::bitwise_cast<uint16_t>(qHi);
  // Isolate G now so that we don't accidentally unpremultiply A.
  auto ga =
      xsimd::bitwise_cast<uint16_t>(xsimd::bitwise_cast<uint32_t>(aGa) &
                                    xsimd::batch<uint32_t, Arch>(0x000000FF));
  // Exact (channel * reciprocal) >> 16 in 16-bit lanes. Since
  //   channel*Q = channel*qHi*0x10000 + channel*qLo,
  //   (channel*Q) >> 16 = channel*qHi + ((channel*qLo) >> 16)
  //                     = mullo(channel, qHi) + mulhi(channel, qLo).
  // mullo gives the exact low 16 bits of channel*qHi; masking to a byte keeps
  // the high byte clear for the recombine below and makes any out-of-range
  // (channel > alpha) input wrap to the low byte exactly as the scalar path.
  const xsimd::batch<uint16_t, Arch> lowByte(0x00FF);
  auto rb = (aRb * qHi16 + xsimd::mul_hi(aRb, qLo16)) & lowByte;
  ga = (ga * qHi16 + xsimd::mul_hi(ga, qLo16)) & lowByte;
  // Combine back to final pixel with rb | (ga << 8) | (aSrc & 0xFF000000),
  // which will add back on the original alpha value unchanged.
  auto alpha =
      xsimd::bitwise_cast<uint16_t>(xsimd::bitwise_cast<uint32_t>(aSrc) &
                                    xsimd::batch<uint32_t, Arch>(0xFF000000));
  return xsimd::bitwise_cast<uint8_t>(rb | (ga << 8) | alpha);
}

// Unpremultiply a vector of pixels, swapping and making opaque as desired.
template <class Arch, bool aSwapRB>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> UnpremultiplyVector_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc) {
  // Isolate R and B with mask.
  const xsimd::batch<uint16_t, Arch> lowByte(0x00FF);
  auto px16 = xsimd::bitwise_cast<uint16_t>(aSrc);
  auto rb = px16 & lowByte;
  // Swap R and B if necessary.
  if constexpr (aSwapRB) {
    rb = SwapRB16_SIMD<Arch>(rb);
  }

  // Isolate G and A by shifting down to bottom of word.
  auto ga = px16 >> 8;
  // Extract the reciprocals from the lookup table.
  auto recip = UnpremultiplyLookup_SIMD<Arch>(aSrc, ga);
  // Perform the unpremultiply.
  return UnpremultiplyReverse_SIMD<Arch>(aSrc, recip, rb, ga);
}

template <class Arch, bool aSwapRB>
static MOZ_ALWAYS_INLINE void UnpremultiplyRow_SIMD(const uint8_t* aSrc,
                                                    uint8_t* aDst,
                                                    int32_t aLength) {
  ProcessRow_SIMD<Arch, UnpremultiplyVector_SIMD<Arch, aSwapRB>>(aSrc, aDst,
                                                                 aLength);
}

template <class Arch, bool aSwapRB>
static MOZ_ALWAYS_INLINE void Unpremultiply_SIMD(const uint8_t* aSrc,
                                                 int32_t aSrcGap, uint8_t* aDst,
                                                 int32_t aDstGap,
                                                 IntSize aSize) {
  Process_SIMD<Arch, UnpremultiplyVector_SIMD<Arch, aSwapRB>>(
      aSrc, aSrcGap, aDst, aDstGap, aSize);
}

template <bool aSwapRB>
struct UnpackRowRGB24ExpandMask {
  static constexpr uint8_t get(uint8_t i, uint8_t) {
    // Every 4th byte is the alpha which we turn opaque in another step. Here,
    // we just duplicate the first channel into the alpha.
    uint8_t channel = i % 4;
    if (channel == 3) {
      return 0;
    }
    // Swap R and B if necessary as well.
    uint8_t pixel = i / 4;
    return 3 * pixel + (aSwapRB ? 2 - channel : channel);
  }
};

template <class Arch, bool aSwapRB>
static MOZ_ALWAYS_INLINE xsimd::batch<uint8_t, Arch> UnpackBatchRGB24_SIMD(
    const xsimd::batch<uint8_t, Arch>& aSrc) {
  constexpr auto expandMask =
      xsimd::make_batch_constant<uint8_t, UnpackRowRGB24ExpandMask<aSwapRB>,
                                 Arch>();
  // Expand the packed RGB pixels to RGBX and force the alpha to be opaque.
  return OpaqueAlpha_SIMD<Arch>(xsimd::swizzle(aSrc, expandMask));
}

template <class Arch, bool aSwapRB>
static MOZ_ALWAYS_INLINE void UnpackRowRGB24_SIMD(const uint8_t* aSrc,
                                                  uint8_t* aDst,
                                                  int32_t aLength) {
  // Each pass writes batchSize pixels (4, 8, 16), or batchBytes bytes (16,
  // 32, 64).
  static constexpr int32_t batchPixels = xsimd::batch<uint32_t, Arch>::size;
  static constexpr int32_t batchBytes = xsimd::batch<uint8_t, Arch>::size;

  // Each pass reads batchBytes worth of data, which maps to batchPackedPixels
  // (6, 11, 22) packed pixels (rounded up) per pass.
  static constexpr int32_t batchPackedPixels = (batchBytes + 2) / 3;

  // The main loop reads batchBytes at once, overrunning the packed pixels it
  // consumes, so alignedRow marks the pixels that can be read that way
  // without running past the source. The trailing pixels (and short rows that
  // cannot use the main loop at all) are handled with safe partial loads
  // instead.
  int32_t alignedRow = 0;
  if (aLength >= batchPackedPixels) {
    static constexpr int32_t batchPackedPixelsOverrun =
        batchPackedPixels - batchPixels;
    alignedRow = (aLength - batchPackedPixelsOverrun) & ~(batchPixels - 1);
  }

  // Because we are expanding in place, process strictly back to front. Handle
  // the trailing pixels first, in up to batchPixels chunks, using loads that
  // never read past the 3*aLength source bytes.
  for (int32_t pos = aLength; pos > alignedRow;) {
    int32_t n = pos - alignedRow < batchPixels ? pos - alignedRow : batchPixels;
    int32_t start = pos - n;
    auto px = LoadRemainderRGB_SIMD<Arch>(aSrc + start * 3, n);
    px = UnpackBatchRGB24_SIMD<Arch, aSwapRB>(px);
    if (n == batchPixels) {
      px.store_unaligned(aDst + start * 4);
    } else {
      StoreRemainder_SIMD<Arch>(aDst + start * 4, n, px);
    }
    pos = start;
  }

  // Process the remaining aligned pixels as full vectors, back to front.
  const uint8_t* src = aSrc + (alignedRow - batchPixels) * 3;
  uint8_t* dst = aDst + (alignedRow - batchPixels) * 4;
  while (src >= aSrc) {
    auto px = xsimd::batch<uint8_t, Arch>::load_unaligned(src);
    px = UnpackBatchRGB24_SIMD<Arch, aSwapRB>(px);
    px.store_unaligned(dst);
    src -= batchPixels * 3;
    dst -= batchPixels * 4;
  }
}

}  // namespace mozilla::gfx

#endif /* MOZILLA_GFX_SWIZZLE_GENERIC_H_ */
