/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_IMAGEPIXELFORMAT_H_
#define DOM_MEDIA_IMAGEPIXELFORMAT_H_

#include "mozilla/DefineEnum.h"
#include "mozilla/Maybe.h"

namespace mozilla {

namespace layers {
class Image;
}  // namespace layers

// The sample layout of a layers::Image:
// - I4xx[A][Pn]: packed planar YCbCr, plus alpha for A, at 4:2:0, 4:2:2 or
//   4:4:4. Pn means n-bit samples in 16-bit words; without it, 8-bit bytes.
// - NV12, NV21: 8-bit 4:2:0 with one interleaved chroma plane, Cb first for
//   NV12 and Cr first for NV21.
// - RGBA, RGBX, BGRA, BGRX: 8-bit channels in memory order; X is not alpha.
// WebCodecs converts the first group by value.
// clang-format off
MOZ_DEFINE_ENUM_CLASS_WITH_BASE_AND_TOSTRING(ImagePixelFormat, uint8_t, (
  // dom::VideoPixelFormat members.
  I420,
  I420P10,
  I420P12,
  I420A,
  I420AP10,
  I420AP12,
  I422,
  I422P10,
  I422P12,
  I422A,
  I422AP10,
  I422AP12,
  I444,
  I444P10,
  I444P12,
  I444A,
  I444AP10,
  I444AP12,
  NV12,
  RGBA,
  RGBX,
  BGRA,
  BGRX,
  // Other image formats.
  NV21
));
// clang-format on

// The layout of the samples aImage yields, from metadata alone; a remote image
// is named by its readback. Nothing() when the layout has no name.
Maybe<ImagePixelFormat> ImageToPixelFormat(layers::Image* aImage);

bool IsRGB(ImagePixelFormat aFormat);

}  // namespace mozilla

#endif  // DOM_MEDIA_IMAGEPIXELFORMAT_H_
