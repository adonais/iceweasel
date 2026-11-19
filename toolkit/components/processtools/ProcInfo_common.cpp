/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/ProcInfo.h"

#include <memory>

#include "nsNetCID.h"
#include "nsServiceManagerUtils.h"
#include "nsThreadUtils.h"

#ifdef MOZ_WIDGET_ANDROID
#  include "mozilla/ProcInfoParent.h"
#endif

namespace mozilla {

#ifdef MOZ_WIDGET_ANDROID
using SingleProcInfoPromise = MozPromise<ProcInfo, nsresult, true>;

// Requests aRequest's info from the process itself, via aProcInfoParent.
static RefPtr<SingleProcInfoPromise> GetRemoteProcInfo(
    ProcInfoParent* aProcInfoParent, ProcInfoRequest&& aRequest) {
  ProcInfo info;
  info.pid = aRequest.pid;
  info.childId = aRequest.childId;
  info.type = aRequest.processType;
  info.origin = aRequest.origin;
  info.windows = std::move(aRequest.windowInfo);
  info.utilityActors = std::move(aRequest.utilityInfo);
  return aProcInfoParent->GetProcInfo()->Then(
      GetCurrentSerialEventTarget(), __func__,
      [info = std::move(info)](RemoteProcInfo&& aRemoteInfo) mutable {
        info.memory = aRemoteInfo.memory();
        info.cpuTime = aRemoteInfo.cpuTime();
        info.cpuCycleCount = aRemoteInfo.cpuCycleCount();
        info.threads = std::move(aRemoteInfo.threads());
        return SingleProcInfoPromise::CreateAndResolve(std::move(info),
                                                       __func__);
      },
      [](nsresult aRv) {
        return SingleProcInfoPromise::CreateAndReject(aRv, __func__);
      });
}
#endif

RefPtr<ProcInfoPromise> GetProcInfo(nsTArray<ProcInfoRequest>&& aRequests) {
  MOZ_ASSERT(NS_IsMainThread());

#ifdef MOZ_WIDGET_ANDROID
  // Processes connected to a ProcInfoParent may be isolated, meaning we cannot
  // read their info ourself. Instead request it from the process itself.
  nsTArray<RefPtr<SingleProcInfoPromise>> remotePromises;
  aRequests.RemoveElementsBy([&](ProcInfoRequest& aRequest) {
    ProcInfoParent* procInfoParent = ProcInfoParent::Get(aRequest.childId);
    if (!procInfoParent) {
      return false;
    }
    remotePromises.AppendElement(
        GetRemoteProcInfo(procInfoParent, std::move(aRequest)));
    return true;
  });
  RefPtr<SingleProcInfoPromise::AllSettledPromiseType> remotePromise;
  if (!remotePromises.IsEmpty()) {
    remotePromise = SingleProcInfoPromise::AllSettled(
        GetCurrentSerialEventTarget(), remotePromises);
  }
#endif

  auto holder = std::make_unique<MozPromiseHolder<ProcInfoPromise>>();
  RefPtr<ProcInfoPromise> promise = holder->Ensure(__func__);

  nsresult rv = NS_OK;
  nsCOMPtr<nsIEventTarget> target =
      do_GetService(NS_STREAMTRANSPORTSERVICE_CONTRACTID, &rv);
  if (NS_FAILED(rv)) {
    NS_WARNING("Failed to get stream transport service");
    holder->Reject(rv, __func__);
    return promise;
  }

  RefPtr<nsIRunnable> r = NS_NewRunnableFunction(
      __func__,
      [holder = std::move(holder),
       requests = std::move(aRequests)]() mutable -> void {
        holder->ResolveOrReject(GetProcInfoSync(std::move(requests)), __func__);
      });

  rv = target->Dispatch(r.forget(), NS_DISPATCH_NORMAL);
  if (NS_FAILED(rv)) {
    NS_WARNING("Failed to dispatch the LoadDataRunnable.");
  }

#ifdef MOZ_WIDGET_ANDROID
  if (remotePromise) {
    return promise->Then(
        GetCurrentSerialEventTarget(), __func__,
        [remotePromise](HashMap<base::ProcessId, ProcInfo>&& aLocalInfo)
            -> RefPtr<ProcInfoPromise> {
          return remotePromise->Then(
              GetCurrentSerialEventTarget(), __func__,
              [procInfo = std::move(aLocalInfo)](
                  SingleProcInfoPromise::AllSettledPromiseType::
                      ResolveOrRejectValue&& aResults) mutable {
                for (auto& result : aResults.ResolveValue()) {
                  if (result.IsReject()) {
                    continue;
                  }
                  ProcInfo& info = result.ResolveValue();
                  const base::ProcessId pid = info.pid;
                  if (!procInfo.put(pid, std::move(info))) {
                    return ProcInfoPromise::CreateAndReject(
                        NS_ERROR_OUT_OF_MEMORY, __func__);
                  }
                }
                return ProcInfoPromise::CreateAndResolve(std::move(procInfo),
                                                         __func__);
              });
        },
        [](nsresult aRv) {
          return ProcInfoPromise::CreateAndReject(aRv, __func__);
        });
  }
#endif

  return promise;
}

nsCString GetUtilityActorName(const UtilityActorName aActorName) {
  switch (aActorName) {
    case UtilityActorName::Unknown:
      return "unknown"_ns;
    case UtilityActorName::AudioDecoder_Generic:
      return "audio-decoder-generic"_ns;
    case UtilityActorName::AudioDecoder_AppleMedia:
      return "audio-decoder-applemedia"_ns;
    case UtilityActorName::AudioDecoder_WMF:
      return "audio-decoder-wmf"_ns;
    case UtilityActorName::MfMediaEngineCDM:
      return "mf-media-engine"_ns;
    case UtilityActorName::JSOracle:
      return "js-oracle"_ns;
    case UtilityActorName::WindowsUtils:
      return "windows-utils"_ns;
    case UtilityActorName::WindowsFileDialog:
      return "windows-file-dialog"_ns;
    case UtilityActorName::Pkcs11Module:
      return "pkcs11-module"_ns;
    case UtilityActorName::HwInference:
      return "hw-inference"_ns;
    default:
      return "unknown"_ns;
  }
}

}  // namespace mozilla
