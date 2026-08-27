/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SpeechSynthesisChild.h"

#include "AutoplayPolicy.h"
#include "mozilla/dom/BrowsingContext.h"
#include "mozilla/dom/ContentMediaController.h"
#include "mozilla/dom/MediaControlUtils.h"
#include "mozilla/glean/DomMediaMetrics.h"
#include "nsPIDOMWindowInlines.h"
#include "nsSynthVoiceRegistry.h"
#include "nsXULAppAPI.h"

#define MEDIA_CONTROL_LOG(msg, ...) \
  MOZ_LOG_FMT(gMediaControlLog, LogLevel::Debug, msg, ##__VA_ARGS__)

namespace mozilla::dom {

// Registers the speech task as an uncontrollable receiver while it is
// speaking, reports audibility, and reacts to media control keys. The owning
// SpeechTaskChild outlives this listener (Shutdown() runs from
// DispatchEndImpl/DispatchErrorImpl before the task is released), so the
// back-reference is always valid until Shutdown.
//
// Note that on Linux/speechd and Android, nsISpeechService::OnPause is a
// no-op, so MediaControlKey::Stop will not actually silence speech on those
// platforms (tracked by Bug 2038329 / Bug 1238538). Audibility is still
// reported so the tab sound indicator and the audiblechange event remain
// accurate.
class MediaSharedKeysListener final : public ContentMediaControlKeyReceiver {
 public:
  NS_INLINE_DECL_REFCOUNTING(MediaSharedKeysListener, override)

  // The W3C Audio Session API does not cover Web Speech / SpeechSynthesis;
  // see https://github.com/w3c/audio-session/issues/28. We tag utterances as
  // "transient" as an interim choice — short-lived TTS briefly takes focus
  // and may duck concurrent audio for the utterance's duration. Revisit and
  // align with the spec once it adds Web Speech support.
  static constexpr AudioSessionType kSessionType = AudioSessionType::Transient;

  explicit MediaSharedKeysListener(SpeechTaskChild& aTask) : mTask(aTask) {
    MOZ_ASSERT(XRE_IsContentProcess());
    MOZ_ASSERT(NS_IsMainThread());
  }

  void Start(nsPIDOMWindowInner* aWindow) {
    MOZ_ASSERT(NS_IsMainThread());
    MOZ_ASSERT(!mAgent, "Start() must not be retried");
    BrowsingContext* bc = aWindow ? aWindow->GetBrowsingContext() : nullptr;
    if (!bc) {
      MEDIA_CONTROL_LOG(
          "MediaSharedKeysListener {} Start: no browsing context, skip",
          fmt::ptr(this));
      return;
    }
    mAgent = ContentMediaAgent::Get(bc);
    if (!mAgent) {
      MEDIA_CONTROL_LOG(
          "MediaSharedKeysListener {} Start: no ContentMediaAgent, skip",
          fmt::ptr(this));
      return;
    }
    mBrowsingContextId = bc->Id();
    mAgent->AddReceiver(this, ControlType::eUncontrollable);
    // Speech is audible from the moment the platform starts speaking until
    // DispatchEnd; there is no separate audibility detection.
    mAgent->NotifyMediaAudibleChanged(
        mBrowsingContextId, MediaAudibleState::eAudible,
        ControlType::eUncontrollable, kSessionType);
    mIsAudible = true;
    MEDIA_CONTROL_LOG(
        "MediaSharedKeysListener {} Start: registered as uncontrollable "
        "receiver and reported audible in BC {}",
        fmt::ptr(this), mBrowsingContextId);
  }

  void Shutdown() {
    MOZ_ASSERT(NS_IsMainThread());
    MOZ_ASSERT(!mShutdown, "Shutdown() must not be retried");
    mShutdown = true;
    if (!mAgent) {
      // Start() bailed out (no BC or no agent at the time); nothing to undo.
      MEDIA_CONTROL_LOG(
          "MediaSharedKeysListener {} Shutdown: never registered, skip",
          fmt::ptr(this));
      return;
    }
    if (mIsAudible) {
      mAgent->NotifyMediaAudibleChanged(
          mBrowsingContextId, MediaAudibleState::eInaudible,
          ControlType::eUncontrollable, kSessionType);
      mIsAudible = false;
    }
    mAgent->RemoveReceiver(this, ControlType::eUncontrollable);
    mAgent = nullptr;
    MEDIA_CONTROL_LOG(
        "MediaSharedKeysListener {} Shutdown: unregistered from BC {}",
        fmt::ptr(this), mBrowsingContextId);
  }

  bool IsPlaying() const override { return mTask.IsSpeaking(); }

  void HandleMediaKey(MediaControlKey aKey,
                      const MediaControlActionParams& aParams) override {
    MOZ_ASSERT(NS_IsMainThread());
    MOZ_ASSERT(!mShutdown, "HandleMediaKey must not be called after Shutdown");
    MEDIA_CONTROL_LOG("MediaSharedKeysListener {} HandleMediaKey '{}'",
                      fmt::ptr(this), GetEnumString(aKey).get());
    if (aKey == MediaControlKey::Stop) {
      mTask.Pause();
    }
    // TODO: implement Setvolume/Mute/Unmute for Web Speech.
  }

  // The interrupt only pauses an utterance that is actively speaking and not
  // already paused; the task remembers that the interruption owns the pause and
  // ResumeFromMediaControl revives only that one, so a page-initiated pause
  // issued while interrupted is never overridden when the interrupt ends.
  void SuspendForInterrupt() override {
    MOZ_ASSERT(NS_IsMainThread());
    const bool willPause = mTask.IsSpeaking() && !mTask.IsPaused();
    MEDIA_CONTROL_LOG(
        "MediaSharedKeysListener {} SuspendForInterrupt in BC {}, pause={}",
        fmt::ptr(this), mBrowsingContextId, willPause);
    mTask.PauseFromMediaControl();
  }
  void ResumeFromInterrupt() override {
    MOZ_ASSERT(NS_IsMainThread());
    MEDIA_CONTROL_LOG("MediaSharedKeysListener {} ResumeFromInterrupt in BC {}",
                      fmt::ptr(this), mBrowsingContextId);
    mTask.ResumeFromMediaControl();
  }

 private:
  ~MediaSharedKeysListener() = default;

  SpeechTaskChild& mTask;
  RefPtr<ContentMediaAgent> mAgent;
  uint64_t mBrowsingContextId = 0;
  bool mIsAudible = false;
  bool mShutdown = false;
};

SpeechSynthesisChild::SpeechSynthesisChild() {
  MOZ_COUNT_CTOR(SpeechSynthesisChild);
}

SpeechSynthesisChild::~SpeechSynthesisChild() {
  MOZ_COUNT_DTOR(SpeechSynthesisChild);
}

mozilla::ipc::IPCResult SpeechSynthesisChild::RecvInitialVoicesAndState(
    nsTArray<RemoteVoice>&& aVoices, nsTArray<nsString>&& aDefaults,
    const bool& aIsSpeaking) {
  nsSynthVoiceRegistry::RecvInitialVoicesAndState(aVoices, aDefaults,
                                                  aIsSpeaking);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisChild::RecvVoiceAdded(
    const RemoteVoice& aVoice) {
  nsSynthVoiceRegistry::RecvAddVoice(aVoice);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisChild::RecvVoiceRemoved(
    const nsAString& aUri) {
  nsSynthVoiceRegistry::RecvRemoveVoice(aUri);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisChild::RecvSetDefaultVoice(
    const nsAString& aUri, const bool& aIsDefault) {
  nsSynthVoiceRegistry::RecvSetDefaultVoice(aUri, aIsDefault);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisChild::RecvIsSpeakingChanged(
    const bool& aIsSpeaking) {
  nsSynthVoiceRegistry::RecvIsSpeakingChanged(aIsSpeaking);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisChild::RecvNotifyVoicesChanged() {
  nsSynthVoiceRegistry::RecvNotifyVoicesChanged();
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisChild::RecvNotifyVoicesError(
    const nsAString& aError) {
  nsSynthVoiceRegistry::RecvNotifyVoicesError(aError);
  return IPC_OK();
}

PSpeechSynthesisRequestChild*
SpeechSynthesisChild::AllocPSpeechSynthesisRequestChild(
    const nsAString& aText, const nsAString& aLang, const nsAString& aUri,
    const float& aVolume, const float& aRate, const float& aPitch,
    const bool& aShouldResistFingerprinting) {
  MOZ_CRASH("Caller is supposed to manually construct a request!");
}

bool SpeechSynthesisChild::DeallocPSpeechSynthesisRequestChild(
    PSpeechSynthesisRequestChild* aActor) {
  delete aActor;
  return true;
}

// SpeechSynthesisRequestChild

SpeechSynthesisRequestChild::SpeechSynthesisRequestChild(SpeechTaskChild* aTask)
    : mTask(aTask) {
  mTask->mActor = this;
  MOZ_COUNT_CTOR(SpeechSynthesisRequestChild);
}

SpeechSynthesisRequestChild::~SpeechSynthesisRequestChild() {
  if (mTask) {
    mTask->mActor = nullptr;
  }
  MOZ_COUNT_DTOR(SpeechSynthesisRequestChild);
}

mozilla::ipc::IPCResult SpeechSynthesisRequestChild::RecvOnStart(
    const nsAString& aUri) {
  mTask->DispatchStartImpl(aUri);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisRequestChild::RecvOnEnd(
    const bool& aIsError, const float& aElapsedTime,
    const uint32_t& aCharIndex) {
  SpeechSynthesisRequestChild* actor = mTask->mActor;
  mTask->mActor = nullptr;

  if (aIsError) {
    mTask->DispatchErrorImpl(aElapsedTime, aCharIndex);
  } else {
    mTask->DispatchEndImpl(aElapsedTime, aCharIndex);
  }

  SpeechSynthesisRequestChild::Send__delete__(actor);

  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisRequestChild::RecvOnPause(
    const float& aElapsedTime, const uint32_t& aCharIndex) {
  mTask->DispatchPauseImpl(aElapsedTime, aCharIndex);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisRequestChild::RecvOnResume(
    const float& aElapsedTime, const uint32_t& aCharIndex) {
  mTask->DispatchResumeImpl(aElapsedTime, aCharIndex);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisRequestChild::RecvOnBoundary(
    const nsAString& aName, const float& aElapsedTime,
    const uint32_t& aCharIndex, const uint32_t& aCharLength,
    const uint8_t& argc) {
  mTask->DispatchBoundaryImpl(aName, aElapsedTime, aCharIndex, aCharLength,
                              argc);
  return IPC_OK();
}

mozilla::ipc::IPCResult SpeechSynthesisRequestChild::RecvOnMark(
    const nsAString& aName, const float& aElapsedTime,
    const uint32_t& aCharIndex) {
  mTask->DispatchMarkImpl(aName, aElapsedTime, aCharIndex);
  return IPC_OK();
}

// SpeechTaskChild

SpeechTaskChild::SpeechTaskChild(SpeechSynthesisUtterance* aUtterance,
                                 bool aShouldResistFingerprinting)
    : nsSpeechTask(aUtterance, aShouldResistFingerprinting), mActor(nullptr) {}

SpeechTaskChild::~SpeechTaskChild() { StopMediaControl(); }

NS_IMETHODIMP
SpeechTaskChild::Setup(nsISpeechTaskCallback* aCallback) {
  MOZ_CRASH("Should never be called from child");
}

void SpeechTaskChild::Pause() {
  // A pause from the page takes over the paused state from an interruption, so
  // a later interruption end must not resume it.
  mPausedByMediaControl = false;
  if (mActor) {
    mActor->SendPause();
  }
}

void SpeechTaskChild::Resume() {
  // The page drives resume from the content process. While the platform has
  // interrupted the tab's audio, block it and keep the interruption owning the
  // pause (mPausedByMediaControl stays set) so the utterance resumes when the
  // interruption ends instead of restarting over the interrupting app. Unlike
  // speak(), this is a deferral rather than a failure, so no error is fired.
  if (mUtterance && media::AutoplayPolicy::IsAudioInterruptedByPlatform(
                        mUtterance->GetOwnerWindow())) {
    MEDIA_CONTROL_LOG(
        "SpeechTaskChild {} Resume() deferred: audio interrupted by platform",
        fmt::ptr(this));
    return;
  }
  if (mActor) {
    mActor->SendResume();
  }
}

void SpeechTaskChild::Cancel() {
  if (mActor) {
    mActor->SendCancel();
  }
}

void SpeechTaskChild::ForceEnd() {
  if (mActor) {
    mActor->SendForceEnd();
  }
}

void SpeechTaskChild::SetAudioOutputVolume(float aVolume) {
  if (mActor) {
    mActor->SendSetAudioOutputVolume(aVolume);
  }
}

void SpeechTaskChild::StartMediaControl() {
  mSharedKeysListener = new MediaSharedKeysListener(*this);
  mSharedKeysListener->Start(mUtterance->GetOwnerWindow());
}

void SpeechTaskChild::StopMediaControl() {
  if (mSharedKeysListener) {
    mSharedKeysListener->Shutdown();
    mSharedKeysListener = nullptr;
  }
}

void SpeechTaskChild::PauseFromMediaControl() {
  const bool willPause = !mPausedByMediaControl && IsSpeaking() && !IsPaused();
  MEDIA_CONTROL_LOG("SpeechTaskChild {} PauseFromMediaControl, pause={}",
                    fmt::ptr(this), willPause);
  if (!willPause) {
    return;
  }
  Pause();
  mPausedByMediaControl = true;
}

void SpeechTaskChild::ResumeFromMediaControl() {
  MEDIA_CONTROL_LOG("SpeechTaskChild {} ResumeFromMediaControl, resume={}",
                    fmt::ptr(this), mPausedByMediaControl);
  if (!mPausedByMediaControl) {
    return;
  }
  mPausedByMediaControl = false;
  glean::media_audio_focus::resume_decision.Get("web_speech"_ns).Add(1);
  // This runs only as the platform interruption ends, by which point the
  // interrupted state that Resume() checks has already been cleared, so its
  // gate is a no-op and reusing the page-resume path is safe.
  Resume();
}

#undef MEDIA_CONTROL_LOG

}  // namespace mozilla::dom
