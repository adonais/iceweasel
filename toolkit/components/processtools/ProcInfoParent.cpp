/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ProcInfoParent.h"

#include "mozilla/StaticPtr.h"
#include "mozilla/ipc/Endpoint.h"
#include "nsITimer.h"
#include "nsTHashMap.h"
#include "nsThreadUtils.h"

namespace mozilla {

static constexpr uint32_t kGetProcInfoTimeoutMs = 1000;

static StaticAutoPtr<nsTHashMap<GeckoChildID, RefPtr<ProcInfoParent>>> sActors;

/* static */
already_AddRefed<ProcInfoParent> ProcInfoParent::Create(
    ipc::Endpoint<PProcInfoParent>&& aEndpoint) {
  MOZ_ASSERT(NS_IsMainThread());
  const GeckoChildID childID = aEndpoint.OtherChildID();
  RefPtr<ProcInfoParent> actor = new ProcInfoParent(childID);
  if (!aEndpoint.Bind(actor)) {
    return nullptr;
  }
  if (!sActors) {
    sActors = new nsTHashMap<GeckoChildID, RefPtr<ProcInfoParent>>();
  }
  sActors->InsertOrUpdate(childID, actor);
  return actor.forget();
}

/* static */
ProcInfoParent* ProcInfoParent::Get(GeckoChildID aChildID) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!sActors) {
    return nullptr;
  }
  auto entry = sActors->Lookup(aChildID);
  return entry ? entry->get() : nullptr;
}

void ProcInfoParent::ActorDestroy(ActorDestroyReason aWhy) {
  MOZ_ASSERT(NS_IsMainThread());
  for (auto& request : mPendingRequests) {
    request.mTimer->Cancel();
    request.mPromise->Reject(NS_ERROR_NOT_AVAILABLE, __func__);
  }
  mPendingRequests.Clear();
  if (!sActors) {
    return;
  }
  sActors->Remove(mChildID);
  if (sActors->IsEmpty()) {
    sActors = nullptr;
  }
}

void ProcInfoParent::Shutdown() {
  MOZ_ASSERT(NS_IsMainThread());
  if (CanSend()) {
    Close();
  }
}

RefPtr<ProcInfoParent::RemoteProcInfoPromise> ProcInfoParent::GetProcInfo() {
  MOZ_ASSERT(NS_IsMainThread());
  if (!CanSend()) {
    return RemoteProcInfoPromise::CreateAndReject(NS_ERROR_NOT_AVAILABLE,
                                                  __func__);
  }

  // The child may be unable to respond, e.g. if it has been frozen by the OS,
  // so reject the request after a timeout rather than wait indefinitely.
  auto promise = MakeRefPtr<RemoteProcInfoPromise::Private>(__func__);
  auto timer = NS_NewTimerWithCallback(
      [self = RefPtr{this}, promise](nsITimer*) {
        self->mPendingRequests.RemoveElementsBy(
            [&](const PendingRequest& aRequest) {
              return aRequest.mPromise == promise;
            });
        promise->Reject(NS_ERROR_FAILURE, __func__);
      },
      kGetProcInfoTimeoutMs, nsITimer::TYPE_ONE_SHOT,
      "ProcInfoParent::GetProcInfo"_ns, GetMainThreadSerialEventTarget());
  if (timer.isErr()) {
    return RemoteProcInfoPromise::CreateAndReject(timer.unwrapErr(), __func__);
  }
  mPendingRequests.AppendElement(PendingRequest{promise, timer.unwrap()});

  // If we are already awaiting a reply from the child then do not send another
  // request. When the child replies we will resolve all pending requests.
  if (!mAwaitingReply) {
    mAwaitingReply = true;
    SendGetProcInfo()->Then(
        GetCurrentSerialEventTarget(), __func__,
        [self =
             RefPtr{this}](GetProcInfoPromise::ResolveOrRejectValue&& aResult) {
          self->mAwaitingReply = false;
          const bool succeeded =
              aResult.IsResolve() && aResult.ResolveValue().isSome();
          for (auto& request : self->mPendingRequests) {
            request.mTimer->Cancel();
            if (succeeded) {
              request.mPromise->Resolve(*aResult.ResolveValue(), __func__);
            } else {
              request.mPromise->Reject(NS_ERROR_FAILURE, __func__);
            }
          }
          self->mPendingRequests.Clear();
        });
  }
  return promise;
}

}  // namespace mozilla
