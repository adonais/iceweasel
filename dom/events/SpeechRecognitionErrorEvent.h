/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef SpeechRecognitionErrorEvent_h_
#define SpeechRecognitionErrorEvent_h_

#include "mozilla/dom/Event.h"
#include "mozilla/dom/SpeechRecognitionErrorEventBinding.h"

namespace mozilla::dom {

class SpeechRecognitionErrorEvent : public Event {
 public:
  SpeechRecognitionErrorEvent(mozilla::dom::EventTarget* aOwner,
                              nsPresContext* aPresContext, WidgetEvent* aEvent);
  virtual ~SpeechRecognitionErrorEvent();

  static already_AddRefed<SpeechRecognitionErrorEvent> Constructor(
      const GlobalObject& aGlobal, const nsAString& aType,
      const SpeechRecognitionErrorEventInit& aParam);

  virtual JSObject* WrapObjectInternal(
      JSContext* aCx, JS::Handle<JSObject*> aGivenProto) override {
    return mozilla::dom::SpeechRecognitionErrorEvent_Binding::Wrap(aCx, this,
                                                                   aGivenProto);
  }

  void GetMessage(nsAString& aString);

  SpeechRecognitionErrorCode Error() { return mError; }
  // aMessage should be valid UTF-8, but invalid UTF-8 byte sequences are
  // replaced with the REPLACEMENT CHARACTER on conversion to UTF-16.
  void InitSpeechRecognitionError(const nsAString& aType, bool aCanBubble,
                                  bool aCancelable,
                                  SpeechRecognitionErrorCode aError,
                                  const nsACString& aMessage);

 protected:
  SpeechRecognitionErrorCode mError;
  nsCString mMessage;
};

}  // namespace mozilla::dom

#endif  // SpeechRecognitionErrorEvent_h_
