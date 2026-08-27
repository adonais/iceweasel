/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SwizzleGeneric.h"

#include "SwizzleHelpers.h"

namespace mozilla::gfx {

using mozgeneric = xsimd::default_arch;

// Premultiply vector of aLength pixels.
template <bool aSwapRB, bool aOpaqueAlpha>
void PremultiplyRow_Generic(const uint8_t* aSrc, uint8_t* aDst,
                            int32_t aLength) {
  PremultiplyRow_SIMD<mozgeneric, aSwapRB, aOpaqueAlpha>(aSrc, aDst, aLength);
}

// Force instantiation of premultiply variants here.
template void PremultiplyRow_Generic<false, false>(const uint8_t*, uint8_t*,
                                                   int32_t);
template void PremultiplyRow_Generic<false, true>(const uint8_t*, uint8_t*,
                                                  int32_t);
template void PremultiplyRow_Generic<true, false>(const uint8_t*, uint8_t*,
                                                  int32_t);
template void PremultiplyRow_Generic<true, true>(const uint8_t*, uint8_t*,
                                                 int32_t);

template <bool aSwapRB>
void UnpremultiplyRow_Generic(const uint8_t* aSrc, uint8_t* aDst,
                              int32_t aLength) {
  UnpremultiplyRow_SIMD<mozgeneric, aSwapRB>(aSrc, aDst, aLength);
}

// Force instantiation of unpremultiply variants here.
template void UnpremultiplyRow_Generic<false>(const uint8_t*, uint8_t*,
                                              int32_t);
template void UnpremultiplyRow_Generic<true>(const uint8_t*, uint8_t*, int32_t);

template <bool aSwapRB, bool aOpaqueAlpha>
void SwizzleRow_Generic(const uint8_t* aSrc, uint8_t* aDst, int32_t aLength) {
  SwizzleRow_SIMD<mozgeneric, aSwapRB, aOpaqueAlpha>(aSrc, aDst, aLength);
}

// Force instantiation of swizzle variants here.
template void SwizzleRow_Generic<true, false>(const uint8_t*, uint8_t*,
                                              int32_t);
template void SwizzleRow_Generic<true, true>(const uint8_t*, uint8_t*, int32_t);

template <bool aSwapRB>
void UnpackRowRGB24_Generic(const uint8_t* aSrc, uint8_t* aDst,
                            int32_t aLength) {
  UnpackRowRGB24_SIMD<mozgeneric, aSwapRB>(aSrc, aDst, aLength);
}

// Force instantiation of swizzle variants here.
template void UnpackRowRGB24_Generic<false>(const uint8_t*, uint8_t*, int32_t);
template void UnpackRowRGB24_Generic<true>(const uint8_t*, uint8_t*, int32_t);

template <bool aSwapRB, bool aInverted>
void SwizzleCmykRow_Generic(const uint8_t* aSrc, uint8_t* aDst,
                            int32_t aLength) {
  SwizzleCmykRow_SIMD<mozgeneric, aSwapRB, aInverted>(aSrc, aDst, aLength);
}

// Force instantiation of swizzle variants here.
template void SwizzleCmykRow_Generic<true, false>(const uint8_t*, uint8_t*,
                                                  int32_t);
template void SwizzleCmykRow_Generic<true, true>(const uint8_t*, uint8_t*,
                                                 int32_t);

#define PREMULTIPLY_ROW_GENERIC(aSrcFormat, aDstFormat)            \
  FORMAT_CASE_ROW(                                                 \
      aSrcFormat, aDstFormat,                                      \
      PremultiplyRow_Generic<ShouldSwapRB(aSrcFormat, aDstFormat), \
                             ShouldForceOpaque(aSrcFormat, aDstFormat)>)

#define UNPREMULTIPLY_ROW_GENERIC(aSrcFormat, aDstFormat) \
  FORMAT_CASE_ROW(                                        \
      aSrcFormat, aDstFormat,                             \
      UnpremultiplyRow_Generic<ShouldSwapRB(aSrcFormat, aDstFormat)>)

#define SWIZZLE_ROW_GENERIC(aSrcFormat, aDstFormat)            \
  FORMAT_CASE_ROW(                                             \
      aSrcFormat, aDstFormat,                                  \
      SwizzleRow_Generic<ShouldSwapRB(aSrcFormat, aDstFormat), \
                         ShouldForceOpaque(aSrcFormat, aDstFormat)>)

#define UNPACK_ROW_RGB_GENERIC(aDstFormat) \
  FORMAT_CASE_ROW(                         \
      SurfaceFormat::R8G8B8, aDstFormat,   \
      UnpackRowRGB24_Generic<ShouldSwapRB(SurfaceFormat::R8G8B8, aDstFormat)>)

#define SWIZZLE_CMYK_ROW_GENERIC(aSrcFormat, aDstFormat)                       \
  FORMAT_CASE_ROW(aSrcFormat, aDstFormat,                                      \
                  SwizzleCmykRow_Generic<ShouldSwapRB(aSrcFormat, aDstFormat), \
                                         ShouldInvert(aSrcFormat)>)

SwizzleRowFn PremultiplyRowGeneric(SurfaceFormat aSrcFormat,
                                   SurfaceFormat aDstFormat,
                                   SwizzleArch aArch) {
  if (aArch & SwizzleArch::eGeneric) {
    switch (FORMAT_KEY(aSrcFormat, aDstFormat)) {
      PREMULTIPLY_ROW_GENERIC(SurfaceFormat::B8G8R8A8, SurfaceFormat::B8G8R8A8)
      PREMULTIPLY_ROW_GENERIC(SurfaceFormat::B8G8R8A8, SurfaceFormat::B8G8R8X8)
      PREMULTIPLY_ROW_GENERIC(SurfaceFormat::B8G8R8A8, SurfaceFormat::R8G8B8A8)
      PREMULTIPLY_ROW_GENERIC(SurfaceFormat::B8G8R8A8, SurfaceFormat::R8G8B8X8)
      PREMULTIPLY_ROW_GENERIC(SurfaceFormat::R8G8B8A8, SurfaceFormat::R8G8B8A8)
      PREMULTIPLY_ROW_GENERIC(SurfaceFormat::R8G8B8A8, SurfaceFormat::R8G8B8X8)
      PREMULTIPLY_ROW_GENERIC(SurfaceFormat::R8G8B8A8, SurfaceFormat::B8G8R8A8)
      PREMULTIPLY_ROW_GENERIC(SurfaceFormat::R8G8B8A8, SurfaceFormat::B8G8R8X8)
      default:
        break;
    }
  }
  return PremultiplyRow(aSrcFormat, aDstFormat, aArch);
}

SwizzleRowFn UnpremultiplyRowGeneric(SurfaceFormat aSrcFormat,
                                     SurfaceFormat aDstFormat,
                                     SwizzleArch aArch) {
  if (aArch & SwizzleArch::eGeneric) {
    switch (FORMAT_KEY(aSrcFormat, aDstFormat)) {
      UNPREMULTIPLY_ROW_GENERIC(SurfaceFormat::B8G8R8A8,
                                SurfaceFormat::B8G8R8A8)
      UNPREMULTIPLY_ROW_GENERIC(SurfaceFormat::B8G8R8A8,
                                SurfaceFormat::R8G8B8A8)
      UNPREMULTIPLY_ROW_GENERIC(SurfaceFormat::R8G8B8A8,
                                SurfaceFormat::R8G8B8A8)
      UNPREMULTIPLY_ROW_GENERIC(SurfaceFormat::R8G8B8A8,
                                SurfaceFormat::B8G8R8A8)
      default:
        break;
    }
  }
  return UnpremultiplyRow(aSrcFormat, aDstFormat, aArch);
}

SwizzleRowFn SwizzleRowGeneric(SurfaceFormat aSrcFormat,
                               SurfaceFormat aDstFormat, SwizzleArch aArch) {
  if (aArch & SwizzleArch::eGeneric) {
    switch (FORMAT_KEY(aSrcFormat, aDstFormat)) {
      SWIZZLE_ROW_GENERIC(SurfaceFormat::B8G8R8A8, SurfaceFormat::R8G8B8A8)
      SWIZZLE_ROW_GENERIC(SurfaceFormat::B8G8R8X8, SurfaceFormat::R8G8B8X8)
      SWIZZLE_ROW_GENERIC(SurfaceFormat::B8G8R8A8, SurfaceFormat::R8G8B8X8)
      SWIZZLE_ROW_GENERIC(SurfaceFormat::B8G8R8X8, SurfaceFormat::R8G8B8A8)
      SWIZZLE_ROW_GENERIC(SurfaceFormat::R8G8B8A8, SurfaceFormat::B8G8R8A8)
      SWIZZLE_ROW_GENERIC(SurfaceFormat::R8G8B8X8, SurfaceFormat::B8G8R8X8)
      SWIZZLE_ROW_GENERIC(SurfaceFormat::R8G8B8A8, SurfaceFormat::B8G8R8X8)
      SWIZZLE_ROW_GENERIC(SurfaceFormat::R8G8B8X8, SurfaceFormat::B8G8R8A8)
      UNPACK_ROW_RGB_GENERIC(SurfaceFormat::R8G8B8X8)
      UNPACK_ROW_RGB_GENERIC(SurfaceFormat::R8G8B8A8)
      UNPACK_ROW_RGB_GENERIC(SurfaceFormat::B8G8R8X8)
      UNPACK_ROW_RGB_GENERIC(SurfaceFormat::B8G8R8A8)
      SWIZZLE_CMYK_ROW_GENERIC(SurfaceFormat::CMYK, SurfaceFormat::B8G8R8X8)
      SWIZZLE_CMYK_ROW_GENERIC(SurfaceFormat::CMYK, SurfaceFormat::B8G8R8A8)
      SWIZZLE_CMYK_ROW_GENERIC(SurfaceFormat::InvertedCMYK,
                               SurfaceFormat::B8G8R8X8)
      SWIZZLE_CMYK_ROW_GENERIC(SurfaceFormat::InvertedCMYK,
                               SurfaceFormat::B8G8R8A8)
      default:
        break;
    }
  }
  return SwizzleRow(aSrcFormat, aDstFormat, aArch);
}

}  // namespace mozilla::gfx
