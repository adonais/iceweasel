/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim:set ts=2 sw=2 sts=2 et cindent: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SpeechRecognitionBackend_h
#define mozilla_dom_SpeechRecognitionBackend_h

#include "AudioSegment.h"
#include "MainThreadUtils.h"
#include "SpeechRecognitionChild.h"
#include "mozilla/AudioCaptureTiming.h"
#include "mozilla/DataMutex.h"
#include "mozilla/EventTargetCapability.h"
#include "mozilla/LazyIdleThread.h"
#include "mozilla/MoveOnlyFunction.h"
#include "mozilla/MozPromise.h"
#include "mozilla/RefPtr.h"
#include "mozilla/SPSCQueue.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/ThreadSafety.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/WeakPtr.h"
#include "mozilla/hwinference/HWInferenceTypes.h"
#include "mozilla/ipc/Endpoint.h"
#include "nsIThread.h"
#include "nsITimer.h"
#include "nsString.h"
#include "nsTArray.h"

namespace mozilla {
class AudibilityMonitor;
class AudioConverter;
class MediaTrackGraph;
namespace dom {
class AudioStreamTrack;
class SpeechRecognition;
class SpeechTrackListener;
}  // namespace dom
}  // namespace mozilla

namespace mozilla::dom {

class Promise;

// Whether ending a session closes its audio lifecycle, i.e. queues the events
// that pair the ones capture opened. See
// SpeechRecognitionBackend::DispatchTrailingEvents().
enum class TrailingEvents { Fire, Skip };

// Keeps the shared IPC actor open for as long as this guard is alive,
// releasing it on destruction - the hold is tied to the guard's own lifetime
// rather than to a promise settling. Gecko silently drops a promise's
// reaction jobs, including a PromiseNativeHandler added via
// AppendNativeHandler, once the promise's global has died (e.g. the calling
// iframe was detached before the async IPC round trip completed); tying the
// hold to this refcounted guard instead avoids leaking the HWInference
// process forever whenever a caller's frame goes away mid-flight.
//
// Created by CreateSession() and owned by the session's
// SpeechRecognitionChild, so the hold covers an actor that never binds - and
// therefore never gets an ActorDestroy() to release it from - as well as one
// that does. This counts speech's own users; the parent process holds one
// utility process keep-alive while there is at least one user.
class SpeechRecognitionIPCActorUserGuard final {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(SpeechRecognitionIPCActorUserGuard)

  SpeechRecognitionIPCActorUserGuard();

 private:
  ~SpeechRecognitionIPCActorUserGuard();
};

// This class sits just below the SpeechRecognition object, and implements using
// packaging and processing audio from a MediaTrackGraph, and sending it over
// IPC, while receiving the recognized text from the HWInference process.
//
// It uses 3 threads:
// - the main thread, where the SpeechRecognition object calls
// - The real-time thread from the MTG, to receive and process the audio
// - an IPC thread, on which the per-session PSpeechRecognition actor is bound,
// so the audio path doesn't share the main thread.
//
// Member accesses are to be checked statically
class SpeechRecognitionBackend {
  friend class SpeechRecognitionIPCActorUserGuard;

 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING_WITH_DELETE_ON_MAIN_THREAD(
      SpeechRecognitionBackend)

  // Creates a backend, along with the resampling thread it processes audio on.
  // Returns nullptr if that thread cannot be created.
  static already_AddRefed<SpeechRecognitionBackend> Create(
      SpeechRecognition* aParent, uint32_t aGraphRate,
      const nsString& aLanguage, const nsTArray<nsString>& aPhrases)
      MOZ_REQUIRES(sMainThreadCapability);

