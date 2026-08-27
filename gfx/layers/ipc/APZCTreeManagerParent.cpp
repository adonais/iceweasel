/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/APZCTreeManagerParent.h"

#include "apz/src/APZCTreeManager.h"
#include "mozilla/layers/APZThreadUtils.h"
#include "mozilla/layers/APZUpdater.h"
#include "mozilla/layers/CompositorBridgeParent.h"
#include "mozilla/layers/CompositorThread.h"
#include "nsThreadUtils.h"

namespace mozilla {
namespace layers {

APZCTreeManagerParent::APZCTreeManagerParent(
    LayersId aLayersId, RefPtr<APZCTreeManager> aAPZCTreeManager,
    RefPtr<APZUpdater> aAPZUpdater)
    : mLayersId(aLayersId),
      mTreeManager(std::move(aAPZCTreeManager)),
      mUpdater(std::move(aAPZUpdater)) {
  MOZ_ASSERT(mTreeManager != nullptr);
  MOZ_ASSERT(mUpdater != nullptr);
  MOZ_ASSERT(mUpdater->HasTreeManager(mTreeManager));
}

APZCTreeManagerParent::~APZCTreeManagerParent() = default;

void APZCTreeManagerParent::ChildAdopted(
    RefPtr<APZCTreeManager> aAPZCTreeManager, RefPtr<APZUpdater> aAPZUpdater) {
  MOZ_ASSERT(aAPZCTreeManager != nullptr);
  MOZ_ASSERT(aAPZUpdater != nullptr);
  MOZ_ASSERT(aAPZUpdater->HasTreeManager(aAPZCTreeManager));
  mTreeManager = std::move(aAPZCTreeManager);
  mUpdater = std::move(aAPZUpdater);
}

void APZCTreeManagerParent::ActorDestroy(ActorDestroyReason aWhy) {
  CompositorBridgeParent::DisconnectApzcTreeManager(this);
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvSetKeyboardMap(
    const KeyboardMap& aKeyboardMap) {
  // See RecvStartAutoscroll() for why this check is necessary.
  if (!IsForRootLayer()) {
    return IPC_FAIL(
        this,
        "SetKeyboardMap from non-root APZCTreeManagerParent is not expected.");
  }

  mUpdater->RunOnUpdaterThread(
      mLayersId, NewRunnableMethod<KeyboardMap>(
                     "layers::IAPZCTreeManager::SetKeyboardMap", mTreeManager,
                     &IAPZCTreeManager::SetKeyboardMap, aKeyboardMap));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvZoomToRect(
    const ScrollableLayerGuid& aGuid, const ZoomTarget& aZoomTarget,
    const uint32_t& aFlags) {
  if (!IsGuidValid(aGuid)) {
    return IPC_FAIL_NO_REASON(this);
  }

  mUpdater->RunOnUpdaterThread(
      aGuid.mLayersId,
      NewRunnableMethod<ScrollableLayerGuid, ZoomTarget, uint32_t>(
          "layers::IAPZCTreeManager::ZoomToRect", mTreeManager,
          &IAPZCTreeManager::ZoomToRect, aGuid, aZoomTarget, aFlags));
  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvContentReceivedInputBlock(
    const uint64_t& aInputBlockId, const bool& aPreventDefault) {
  mUpdater->RunOnUpdaterThread(
      mLayersId, NewRunnableMethod<uint64_t, bool>(
                     "layers::IAPZCTreeManager::ContentReceivedInputBlock",
                     mTreeManager, &IAPZCTreeManager::ContentReceivedInputBlock,
                     aInputBlockId, aPreventDefault));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvSetTargetAPZC(
    const uint64_t& aInputBlockId, nsTArray<ScrollableLayerGuid>&& aTargets) {
  mUpdater->RunOnUpdaterThread(
      mLayersId,
      NewRunnableMethod<uint64_t,
                        StoreCopyPassByRRef<nsTArray<ScrollableLayerGuid>>>(
          "layers::IAPZCTreeManager::SetTargetAPZC", mTreeManager,
          &IAPZCTreeManager::SetTargetAPZC, aInputBlockId,
          std::move(aTargets)));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvUpdateZoomConstraints(
    const ScrollableLayerGuid& aGuid,
    const Maybe<ZoomConstraints>& aConstraints) {
  if (!IsGuidValid(aGuid)) {
    return IPC_FAIL_NO_REASON(this);
  }

  mTreeManager->UpdateZoomConstraints(aGuid, aConstraints);
  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvSetDPI(
    const float& aDpiValue) {
  // See RecvStartAutoscroll() for why this check is necessary.
  if (!IsForRootLayer()) {
    return IPC_FAIL(
        this, "SetDPI from non-root APZCTreeManagerParent is not expected.");
  }

  mUpdater->RunOnUpdaterThread(
      mLayersId,
      NewRunnableMethod<float>("layers::IAPZCTreeManager::SetDPI", mTreeManager,
                               &IAPZCTreeManager::SetDPI, aDpiValue));
  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvSetAllowedTouchBehavior(
    const uint64_t& aInputBlockId, nsTArray<TouchBehaviorFlags>&& aValues) {
  mUpdater->RunOnUpdaterThread(
      mLayersId,
      NewRunnableMethod<uint64_t,
                        StoreCopyPassByRRef<nsTArray<TouchBehaviorFlags>>>(
          "layers::IAPZCTreeManager::SetAllowedTouchBehavior", mTreeManager,
          &IAPZCTreeManager::SetAllowedTouchBehavior, aInputBlockId,
          std::move(aValues)));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvSetBrowserGestureResponse(
    const uint64_t& aInputBlockId, const BrowserGestureResponse& aResponse) {
  // See RecvStartAutoscroll() for why this check is necessary.
  if (!IsForRootLayer()) {
    return IPC_FAIL(this,
                    "SetBrowserGestureResponse from non-root "
                    "APZCTreeManagerParent is not expected.");
  }

  mUpdater->RunOnUpdaterThread(
      mLayersId, NewRunnableMethod<uint64_t, BrowserGestureResponse>(
                     "layers::IAPZCTreeManager::SetBrowserGestureResponse",
                     mTreeManager, &IAPZCTreeManager::SetBrowserGestureResponse,
                     aInputBlockId, aResponse));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvStartScrollbarDrag(
    const ScrollableLayerGuid& aGuid, const AsyncDragMetrics& aDragMetrics) {
  if (!IsGuidValid(aGuid)) {
    return IPC_FAIL_NO_REASON(this);
  }

  mUpdater->RunOnUpdaterThread(
      aGuid.mLayersId,
      NewRunnableMethod<ScrollableLayerGuid, AsyncDragMetrics>(
          "layers::IAPZCTreeManager::StartScrollbarDrag", mTreeManager,
          &IAPZCTreeManager::StartScrollbarDrag, aGuid, aDragMetrics));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvStartAutoscroll(
    const ScrollableLayerGuid& aGuid, const ScreenPoint& aAnchorLocation) {
  // Autoscroll is legitimately started only through the APZCTreeManagerParent
  // that corresponds to the root of the layer tree. We check if this
  // instance corresponds to the root of the layer tree.
  if (!IsForRootLayer()) {
    return IPC_FAIL(
        this,
        "StartAutoscroll from non-root APZCTreeManagerParent is not expected.");
  }

  mUpdater->RunOnControllerThread(
      mLayersId,
      NewRunnableMethod<ScrollableLayerGuid, ScreenPoint>(
          "layers::IAPZCTreeManager::StartAutoscroll", mTreeManager,
          &IAPZCTreeManager::StartAutoscroll, aGuid, aAnchorLocation));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvStopAutoscroll(
    const ScrollableLayerGuid& aGuid) {
  // See RecvStartAutoscroll().
  if (!IsForRootLayer()) {
    return IPC_FAIL(
        this,
        "StopAutoscroll from non-root APZCTreeManagerParent is not expected.");
  }

  mUpdater->RunOnControllerThread(
      mLayersId, NewRunnableMethod<ScrollableLayerGuid>(
                     "layers::IAPZCTreeManager::StopAutoscroll", mTreeManager,
                     &IAPZCTreeManager::StopAutoscroll, aGuid));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvSetLongTapEnabled(
    const bool& aLongTapEnabled) {
  // See RecvStartAutoscroll() for why this check is necessary.
  if (!IsForRootLayer()) {
    return IPC_FAIL(this,
                    "SetLongTapEnabled from non-root APZCTreeManagerParent is "
                    "not expected.");
  }

  mUpdater->RunOnUpdaterThread(
      mLayersId,
      NewRunnableMethod<bool>(
          "layers::IAPZCTreeManager::SetLongTapEnabled", mTreeManager,
          &IAPZCTreeManager::SetLongTapEnabled, aLongTapEnabled));

  return IPC_OK();
}

mozilla::ipc::IPCResult APZCTreeManagerParent::RecvNotifyApzAwareListenerAdded(
    const ScrollableLayerGuid& aGuid) {
  if (!IsGuidValid(aGuid)) {
    return IPC_FAIL_NO_REASON(this);
  }
  mTreeManager->NotifyApzAwareListenerAdded(aGuid);
  return IPC_OK();
}

bool APZCTreeManagerParent::IsGuidValid(const ScrollableLayerGuid& aGuid) {
  if (aGuid.mLayersId != mLayersId) {
    NS_ERROR("Unexpected layers id");
    return false;
  }
  return true;
}

bool APZCTreeManagerParent::IsForRootLayer() const {
  return mLayersId == mTreeManager->GetRootLayersId();
}

}  // namespace layers
}  // namespace mozilla
