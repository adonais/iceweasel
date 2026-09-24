/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SpeechRecognitionErrorEvent.h"

namespace mozilla::dom {

SpeechRecognitionErrorEvent::SpeechRecognitionErrorEvent(
    mozilla::dom::EventTarget* aOwner, nsPresContext* aPresContext,
    WidgetEvent* aEvent)
    : Event(aOwner, aPresContext, aEvent), mError() {}

SpeechRecognitionErrorEvent::~SpeechRecognitionErrorEvent() = default;

already_AddRefed<SpeechRecognitionErrorEvent>
SpeechRecognitionErrorEvent::Constructor(
    const GlobalObject& aGlobal, const nsAString& aType,
    const SpeechRecognitionErrorEventInit& aParam) {
  nsCOMPtr<mozilla::dom::EventTarget> t =
      do_QueryInterface(aGlobal.GetAsSupports());
  RefPtr<SpeechRecognitionErrorEvent> e =
      new SpeechRecognitionErrorEvent(t, nullptr, nullptr);
  bool trusted = e->Init(t);
  e->InitSpeechRecognitionError(aType, aParam.mBubbles, aParam.mCancelable,
                                aParam.mError,
                                NS_ConvertUTF16toUTF8(aParam.mMessage));
  e->SetTrusted(trusted);
  e->SetComposed(aParam.mComposed);
  return e.forget();
}

void SpeechRecognitionErrorEvent::GetMessage(nsAString& aString) {
  CopyUTF8toUTF16(mMessage, aString);
}

void SpeechRecognitionErrorEvent::InitSpeechRecognitionError(
    const nsAString& aType, bool aCanBubble, bool aCancelable,
    SpeechRecognitionErrorCode aError, const nsACString& aMessage) {
  Event::InitEvent(aType, aCanBubble, aCancelable);
  mError = aError;
  mMessage = aMessage;
}

}  // namespace mozilla::dom
