/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://webaudio.github.io/web-speech-api/
 */

// https://webaudio.github.io/web-speech-api/#enumdef-speechrecognitionquality
enum SpeechRecognitionQuality {
  "command",
  "dictation",
  "conversation"
};

dictionary SpeechRecognitionOptions {
  required sequence<UTF8String> langs;
  boolean processLocally = false;
  // Not yet plumbed to the backend; accepted for spec conformance.
  SpeechRecognitionQuality quality = "command";
};

enum AvailabilityStatus {
  "unavailable",
  "downloadable",
  "downloading",
  "available"
};

[SecureContext,
 Pref="media.webspeech.recognition.enable",
 LegacyFactoryFunction=webkitSpeechRecognition,
 Exposed=Window]
interface SpeechRecognition : EventTarget {
    [Throws]
    constructor();

    // recognition parameters
    attribute SpeechGrammarList grammars;
    attribute DOMString lang;
    [Throws]
    attribute boolean continuous;
    attribute boolean interimResults;
    attribute boolean unspokenPunctuation;
    attribute unsigned long maxAlternatives;

    attribute boolean processLocally;
    attribute ObservableArray<SpeechRecognitionPhrase> phrases;

    // methods to drive the speech interaction
    [Throws, NeedsCallerType]
    undefined start();
    [Throws, NeedsCallerType]
    undefined start(MediaStreamTrack audioTrack);
    undefined stop();
    undefined abort();

    [NewObject, Throws]
    static Promise<AvailabilityStatus> available(SpeechRecognitionOptions options);
    [NewObject, Throws]
    static Promise<boolean> install(SpeechRecognitionOptions options);

    // event methods
    attribute EventHandler onaudiostart;
    attribute EventHandler onsoundstart;
    attribute EventHandler onspeechstart;
    attribute EventHandler onspeechend;
    attribute EventHandler onsoundend;
    attribute EventHandler onaudioend;
    attribute EventHandler onresult;
    attribute EventHandler onnomatch;
    attribute EventHandler onerror;
    attribute EventHandler onstart;
    attribute EventHandler onend;
};
