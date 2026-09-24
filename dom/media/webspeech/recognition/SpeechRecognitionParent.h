/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8  et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONPARENT_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONPARENT_H_

#include <deque>
#include <functional>

#include "WavDumper.h"
#include "mozilla/AudioCaptureTiming.h"
#include "mozilla/FileUtils.h"
#include "mozilla/MozPromise.h"
#include "mozilla/SPSCQueue.h"
#include "mozilla/ThreadSafety.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/ipc/IdType.h"
#include "mozilla/hwinference/PHWInferenceChild.h"
#include "mozilla/hwinference/PSpeechRecognitionParent.h"
#include "nsCOMPtr.h"
#include "nsISupportsImpl.h"
#include "nsIThread.h"
#include "nsStringFwd.h"

namespace mozilla::llama {
struct LlamaLibWrapper;
}

namespace mozilla::hwinference {
class HWInferenceChild;
}

// Opaque handles from mudler/parakeet.cpp's streaming C-API (parakeet_capi.h).
struct parakeet_ctx;
struct parakeet_stream;

namespace mozilla::hwinference {

class SpeechRecognitionParent final : public PSpeechRecognitionParent {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(SpeechRecognitionParent, override)

  // aContentId is the GeckoChildID the parent process assigned to the content
  // process that created this session. It is never supplied by content, and is
  // forwarded with install requests so the parent can verify the window owner.
  explicit SpeechRecognitionParent(dom::ContentParentId aContentId);

  ipc::IPCResult RecvIsModelAvailable(const nsTArray<nsCString>& aLanguages,
                                      IsModelAvailableResolver&& aResolver);
  ipc::IPCResult RecvIsModelInstalled(const nsTArray<nsCString>& aLanguages,
                                      IsModelInstalledResolver&& aResolver);
  ipc::IPCResult RecvInstallModels(const nsTArray<nsCString>& aLanguages,
                                   uint64_t aInnerWindowId,
                                   InstallModelsResolver&& aResolver);
  mozilla::ipc::IPCResult RecvInit(const nsCString& aEngineId,
                                   const nsCString& aLanguage,
                                   const nsTArray<nsString>& aPhrases,
                                   InitResolver&& aResolver);
  mozilla::ipc::IPCResult RecvProcessAudioData(
      nsTArray<float>&& aAudioData, const TimeStamp& aCaptureEndTime);
  mozilla::ipc::IPCResult RecvStop(StopResolver&& aResolver);

  void ActorDestroy(ActorDestroyReason aReason) override;

  void ResolveOrRejectInitOnIPCThread(InitResolver&& aResolver, bool aSuccess)
      MOZ_EXCLUDES(mLock);

 private:
  // Session lifecycle. Stopping and Destroyed are terminal.
  enum class State { Idle, Initializing, Running, Stopping, Destroyed };

  ~SpeechRecognitionParent();
  void LoadPreferences();

  const dom::ContentParentId mContentId;

  // Shared by RecvIsModelAvailable and RecvIsModelInstalled, which otherwise
  // only differ in the HWInferenceChild call they make and which request
  // holder they track it with. Sends one request per distinct model and
  // resolves true only if every request does.
  using BoolPromise = hwinference::PHWInferenceChild::IsModelAvailablePromise;
  mozilla::ipc::IPCResult RunHWInferenceBoolQueries(
      const char* aFuncName, const nsTArray<nsCString>& aModelIds,
      std::function<RefPtr<BoolPromise>(hwinference::HWInferenceChild*,
                                        const nsCString&)>
          aSendFunc,
      std::function<void(const bool&)> aResolver,
      MozPromiseRequestHolder<BoolPromise::AllPromiseType>& aRequestHolder);

  // Runs on mRecognitionThread. Takes ownership of mModelFile, loads it, and
  // enters ProcessAudioStreaming() unless the session was torn down meanwhile.
  void InitializeParakeetContext(InitResolver&& aResolver);
  void RetrieveModel(InitResolver&& aResolver);
  // Fetches an already-installed model's file. Only called by RetrieveModel()
  // after confirming the model is installed.
  void FetchModelFile(const nsCString& aModelId, InitResolver&& aResolver);
  // Cache-aware streaming path (mudler/parakeet.cpp streaming C-API).
  // Runs on mRecognitionThread, and returns once mState leaves Running.
  void ProcessAudioStreaming();
  bool IsRunning() MOZ_EXCLUDES(mLock);
  // Runs on mRecognitionThread, which alone owns mCapiCtx and mCapiStream.
  void DestroyParakeetContext(mozilla::llama::LlamaLibWrapper* aLib);
  void SignalError(const nsCString& aErrorMessage);

