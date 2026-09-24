/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_ML_IPC_HWINFERENCEPARENT_H_
#define TOOLKIT_COMPONENTS_ML_IPC_HWINFERENCEPARENT_H_

#include "mozilla/MozPromise.h"
#include "mozilla/ProcInfo.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/ipc/Endpoint.h"
#include "mozilla/ipc/UtilityProcessParent.h"
#include "mozilla/hwinference/PHWInferenceParent.h"
#include "mozilla/ipc/UtilityMediaService.h"

namespace mozilla::hwinference {

// HWInference parent process side
class HWInferenceParent final : public PHWInferenceParent {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(HWInferenceParent, override);

  HWInferenceParent() = default;

  void ActorDestroy(ActorDestroyReason aReason) override;

  mozilla::ipc::IPCResult RecvIsModelAvailable(
      nsCString&& aTask, nsCString&& aId, IsModelAvailableResolver&& aResolver);

  mozilla::ipc::IPCResult RecvIsModelInstalled(
      nsCString&& aTask, nsCString&& aId, IsModelInstalledResolver&& aResolver);

  mozilla::ipc::IPCResult RecvInstallModel(
      nsCString&& aTask, nsCString&& aId, uint64_t aInnerWindowId,
      const dom::ContentParentId& aContentId, InstallModelResolver&& aResolver);

  mozilla::ipc::IPCResult RecvGetModelFile(nsCString&& aTask, nsCString&& aId,
                                           GetModelFileResolver&& aResolver);

  ipc::UtilityActorName GetActorName() {
    return ipc::UtilityActorName::HwInference;
  }

  nsresult BindToUtilityProcess(
      const RefPtr<ipc::UtilityProcessParent>& aUtilityParent);

  // Resolved once this actor is bound to its utility process, rejected if that
  // process goes away before it can be.
  RefPtr<GenericNonExclusivePromise> WhenReady() { return mReadyPromise; }

  // Forwards aEndpoint to the HWInference process once its actor is ready. The
  // caller must hold a keep-alive, see
  // UtilityProcessManager::AcquireContentHWInferenceProcess().
  static void StartContentSpeechRecognition(
      Endpoint<PSpeechRecognitionParent>&& aEndpoint,
      dom::ContentParentId aChildId);

  static RefPtr<HWInferenceParent> GetSingleton();

 private:
  friend PHWInferenceParent;
  static StaticRefPtr<HWInferenceParent> sInstance;
  ~HWInferenceParent() = default;

  // The utility process this actor is bound to, null until BindToUtilityProcess
  // and once destroyed. An instance is only ever bound to one process.
  RefPtr<ipc::UtilityProcessParent> mUtilityParent;

  const RefPtr<GenericNonExclusivePromise::Private> mReadyPromise =
      new GenericNonExclusivePromise::Private(
          "HWInferenceParent::mReadyPromise");
};

}  // namespace mozilla::hwinference

#endif  // TOOLKIT_COMPONENTS_ML_IPC_HWINFERENCEPARENT_H_