  // Called when SpeechRecognition.start() is called from JS. Establishes the
  // IPC connection; the resampling loop only starts once the engine has
  // confirmed session init.
  void Start() MOZ_REQUIRES(sMainThreadCapability);
  // Called when SpeechRecognition.stop() is called from JS. Shuts down the
  // background thread and IPC session, waiting for the engine's end-of-stream
  // flush before reporting the session finished.
  void Stop() MOZ_REQUIRES(sMainThreadCapability);
  // Called when SpeechRecognition.abort() is called from JS, and from
  // SpeechRecognition's own teardown. Immediately terminates the resampling
  // thread and IPC, discarding any result the engine had yet to flush.
  // The teardown paths pass TrailingEvents::Skip: they end the session with
  // "error", or with the owner going away, and do not owe those events.
  void Abort(TrailingEvents aTrailingEvents)
      MOZ_REQUIRES(sMainThreadCapability);

  // Attach to an audio track to start receiving audio data.
  // Creates a SpeechTrackListener and attaches it to the track.
  void AttachToTrack(AudioStreamTrack* aTrack)
      MOZ_REQUIRES(sMainThreadCapability);
  // Detach from the current audio track.
  void DetachFromTrack() MOZ_REQUIRES(sMainThreadCapability);

  // == Graph thread
  // Called by SpeechTrackListener on the graph's real-time thread
  // Uses lock-free SPSC queue to send data to background thread
  void DataCallback(MediaTrackGraph* aGraph, TrackTime aTime,
                    const AudioChunk& aChunk);
  // Called by SpeechTrackListener when the track ends
  void NotifyTrackEnded();

  static already_AddRefed<Promise> Available(
      nsIGlobalObject* aGlobal, const nsTArray<nsCString>& aLanguages);
  // Requests installation of the on-device model(s) for aLanguages. The
  // request is relayed by the utility to the trusted parent, which obtains the
  // user's consent and performs the download (see nsIMLModelResolver);
  // aInnerWindowId is the requesting document's inner window id, forwarded
  // so the parent can verify ownership and anchor the prompt on that tab.
  static already_AddRefed<Promise> Install(
      nsIGlobalObject* aGlobal, const nsTArray<nsCString>& aLanguages,
      uint64_t aInnerWindowId);
  // Rejects when the request could not be made at all.
  using ModelInstallPromise =
      MozPromise<hwinference::ModelInstallResult, nsresult, true>;

  static RefPtr<ModelInstallPromise> InstallModels(
      const nsTArray<nsCString>& aLanguages, uint64_t aInnerWindowId)
      MOZ_REQUIRES(sMainThreadCapability);
  // InstallModels(), but skipping the request - and thus the prompt - when
  // every model is already installed. What start() waits on.
  static RefPtr<ModelInstallPromise> EnsureModelsInstalled(
      const nsTArray<nsCString>& aLanguages, uint64_t aInnerWindowId)
      MOZ_REQUIRES(sMainThreadCapability);
  static RefPtr<hwinference::PSpeechRecognitionChild::IsModelInstalledPromise>
  IsModelInstalledNative(hwinference::SpeechRecognitionChild* aChild,
                         const nsTArray<nsCString>& aLanguages);

 private:
  SpeechRecognitionBackend(SpeechRecognition* aParent,
                           nsIThread* aResamplingThread, uint32_t aGraphRate,
                           const nsString& aLanguage,
                           const nsTArray<nsString>& aPhrases)
      MOZ_REQUIRES(sMainThreadCapability);
  virtual ~SpeechRecognitionBackend();

  // Shared body of Stop() and Abort(). aWaitForFlush defers
  // NotifySessionFinished() until the engine has flushed and answered
  // PSpeechRecognition::Stop.
  void Shutdown(bool aWaitForFlush, TrailingEvents aTrailingEvents)
      MOZ_REQUIRES(sMainThreadCapability);

  // Queues speechend and soundend, for whichever of the two pairs this session
  // left open, then audioend, as one task ahead of the one that fires "end".
  void DispatchTrailingEvents() MOZ_REQUIRES(sMainThreadCapability);
  // Tells the SpeechRecognition the session is over and whether the engine
  // finalized anything, so it can fire nomatch before end. Callable from the
  // main and IPC threads.
  void NotifySessionFinished(bool aProducedResult);

