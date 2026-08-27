/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_SWIZZLE_HELPERS_H_
#define MOZILLA_GFX_SWIZZLE_HELPERS_H_

#include <bit>

#include "mozilla/gfx/Types.h"

namespace mozilla::gfx {

/**
 * Convenience macros for dispatching to various format combinations.
 */

// Hash the formats to a relatively dense value to optimize jump table
// generation. The first 6 formats in SurfaceFormat are the 32-bit BGRA variants
// and are the most common formats dispatched here. Room is reserved in the
// lowish bits for up to these 6 destination formats. If a destination format is
// >= 6, the 6th bit is set to avoid collisions.
#define FORMAT_KEY(aSrcFormat, aDstFormat) \
  (int(aSrcFormat) * 6 + int(aDstFormat) + (int(int(aDstFormat) >= 6) << 6))

#define FORMAT_CASE_EXPR(aSrcFormat, aDstFormat, ...) \
  case FORMAT_KEY(aSrcFormat, aDstFormat):            \
    __VA_ARGS__;                                      \
    return true;

#define FORMAT_CASE(aSrcFormat, aDstFormat, ...) \
  FORMAT_CASE_EXPR(aSrcFormat, aDstFormat, FORMAT_CASE_CALL(__VA_ARGS__))

#define FORMAT_CASE_ROW(aSrcFormat, aDstFormat, ...) \
  case FORMAT_KEY(aSrcFormat, aDstFormat):           \
    return &__VA_ARGS__;

/**
 * Constexpr functions for analyzing format attributes in templates.
 */

// Whether the CMYK needs to be inverted first.
static constexpr bool ShouldInvert(SurfaceFormat aFormat) {
  return aFormat == SurfaceFormat::InvertedCMYK;
}

// Whether B comes before R in pixel memory layout.
static constexpr MOZ_ALWAYS_INLINE bool IsBGRFormat(SurfaceFormat aFormat) {
  return aFormat == SurfaceFormat::B8G8R8A8 ||
         (std::endian::native == std::endian::little &&
          aFormat == SurfaceFormat::R5G6B5_UINT16) ||
         aFormat == SurfaceFormat::B8G8R8X8 || aFormat == SurfaceFormat::B8G8R8;
}

// Whether the order of B and R need to be swapped to map from src to dst.
static constexpr MOZ_ALWAYS_INLINE bool ShouldSwapRB(SurfaceFormat aSrcFormat,
                                                     SurfaceFormat aDstFormat) {
  return IsBGRFormat(aSrcFormat) != IsBGRFormat(aDstFormat);
}

// The starting byte of the RGB components in pixel memory.
static constexpr MOZ_ALWAYS_INLINE uint32_t
RGBByteIndex(SurfaceFormat aFormat) {
  return aFormat == SurfaceFormat::A8R8G8B8 ||
                 aFormat == SurfaceFormat::X8R8G8B8
             ? 1
             : 0;
}

// The byte of the alpha component, which just comes after RGB.
static constexpr MOZ_ALWAYS_INLINE uint32_t
AlphaByteIndex(SurfaceFormat aFormat) {
  return (RGBByteIndex(aFormat) + 3) % 4;
}

// The endian-dependent bit shift to access RGB of a UINT32 pixel.
static constexpr MOZ_ALWAYS_INLINE uint32_t RGBBitShift(SurfaceFormat aFormat) {
  if constexpr (std::endian::native == std::endian::little) {
    return 8 * RGBByteIndex(aFormat);
  } else {
    return 8 - 8 * RGBByteIndex(aFormat);
  }
}

// The endian-dependent bit shift to access alpha of a UINT32 pixel.
static constexpr MOZ_ALWAYS_INLINE uint32_t
AlphaBitShift(SurfaceFormat aFormat) {
  return (RGBBitShift(aFormat) + 24) % 32;
}

// Whether the pixel format should ignore the value of the alpha channel and
// treat it as opaque.
static constexpr MOZ_ALWAYS_INLINE bool IgnoreAlpha(SurfaceFormat aFormat) {
  return aFormat == SurfaceFormat::B8G8R8X8 ||
         aFormat == SurfaceFormat::R8G8B8X8 ||
         aFormat == SurfaceFormat::X8R8G8B8;
}

// Whether to force alpha to opaque to map from src to dst.
static constexpr MOZ_ALWAYS_INLINE bool ShouldForceOpaque(
    SurfaceFormat aSrcFormat, SurfaceFormat aDstFormat) {
  return IgnoreAlpha(aSrcFormat) != IgnoreAlpha(aDstFormat);
}

}  // namespace mozilla::gfx

#endif /* MOZILLA_GFX_SWIZZLE_HELPERS_H_ */
