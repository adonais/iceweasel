/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "HeadlessCompositorWidgetParent.h"

#include "mozilla/widget/PlatformWidgetTypes.h"
#include "nsXULAppAPI.h"

namespace mozilla::widget {

HeadlessCompositorWidgetParent::HeadlessCompositorWidgetParent(
    const HeadlessCompositorWidgetInitData& aInitData,
    const layers::CompositorOptions& aOptions)
    : HeadlessCompositorWidget(aInitData, aOptions, nullptr) {
  MOZ_ASSERT(XRE_IsGPUProcess());
}

HeadlessCompositorWidgetParent::~HeadlessCompositorWidgetParent() = default;

void HeadlessCompositorWidgetParent::ObserveVsync(VsyncObserver* aObserver) {
  if (aObserver) {
    (void)SendObserveVsync();
  } else {
    (void)SendUnobserveVsync();
  }
  mVsyncObserver = aObserver;
}

RefPtr<VsyncObserver> HeadlessCompositorWidgetParent::GetVsyncObserver() const {
  MOZ_ASSERT(XRE_IsGPUProcess());
  return mVsyncObserver;
}

mozilla::ipc::IPCResult
HeadlessCompositorWidgetParent::RecvNotifyClientSizeChanged(
    const LayoutDeviceIntSize& aClientSize) {
  NotifyClientSizeChanged(aClientSize);
  return IPC_OK();
}

#ifdef XP_WIN
mozilla::ipc::IPCResult HeadlessCompositorWidgetParent::RecvInitialize(
    const RemoteBackbufferHandles&) {
  return IPC_OK();
}

mozilla::ipc::IPCResult HeadlessCompositorWidgetParent::RecvEnterPresentLock() {
  return IPC_OK();
}

mozilla::ipc::IPCResult HeadlessCompositorWidgetParent::RecvLeavePresentLock() {
  return IPC_OK();
}

mozilla::ipc::IPCResult
HeadlessCompositorWidgetParent::RecvNotifyVisibilityUpdated(const bool&) {
  return IPC_OK();
}

mozilla::ipc::IPCResult HeadlessCompositorWidgetParent::RecvUpdateTransparency(
    const TransparencyMode&) {
  return IPC_OK();
}
#endif

}  // namespace mozilla::widget
