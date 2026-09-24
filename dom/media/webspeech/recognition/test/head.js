"use strict";

const DEFAULT_AUDIO_SAMPLE_FILE = "hello.ogg";
const SPEECH_RECOGNITION_TEST_REQUEST_EVENT_TOPIC =
  "SpeechRecognitionTest:RequestEvent";
const SPEECH_RECOGNITION_TEST_END_TOPIC = "SpeechRecognitionTest:End";

// Catches setup mistakes (e.g. pipewire not running) where resume() never
// settles: bound the wait and fail fast instead of hanging.
async function createResumedAudioContext({ timeoutMs = 5000 } = {}) {
  const ctx = new AudioContext();
  await Promise.race([
    ctx.resume(),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `AudioContext.resume() did not settle within ${timeoutMs}ms ` +
                `(state=${ctx.state}); likely a stuck headless audio backend.`
            )
          ),
        timeoutMs
      )
    ),
  ]);
  if (ctx.state !== "running") {
    throw new Error(`AudioContext failed to resume: state=${ctx.state}`);
  }
  return ctx;
}

async function ensureModelInstalled(aLangs) {
  const availability = await SpeechRecognition.available({
    langs: aLangs,
    processLocally: true,
  });
  if (availability === "available") {
    return true;
  }
  SpecialPowers.wrap(document).notifyUserGestureActivation();
  return SpeechRecognition.install({ langs: aLangs, processLocally: true });
}

// Peak and mean FFT magnitude over the current frame: the cheap way to tell
// "is there actually sound on this track" from "the track merely exists".
function AudioStreamAnalyser(ac, stream) {
  this.audioContext = ac;
  this.analyser = this.audioContext.createAnalyser();
  this.analyser.smoothingTimeConstant = 0.2;
  this.analyser.fftSize = 1024;
  this.source = this.audioContext.createMediaStreamSource(stream);
  this.source.connect(this.analyser);
  this.data = new Uint8Array(this.analyser.frequencyBinCount);
}
AudioStreamAnalyser.prototype.getByteFrequencyData = function () {
  this.analyser.getByteFrequencyData(this.data);
  return this.data;
};
AudioStreamAnalyser.prototype.levels = function () {
  const d = this.getByteFrequencyData();
  let max = 0,
    sum = 0;
  for (let i = 0; i < d.length; i++) {
    sum += d[i];
    if (d[i] > max) {
      max = d[i];
    }
  }
  return { max, avg: +(sum / d.length).toFixed(1) };
};
AudioStreamAnalyser.prototype.disconnect = function () {
  this.source.disconnect();
};

// Throws if no audio is flowing into the track within timeoutMs.
async function waitForAudioFlowing(
  ctx,
  stream,
  { timeoutMs = 3000, pollMs = 100 } = {}
) {
  const analyser = new AudioStreamAnalyser(ctx, stream);
  try {
    const start = performance.now();
    let maxLevel = 0;
    while (performance.now() - start < timeoutMs) {
      const lvl = analyser.levels();
      if (lvl.max > maxLevel) {
        maxLevel = lvl.max;
      }
      if (maxLevel > 0) {
        return maxLevel;
      }
      await new Promise(r => setTimeout(r, pollMs));
    }
    throw new Error(
      `No audio flowing into track after ${timeoutMs}ms (ctx.state=${ctx.state})`
    );
  } finally {
    analyser.disconnect();
  }
}

// Creates an <audio src=filename> under #content and resolves once it can
// play through fully. `configureAudioElement`, if given, runs before load()
// so callers can set attributes like `id`/`controls`. Shared by the parakeet
// e2e and multilingual tests.
async function loadTestAudio(filename, configureAudioElement) {
  const audio = document.createElement("audio");
  audio.src = filename;
  if (configureAudioElement) {
    configureAudioElement(audio);
  }
  document.getElementById("content").appendChild(audio);
  await new Promise((resolve, reject) => {
    audio.addEventListener("canplaythrough", resolve, { once: true });
    audio.addEventListener(
      "error",
      () => reject(new Error("Audio load failed")),
      {
        once: true,
      }
    );
    audio.load();
  });
  return audio;
}

