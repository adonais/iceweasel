/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8  et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SpeechRecognitionParent.h"

#include <algorithm>
#include <chrono>
#include <thread>

#include "SpeechRecognitionModelMapping.h"
#include "mozilla/Logging.h"
#include "mozilla/Mutex.h"
#include "mozilla/Preferences.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/StaticMutex.h"
#include "mozilla/StaticPrefs_browser.h"
#include "mozilla/StaticPrefs_media.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/hwinference/HWInferenceChild.h"
#include "mozilla/ipc/FileDescriptorUtils.h"
#include "mozilla/ipc/ProtocolUtils.h"
#include "mozilla/ipc/UtilityProcessChild.h"
#include "mozilla/llama/LlamaRuntimeLinker.h"
#include "nsDebug.h"
#include "nsIDUtils.h"
#include "nsReadableUtils.h"
#include "nsString.h"
#include "nsThreadUtils.h"

namespace mozilla::hwinference {

// Static initialization
StaticRefPtr<SpeechRecognitionParent> SpeechRecognitionParent::sActiveSession;
StaticMutex SpeechRecognitionParent::sSessionMutex;

static LazyLogModule gSpeechRecognitionParentLog("SpeechRecognitionParent");
#define LOGV(fmt, ...)                                             \
  MOZ_LOG_FMT(gSpeechRecognitionParentLog, LogLevel::Verbose, fmt, \
              ##__VA_ARGS__)
#define LOGD(fmt, ...) \
  MOZ_LOG_FMT(gSpeechRecognitionParentLog, LogLevel::Debug, fmt, ##__VA_ARGS__)
#define LOGE(fmt, ...) \
  MOZ_LOG_FMT(gSpeechRecognitionParentLog, LogLevel::Error, fmt, ##__VA_ARGS__)

// Sample rate the Parakeet models operate at.
static constexpr int32_t PARAKEET_SAMPLE_RATE = 16000;
// Bound on SpeechRecognitionParent::mCaptureTimeSamples; see the comment at
// its only push_back() site.
static constexpr size_t kMaxCaptureTimeSamples = 64;

void SpeechRecognitionParent::ResolveOrRejectInitOnIPCThread(
    InitResolver&& aResolver, bool aSuccess) {
  if (!aSuccess) {
    // Init failed after this session claimed the single-session slot in
    // RecvInit. Release it here so the next session is not falsely rejected as
    // concurrent. The concurrent-session rejection path in RecvInit resolves
    // the resolver directly and never reaches this helper, so it cannot clear
    // another session's slot.
    StaticMutexAutoLock lock(sSessionMutex);
    if (sActiveSession == this) {
      LOGD("Clearing active session after init failure");
      sActiveSession = nullptr;
    }
  }
  // An empty string means success; otherwise it carries the Web Speech error
  // token. Every failure reaching this helper is a model-retrieval or
  // engine-startup problem, surfaced as "network" so it is not conflated with
  // the genuine concurrent-session rejection handled directly in RecvInit.
  nsCString error = aSuccess ? nsCString() : nsCString("network");
  if (GetActorEventTarget()->IsOnCurrentThread()) {
    LOGV("Resolving init on same thread, error='{}'", error.get());
    aResolver(error);
  } else {
    LOGV("Resolving init accross thread, error='{}'", error.get());
    GetActorEventTarget()->Dispatch(NS_NewRunnableFunction(
        "Speech recognition init runnable",
        [resolver = std::move(aResolver), error = std::move(error)]() {
          LOGV("Resolving init accross thread, error='{}'", error.get());
          resolver(error);
        }));
  }
}

static nsTArray<nsCString> SpeechModelIdsFor(
    const nsTArray<nsCString>& aLanguages) {
  nsTArray<nsCString> modelIds;
  for (const auto& language : aLanguages) {
    Maybe<dom::SpeechModelMatch> model = dom::SpeechModelFor(language);
    if (model.isNothing()) {
      return {};
    }
    if (!modelIds.Contains(model->mId)) {
      modelIds.AppendElement(std::move(model->mId));
    }
  }
  return modelIds;
}

mozilla::ipc::IPCResult SpeechRecognitionParent::RunHWInferenceBoolQueries(
    const char* aFuncName, const nsTArray<nsCString>& aModelIds,
    std::function<RefPtr<BoolPromise>(hwinference::HWInferenceChild*,
                                      const nsCString&)>
        aSendFunc,
    std::function<void(const bool&)> aResolver,
    MozPromiseRequestHolder<BoolPromise::AllPromiseType>& aRequestHolder) {
  if (aModelIds.IsEmpty()) {
    aResolver(false);
    return IPC_OK();
  }

  RefPtr<mozilla::ipc::UtilityProcessChild> utilityChild =
      mozilla::ipc::UtilityProcessChild::GetSingleton();
  if (!utilityChild) {
    LOGE("{} No UtilityProcessChild available", aFuncName);
    aResolver(false);
    return IPC_OK();
  }

  HWInferenceChild* hwInferenceChild = utilityChild->GetHWInferenceChild();
  if (!hwInferenceChild) {
    LOGE("{} No HWInferenceChild available", aFuncName);
    aResolver(false);
    return IPC_OK();
  }

  nsTArray<RefPtr<BoolPromise>> promises;
  for (const auto& modelId : aModelIds) {
    promises.AppendElement(aSendFunc(hwInferenceChild, modelId));
  }

  BoolPromise::All(GetCurrentSerialEventTarget(), promises)
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [self = RefPtr{this}, aResolver = std::move(aResolver), aFuncName,
           &aRequestHolder](BoolPromise::AllPromiseType::ResolveOrRejectValue&&
                                aValue) mutable {
            aRequestHolder.Complete();
            bool result = false;
            if (aValue.IsReject()) {
              LOGE("{} IPC call to main process failed: {}", aFuncName,
                   static_cast<int>(aValue.RejectValue()));
            } else {
              const auto& results = aValue.ResolveValue();
              result = std::all_of(results.cbegin(), results.cend(),
                                   [](bool aResult) { return aResult; });
            }
            LOGD("{} Sending response back to content process: {}", aFuncName,
                 result ? "true" : "false");
            aResolver(result);
          })
      ->Track(aRequestHolder);

  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechRecognitionParent::RecvIsModelAvailable(
    const nsTArray<nsCString>& aLanguages,
    IsModelAvailableResolver&& aResolver) {
  if (aLanguages.IsEmpty()) {
    return IPC_FAIL(this,
                    "RecvIsModelAvailable requires at least one language");
  }

  nsTArray<nsCString> modelIds = SpeechModelIdsFor(aLanguages);
  LOGD("{} languages: {} mapped to ids={}", __func__,
       fmt::join(aLanguages, ", "), fmt::join(modelIds, ", "));

  return RunHWInferenceBoolQueries(
      __func__, modelIds,
      [](hwinference::HWInferenceChild* aChild, const nsCString& aModelId) {
        return aChild->SendIsModelAvailable(dom::kSpeechRecognitionTask,
                                            aModelId);
      },
      std::move(aResolver), mIsModelAvailableRequest);
}

mozilla::ipc::IPCResult SpeechRecognitionParent::RecvIsModelInstalled(
    const nsTArray<nsCString>& aLanguages,
    IsModelInstalledResolver&& aResolver) {
  if (aLanguages.IsEmpty()) {
    return IPC_FAIL(this,
                    "RecvIsModelInstalled requires at least one language");
  }

  nsTArray<nsCString> modelIds = SpeechModelIdsFor(aLanguages);
  LOGD("{} languages: {} mapped to ids={}", __func__,
       fmt::join(aLanguages, ", "), fmt::join(modelIds, ", "));

  return RunHWInferenceBoolQueries(
      __func__, modelIds,
      [](hwinference::HWInferenceChild* aChild, const nsCString& aModelId) {
        return aChild->SendIsModelInstalled(dom::kSpeechRecognitionTask,
                                            aModelId);
      },
      std::move(aResolver), mIsModelInstalledRequest);
}

mozilla::ipc::IPCResult SpeechRecognitionParent::RecvInstallModels(
    const nsTArray<nsCString>& aLanguages, uint64_t aInnerWindowId,
    InstallModelsResolver&& aResolver) {
  if (aLanguages.IsEmpty()) {
    return IPC_FAIL(this, "RecvInstallModels requires at least one language");
  }

  nsTArray<nsCString> modelIds = SpeechModelIdsFor(aLanguages);
  LOGD("{} languages: {} mapped to ids={}", __func__,
       fmt::join(aLanguages, ", "), fmt::join(modelIds, ", "));
  if (modelIds.IsEmpty()) {
    aResolver(hwinference::ModelInstallResult::Failed);
    return IPC_OK();
  }

  RefPtr<mozilla::ipc::UtilityProcessChild> utilityChild =
      mozilla::ipc::UtilityProcessChild::GetSingleton();
  HWInferenceChild* hwInferenceChild =
      utilityChild ? utilityChild->GetHWInferenceChild() : nullptr;
  if (!hwInferenceChild) {
    LOGE("{} No HWInferenceChild available", __func__);
    aResolver(hwinference::ModelInstallResult::Failed);
    return IPC_OK();
  }

  // mContentId is the trusted id of the content process that owns this
  // connection, so the parent can verify the requesting window really belongs
  // to the requester.
  using InstallModelPromise = PHWInferenceChild::InstallModelPromise;
  nsTArray<RefPtr<InstallModelPromise>> promises;
  for (const auto& modelId : modelIds) {
    promises.AppendElement(hwInferenceChild->SendInstallModel(
        dom::kSpeechRecognitionTask, modelId, aInnerWindowId, mContentId));
  }

  InstallModelPromise::All(GetCurrentSerialEventTarget(), promises)
      ->Then(GetCurrentSerialEventTarget(), __func__,
             [self = RefPtr{this}, aResolver = std::move(aResolver)](
                 InstallModelPromise::AllPromiseType::ResolveOrRejectValue&&
                     aValue) mutable {
               self->mInstallModelsRequest.Complete();
               if (aValue.IsReject()) {
                 aResolver(hwinference::ModelInstallResult::Failed);
                 return;
               }
               // Anything but Installed is reported as-is, so a download the
               // user refused stays a refusal rather than a failure.
               for (const auto& result : aValue.ResolveValue()) {
                 if (result != hwinference::ModelInstallResult::Installed) {
                   aResolver(result);
                   return;
                 }
               }
               aResolver(hwinference::ModelInstallResult::Installed);
             })
      ->Track(mInstallModelsRequest);

  return IPC_OK();
}

SpeechRecognitionParent::SpeechRecognitionParent(
    dom::ContentParentId aContentId)
    : mContentId(aContentId),
      mLock("SpeechRecognitionLock"),
      // We expect that in some less powerful computer that aren't doing hw
      // accelerated recognition, having a very long queue can smooth things
      // out.
      mAudioQueue(PARAKEET_SAMPLE_RATE * 30),
      mProcessedAudioPos(0),
      mTimingLock("SpeechRecognitionParent::mTimingLock") {
  // MOZ_DUMP_AUDIO=1 MOZ_DISABLE_UTILITY_SANDBOX=1 to activate this
  // It will contain the (repeating segments of audio), precisely that has been
  // sent to the recognizer.
  const int MONO = 1;
  mRecognitionAudioDumper.Open("SpeechRecognition-Audio-Input", MONO,
                               PARAKEET_SAMPLE_RATE);

  // Load tunable parameters from preferences (can be overridden via
  // about:config)
  LoadPreferences();
}

void SpeechRecognitionParent::LoadPreferences() {}

void SpeechRecognitionParent::RetrieveModel(InitResolver&& aResolver) {
  MOZ_ASSERT(NS_IsMainThread());
  RefPtr<mozilla::ipc::UtilityProcessChild> utilityChild =
      mozilla::ipc::UtilityProcessChild::GetSingleton();
  if (!utilityChild) {
    LOGE("{} ERROR: No UtilityProcessChild available", __func__);
    ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
    return;
  }
  mozilla::hwinference::HWInferenceChild* hwInferenceChild =
      utilityChild->GetHWInferenceChild();
  if (!hwInferenceChild) {
    LOGE("{} No HWInferenceChild available for model retrieval", __func__);
    ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
    return;
  }

  nsCString modelId;
  {
    MutexAutoLock lock(mLock);
    modelId = mModelId;
  }

  LOGD("{} Checking model is installed: id={}", __func__, modelId.get());

  // Only SpeechRecognition::Install() may download a model, behind its own
  // permission doorhanger. start() requires the model to already be
  // installed, so check that before FetchModelFile() rather than letting
  // GetModelFile download it on demand.
  hwInferenceChild->SendIsModelInstalled(dom::kSpeechRecognitionTask, modelId)
      ->Then(GetCurrentSerialEventTarget(), __func__,
             [self = RefPtr{this}, aResolver = std::move(aResolver),
              modelId](hwinference::PHWInferenceChild::IsModelInstalledPromise::
                           ResolveOrRejectValue&& aValue) mutable {
               self->mRetrieveModelIsInstalledRequest.Complete();
               if (!aValue.IsResolve() || !aValue.ResolveValue()) {
                 LOGE(
                     "{} model {} is not installed; call "
                     "SpeechRecognition.install() first",
                     __func__, modelId.get());
                 self->ResolveOrRejectInitOnIPCThread(std::move(aResolver),
                                                      false);
                 return;
               }
               self->FetchModelFile(modelId, std::move(aResolver));
             })
      ->Track(mRetrieveModelIsInstalledRequest);
}

void SpeechRecognitionParent::FetchModelFile(const nsCString& aModelId,
                                             InitResolver&& aResolver) {
  MOZ_ASSERT(NS_IsMainThread());
  RefPtr<mozilla::ipc::UtilityProcessChild> utilityChild =
      mozilla::ipc::UtilityProcessChild::GetSingleton();
  mozilla::hwinference::HWInferenceChild* hwInferenceChild =
      utilityChild ? utilityChild->GetHWInferenceChild() : nullptr;
  if (!hwInferenceChild) {
    LOGE("{} No HWInferenceChild available for model retrieval", __func__);
    ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
    return;
  }

  LOGD("{} Requesting model: id={}", __func__, aModelId.get());

  hwInferenceChild->SendGetModelFile(dom::kSpeechRecognitionTask, aModelId)
      ->Then(
          GetCurrentSerialEventTarget(), __func__,
          [self = RefPtr{this}, aResolver = std::move(aResolver)](
              hwinference::PHWInferenceChild::GetModelFilePromise::
                  ResolveOrRejectValue&& aValue) mutable {
            self->mGetModelFileRequest.Complete();
            if (aValue.IsReject()) {
              LOGE("{} Promise rejected with reason {}", __func__,
                   static_cast<int>(aValue.RejectValue()));
              self->ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
              return;
            }

            const mozilla::hwinference::GetModelFileResult& result =
                aValue.ResolveValue();
            if (result.type() ==
                mozilla::hwinference::GetModelFileResult::TGetModelError) {
              LOGE("{} GetModelError with nsresult={:x}", __func__,
                   static_cast<uint32_t>(
                       result.get_GetModelError().errorCode()));
              self->ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
              return;
            }

            // Convert FileDescriptor to FILE* using the helper function
            mozilla::ipc::FileDescriptor fd =
                result.get_GetModelFileSuccess().fd();

            FILE* file = FileDescriptorToFILE(fd, "rb");
            if (!file) {
              LOGE("{} Failed to convert FileDescriptor to FILE*", __func__);
              self->ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
              return;
            }
            // Store the file handle on the main thread
            {
              MutexAutoLock lock(self->mLock);
              self->mModelFile.reset(file);
            }

            // Signal the recognition thread that the model is ready
            LOGD("Model file ready, starting recognition thread");
            nsresult rv = NS_NewNamedThread(
                "Parakeet", getter_AddRefs(self->mRecognitionThread));
            if (NS_FAILED(rv)) {
              LOGE("Failed to create recognition thread: {:x}",
                   static_cast<uint32_t>(rv));
              self->ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
              return;
            }
            nsCOMPtr<nsIThread> recognitionThread = self->mRecognitionThread;
            recognitionThread->Dispatch(NS_NewRunnableFunction(
                "Initialize parakeet context",
                [self, recognitionThread,
                 aResolver = std::move(aResolver)]() mutable {
                  MOZ_ASSERT(recognitionThread->IsOnCurrentThread());
                  self->InitializeParakeetContext(std::move(aResolver));
                }));
          })
      ->Track(mGetModelFileRequest);
}

void SpeechRecognitionParent::InitializeParakeetContext(
    InitResolver&& aResolver) {
  mozilla::llama::LlamaLibWrapper* lib =
      mozilla::llama::LlamaRuntimeLinker::Get();
  if (!lib) {
    LOGE("{} Failed to get runtime linker", __func__);
    ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
    return;
  }

  // Route ggml logs through gSpeechRecognitionParentLog instead of its
  // default unconditional stderr logging.
  lib->llama_log_set(
      [](ggml_log_level level, const char* text, void* /* user_data */) {
        switch (level) {
          case GGML_LOG_LEVEL_NONE:
            MOZ_LOG(gSpeechRecognitionParentLog, LogLevel::Disabled,
                    ("%s", text));
            break;
          case GGML_LOG_LEVEL_DEBUG:
            MOZ_LOG(gSpeechRecognitionParentLog, LogLevel::Debug, ("%s", text));
            break;
          case GGML_LOG_LEVEL_INFO:
            MOZ_LOG(gSpeechRecognitionParentLog, LogLevel::Info, ("%s", text));
            break;
          case GGML_LOG_LEVEL_WARN:
            MOZ_LOG(gSpeechRecognitionParentLog, LogLevel::Warning,
                    ("%s", text));
            break;
          case GGML_LOG_LEVEL_ERROR:
            MOZ_LOG(gSpeechRecognitionParentLog, LogLevel::Error, ("%s", text));
            break;
          default:
            MOZ_LOG(gSpeechRecognitionParentLog, LogLevel::Verbose,
                    ("%s", text));
            break;
        }
      },
      nullptr);

  // Test-only: widen the window before mLock is acquired below, so a test
  // can deterministically land ActorDestroy() (running on another thread)
  // in that window instead of relying on scheduling luck.
  int32_t testDelayMs =
      StaticPrefs::media_webspeech_recognition_testing_parakeet_init_delay_ms();
  if (testDelayMs > 0) {
    std::this_thread::sleep_for(std::chrono::milliseconds(testDelayMs));
  }

  mozilla::UniquePtr<FILE, mozilla::FCloseDeleter> modelFile;
  nsCString language;
  State state;
  {
    MutexAutoLock lock(mLock);
    state = mState;
    if (state == State::Initializing) {
      modelFile = std::move(mModelFile);
      language = mLanguage;
    }
  }
  if (state != State::Initializing) {
    LOGD("{} Session already torn down, abandoning init", __func__);
    ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
    return;
  }

  MOZ_ASSERT(modelFile);
  mCapiCtx = lib->parakeet_capi_load_fd(fileno(modelFile.get()));
  if (!mCapiCtx) {
    LOGE("{} parakeet_capi_load_fd failed", __func__);
    ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
    return;
  }
  const char* langArg = language.IsEmpty() ? nullptr : language.get();
  mCapiStream = lib->parakeet_capi_stream_begin_lang(mCapiCtx, langArg);
  if (!mCapiStream && langArg) {
    // The multilingual model rejects languages outside its dictionary; rather
    // than fail the session, fall back to auto-detection.
    LOGD("stream_begin_lang('{}') failed; falling back to auto-detection",
         langArg);
    mCapiStream = lib->parakeet_capi_stream_begin_lang(mCapiCtx, "auto");
  }
  if (!mCapiStream) {
    LOGE("{} parakeet_capi_stream_begin_lang failed", __func__);
    DestroyParakeetContext(lib);
    ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
    return;
  }

  {
    MutexAutoLock lock(mLock);
    if (mState == State::Initializing) {
      mState = State::Running;
    }
    state = mState;
  }
  if (state != State::Running) {
    LOGD("{} Session torn down during load, abandoning init", __func__);
    DestroyParakeetContext(lib);
    ResolveOrRejectInitOnIPCThread(std::move(aResolver), false);
    return;
  }

  ResolveOrRejectInitOnIPCThread(std::move(aResolver), true);
  LOGD("Parakeet streaming session ready, starting streaming loop");

  // Already running on mRecognitionThread, so just call directly instead of
  // dispatching back onto it.
  ProcessAudioStreaming();
}

SpeechRecognitionParent::~SpeechRecognitionParent() {
  LOGD("{}", __func__);

  // Clear active session if this was it
  {
    StaticMutexAutoLock lock(sSessionMutex);
    if (sActiveSession == this) {
      LOGD("Clearing active session in destructor");
      sActiveSession = nullptr;
    }
  }
}

void SpeechRecognitionParent::ActorDestroy(ActorDestroyReason aReason) {
  LOGD("{} ActorDestroy called", __func__);

  // Clear active session if this was it. The actor can be torn down without
  // RecvStop() ever running (e.g. a detached frame), which would otherwise
  // leave sActiveSession dangling and reject every subsequent session as
  // concurrent.
  {
    StaticMutexAutoLock lock(sSessionMutex);
    if (sActiveSession == this) {
      LOGD("Clearing active session in ActorDestroy");
      sActiveSession = nullptr;
    }
  }

  {
    MutexAutoLock lock(mLock);
    mState = State::Destroyed;
  }

  // Disconnect outstanding requests to the utility process so their
  // resolve/reject callbacks never run and try to resolve a dead IPDL
  // resolver after this actor is torn down.
  mIsModelAvailableRequest.DisconnectIfExists();
  mIsModelInstalledRequest.DisconnectIfExists();
  mRetrieveModelIsInstalledRequest.DisconnectIfExists();
  mInstallModelsRequest.DisconnectIfExists();
  mGetModelFileRequest.DisconnectIfExists();

  // Use AsyncShutdown(), not Shutdown(): the latter joins the thread by
  // spinning a nested event loop, which can crash when called from inside
  // this IPC dispatch. The recognition thread drains its own queue and frees
  // mCapiCtx/mCapiStream itself, avoiding a race with it still in use.
  if (mRecognitionThread) {
    mRecognitionThread->AsyncShutdown();
    mRecognitionThread = nullptr;
  }
}

mozilla::ipc::IPCResult SpeechRecognitionParent::RecvInit(
    const nsCString& aEngineId, const nsCString& aLanguage,
    const nsTArray<nsString>& aPhrases, InitResolver&& aResolver) {
  LOGD("{} engineId='{}' language='{}'", __func__, aEngineId.get(),
       aLanguage.get());

  {
    MutexAutoLock lock(mLock);
    if (mState != State::Idle) {
      return IPC_FAIL(this, "Init already called");
    }
  }

  // Enforce single active session
  {
    StaticMutexAutoLock lock(sSessionMutex);
    if (sActiveSession) {
      LOGE("Rejecting Init - another recognition session is already active");
      aResolver("concurrent-session"_ns);
      return IPC_OK();
    }
    sActiveSession = this;
    LOGD("Session registered as active");
  }

  // Moved out of Idle here rather than on the recognition thread once the
  // engine is up: this is what tells a session setup still in flight there
  // that the session has gone away in the meantime.
  dom::SpeechModelMatch model;
  if (aLanguage.IsEmpty()) {
    model = dom::DefaultSpeechModel();
  } else if (Maybe<dom::SpeechModelMatch> match =
                 dom::SpeechModelFor(aLanguage)) {
    model = std::move(*match);
  }

  {
    MutexAutoLock lock(mLock);
    mState = State::Initializing;
    mModelId = std::move(model.mId);
    mLanguage = std::move(model.mLocale);
    mPhrases = aPhrases.Clone();
  }

  // The testing mock (see RecvIsModelAvailable and the parent-side model
  // download in SpeechModelDownloadPermissionRequest) has no equivalent for
  // GetModelFile: there's no lightweight stand-in for an actual parseable
  // model file, so tests that only care about session/IPC lifecycle (not real
  // recognition) skip loading a model entirely rather than needing one to
  // succeed.
  if (StaticPrefs::browser_ml_modelHub_testing()) {
    LOGD("{} - testing mock: skipping model retrieval", __func__);
    aResolver(""_ns);
    return IPC_OK();
  }

  RetrieveModel(std::move(aResolver));

  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechRecognitionParent::RecvProcessAudioData(
    nsTArray<float>&& aAudioData, const TimeStamp& aCaptureEndTime) {
  LOGV("{} {} samples", __func__, aAudioData.Length());

  // All-or-nothing: a partial enqueue would splice a discontinuity into a block
  // fed to a transducer that carries caches across feeds.
  int length = AssertedCast<int>(aAudioData.Length());
  if (mAudioQueue.AvailableWrite() < length) {
    LOGE("Audio queue full, dropping {} samples", length);
    return IPC_OK();
  }
  int written = mAudioQueue.Enqueue(aAudioData.Elements(), length);
  if (written != length) {
    LOGE("Audio queue accepted only {} of {} samples", written, length);
  }

  {
    MutexAutoLock lock(mTimingLock);
    // Advances by what was queued, not what arrived, so this timeline stays
    // aligned with mProcessedAudioPos when a block is dropped above.
    mEnqueuedAudioPos += written;
    mCaptureTimeSamples.push_back({mEnqueuedAudioPos, aCaptureEndTime});
    // CaptureTimeForPosition() only prunes on the final-result emit path, so a
    // session that never finalizes (continuous input, silence) would otherwise
    // grow this deque by one entry per audio block for the session's whole
    // lifetime. Cap it here too; a handful of entries is enough to
    // extrapolate from.
    while (mCaptureTimeSamples.size() > kMaxCaptureTimeSamples) {
      mCaptureTimeSamples.pop_front();
    }
  }

  return IPC_OK();
}

TimeStamp SpeechRecognitionParent::CaptureTimeForPosition(size_t aPosition) {
  MutexAutoLock lock(mTimingLock);
  // Drop samples that are behind aPosition, but always keep at least one to
  // extrapolate from.
  while (mCaptureTimeSamples.size() > 1 &&
         mCaptureTimeSamples.front().mPosition < aPosition) {
    mCaptureTimeSamples.pop_front();
  }
  if (mCaptureTimeSamples.empty()) {
    return TimeStamp::Now();
  }
  const CaptureTimeSample& sample = mCaptureTimeSamples.front();
  return EstimateSampleTimeStamp(int64_t(sample.mPosition), sample.mTimeStamp,
                                 int64_t(aPosition), PARAKEET_SAMPLE_RATE);
}

mozilla::ipc::IPCResult SpeechRecognitionParent::RecvStop(
    StopResolver&& aResolver) {
  // Clear active session if this was it
  {
    StaticMutexAutoLock lock(sSessionMutex);
    if (sActiveSession == this) {
      LOGD("Clearing active session in RecvStop");
      sActiveSession = nullptr;
    }
  }

  {
    MutexAutoLock lock(mLock);
    if (mState != State::Destroyed) {
      mState = State::Stopping;
    }
  }

  LOGD("Stopping speech recognition session and cleaning up resources");

  if (!mRecognitionThread) {
    // No streaming loop was ever started: nothing to flush, and nothing was
    // ever finalized.
    aResolver(false);
    return IPC_OK();
  }

  // Resolving is deferred onto mRecognitionThread: it is serial and
  // ProcessAudioStreaming() holds it for the whole session, so this happens
  // after that loop's end-of-stream flush and after the results the flush
  // dispatched, which is what stop() promises the page. That thread is also
  // where mEmittedFinalResult is written, hence reading it there.
  mRecognitionThread->Dispatch(NS_NewRunnableFunction(
      "SpeechRecognitionParent::ResolveStop",
      [self = RefPtr{this}, resolver = std::move(aResolver)]() mutable {
        self->GetActorEventTarget()->Dispatch(NS_NewRunnableFunction(
            "SpeechRecognitionParent::ResolveStop",
            [resolver = std::move(resolver),
             any = self->mEmittedFinalResult]() { resolver(any); }));
      }));

  return IPC_OK();
}

void SpeechRecognitionParent::SignalError(const nsCString& aErrorMessage) {
  LOGE("Error: {}", aErrorMessage.get());
  NS_DispatchToMainThread(NS_NewRunnableFunction(
      "SpeechRecognitionParent::SignalError",
      [self = RefPtr{this}, aErrorMessage]() {
        if (!self->SendOnRecognitionError(aErrorMessage)) {
          LOGE("Counldn't send OnRecognitionError for {}", aErrorMessage);
        }
      }));
}

void SpeechRecognitionParent::ProcessAudioStreaming() {
  LOGD("{} Starting cache-aware streaming loop", __func__);

  mozilla::llama::LlamaLibWrapper* lib =
      mozilla::llama::LlamaRuntimeLinker::Get();

  // parakeet_capi_stream_feed hands new audio to the model (which keeps its
  // own caches) and returns the text newly committed by this call; a
  // cache-aware transducer never revises past output, so each committed delta
  // is emitted as a final result. Forward audio as it arrives; a small floor
  // avoids spinning on sub-block wakeups.
  const size_t minFeed = size_t(0.01 * PARAKEET_SAMPLE_RATE);  // 10 ms
  const size_t maxFeed = size_t(PARAKEET_SAMPLE_RATE);         // 1 s

  // Strip inline <...> markers (e.g. nemotron <en-US> language tags).
  auto stripTags = [](nsCString& aText) {
    int32_t open;
    while ((open = aText.FindChar('<')) != kNotFound) {
      int32_t close = aText.FindChar('>', open);
      if (close == kNotFound) {
        break;
      }
      aText.Cut(open, close - open + 1);
    }
  };

  auto emit = [self = RefPtr{this}](const nsCString& aText, bool aFinal,
                                    float aConfidence, TimeStamp aEventTime) {
    // An empty transcript is not a result; a session that only ever produces
    // these is reported as a nomatch when RecvStop() resolves.
    if (aText.IsEmpty()) {
      return;
    }
    if (aFinal) {
      self->mEmittedFinalResult = true;
    }
    NS_DispatchToMainThread(NS_NewRunnableFunction(
        "SpeechRecognitionParent::StreamResult",
        [self, payload = nsCString(aText), aFinal, aConfidence, aEventTime]() {
          LOGV("Sending streaming result: '{}' (final={}, conf={})",
               payload.get(), aFinal, aConfidence);
          if (self->CanSend()) {
            (void)self->SendOnRecognitionResult(payload, aFinal, aConfidence,
                                                aEventTime);
          }
        }));
  };

  // Drain the words the model finalized this step. They are already grouped at
  // word boundaries and carry per-word timing + confidence. Emit them as a
  // single final result with the mean confidence; the per-word timestamps are
  // logged (kept engine-internal — the Web Speech result has no per-word timing
  // field).
  auto emitFinalizedWords = [&]() {
    parakeet_stream_word* words = nullptr;
    int n = lib->parakeet_capi_stream_drain_words(mCapiStream, &words);
    if (n > 0) {
      nsCString text;
      float confSum = 0.0f;
      int counted = 0;
      for (int i = 0; i < n; ++i) {
        nsCString w(words[i].text ? words[i].text : "");
        stripTags(w);  // drop any inline <lang> markers
        w.Trim(" \t\n\r");
        if (w.IsEmpty()) {
          continue;
        }
        if (!text.IsEmpty()) {
          text.Append(' ');
        }
        text.Append(w);
        confSum += words[i].conf;
        ++counted;
        LOGV("  word '{}' [{:.2f}-{:.2f}] conf={:.2f}", w.get(), words[i].start,
             words[i].end, words[i].conf);
      }
      emit(text, /* isFinal */ true, counted ? confSum / counted : 1.0f,
           CaptureTimeForPosition(mProcessedAudioPos));
    }
    lib->parakeet_capi_free_words(words, n > 0 ? n : 0);
  };

  nsTArray<float> chunk;

  while (IsRunning()) {
    size_t available = mAudioQueue.AvailableRead();
    if (available < minFeed) {
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
      continue;
    }
    size_t take = std::min(available, maxFeed);
    chunk.SetLength(take);
    size_t got = mAudioQueue.Dequeue(chunk.Elements(), AssertedCast<int>(take));
    chunk.SetLength(got);
    mProcessedAudioPos += got;

    // Dump audio for debugging
    mRecognitionAudioDumper.Write(chunk.Elements(), chunk.Length());

    int eou = 0;
    // The marker interval is the inference compute time; the text records the
    // audio fed and how much was queued (the buffering-latency component), so a
    // profile shows the real-time factor and end-to-end latency directly.
    TimeStamp feedStart = TimeStamp::Now();
    char* fed = lib->parakeet_capi_stream_feed(mCapiStream, chunk.Elements(),
                                               AssertedCast<int>(got), &eou);
    if (fed) {
      lib->parakeet_capi_free_string(fed);  // text comes from drain_words
    }
    PROFILER_MARKER_TEXT(
        "Parakeet stream_feed", MEDIA_PLAYBACK,
        MarkerOptions(MarkerTiming::IntervalUntilNowFrom(feedStart)),
        nsFmtCString("fed={:.0f}ms queued={:.0f}ms",
                     1000.0 * got / PARAKEET_SAMPLE_RATE,
                     1000.0 * available / PARAKEET_SAMPLE_RATE));
    emitFinalizedWords();
    (void)eou;
  }

  // Flush the end-of-stream tail, then emit its finalized words.
  char* tail = lib->parakeet_capi_stream_finalize(mCapiStream);
  if (tail) {
    lib->parakeet_capi_free_string(tail);
  }
  emitFinalizedWords();
  LOGD("Streaming loop exiting");

  // Freed here, on the thread that alone uses them, rather than from
  // ActorDestroy() on the main thread: ActorDestroy() only requests this
  // thread's shutdown (see AsyncShutdown() there) instead of blocking on it,
  // so it can't assume the loop above has already exited.
  DestroyParakeetContext(lib);
}

bool SpeechRecognitionParent::IsRunning() {
  MutexAutoLock lock(mLock);
  return mState == State::Running;
}

void SpeechRecognitionParent::DestroyParakeetContext(
    mozilla::llama::LlamaLibWrapper* aLib) {
  if (mCapiStream) {
    aLib->parakeet_capi_stream_free(mCapiStream);
    mCapiStream = nullptr;
  }
  if (mCapiCtx) {
    aLib->parakeet_capi_free(mCapiCtx);
    mCapiCtx = nullptr;
  }
}

}  // namespace mozilla::hwinference

#undef LOGV
#undef LOGD
#undef LOGE
