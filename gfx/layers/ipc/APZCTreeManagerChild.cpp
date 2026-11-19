/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/APZCTreeManagerChild.h"

#include "InputData.h"                          // for InputData
#include "mozilla/dom/BrowserParent.h"          // for BrowserParent
#include "mozilla/layers/APZBridgeChild.h"      // for APZBridgeChild
#include "mozilla/layers/APZCCallbackHelper.h"  // for APZCCallbackHelper
#include "mozilla/layers/DoubleTapToZoom.h"     // for DoubleTapToZoomMetrics
#include "mozilla/layers/GeckoContentController.h"  // for GeckoContentController
#include "mozilla/layers/RemoteCompositorSession.h"  // for RemoteCompositorSession
#ifdef MOZ_WIDGET_ANDROID
#  include "mozilla/jni/Utils.h"  // for DispatchToGeckoPriorityQueue
#endif

namespace mozilla {
namespace layers {

APZCTreeManagerChild::APZCTreeManagerChild() : mCompositorSession(nullptr) {}

APZCTreeManagerChild::~APZCTreeManagerChild() = default;

void APZCTreeManagerChild::SetCompositorSession(
    RemoteCompositorSession* aSession) {
  // Exactly one of mCompositorSession and aSession must be null (i.e. either
  // we're setting mCompositorSession or we're clearing it).
  MOZ_RELEASE_ASSERT(!mCompositorSession ^ !aSession);
  mCompositorSession = aSession;
  if (mBridge) {
    mBridge->SetCompositorSession(aSession);
  }
}

void APZCTreeManagerChild::SetBridge(RefPtr<APZBridgeChild>&& aBridge) {
  // The APZ bridge only exists from the UI process to the GPU process.
  MOZ_RELEASE_ASSERT(XRE_IsParentProcess());
  MOZ_RELEASE_ASSERT(!mBridge);

  mBridge = std::move(aBridge);
}

void APZCTreeManagerChild::Destroy() {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  if (mBridge) {
    mBridge->Destroy();
    mBridge = nullptr;
  }
}

void APZCTreeManagerChild::ZoomToRect(const ScrollableLayerGuid& aGuid,
                                      const ZoomTarget& aZoomTarget,
                                      const uint32_t aFlags) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  SendZoomToRect(aGuid, aZoomTarget, aFlags);
}

void APZCTreeManagerChild::ContentReceivedInputBlock(uint64_t aInputBlockId,
                                                     bool aPreventDefault) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  SendContentReceivedInputBlock(aInputBlockId, aPreventDefault);
}

void APZCTreeManagerChild::SetTargetAPZC(
    uint64_t aInputBlockId, const nsTArray<ScrollableLayerGuid>& aTargets) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  SendSetTargetAPZC(aInputBlockId, aTargets);
}

void APZCTreeManagerChild::UpdateZoomConstraints(
    const ScrollableLayerGuid& aGuid,
    const Maybe<ZoomConstraints>& aConstraints) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  if (CanSend()) {
    SendUpdateZoomConstraints(aGuid, aConstraints);
  }
}

void APZCTreeManagerChild::SetAllowedTouchBehavior(
    uint64_t aInputBlockId, const nsTArray<TouchBehaviorFlags>& aValues) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  SendSetAllowedTouchBehavior(aInputBlockId, aValues);
}

void APZCTreeManagerChild::StartScrollbarDrag(
    const ScrollableLayerGuid& aGuid, const AsyncDragMetrics& aDragMetrics) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  SendStartScrollbarDrag(aGuid, aDragMetrics);
}

void APZCTreeManagerChild::NotifyApzAwareListenerAdded(
    const ScrollableLayerGuid& aGuid) {
  MOZ_RELEASE_ASSERT(NS_IsMainThread());
  if (CanSend()) {
    SendNotifyApzAwareListenerAdded(aGuid);
  }
}

RefPtr<APZBridge> APZCTreeManagerChild::Bridge() {
  MOZ_RELEASE_ASSERT(XRE_IsParentProcess());
  MOZ_RELEASE_ASSERT(mBridge);

  return mBridge;
}

}  // namespace layers
}  // namespace mozilla