// Runs one SpeechRecognition session against `track` for `durationMs`,
// logging every lifecycle event plus a periodic heartbeat via `diag`, and
// resolves with the recognized transcript and event/result counts. Shared by
// the parakeet e2e and multilingual tests, which only differ in audio-graph
// setup and language selection (done by the caller before calling this).
async function runSpeechRecognitionSession(
  sr,
  track,
  { ctx, audio, analyser, durationMs, diag }
) {
  let audiostartFired = false,
    soundstartFired = false,
    speechstartFired = false;
  sr.onaudiostart = () => {
    audiostartFired = true;
    diag("event: audiostart");
  };
  sr.onsoundstart = () => {
    soundstartFired = true;
    diag("event: soundstart");
  };
  sr.onspeechstart = () => {
    speechstartFired = true;
    diag("event: speechstart");
  };
  sr.onspeechend = () => diag("event: speechend");
  sr.onsoundend = () => diag("event: soundend");
  sr.onaudioend = () => diag("event: audioend");
  sr.onnomatch = () => diag("event: nomatch");

  let previousResults = null,
    finalCount = 0,
    interimCount = 0,
    statusTimer = null;
  try {
    const transcript = await new Promise((resolve, reject) => {
      let text = "";
      sr.onresult = e => {
        is(
          e.resultIndex,
          finalCount,
          "resultIndex points at the newly appended result"
        );
        is(
          e.results.length,
          finalCount + 1,
          "results retains all previous final results"
        );
        if (previousResults) {
          isnot(
            e.results,
            previousResults,
            "each event receives a new result list"
          );
          is(
            previousResults.length,
            finalCount,
            "a previous event's result list remains unchanged"
          );
          ok(
            Array.from(previousResults).every(
              (result, i) => result === e.results[i]
            ),
            "unchanged results retain their identity"
          );
        }
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            finalCount++;
            const alt = e.results[i][0];
            const confPart =
              typeof alt.confidence === "number"
                ? ` (conf=${alt.confidence})`
                : "";
            text += " " + alt.transcript;
            diag(`final result #${finalCount}: "${alt.transcript}"${confPart}`);
          } else {
            interimCount++;
          }
        }
        previousResults = e.results;
        document.getElementById("rec-text").textContent = text.trim();
      };
      sr.onerror = e => {
        diag(`event: ERROR error="${e.error}" message="${e.message}"`);
        reject(new Error(e.error));
      };
      sr.onstart = () => diag("event: start");
      sr.onend = () => {
        diag("event: end");
        resolve(text.trim());
      };

      diag("calling sr.start(track)");
      sr.start(track);
      diag(`listening for ${durationMs / 1000}s...`);

      statusTimer = setInterval(() => {
        const lvl = analyser.levels();
        diag(
          `status: ctx=${ctx.state} curTime=${audio.currentTime.toFixed(1)} ` +
            `level(max=${lvl.max}) finals=${finalCount} interims=${interimCount}`
        );
      }, 5000);

      setTimeout(() => {
        diag("stopping recognition");
        sr.stop();
      }, durationMs);
    });
    return {
      transcript,
      finalCount,
      interimCount,
      audiostartFired,
      soundstartFired,
      speechstartFired,
    };
  } finally {
    clearInterval(statusTimer);
  }
}

var errorCodes = {
  NO_SPEECH: "no-speech",
  ABORTED: "aborted",
  AUDIO_CAPTURE: "audio-capture",
  NETWORK: "network",
  NOT_ALLOWED: "not-allowed",
  SERVICE_NOT_ALLOWED: "service-not-allowed",
  BAD_GRAMMAR: "bad-grammar",
  LANGUAGE_NOT_SUPPORTED: "language-not-supported",
};

var Services = SpecialPowers.Services;

