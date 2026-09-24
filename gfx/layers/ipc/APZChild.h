/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_layers_APZChild_h
#define mozilla_layers_APZChild_h

#include "mozilla/ipc/ProtocolUtils.h"
#include "mozilla/layers/APZTaskRunnable.h"
#include "mozilla/layers/PAPZChild.h"

namespace mozilla {
namespace layers {

class GeckoContentController;

/**
 * APZChild implements PAPZChild and is used to remote a GeckoContentController
 * that lives in a different process than where APZ lives.
 */
class APZChild final : public PAPZChild {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(APZChild, final);

  using APZStateChange = GeckoContentController_APZStateChange;

  explicit APZChild(RefPtr<GeckoContentController> aController);

  mozilla::ipc::IPCResult RecvRequestContentRepaint(
      const RepaintRequest& aRequest);

  MOZ_CAN_RUN_SCRIPT_BOUNDARY mozilla::ipc::IPCResult
  RecvNotifyMozMouseScrollEvent(const ViewID& aScrollId,
                                const nsString& aEvent);

  mozilla::ipc::IPCResult RecvNotifyAPZStateChange(
      const ScrollableLayerGuid& aGuid, const APZStateChange& aChange,
      const int& aArg, Maybe<uint64_t> aInputBlockId);

  mozilla::ipc::IPCResult RecvNotifyFlushComplete();

  mozilla::ipc::IPCResult RecvNotifyAsyncScrollbarDragInitiated(
      const uint64_t& aDragBlockId, const ViewID& aScrollId,
      const ScrollDirection& aDirection);
  mozilla::ipc::IPCResult RecvNotifyAsyncScrollbarDragRejected(
      const ViewID& aScrollId);

  mozilla::ipc::IPCResult RecvNotifyAsyncAutoscrollRejected(
      const ViewID& aScrollId);

  mozilla::ipc::IPCResult RecvDestroy();

 private:
  virtual ~APZChild();

  void EnsureAPZTaskRunnable() {
    if (!mAPZTaskRunnable) {
      mAPZTaskRunnable = new APZTaskRunnable(mController);
    }
  }

  RefPtr<GeckoContentController> mController;
  // A runnable invoked in a nsRefreshDriver's tick to update multiple
  // RepaintRequests and notify a "apz-repaints-flushed" at the same time.
  RefPtr<APZTaskRunnable> mAPZTaskRunnable;
};

}  // namespace layers
}  // namespace mozilla

#endif  // mozilla_layers_APZChild_h
