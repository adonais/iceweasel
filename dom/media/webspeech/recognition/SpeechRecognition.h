/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITION_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITION_H_

#include "DOMMediaStream.h"
#include "SpeechGrammarList.h"
#include "SpeechRecognitionResultList.h"
#include "js/TypeDecls.h"
#include "mozilla/DOMEventTargetHelper.h"
#include "mozilla/Maybe.h"
#include "mozilla/MozPromise.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/WeakPtr.h"
#include "mozilla/dom/BindingDeclarations.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/SpeechRecognitionBinding.h"
#include "mozilla/dom/SpeechRecognitionErrorEventBinding.h"
#include "mozilla/hwinference/HWInferenceTypes.h"
#include "nsCOMPtr.h"
#include "nsProxyRelease.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsWrapperCache.h"

class nsPIDOMWindowInner;

namespace mozilla {

namespace dom {

class Promise;
class SpeechRecognitionBackend;
class SpeechRecognitionPhrase;

#define SPEECH_RECOGNITION_TEST_EVENT_REQUEST_TOPIC \
  "SpeechRecognitionTest:RequestEvent"
#define SPEECH_RECOGNITION_TEST_END_TOPIC "SpeechRecognitionTest:End"

class GlobalObject;
class AudioStreamTrack;
class MediaStreamTrack;
class SpeechTrackListener;

class SpeechRecognitionInstallTransaction final {
 public:
  NS_INLINE_DECL_REFCOUNTING(SpeechRecognitionInstallTransaction)

  static already_AddRefed<SpeechRecognitionInstallTransaction> GetOrCreate(
      nsPIDOMWindowInner* aWindow, const nsTArray<nsCString>& aLanguages,
      Promise* aPromise, bool* aCreated) MOZ_REQUIRES(sMainThreadCapability);

  void Resolve(bool aSuccess);
  const nsTArray<nsCString>& Languages() const { return mLanguages; }

 private:
  SpeechRecognitionInstallTransaction(nsCString&& aKey,
                                      const nsTArray<nsCString>& aLanguages);
  ~SpeechRecognitionInstallTransaction() = default;

