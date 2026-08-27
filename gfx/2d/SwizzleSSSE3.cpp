/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// clang-format off
#include "SwizzleSSE2.h"      // must be first for template specialization
#include "SwizzleGeneric.h"
// clang-format on

namespace mozilla::gfx {

template <bool aSwapRB, bool aOpaqueAlpha>
void SwizzleRow_SSSE3(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  SwizzleRow_SIMD<xsimd::ssse3, aSwapRB, aOpaqueAlpha>(aSrc, aDst, aLength);
}

template <bool aSwapRB, bool aOpaqueAlpha>
void Swizzle_SSSE3(const uint8_t* aSrc, int32_t aSrcGap, uint8_t* aDst,
                   int32_t aDstGap, IntSize aSize) {
  Swizzle_SIMD<xsimd::ssse3, aSwapRB, aOpaqueAlpha>(aSrc, aSrcGap, aDst,
                                                    aDstGap, aSize);
}

// Force instantiation of swizzle variants here.
template void SwizzleRow_SSSE3<true, false>(const uint8_t*, uint8_t*, int32_t);
template void SwizzleRow_SSSE3<true, true>(const uint8_t*, uint8_t*, int32_t);
template void Swizzle_SSSE3<true, false>(const uint8_t*, int32_t, uint8_t*,
                                         int32_t, IntSize);
template void Swizzle_SSSE3<true, true>(const uint8_t*, int32_t, uint8_t*,
                                        int32_t, IntSize);

template <bool aSwapRB>
void UnpackRowRGB24_SSSE3(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  UnpackRowRGB24_SIMD<xsimd::ssse3, aSwapRB>(aSrc, aDst, aLength);
}

// Force instantiation of swizzle variants here.
template void UnpackRowRGB24_SSSE3<false>(const uint8_t*, uint8_t*, int32_t);
template void UnpackRowRGB24_SSSE3<true>(const uint8_t*, uint8_t*, int32_t);

}  // namespace mozilla::gfx
