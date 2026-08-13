/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_SpeechSynthesisChild_h
#define mozilla_dom_SpeechSynthesisChild_h

#include "mozilla/dom/PSpeechSynthesisChild.h"
#include "mozilla/dom/PSpeechSynthesisRequestChild.h"
#include "nsSpeechTask.h"

namespace mozilla::dom {

class nsSynthVoiceRegistry;
class SpeechSynthesisRequestChild;
class SpeechTaskChild;
class MediaSharedKeysListener;

class SpeechSynthesisChild : public PSpeechSynthesisChild {
  friend class nsSynthVoiceRegistry;
  friend class PSpeechSynthesisChild;

 public:
  NS_INLINE_DECL_REFCOUNTING(SpeechSynthesisChild, override)

  mozilla::ipc::IPCResult RecvInitialVoicesAndState(
      nsTArray<RemoteVoice>&& aVoices, nsTArray<nsString>&& aDefaults,
      const bool& aIsSpeaking);

  mozilla::ipc::IPCResult RecvVoiceAdded(const RemoteVoice& aVoice);

  mozilla::ipc::IPCResult RecvVoiceRemoved(const nsAString& aUri);

  mozilla::ipc::IPCResult RecvSetDefaultVoice(const nsAString& aUri,
                                              const bool& aIsDefault);

  mozilla::ipc::IPCResult RecvIsSpeakingChanged(const bool& aIsSpeaking);

  mozilla::ipc::IPCResult RecvNotifyVoicesChanged();

  mozilla::ipc::IPCResult RecvNotifyVoicesError(const nsAString& aError);

 protected:
  SpeechSynthesisChild();
  virtual ~SpeechSynthesisChild();

  PSpeechSynthesisRequestChild* AllocPSpeechSynthesisRequestChild(
      const nsAString& aLang, const nsAString& aUri, const nsAString& aText,
      const float& aVolume, const float& aPitch, const float& aRate,
      const bool& aShouldResistFingerprinting);
  bool DeallocPSpeechSynthesisRequestChild(
      PSpeechSynthesisRequestChild* aActor);
};

class SpeechSynthesisRequestChild : public PSpeechSynthesisRequestChild {
 public:
  explicit SpeechSynthesisRequestChild(SpeechTaskChild* aTask);
  virtual ~SpeechSynthesisRequestChild();

 protected:
  mozilla::ipc::IPCResult RecvOnStart(const nsAString& aUri) override;

  mozilla::ipc::IPCResult RecvOnEnd(const bool& aIsError,
                                    const float& aElapsedTime,
                                    const uint32_t& aCharIndex) override;

  mozilla::ipc::IPCResult RecvOnPause(const float& aElapsedTime,
                                      const uint32_t& aCharIndex) override;

  mozilla::ipc::IPCResult RecvOnResume(const float& aElapsedTime,
                                       const uint32_t& aCharIndex) override;

  mozilla::ipc::IPCResult RecvOnBoundary(const nsAString& aName,
                                         const float& aElapsedTime,
                                         const uint32_t& aCharIndex,
                                         const uint32_t& aCharLength,
                                         const uint8_t& argc) override;

  mozilla::ipc::IPCResult RecvOnMark(const nsAString& aName,
                                     const float& aElapsedTime,
                                     const uint32_t& aCharIndex) override;

  RefPtr<SpeechTaskChild> mTask;
};

class SpeechTaskChild : public nsSpeechTask {
  friend class SpeechSynthesisRequestChild;

 public:
  explicit SpeechTaskChild(SpeechSynthesisUtterance* aUtterance,
                           bool aShouldResistFingerprinting);

  NS_IMETHOD Setup(nsISpeechTaskCallback* aCallback) override;

  void Pause() override;

  void Resume() override;

  void Cancel() override;

  void ForceEnd() override;

  void SetAudioOutputVolume(float aVolume) override;

  // Pause/resume driven by an audio-focus interruption. ResumeFromMediaControl
  // only resumes a task the interruption itself paused; if the page called
  // pause()/resume() in the meantime it has taken over and we leave it alone.
  void PauseFromMediaControl();
  void ResumeFromMediaControl();

 protected:
  virtual ~SpeechTaskChild();

  void StartMediaControl() override;
  void StopMediaControl() override;

 private:
  SpeechSynthesisRequestChild* mActor;

  // Surfaces a speaking utterance to media control: reports the tab as audible
  // and lets media control pause/resume the speech.
  RefPtr<MediaSharedKeysListener> mSharedKeysListener;

  // Set while an audio-focus interruption owns the paused state; cleared once
  // the page issues its own pause()/resume().
  bool mPausedByMediaControl = false;
};

}  // namespace mozilla::dom

#endif
