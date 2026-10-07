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

// Test-only performance counters for a recognition session, in milliseconds.
// A duration stays 0 until the point it measures has been reached.
dictionary SpeechRecognitionPerfStats {
  // From a successful start() to the engine being ready to consume audio: the
  // HWInference process starting up, the model being retrieved and loaded, and
  // the engine's own session setup.
  double engineReadyDuration = 0;
  // From a successful start() to the dispatch of the first result event,
  // interim or final.
  double firstResultDuration = 0;
  // From stop() to the end event, i.e. the engine's end-of-stream flush.
  double finalizationDuration = 0;
  // Audio handed to the model, and the wall clock the model spent on it, over
  // the session. Their ratio is the real-time factor.
  double fedAudioDuration = 0;
  double inferenceDuration = 0;
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
    [Throws, NeedsCallerType, UseCounter]
    undefined start();
    [Throws, NeedsCallerType, UseCounter]
    undefined start(MediaStreamTrack audioTrack);
    undefined stop();
    undefined abort();

    [NewObject, Throws, UseCounter]
    static Promise<AvailabilityStatus> available(SpeechRecognitionOptions options);
    [NewObject, Throws, UseCounter]
    static Promise<boolean> install(SpeechRecognitionOptions options);

    [ChromeOnly, NewObject, Throws]
    Promise<SpeechRecognitionPerfStats> getPerfStats();

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
