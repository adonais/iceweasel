/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_AppleVTColorSpace_h
#define mozilla_AppleVTColorSpace_h

#include <CoreFoundation/CFString.h>
#include <CoreVideo/CVImageBuffer.h>

#include "mozilla/gfx/Types.h"

namespace mozilla {

// Returns the name of the CGColorSpace to attach to a decoded buffer whose
// colour description is aTransferFunction and aColorPrimaries, or nullptr to
// keep the colorspace VideoToolbox itself gave the buffer.
//
// VideoToolbox does not reliably describe wide gamut and HDR buffers in a way
// that matches their own transfer function, so those get an explicit one. SDR
// BT.709 buffers must not: CoreAnimation colour matches through an attached
// colorspace in preference to the surface's individual colour keys, so
// attaching one there substitutes a different EOTF and shifts the gamma.
CFStringRef CGColorSpaceNameForFrame(gfx::TransferFunction aTransferFunction,
                                     gfx::ColorSpace2 aColorPrimaries);

// Attaches the CGColorSpace named by CGColorSpaceNameForFrame to aImage, if
// that colour description calls for one. Returns whether an attachment was
// made. Note that this sets a CVBuffer attachment, which is distinct from the
// IOSurfaceColorSpace value VideoToolbox stamps on the backing IOSurface.
bool MaybeAttachCGColorSpace(CVImageBufferRef aImage,
                             gfx::TransferFunction aTransferFunction,
                             gfx::ColorSpace2 aColorPrimaries);

}  // namespace mozilla

#endif  // mozilla_AppleVTColorSpace_h
