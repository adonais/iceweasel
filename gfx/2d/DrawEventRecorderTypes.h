/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_DRAWEVENTRECORDERTYPES_H_
#define MOZILLA_GFX_DRAWEVENTRECORDERTYPES_H_

#include <vector>

#include "mozilla/RefPtr.h"

namespace mozilla {
namespace gfx {

class SourceSurface;

// Pull these out of DrawEventRecorderPrivate to make them forward-decl-able.

struct DrawEventRecorderPrivate_ExternalSurfaceEntry {
  RefPtr<SourceSurface> mSurface;
  int64_t mEventCount = -1;
};

// Most holders never get any entries, so use a container that doesn't
// allocate when empty.
using DrawEventRecorderPrivate_ExternalSurfacesHolder =
    std::vector<DrawEventRecorderPrivate_ExternalSurfaceEntry>;

}  // namespace gfx
}  // namespace mozilla

#endif /* MOZILLA_GFX_DRAWEVENTRECORDERTYPES_H_ */
