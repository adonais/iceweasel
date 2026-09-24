/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8  et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONCHILD_H_
#define DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONCHILD_H_

#include <functional>

#include "mozilla/RefPtr.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/hwinference/PSpeechRecognitionChild.h"
#include "nsISupportsImpl.h"

namespace mozilla::dom {
class SpeechRecognitionIPCActorUserGuard;
}

namespace mozilla::hwinference {

class SpeechRecognitionChild final : public PSpeechRecognitionChild {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(SpeechRecognitionChild, override)
  using RecognitionResultCallback =
      std::function<void(const nsCString&, bool, float, TimeStamp)>;
  using RecognitionErrorCallback = std::function<void(const nsCString&)>;
  using SpeechChangeCallback = std::function<void(bool, TimeStamp)>;
  using DestroyedCallback = std::function<void(SpeechRecognitionChild*)>;

  explicit SpeechRecognitionChild(
      already_AddRefed<dom::SpeechRecognitionIPCActorUserGuard>
          aIPCActorUserGuard);

  void SetResultCallback(RecognitionResultCallback&& aCallback);
  void SetErrorCallback(RecognitionErrorCallback&& aCallback);
  void SetSpeechChangeCallback(SpeechChangeCallback&& aCallback);
  // Invoked from ActorDestroy(), including when the actor is torn down from
  // the other side (utility process crash/channel close), so the owner can
  // drop its reference instead of continuing to send through a dead actor.
  void SetDestroyedCallback(DestroyedCallback&& aCallback);
  mozilla::ipc::IPCResult RecvOnRecognitionResult(const nsCString& aTranscript,
                                                  const bool& aIsFinal,
                                                  const float& aConfidence,
                                                  const TimeStamp& aEventTime);
  mozilla::ipc::IPCResult RecvOnRecognitionError(const nsCString& aError);
  mozilla::ipc::IPCResult RecvOnSpeechChange(const bool& aSpeechDetected,
                                             const TimeStamp& aEventTime);

  void ActorDestroy(ActorDestroyReason aReason) override;

 private:
  ~SpeechRecognitionChild();
  RecognitionResultCallback mResultCallback;
  RecognitionErrorCallback mErrorCallback;
  SpeechChangeCallback mSpeechChangeCallback;
  DestroyedCallback mDestroyedCallback;
  RefPtr<dom::SpeechRecognitionIPCActorUserGuard> mIPCActorUserGuard;
};

}  // namespace mozilla::hwinference

#endif  // DOM_MEDIA_WEBSPEECH_RECOGNITION_SPEECHRECOGNITIONCHILD_H_
