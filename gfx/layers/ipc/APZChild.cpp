/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/layers/APZChild.h"

#include "InputData.h"  // for InputData
#include "mozilla/dom/BrowserChild.h"
#include "mozilla/ipc/ProtocolUtils.h"
#include "mozilla/layers/APZCCallbackHelper.h"
#include "mozilla/layers/GeckoContentController.h"

namespace mozilla {
namespace layers {

APZChild::APZChild(RefPtr<GeckoContentController> aController)
    : mController(aController) {
  MOZ_ASSERT(mController);
}

APZChild::~APZChild() {
  if (mAPZTaskRunnable) {
    mAPZTaskRunnable->Revoke();
    mAPZTaskRunnable = nullptr;
  }
  if (mController) {
    mController->Destroy();
    mController = nullptr;
  }
}

mozilla::ipc::IPCResult APZChild::RecvRequestContentRepaint(
    const RepaintRequest& aRequest) {
  MOZ_ASSERT(mController->IsRepaintThread());

  EnsureAPZTaskRunnable();

  mAPZTaskRunnable->QueueRequest(aRequest);
  return IPC_OK();
}

mozilla::ipc::IPCResult APZChild::RecvNotifyMozMouseScrollEvent(
    const ViewID& aScrollId, const nsString& aEvent) {
  const RefPtr<GeckoContentController> controller = mController;
  controller->NotifyMozMouseScrollEvent(aScrollId, aEvent);
  return IPC_OK();
}

mozilla::ipc::IPCResult APZChild::RecvNotifyAPZStateChange(
    const ScrollableLayerGuid& aGuid, const APZStateChange& aChange,
    const int& aArg, Maybe<uint64_t> aInputBlockId) {
  MOZ_ASSERT(mController->IsRepaintThread());
  EnsureAPZTaskRunnable();

  mAPZTaskRunnable->QueueAPZStateChange(aGuid, aChange, aArg, aInputBlockId);

  return IPC_OK();
}

mozilla::ipc::IPCResult APZChild::RecvNotifyFlushComplete() {
  MOZ_ASSERT(mController->IsRepaintThread());
  EnsureAPZTaskRunnable();

  mAPZTaskRunnable->QueueFlushCompleteNotification();

  return IPC_OK();
}

mozilla::ipc::IPCResult APZChild::RecvNotifyAsyncScrollbarDragInitiated(
    const uint64_t& aDragBlockId, const ViewID& aScrollId,
    const ScrollDirection& aDirection) {
  mController->NotifyAsyncScrollbarDragInitiated(aDragBlockId, aScrollId,
                                                 aDirection);
  return IPC_OK();
}

mozilla::ipc::IPCResult APZChild::RecvNotifyAsyncScrollbarDragRejected(
    const ViewID& aScrollId) {
  mController->NotifyAsyncScrollbarDragRejected(aScrollId);
  return IPC_OK();
}

mozilla::ipc::IPCResult APZChild::RecvNotifyAsyncAutoscrollRejected(
    const ViewID& aScrollId) {
  mController->NotifyAsyncAutoscrollRejected(aScrollId);
  return IPC_OK();
}

mozilla::ipc::IPCResult APZChild::RecvDestroy() {
  // mController->Destroy will be called in the destructor
  PAPZChild::Send__delete__(this);
  return IPC_OK();
}

}  // namespace layers
}  // namespace mozilla
