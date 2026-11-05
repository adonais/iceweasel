/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PrintTargetRecording.h"

#include "cairo.h"
#include "mozilla/gfx/2D.h"

namespace mozilla::gfx {

PrintTargetRecording::PrintTargetRecording(const IntSize& aSize)
    : PrintTarget(nullptr, aSize) {}

/* static */
already_AddRefed<PrintTargetRecording> PrintTargetRecording::CreateOrNull(
    const IntSize& aSize) {
  if (!Factory::CheckSurfaceSize(aSize)) {
    return nullptr;
  }
  return do_AddRef(new PrintTargetRecording(aSize));
}

already_AddRefed<DrawTarget> PrintTargetRecording::MakeDrawTarget(
    const IntSize& aSize, DrawEventRecorder* aRecorder) {
  MOZ_ASSERT(aRecorder, "A DrawEventRecorder is required");

  if (!aRecorder) {
    return nullptr;
  }

  RefPtr refDt = GetReferenceDrawTarget();
  const IntRect rect(IntPoint(), aSize);
  return gfx::Factory::CreateRecordingDrawTarget(aRecorder, refDt, rect);
}

already_AddRefed<DrawTarget> PrintTargetRecording::GetReferenceDrawTarget() {
  if (!mRefDT) {
    mRefDT = gfx::Factory::CreateDrawTarget(BackendType::SKIA, IntSize(1, 1),
                                            SurfaceFormat::B8G8R8A8);
  }
  return do_AddRef(mRefDT);
}

}  // namespace mozilla::gfx