  // == Resampling thread
  void ProcessAudioChunk() MOZ_REQUIRES(mResamplingCapability);
  void SendAudioDataViaIPC(nsTArray<float>&& aAudioData,
                           TimeStamp aCaptureEndTime)
      MOZ_REQUIRES(mResamplingCapability);
  // Wall-clock estimate for a position in the track's raw sample timeline.
  TimeStamp CaptureTimeForTrackPosition(TrackTime aPosition);

  // == IPC thread
  // Takes over a session actor freshly bound on the IPC thread, wires its
  // callbacks up and initializes the engine.
  void StartSpeechRecognitionSession(
      const nsACString& aLanguage, hwinference::SpeechRecognitionChild* aChild)
      MOZ_REQUIRES(sIPCCapability);
  void HandleRecognitionResult(const nsACString& aTranscript, bool aIsFinal,
                               float aConfidence, TimeStamp aEventTime)
      MOZ_REQUIRES(sIPCCapability);
  void HandleRecognitionError(const nsACString& aError)
      MOZ_REQUIRES(sIPCCapability);

  static void CreateSession(
      MoveOnlyFunction<void(hwinference::SpeechRecognitionChild*)> aCallback)
      MOZ_REQUIRES(sMainThreadCapability);

  // Creates the shared IPC thread on first use, and publishes its serial event
  // target as sIPCCapability. The target is stable for the process lifetime;
  // its backing OS thread is released when idle (see the body).
  static void EnsureIPCThread() MOZ_REQUIRES(sMainThreadCapability);

  static void AssertOnIPCThread() MOZ_ASSERT_CAPABILITY(sIPCCapability);

  static void AcquireIPCActorUser() MOZ_REQUIRES(sMainThreadCapability);
  static void ReleaseIPCActorUser() MOZ_REQUIRES(sMainThreadCapability);
  static void CancelIdleCloseTimer() MOZ_REQUIRES(sMainThreadCapability);

  // Opens a transient session on the IPC thread and calls aSendFunc(session)
  // there. aSendFunc must return a RefPtr<MozPromise>; the returned promise
  // forwards its result and rejects with NS_ERROR_FAILURE if setup or IPC
  // fails. The session lives exactly as long as the call it was opened for:
  // it is closed as soon as aSendFunc's promise settles, so callers must not
  // hold on to it past that point.
  template <typename SendFunc>
  static auto RunWithTransientSession(SendFunc&& aSendFunc)
      MOZ_REQUIRES(sMainThreadCapability);

  // Runs aFunc(parent) on the main thread, named aName, if the parent
  // SpeechRecognition is still alive and still owns this backend by then.
  // Callable from any thread.
  template <typename Func>
  void DispatchToParentIfAlive(const char* aName, Func&& aFunc);

 public:
  static StaticAutoPtr<mozilla::EventTargetCapability<nsISerialEventTarget>>
      sIPCCapability;

 private:
  // Number of live SpeechRecognitionIPCActorUserGuards, i.e. of things that
  // need the HWInference process: a live SpeechRecognition object, a session,
  // or a static call in flight.
  static int32_t sIPCActorUsers MOZ_GUARDED_BY(sMainThreadCapability);
  // Armed when sIPCActorUsers hits zero, cancelled by the next acquisition, so
  // the connection survives a brief gap between users. See
  // media.webspeech.recognition.idle_shutdown_grace_ms.
  static StaticRefPtr<nsITimer> sIdleCloseTimer
      MOZ_GUARDED_BY(sMainThreadCapability);
  // Upgraded to a RefPtr on the main thread only; see DispatchToParentIfAlive.
  WeakPtr<SpeechRecognition> mParent MOZ_GUARDED_BY(sMainThreadCapability);

  RefPtr<AudioStreamTrack> mTrack MOZ_GUARDED_BY(sMainThreadCapability);
  RefPtr<SpeechTrackListener> mTrackListener
      MOZ_GUARDED_BY(sMainThreadCapability);