  nsCString mKey;
  nsTArray<nsCString> mLanguages;
  nsTArray<RefPtr<Promise>> mPromises;
};

// This implements the SpeechRecognition object in the content process, from the
// Web Speech API: https://webaudio.github.io/web-speech-api/#speechrecognition
class SpeechRecognition final : public DOMEventTargetHelper,
                                public SupportsWeakPtr {
 public:
  MOZ_DECLARE_REFCOUNTED_TYPENAME(SpeechRecognition)

  explicit SpeechRecognition(nsPIDOMWindowInner* aOwnerWindow);

  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(SpeechRecognition,
                                           DOMEventTargetHelper)

  JSObject* WrapObject(JSContext* aCx,
                       JS::Handle<JSObject*> aGivenProto) override;

  void DisconnectFromOwner() override;

  static already_AddRefed<SpeechRecognition> Constructor(
      const GlobalObject& aGlobal, ErrorResult& aRv);

  static already_AddRefed<SpeechRecognition> WebkitSpeechRecognition(
      const GlobalObject& aGlobal, ErrorResult& aRv) {
    return Constructor(aGlobal, aRv);
  }

  already_AddRefed<SpeechGrammarList> Grammars() const;

  void SetGrammars(mozilla::dom::SpeechGrammarList& aArg);

  void GetLang(nsString& aRetVal) const;

  void SetLang(const nsAString& aArg);

  bool GetContinuous(ErrorResult& aRv) const;

  void SetContinuous(bool aArg, ErrorResult& aRv);

  bool InterimResults() const;

  void SetInterimResults(bool aArg);

  uint32_t MaxAlternatives() const;

  void SetMaxAlternatives(uint32_t aArg);

  // New attributes from current spec
  bool ProcessLocally() const;
  void SetProcessLocally(bool aProcessLocally);

  bool UnspokenPunctuation() const;
  void SetUnspokenPunctuation(bool aUnspokenPunctuation);

  // ObservableArray callbacks for phrases
  void OnSetPhrases(SpeechRecognitionPhrase& aPhrase, uint32_t aIndex,
                    ErrorResult& aRv);
  void OnDeletePhrases(SpeechRecognitionPhrase& aPhrase, uint32_t aIndex,
                       ErrorResult& aRv);

  // Static methods from current spec
  static already_AddRefed<Promise> Available(
      const GlobalObject& aGlobal, const SpeechRecognitionOptions& aOptions,
      ErrorResult& aRv);
  static already_AddRefed<Promise> Install(
      const GlobalObject& aGlobal, const SpeechRecognitionOptions& aOptions,
      ErrorResult& aRv);

  // https://webaudio.github.io/web-speech-api/#dom-speechrecognition-start
  // Two overloads per spec: start() (microphone) and start(MediaStreamTrack).
  void Start(CallerType aCallerType, ErrorResult& aRv);
  void Start(MediaStreamTrack& aAudioTrack, CallerType aCallerType,
             ErrorResult& aRv);

  void Stop();

  void Abort();

  IMPL_EVENT_HANDLER(audiostart)
  IMPL_EVENT_HANDLER(soundstart)
  IMPL_EVENT_HANDLER(speechstart)
  IMPL_EVENT_HANDLER(speechend)
  IMPL_EVENT_HANDLER(soundend)
  IMPL_EVENT_HANDLER(audioend)
  IMPL_EVENT_HANDLER(result)
  IMPL_EVENT_HANDLER(nomatch)
  IMPL_EVENT_HANDLER(error)
  IMPL_EVENT_HANDLER(start)
  IMPL_EVENT_HANDLER(end)

  void NotifyTrackAdded(const RefPtr<MediaStreamTrack>& aTrack);

  class TrackListener final : public DOMMediaStream::TrackListener {
   public:
    NS_DECL_ISUPPORTS_INHERITED
    NS_DECL_CYCLE_COLLECTION_CLASS_INHERITED(TrackListener,
                                             DOMMediaStream::TrackListener)
    explicit TrackListener(SpeechRecognition* aSpeechRecognition)
        : mSpeechRecognition(aSpeechRecognition) {}
    void NotifyTrackAdded(const RefPtr<MediaStreamTrack>& aTrack) override {
      mSpeechRecognition->NotifyTrackAdded(aTrack);
    }

   private:
    virtual ~TrackListener() = default;
    RefPtr<SpeechRecognition> mSpeechRecognition;
  };

  // aMessage should be valid UTF-8, but invalid UTF-8 byte sequences are
  // replaced with the REPLACEMENT CHARACTER on conversion to UTF-16.
  void DispatchError(SpeechRecognitionErrorCode aErrorCode,
                     const nsACString& aMessage);
  template <int N>
  void DispatchError(SpeechRecognitionErrorCode aErrorCode,
                     const char (&aMessage)[N]) {
    DispatchError(aErrorCode, nsLiteralCString(aMessage));
  }
  // https://webaudio.github.io/web-speech-api/#start-session-algorithm
  // step 2: "If [[started]] is true and no error event or end event has
  // fired on it, throw an InvalidStateError and abort these steps." If the
  // session was actually started (mStarted), this also tears down the
  // backend and fires "end", so a subsequent start() is allowed again, the
  // same way it is after stop()/abort().
  void DispatchErrorAndEnd(SpeechRecognitionErrorCode aErrorCode,
                           const nsACString& aMessage);
  void DispatchTrustedEventWithTimestamp(const nsAString& aEventName,
                                         TimeStamp aTimeStamp);
  // Backend methods
  void HandleRecognitionResultFromBackend(const nsCString& aTranscript,
                                          bool aIsFinal, float aConfidence,
                                          TimeStamp aEventTime);
  void HandleRecognitionErrorFromBackend(const nsCString& aError);
  // Called once the backend's session is fully over: for stop(), only after
  // the engine's end-of-stream flush and the results it produced. Fires
  // nomatch when the engine finalized nothing, then "end".
  void OnSessionFinished(bool aProducedResult);
  // Called once the backend's session is initialized and ready to receive
  // audio; combined with a track being attached (mTrack), this determines
  // when "start" fires (see MaybeDispatchStart()).
  void NotifyBackendListening();

  // A backend's callbacks are bound to that specific instance and can still
  // be in flight when it's superseded by a newer one (e.g. stop() followed
  // immediately by start()). DispatchToParentIfAlive uses this to drop
  // notifications from a backend that is no longer the current one, rather
  // than misattributing them to whatever session happens to be active by the
  // time the callback reaches the main thread.
  bool IsCurrentBackend(const SpeechRecognitionBackend* aBackend) const {
    return mBackend == aBackend;
  }

 private:
  virtual ~SpeechRecognition();

  NS_IMETHOD StartRecording(RefPtr<AudioStreamTrack>& aDOMStream);

  void Reset();
  void ResetAndEnd();
  // https://webaudio.github.io/web-speech-api/#eventdef-speechrecognition-end
  // "The user agent must raise an end event once the speech service is no
  // longer connected." Posts a task to call ResetAndEnd() rather than firing
  // synchronously, from Stop()/Abort()/DispatchErrorAndEnd(). mBackend is
  // expected to already be cleared by the caller; if a subsequent start()
  // set it again by the time this runs, this stale continuation must not
  // reset the new session's state out from under it.
  //
  // Two of these can be queued for one session: DispatchErrorAndEnd() fires
  // "error" synchronously, so a listener can call abort() - which posts one -
  // before DispatchErrorAndEnd() gets to post its own. The task therefore also
  // checks mStarted, which Reset() clears, so only the first one to run ends
  // the session and "end" fires exactly once.
  void PostResetAndEnd();
  void DispatchNoMatch();
  // What start() settled on, carried across the model-install wait. mTrack is
  // null for the microphone start().
  struct PendingSession {
    RefPtr<AudioStreamTrack> mTrack;
    CallerType mCallerType;
    nsString mLanguage;
    uint32_t mGraphRate = 0;
    nsTArray<nsString> mPhrases;
  };

  // Shared body of the two start() overloads. aAudioTrack is null for the
  // microphone start() and the passed track for start(MediaStreamTrack).
  void StartImpl(MediaStreamTrack* aAudioTrack, CallerType aCallerType,
                 ErrorResult& aRv);
  // aResult is Nothing() when the install request never reached the
  // HWInference service, which means local recognition is unavailable rather
  // than that a download failed.
  void OnModelInstalled(uint32_t aGeneration,
                        Maybe<hwinference::ModelInstallResult> aResult,
                        PendingSession&& aSession);
  // Second half of start(): creates the backend and attaches the audio.
  void BeginSession(PendingSession&& aSession);
  // Fires "start" once the system is successfully listening: the backend
  // session is initialized and a live track is attached (mTrack).
  void MaybeDispatchStart();

  RefPtr<DOMMediaStream> mStream;
  RefPtr<AudioStreamTrack> mTrack;
  bool mTrackIsOwned = false;
  RefPtr<SpeechTrackListener> mSpeechListener;

  // Tracks if recognition has been started (spec's [[started]] internal slot)
  bool mStarted;
  // Set by stop() until the backend reports the session finished, so a second
  // stop() in that window is ignored per spec.
  bool mStopping = false;
  // Set by abort() until "end" has fired, so a second abort() in that window is
  // ignored per spec.
  bool mAborting = false;
  // Whether the backend has reported its session as initialized. See
  // MaybeDispatchStart().
  bool mBackendListening = false;
  // Whether "start" has already been dispatched for the current session.
  bool mStartDispatched = false;
  // Set while start() waits for the on-device model to be downloaded:
  // [[started]] is true, but there is no backend and no event has fired yet.
  bool mAwaitingModelInstall = false;
  // Incremented by every start(), so OnModelInstalled() can tell it is no
  // longer about the current session: stop()/abort() during the wait ends the
  // session, and a start() from the "end" handler begins a new one.
  uint32_t mSessionGeneration = 0;

  nsString mLang;

  RefPtr<SpeechGrammarList> mSpeechGrammarList;

  bool mContinuous;
  bool mInterimResults;
  uint32_t mMaxAlternatives;
  bool mProcessLocally = false;
  // Per spec, defaults to false. The value is stored for round-tripping but
  // does not change recognition behaviour: Gecko's recognizer is LLM-based
  // and only ever infers punctuation that was not spoken.
  bool mUnspokenPunctuation = false;
  // The backend gets these at Start() time; spec is unclear on dynamic updates
  // Probably better as a SimpleMap or something so it's sparse
  // https://github.com/WebAudio/web-speech-api/issues/172
  nsTArray<RefPtr<SpeechRecognitionPhrase>> mPhrases;
  nsTArray<RefPtr<SpeechRecognitionResult>> mRecognitionResults;
  RefPtr<TrackListener> mListener;
  // Backend instance for handling audio processing
  RefPtr<SpeechRecognitionBackend> mBackend;

  static nsTHashSet<nsCString> sDownloadingLanguages
      MOZ_GUARDED_BY(sMainThreadCapability);
  // One entry per language currently in sDownloadingLanguages, so a second
  // install() call for the same language can wait on the in-flight download
  // instead of starting a redundant one. See GetDownloadCompletionPromise().
  static nsTHashMap<nsCStringHashKey,
                    RefPtr<GenericNonExclusivePromise::Private>>
      sLanguageDownloadPromises MOZ_GUARDED_BY(sMainThreadCapability);
};

}  // namespace dom

inline nsISupports* ToSupports(dom::SpeechRecognition* aRec) {
  return ToSupports(static_cast<DOMEventTargetHelper*>(aRec));
}

}  // namespace mozilla

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITION_H_
