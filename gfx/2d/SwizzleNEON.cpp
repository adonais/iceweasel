/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// clang-format off
#include "SwizzleNEON.h"      // must be first for template specialization
#include "SwizzleGeneric.h"
// clang-format on

namespace mozilla {
namespace gfx {

template <bool aSwapRB, bool aOpaqueAlpha>
void PremultiplyRow_NEON(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  PremultiplyRow_SIMD<mozneon, aSwapRB, aOpaqueAlpha>(aSrc, aDst, aLength);
}

template <bool aSwapRB, bool aOpaqueAlpha>
void Premultiply_NEON(const uint8_t* aSrc, int32_t aSrcGap, uint8_t* aDst,
                      int32_t aDstGap, IntSize aSize) {
  Premultiply_SIMD<mozneon, aSwapRB, aOpaqueAlpha>(aSrc, aSrcGap, aDst, aDstGap,
                                                   aSize);
}

// Force instantiation of premultiply variants here.
template void PremultiplyRow_NEON<false, false>(const uint8_t*, uint8_t*,
                                                int32_t);
template void PremultiplyRow_NEON<false, true>(const uint8_t*, uint8_t*,
                                               int32_t);
template void PremultiplyRow_NEON<true, false>(const uint8_t*, uint8_t*,
                                               int32_t);
template void PremultiplyRow_NEON<true, true>(const uint8_t*, uint8_t*,
                                              int32_t);
template void Premultiply_NEON<false, false>(const uint8_t*, int32_t, uint8_t*,
                                             int32_t, IntSize);
template void Premultiply_NEON<false, true>(const uint8_t*, int32_t, uint8_t*,
                                            int32_t, IntSize);
template void Premultiply_NEON<true, false>(const uint8_t*, int32_t, uint8_t*,
                                            int32_t, IntSize);
template void Premultiply_NEON<true, true>(const uint8_t*, int32_t, uint8_t*,
                                           int32_t, IntSize);

// This generates a table of fixed-point reciprocals representing 1/alpha
// similar to the fallback implementation. However, the reciprocal must
// ultimately be multiplied as an unsigned 9 bit upper part and a signed
// 15 bit lower part to cheaply multiply. Thus, the lower 15 bits of the
// reciprocal is stored 15 bits of the reciprocal are masked off and
// stored in the low word. The upper 9 bits are masked and shifted to fit
// into the high word. These then get independently multiplied with the
// color component and recombined to provide the full recriprocal multiply.
#define UNPREMULQ_NEON(x) \
  ((((0xFF00FFU / (x)) & 0xFF8000U) << 1) | ((0xFF00FFU / (x)) & 0x7FFFU))
#define UNPREMULQ_NEON_2(x) UNPREMULQ_NEON(x), UNPREMULQ_NEON((x) + 1)
#define UNPREMULQ_NEON_4(x) UNPREMULQ_NEON_2(x), UNPREMULQ_NEON_2((x) + 2)
#define UNPREMULQ_NEON_8(x) UNPREMULQ_NEON_4(x), UNPREMULQ_NEON_4((x) + 4)
#define UNPREMULQ_NEON_16(x) UNPREMULQ_NEON_8(x), UNPREMULQ_NEON_8((x) + 8)
#define UNPREMULQ_NEON_32(x) UNPREMULQ_NEON_16(x), UNPREMULQ_NEON_16((x) + 16)
extern const uint32_t sUnpremultiplyTable_NEON[256] = {0,
                                                       UNPREMULQ_NEON(1),
                                                       UNPREMULQ_NEON_2(2),
                                                       UNPREMULQ_NEON_4(4),
                                                       UNPREMULQ_NEON_8(8),
                                                       UNPREMULQ_NEON_16(16),
                                                       UNPREMULQ_NEON_32(32),
                                                       UNPREMULQ_NEON_32(64),
                                                       UNPREMULQ_NEON_32(96),
                                                       UNPREMULQ_NEON_32(128),
                                                       UNPREMULQ_NEON_32(160),
                                                       UNPREMULQ_NEON_32(192),
                                                       UNPREMULQ_NEON_32(224)};

template <bool aSwapRB>
void UnpremultiplyRow_NEON(const uint8_t* aSrc, uint8_t* aDst,
                           int32_t aLength) {
  UnpremultiplyRow_SIMD<mozneon, aSwapRB>(aSrc, aDst, aLength);
}

template <bool aSwapRB>
void Unpremultiply_NEON(const uint8_t* aSrc, int32_t aSrcGap, uint8_t* aDst,
                        int32_t aDstGap, IntSize aSize) {
  Unpremultiply_SIMD<mozneon, aSwapRB>(aSrc, aSrcGap, aDst, aDstGap, aSize);
}

// Force instantiation of unpremultiply variants here.
template void UnpremultiplyRow_NEON<false>(const uint8_t*, uint8_t*, int32_t);
template void UnpremultiplyRow_NEON<true>(const uint8_t*, uint8_t*, int32_t);
template void Unpremultiply_NEON<false>(const uint8_t*, int32_t, uint8_t*,
                                        int32_t, IntSize);
template void Unpremultiply_NEON<true>(const uint8_t*, int32_t, uint8_t*,
                                       int32_t, IntSize);

template <bool aSwapRB, bool aOpaqueAlpha>
void SwizzleRow_NEON(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  SwizzleRow_SIMD<mozneon, aSwapRB, aOpaqueAlpha>(aSrc, aDst, aLength);
}

template <bool aSwapRB, bool aOpaqueAlpha>
void Swizzle_NEON(const uint8_t* aSrc, int32_t aSrcGap, uint8_t* aDst,
                  int32_t aDstGap, IntSize aSize) {
  Swizzle_SIMD<mozneon, aSwapRB, aOpaqueAlpha>(aSrc, aSrcGap, aDst, aDstGap,
                                               aSize);
}

// Force instantiation of swizzle variants here.
template void SwizzleRow_NEON<true, false>(const uint8_t*, uint8_t*, int32_t);
template void SwizzleRow_NEON<true, true>(const uint8_t*, uint8_t*, int32_t);
template void Swizzle_NEON<true, false>(const uint8_t*, int32_t, uint8_t*,
                                        int32_t, IntSize);
template void Swizzle_NEON<true, true>(const uint8_t*, int32_t, uint8_t*,
                                       int32_t, IntSize);

template <bool aSwapRB>
void UnpackRowRGB24_NEON(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  UnpackRowRGB24_SIMD<mozneon, aSwapRB>(aSrc, aDst, aLength);
}

// Force instantiation of swizzle variants here.
template void UnpackRowRGB24_NEON<false>(const uint8_t*, uint8_t*, int32_t);
template void UnpackRowRGB24_NEON<true>(const uint8_t*, uint8_t*, int32_t);

template <bool aSwapRB, bool aInverted>
void SwizzleCmykRow_NEON(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  SwizzleCmykRow_SIMD<mozneon, aSwapRB, aInverted>(aSrc, aDst, aLength);
}

// Force instantiation of swizzle variants here.
template void SwizzleCmykRow_NEON<true, false>(const uint8_t*, uint8_t*,
                                               int32_t);
template void SwizzleCmykRow_NEON<true, true>(const uint8_t*, uint8_t*,
                                              int32_t);

}  // namespace gfx
}  // namespace mozilla