function EventManager(sr) {
  var self = this;
  var nEventsExpected = 0;
  self.eventsReceived = [];

  var allEvents = [
    "audiostart",
    "soundstart",
    "speechstart",
    "speechend",
    "soundend",
    "audioend",
    "result",
    "nomatch",
    "error",
    "start",
    "end",
  ];

  var eventDependencies = {
    speechend: "speechstart",
    soundend: "soundstart",
    audioend: "audiostart",
  };

  var isDone = false;

  // set up grammar
  var sgl = new SpeechGrammarList();
  sgl.addFromString("#JSGF V1.0; grammar test; public <simple> = hello ;", 1);
  sr.grammars = sgl;

  // AUDIO_DATA events are asynchronous,
  // so we queue events requested while they are being
  // issued to make them seem synchronous
  var isSendingAudioData = false;
  var queuedEventRequests = [];

  // register default handlers
  for (var i = 0; i < allEvents.length; i++) {
    (function (eventName) {
      sr["on" + eventName] = function (evt) {
        var message = "unexpected event: " + eventName;
        if (eventName == "error") {
          message += " -- " + evt.message;
        }

        ok(false, message);
        if (self.doneFunc && !isDone) {
          isDone = true;
          self.doneFunc();
        }
      };
    })(allEvents[i]);
  }

  self.expect = function EventManager_expect(eventName, cb) {
    nEventsExpected++;

    sr["on" + eventName] = function (evt) {
      self.eventsReceived.push(eventName);
      ok(true, "received event " + eventName);

      var dep = eventDependencies[eventName];
      if (dep) {
        ok(
          self.eventsReceived.includes(dep),
          eventName + " must come after " + dep
        );
      }

      cb && cb(evt, sr);
      if (
        self.doneFunc &&
        !isDone &&
        nEventsExpected === self.eventsReceived.length
      ) {
        isDone = true;
        self.doneFunc();
      }
    };
  };

  self.start = function EventManager_start() {
    isSendingAudioData = true;
    var audioTag = document.createElement("audio");
    audioTag.src = self.audioSampleFile;

    var stream = audioTag.mozCaptureStreamUntilEnded();
    audioTag.addEventListener("ended", function () {
      info("Sample stream ended, requesting queued events");
      isSendingAudioData = false;
      while (queuedEventRequests.length) {
        self.requestFSMEvent(queuedEventRequests.shift());
      }
    });

    audioTag.play();
    sr.start(stream);
  };

  self.requestFSMEvent = function EventManager_requestFSMEvent(eventName) {
    if (isSendingAudioData) {
      info(
        "Queuing event " + eventName + " until we're done sending audio data"
      );
      queuedEventRequests.push(eventName);
      return;
    }

    info("requesting " + eventName);
    Services.obs.notifyObservers(
      null,
      SPEECH_RECOGNITION_TEST_REQUEST_EVENT_TOPIC,
      eventName
    );
  };

  self.requestTestEnd = function EventManager_requestTestEnd() {
    Services.obs.notifyObservers(null, SPEECH_RECOGNITION_TEST_END_TOPIC);
  };
}

function buildResultCallback(transcript) {
  return function (evt) {
    is(evt.results[0][0].transcript, transcript, "expect correct transcript");
  };
}

function buildErrorCallback(errcode) {
  return function (err) {
    is(err.error, errcode, "expect correct error code");
  };
}

function performTest(options) {
  var prefs = options.prefs;

  prefs.unshift(
    ["media.webspeech.recognition.enable", true],
    ["media.webspeech.test.enable", true]
  );

  SpecialPowers.pushPrefEnv({ set: prefs }, function () {
    var sr;
    if (!options.webkit) {
      sr = new SpeechRecognition();
    } else {
      sr = new webkitSpeechRecognition();
      var grammar = new webkitSpeechGrammar();
      var speechrecognitionlist = new webkitSpeechGrammarList();
      speechrecognitionlist.addFromString("", 1);
      sr.grammars = speechrecognitionlist;
    }
    var em = new EventManager(sr);

    for (var eventName in options.expectedEvents) {
      var cb = options.expectedEvents[eventName];
      em.expect(eventName, cb);
    }

    em.doneFunc = function () {
      em.requestTestEnd();
      if (options.doneFunc) {
        options.doneFunc();
      }
    };

    em.audioSampleFile = DEFAULT_AUDIO_SAMPLE_FILE;
    if (options.audioSampleFile) {
      em.audioSampleFile = options.audioSampleFile;
    }

    em.start();

    for (var i = 0; i < options.eventsToRequest.length; i++) {
      em.requestFSMEvent(options.eventsToRequest[i]);
    }
  });
}
