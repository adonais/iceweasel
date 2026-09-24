/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://webaudio.github.io/web-speech-api/#speechrecognitionerrorevent
 */

enum SpeechRecognitionErrorCode {
  "no-speech",
  "aborted",
  "audio-capture",
  "network",
  "not-allowed",
  "service-not-allowed",
  "bad-grammar",
  "language-not-supported",
  "phrases-not-supported"
};

[SecureContext,
 Pref="media.webspeech.recognition.enable",
 Exposed=Window]
interface SpeechRecognitionErrorEvent : Event
{
  constructor(DOMString type,
              SpeechRecognitionErrorEventInit eventInitDict);

  readonly attribute SpeechRecognitionErrorCode error;
  readonly attribute DOMString message;
};

dictionary SpeechRecognitionErrorEventInit : EventInit
{
  required SpeechRecognitionErrorCode error;
  DOMString message = "";
};
