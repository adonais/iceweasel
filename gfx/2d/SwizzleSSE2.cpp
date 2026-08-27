/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// clang-format off
#include "SwizzleSSE2.h"      // must be first for template specialization
#include "SwizzleGeneric.h"
// clang-format on

namespace mozilla::gfx {

// Premultiply vector of aLength pixels.
template <bool aSwapRB, bool aOpaqueAlpha>
void PremultiplyRow_SSE2(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  PremultiplyRow_SIMD<xsimd::sse2, aSwapRB, aOpaqueAlpha>(aSrc, aDst, aLength);
}

template <bool aSwapRB, bool aOpaqueAlpha>
void Premultiply_SSE2(const uint8_t* aSrc, int32_t aSrcGap, uint8_t* aDst,
                      int32_t aDstGap, IntSize aSize) {
  Premultiply_SIMD<xsimd::sse2, aSwapRB, aOpaqueAlpha>(aSrc, aSrcGap, aDst,
                                                       aDstGap, aSize);
}

// Force instantiation of premultiply variants here.
template void PremultiplyRow_SSE2<false, false>(const uint8_t*, uint8_t*,
                                                int32_t);
template void PremultiplyRow_SSE2<false, true>(const uint8_t*, uint8_t*,
                                               int32_t);
template void PremultiplyRow_SSE2<true, false>(const uint8_t*, uint8_t*,
                                               int32_t);
template void PremultiplyRow_SSE2<true, true>(const uint8_t*, uint8_t*,
                                              int32_t);
template void Premultiply_SSE2<false, false>(const uint8_t*, int32_t, uint8_t*,
                                             int32_t, IntSize);
template void Premultiply_SSE2<false, true>(const uint8_t*, int32_t, uint8_t*,
                                            int32_t, IntSize);
template void Premultiply_SSE2<true, false>(const uint8_t*, int32_t, uint8_t*,
                                            int32_t, IntSize);
template void Premultiply_SSE2<true, true>(const uint8_t*, int32_t, uint8_t*,
                                           int32_t, IntSize);

template <bool aSwapRB>
void UnpremultiplyRow_SSE2(const uint8_t* aSrc, uint8_t* aDst,
                           int32_t aLength) {
  UnpremultiplyRow_SIMD<xsimd::sse2, aSwapRB>(aSrc, aDst, aLength);
}

template <bool aSwapRB>
void Unpremultiply_SSE2(const uint8_t* aSrc, int32_t aSrcGap, uint8_t* aDst,
                        int32_t aDstGap, IntSize aSize) {
  Unpremultiply_SIMD<xsimd::sse2, aSwapRB>(aSrc, aSrcGap, aDst, aDstGap, aSize);
}

// Force instantiation of unpremultiply variants here.
template void UnpremultiplyRow_SSE2<false>(const uint8_t*, uint8_t*, int32_t);
template void UnpremultiplyRow_SSE2<true>(const uint8_t*, uint8_t*, int32_t);
template void Unpremultiply_SSE2<false>(const uint8_t*, int32_t, uint8_t*,
                                        int32_t, IntSize);
template void Unpremultiply_SSE2<true>(const uint8_t*, int32_t, uint8_t*,
                                       int32_t, IntSize);

template <bool aSwapRB, bool aOpaqueAlpha>
void SwizzleRow_SSE2(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  SwizzleRow_SIMD<xsimd::sse2, aSwapRB, aOpaqueAlpha>(aSrc, aDst, aLength);
}

template <bool aSwapRB, bool aOpaqueAlpha>
void Swizzle_SSE2(const uint8_t* aSrc, int32_t aSrcGap, uint8_t* aDst,
                  int32_t aDstGap, IntSize aSize) {
  Swizzle_SIMD<xsimd::sse2, aSwapRB, aOpaqueAlpha>(aSrc, aSrcGap, aDst, aDstGap,
                                                   aSize);
}

// Force instantiation of swizzle variants here.
template void SwizzleRow_SSE2<true, false>(const uint8_t*, uint8_t*, int32_t);
template void SwizzleRow_SSE2<true, true>(const uint8_t*, uint8_t*, int32_t);
template void Swizzle_SSE2<true, false>(const uint8_t*, int32_t, uint8_t*,
                                        int32_t, IntSize);
template void Swizzle_SSE2<true, true>(const uint8_t*, int32_t, uint8_t*,
                                       int32_t, IntSize);

template <bool aSwapRB, bool aInverted>
void SwizzleCmykRow_SSE2(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  SwizzleCmykRow_SIMD<xsimd::sse2, aSwapRB, aInverted>(aSrc, aDst, aLength);
}

// Force instantiation of swizzle variants here.
template void SwizzleCmykRow_SSE2<true, false>(const uint8_t*, uint8_t*,
                                               int32_t);
template void SwizzleCmykRow_SSE2<true, true>(const uint8_t*, uint8_t*,
                                              int32_t);

}  // namespace mozilla::gfx