  // Wall-clock estimate for a position in the fed-audio timeline
  // (mProcessedAudioPos's units), from capture timestamps received in
  // RecvProcessAudioData.
  TimeStamp CaptureTimeForPosition(size_t aPosition) MOZ_EXCLUDES(mTimingLock);

  // Static tracking of the single active recognition session
  static StaticMutex sSessionMutex;
  static StaticRefPtr<SpeechRecognitionParent> sActiveSession
      MOZ_GUARDED_BY(sSessionMutex);

  Mutex mLock;
  State mState MOZ_GUARDED_BY(mLock) = State::Idle;
  // Recognition language
  // Set during RecvInit, then constant
  nsCString mLanguage MOZ_GUARDED_BY(mLock);
  nsCString mModelId MOZ_GUARDED_BY(mLock);
  // Contextual biasing phrases
  // Set during RecvInit, then constant
  nsTArray<nsString> mPhrases MOZ_GUARDED_BY(mLock);
  // Model file handle, handed to InitializeParakeetContext() on the recognition
  // thread, which owns and closes it from then on.
  mozilla::UniquePtr<FILE, mozilla::FCloseDeleter> mModelFile
      MOZ_GUARDED_BY(mLock);
  // Streaming backend handles (mudler/parakeet.cpp), owned by the recognition
  // thread.
  parakeet_ctx* mCapiCtx = nullptr;
  parakeet_stream* mCapiStream = nullptr;

  // Lock-free queue to convey audio from the IPC thread to the processing
  // thread. Producer is the IPC thread, consumer is the processing thread.
  mozilla::SPSCQueue<float> mAudioQueue;

  // Started in RecvInit, then stopped and join on actor destroyed, recognitions
  // stopped, etc.
  nsCOMPtr<nsIThread> mRecognitionThread;

  // Dumps audio sent to the recognizer. This will contain segments of about
  // 10s of audio, representing the audio sent for inference.
  // MOZ_DISABLE_UTILITY_SANDBOX=1 MOZ_DUMP_AUDIO=1 to activate
  WavDumper mRecognitionAudioDumper;

  // Whether the streaming loop ever emitted a final result. Answers RecvStop(),
  // letting content fire nomatch when the recognizer finalized nothing.
  // https://webaudio.github.io/web-speech-api/#eventdef-speechrecognition-nomatch
  // mRecognitionThread only, and only meaningful if there is such a thread.
  bool mEmittedFinalResult = false;

  // Position in the audio stream that has been processed, in samples.
  size_t mProcessedAudioPos;

  // Capture-time samples reported alongside audio in RecvProcessAudioData
  // (IPC thread), consumed by CaptureTimeForPosition() on mRecognitionThread.
  // Neither is real-time-audio-constrained, so a mutex is fine here.
  struct CaptureTimeSample {
    size_t mPosition = 0;
    TimeStamp mTimeStamp;
  };
  Mutex mTimingLock;
  size_t mEnqueuedAudioPos MOZ_GUARDED_BY(mTimingLock) = 0;
  std::deque<CaptureTimeSample> mCaptureTimeSamples MOZ_GUARDED_BY(mTimingLock);

  // Outstanding requests to the utility process, disconnected in
  // ActorDestroy() so their callbacks never run (and resolve a dead IPDL
  // resolver) after the actor is torn down.
  MozPromiseRequestHolder<
      hwinference::PHWInferenceChild::IsModelAvailablePromise::AllPromiseType>
      mIsModelAvailableRequest;
  // Backs the JS-facing IsModelInstalled query.
  MozPromiseRequestHolder<
      hwinference::PHWInferenceChild::IsModelInstalledPromise::AllPromiseType>
      mIsModelInstalledRequest;
  // Tracks RetrieveModel()'s installation check, run before fetching the model
  // file for a recognition session.
  MozPromiseRequestHolder<
      hwinference::PHWInferenceChild::IsModelInstalledPromise>
      mRetrieveModelIsInstalledRequest;
  MozPromiseRequestHolder<
      hwinference::PHWInferenceChild::InstallModelPromise::AllPromiseType>
      mInstallModelsRequest;
  MozPromiseRequestHolder<hwinference::PHWInferenceChild::GetModelFilePromise>
      mGetModelFileRequest;
};

}  // namespace mozilla::hwinference

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONPARENT_H_
