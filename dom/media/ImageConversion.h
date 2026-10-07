/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ImageToI420Converter_h
#define ImageToI420Converter_h

#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/gfx/Point.h"
#include "mozilla/gfx/Types.h"
#include "nsError.h"

namespace mozilla {

namespace gfx {
class SourceSurface;
}  // namespace gfx

namespace layers {
class Image;
}  // namespace layers

// The conversion routines below scale with libyuv's box filter, which is
// defined for image dimensions below this value.
static constexpr int32_t kMaxConvertImageDimension = 32768;

// Whether an image of aSize can be passed to the conversion routines below.
inline bool IsImageDimensionSupportedForConversion(const gfx::IntSize& aSize) {
  return aSize.width < kMaxConvertImageDimension &&
         aSize.height < kMaxConvertImageDimension;
}

/**
 * Gets a SourceSurface from given image.
 */
already_AddRefed<gfx::SourceSurface> GetSourceSurface(layers::Image* aImage);

/**
 * Converts aImage to an I420 image and writes it to the given buffers.
 *
 * aDestStrideY must be at least aDestSize.width, and aDestStrideU and
 * aDestStrideV must be at least ceil(aDestSize.width / 2). Returns
 * NS_ERROR_INVALID_ARG if any stride is too small. A source already in I420
 * is copied, and scaled when aDestSize differs from its size.
 *
 * An RGB source is converted with the matrix for aDestYUVColorSpace and
 * aDestColorRange; a YUV source ignores both and is repacked as it is.
 * Returns NS_ERROR_NOT_IMPLEMENTED when libyuv has no such matrix for the
 * source: Identity is not an RGB-to-YUV matrix, and an RGB565 source only has
 * BT.601 limited range.
 */
nsresult ConvertToI420(
    layers::Image* aImage, uint8_t* aDestY, int aDestStrideY, uint8_t* aDestU,
    int aDestStrideU, uint8_t* aDestV, int aDestStrideV,
    const gfx::IntSize& aDestSize,
    gfx::YUVColorSpace aDestYUVColorSpace = gfx::YUVColorSpace::BT601,
    gfx::ColorRange aDestColorRange = gfx::ColorRange::LIMITED);

/**
 * Converts aImage to an NV12 image and writes it to the given buffers.
 *
 * Sources, matrix selection, scaling and stride checks are as for
 * ConvertToI420, except that RGB565 sources are refused, since libyuv converts
 * those to I420 only, and that aDestStrideUV must hold both chroma planes: at
 * least 2 * ceil(aDestSize.width / 2). A source already in NV12 is copied.
 */
nsresult ConvertToNV12(
    layers::Image* aImage, uint8_t* aDestY, int aDestStrideY, uint8_t* aDestUV,
    int aDestStrideUV, gfx::IntSize aDestSize,
    gfx::YUVColorSpace aDestYUVColorSpace = gfx::YUVColorSpace::BT601,
    gfx::ColorRange aDestColorRange = gfx::ColorRange::LIMITED);

/**
 * Converts aImage into an RGBA image in a specified format and writes it to the
 * given buffer.
 */
nsresult ConvertToRGBA(layers::Image* aImage,
                       const gfx::SurfaceFormat& aDestFormat,
                       uint8_t* aDestBuffer, int aDestStride);

/*
 * Convert the RGBA image data from SRGB color into DisplayP3 color.
 * aSrcBuffer and aDestBuffer can be the same.
 */
nsresult ConvertSRGBBufferToDisplayP3(uint8_t* aSrcBuffer,
                                      const gfx::SurfaceFormat& aSrcFormat,
                                      uint8_t* aDestBuffer, int aWidth,
                                      int aHeight);

}  // namespace mozilla

#endif /* ImageToI420Converter_h */
