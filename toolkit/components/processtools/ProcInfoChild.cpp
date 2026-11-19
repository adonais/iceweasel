/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ProcInfoChild.h"
#include "mozilla/ProcInfo.h"
#include "mozilla/ipc/Endpoint.h"
#include "base/process_util.h"

namespace mozilla {

/* static */
void ProcInfoChild::Create(ipc::Endpoint<PProcInfoChild>&& aEndpoint) {
  MOZ_ASSERT(NS_IsMainThread());

  nsCOMPtr<nsISerialEventTarget> taskQueue;
  if (NS_FAILED(NS_CreateBackgroundTaskQueue("ProcInfoChild",
                                             getter_AddRefs(taskQueue)))) {
    NS_WARNING("Failed to create BackgroundTaskQueue for ProcInfoChild");
    return;
  }

  taskQueue->Dispatch(NS_NewRunnableFunction(
      "ProcInfoChild::Bind", [endpoint = std::move(aEndpoint)]() mutable {
        RefPtr<ProcInfoChild> actor = new ProcInfoChild();
        if (!endpoint.Bind(actor)) {
          NS_WARNING("Failed to bind ProcInfoChild");
        }
      }));
}

mozilla::ipc::IPCResult ProcInfoChild::RecvGetProcInfo(
    GetProcInfoResolver&& aResolver) {
  const base::ProcessId pid = base::GetCurrentProcId();
  nsTArray<ProcInfoRequest> requests;
  requests.EmplaceBack(
      /* aPid = */ pid,
      /* aProcessType = */ ProcType::Unknown,
      /* aOrigin = */ ""_ns,
      /* aWindowInfo = */ nsTArray<WindowInfo>(),
      /* aUtilityInfo = */ nsTArray<UtilityInfo>());

  ProcInfoPromise::ResolveOrRejectValue result =
      GetProcInfoSync(std::move(requests));

  Maybe<RemoteProcInfo> remoteInfo;
  if (result.IsResolve()) {
    if (auto entry = result.ResolveValue().lookup(pid)) {
      ProcInfo& info = entry->value();
      remoteInfo.emplace(info.memory, info.cpuTime, info.cpuCycleCount,
                         std::move(info.threads));
    }
  }
  aResolver(remoteInfo);
  return IPC_OK();
}

}  // namespace mozilla