  // Read on the IPC thread, when initializing a session.
  const nsCString mLanguage;
  const nsTArray<nsString> mPhrases;
  // Written by the graph thread (DataCallback), read by the resampling thread
  // (ProcessAudioChunk). There is no capability for the graph thread, hence no
  // annotation here.
  const UniquePtr<SPSCQueue<float>> mRingBuffer;
  // Created by Create() and shut down by Shutdown(), both on the main thread,
  // and touched by nobody else - the resampling thread reaches itself through
  // mResamplingCapability. Sole owner of the thread's lifetime.
  nsCOMPtr<nsIThread> mResamplingThread MOZ_GUARDED_BY(sMainThreadCapability);
  // Guards the members only the resampling thread may touch.
  const mozilla::EventTargetCapability<nsIThread> mResamplingCapability;
  // Graph-thread downmixing scratch buffer, freed with the backend after
  // DetachFromTrack() has stopped the callbacks.
  nsTArray<AudioDataValue> mMonoBuffer;
  const uint32_t mGraphRate;
  // Graph-thread only, number of frames that couldn't be pushed into
  // mRingBuffer and has been dropped.
  uint64_t mFramesDropped = 0;
  // Most recent (track-time position, wall-clock time) reference, published
  // by DataCallback() on the graph thread and consumed on the resampling
  // thread.
  TripleBuffer<SampleTimeReference> mLastTrackPositionRef;
  // Resampling thread only: cumulative raw frames dequeued from mRingBuffer.
  TrackTime mFramesDequeuedTotal MOZ_GUARDED_BY(mResamplingCapability) = 0;
  // Whether Shutdown() has already run, so it runs exactly once.
  bool mStopped MOZ_GUARDED_BY(sMainThreadCapability) = false;
  // Whether a soundstart was fired without its soundend. The main thread owns
  // the soundstart/soundend pair, the resampling thread only reports the
  // transitions it sees, so that teardown - which happens here - is what
  // decides how the session ends.
  bool mCurrentlyAudible MOZ_GUARDED_BY(sMainThreadCapability) = false;
  // Whether a speechstart was fired without its speechend, owned by the main
  // thread for the same reason as mCurrentlyAudible.
  bool mSpeechDetected MOZ_GUARDED_BY(sMainThreadCapability) = false;
  // Last audibility the monitor reported, to detect transitions.
  bool mAudible MOZ_GUARDED_BY(mResamplingCapability) = false;
  bool mAudioStartDispatched MOZ_GUARDED_BY(mResamplingCapability) = false;
  // Set by a task Shutdown() dispatches to the resampling thread, and never
  // cleared, so the loop stops and cannot be restarted by a session init that
  // completes after teardown. This is the only thing that stops the loop: the
  // audio path never takes a lock or reads an atomic to decide whether to
  // continue.
  bool mAudioProcessingStopped MOZ_GUARDED_BY(mResamplingCapability) = false;
  // Created by Start() on main, before the resampling thread that uses it.
  UniquePtr<mozilla::AudibilityMonitor> mAudibilityMonitor;
  // The current session's actor, and whether teardown has been requested.
  // mStopRequested is how Shutdown() on main tells the IPC thread, which can be
  // in the middle of opening a session, that there is no longer a session to
  // open one for. Publishing it and taking mChild away happen together under
  // this lock, so exactly one of the two sides ends up owning the actor: either
  // the IPC thread stores it and Shutdown() stops it, or the IPC thread sees
  // the flag and closes it itself. See mState in
  // dom/workers/remoteworkers/RemoteWorkerChild.h for the same pattern.
  struct Session {
    RefPtr<hwinference::SpeechRecognitionChild> mChild;
    bool mStopRequested = false;
  };
  DataMutex<Session> mSession{"SpeechRecognitionBackend::mSession"};

  UniquePtr<AudioConverter> mAudioConverter
      MOZ_GUARDED_BY(mResamplingCapability);
};

}  // namespace mozilla::dom

#endif
