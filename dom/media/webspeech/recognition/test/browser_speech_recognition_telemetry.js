/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Instrumentation tests for the media.speech_recognition Glean metrics. The
// metrics are recorded in the content process, so every assertion is preceded
// by a flush of child-process FOG data.

const ORIGIN = "https://example.com";
const PAGE =
  getRootDirectory(gTestPath).replace("chrome://mochitests/content", ORIGIN) +
  "empty.html";

async function flushAndReset() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
}

async function sessionStartedEvents() {
  await Services.fog.testFlushAllChildren();
  return Glean.mediaSpeechRecognition.sessionStarted.testGetValue() ?? [];
}

async function sessionEndedEvents() {
  await Services.fog.testFlushAllChildren();
  return Glean.mediaSpeechRecognition.sessionEnded.testGetValue() ?? [];
}

// Starts a session on a fake microphone track and resolves once "start" has
// fired, leaving the recognition reachable as content._recognition.
function startSession(browser, options = {}) {
  return SpecialPowers.spawn(browser, [options], async opts => {
    const stream = await content.navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const recognition = new content.SpeechRecognition();
    recognition.processLocally = true;
    for (const [key, value] of Object.entries(opts)) {
      recognition[key] = value;
    }
    content.wrappedJSObject._recognition = recognition;
    return new Promise(resolve => {
      recognition.onstart = () => resolve("start");
      recognition.onerror = e => resolve(`error: ${e.error}`);
      recognition.start(stream.getAudioTracks()[0]);
    });
  });
}

// Ends the session started by startSession() with stop() or abort(), and
// resolves once "end" has fired.
async function endSession(browser, method) {
  await SpecialPowers.spawn(browser, [method], name => {
    const recognition = content.wrappedJSObject._recognition;
    return new Promise(resolve => {
      recognition.onend = () => resolve();
      recognition[name]();
    });
  });
  // A closed tab's process only sends session_ended as it exits, too late for
  // the next task.
  await Services.fog.testFlushAllChildren();
}

// Starts a second recognition while the first one still holds the single
// backend session slot, so it fails with a concurrent-session error, and
// resolves once "end" has fired on it. With aStopOnError, stop() is called
// from the error handler, so the session is both erroring and stopping when
// it tears down.
function startConcurrentSession(browser, stopOnError) {
  return SpecialPowers.spawn(browser, [stopOnError], shouldStop => {
    const recognition = new content.SpeechRecognition();
    recognition.processLocally = true;
    return new Promise(resolve => {
      recognition.onerror = () => {
        if (shouldStop) {
          recognition.stop();
        }
      };
      recognition.onend = () => resolve();
      recognition.start();
    });
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["media.webspeech.recognition.enable", true],
      // No network/IndexedDB/downloads, and RecvInit skips model retrieval, so
      // a session can start without a real multi-hundred-MB model.
      ["browser.ml.modelHub.testing", true],
      // start() offers to install the missing model; answer that prompt from
      // media.navigator.permission.disabled instead of waiting for a click.
      ["media.webspeech.recognition.model-download.prompt.testing", true],
      // Fake mic, so start() gets a track without any device or user prompt.
      ["media.navigator.streams.fake", true],
      ["media.navigator.permission.disabled", true],
      // The "discarded" case below needs the navigated-away-from window to be
      // torn down rather than kept alive in the bfcache.
      ["browser.sessionhistory.max_total_viewers", 0],
    ],
  });
});

add_task(async function test_session_started_extras() {
  await flushAndReset();

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    const started = await startSession(browser, { lang: "en-US" });
    is(started, "start", "Recognition session started");

    const events = await sessionStartedEvents();
    is(events.length, 1, "One session_started event");
    const extra = events[0].extra;
    is(extra.lang, "en-US", "lang is the requested language");
    is(extra.lang_source, "attribute", "lang came from the attribute");
    // What ran, as opposed to what was asked for: the English model
    // declares "en", so every en-* request negotiates to that one locale
    // and groups together instead of splintering per requested tag.
    is(extra.model_id, "english", "model_id is the model that ran");
    is(extra.model_locale, "en", "model_locale is the negotiated locale");
    Assert.ok(extra.session_id, "A session_id was recorded");

    // Closing the tab on a live session records a "discarded"
    // session_ended while the window is torn down, which outlives the tab
    // close and would land in the next task's metrics. End it here.
    await endSession(browser, "abort");
  });
});

// A language no model recognizes is rejected before the session reaches
// [[started]], so it records an error but neither session event. init_failure
// is what keeps it visible, and what explains why error and session_ended do
// not add up.
add_task(async function test_unsupported_language_init_failure() {
  await flushAndReset();

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    const started = await startSession(browser, { lang: "zz" });
    is(started, "error: service-not-allowed", "Unsupported language failed");

    await Services.fog.testFlushAllChildren();
    is(
      Glean.mediaSpeechRecognition.initFailure.language_not_supported.testGetValue(),
      1,
      "init_failure[language_not_supported] recorded"
    );
    is(
      Glean.mediaSpeechRecognition.error.service_not_allowed.testGetValue(),
      1,
      "The spec-mandated error code is still the coarse one"
    );
    Assert.deepEqual(
      await sessionStartedEvents(),
      [],
      "No session_started, the session never reached [[started]]"
    );
    Assert.deepEqual(await sessionEndedEvents(), [], "No session_ended either");
  });
});

// With no lang attribute and no document language, start() falls back to the
// user's language, and the source says so rather than crediting the document.
add_task(async function test_session_started_lang_source_user() {
  await flushAndReset();

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    const started = await startSession(browser);
    is(started, "start", "Recognition session started");

    const userLang = await SpecialPowers.spawn(
      browser,
      [],
      () => content.navigator.language
    );
    const events = await sessionStartedEvents();
    is(events.length, 1, "One session_started event");
    is(events[0].extra.lang, userLang, "Effective language is the user's");
    is(events[0].extra.lang_source, "user", "Language came from the user");

    await endSession(browser, "abort");
  });
});

// Every way a started session can end, with the session_ended events each one
// is expected to record, in order, as [outcome, error_code] pairs. Each case
// runs on top of a session already started by startSession(), and must leave
// no session running behind it.
const SESSION_END_CASES = [
  {
    // stop() asks the engine to flush, so the outcome reflects whether
    // anything came back rather than being an abort.
    name: "stop()",
    expected: [["stopped", ""]],
    run: browser => endSession(browser, "stop"),
  },
  {
    // abort() is its own outcome: no result is flushed and no nomatch fired.
    name: "abort()",
    expected: [["aborted", ""]],
    run: browser => endSession(browser, "abort"),
  },
  {
    name: "an error event",
    expected: [
      ["error", "service_not_allowed"],
      ["aborted", ""],
    ],
    run: async browser => {
      await startConcurrentSession(browser, false);
      await endSession(browser, "abort");
    },
  },
  {
    // An error is what ended the session even though stop() was also called,
    // so the outcome must not be "stopped".
    name: "stop() on an erroring session",
    expected: [
      ["error", "service_not_allowed"],
      ["aborted", ""],
    ],
    run: async browser => {
      await startConcurrentSession(browser, true);
      await endSession(browser, "abort");
    },
  },
  {
    // Neither stopped nor aborted: the owning window went away mid-session.
    name: "navigating away",
    expected: [["discarded", ""]],
    run: async browser => {
      const url = `${PAGE}?navigated`;
      const loaded = BrowserTestUtils.browserLoaded(browser, false, url);
      BrowserTestUtils.startLoadingURIString(browser, url);
      await loaded;
      // The discarded session_ended is recorded as the old window is torn
      // down, which the load does not wait for.
      await TestUtils.waitForCondition(
        async () => (await sessionEndedEvents()).length == 1,
        "session_ended recorded for the discarded session"
      );
    },
  },
];

add_task(async function test_session_ended() {
  for (const { name, expected, run } of SESSION_END_CASES) {
    await flushAndReset();

    await BrowserTestUtils.withNewTab(PAGE, async browser => {
      is(await startSession(browser), "start", "Recognition session started");
      await run(browser);

      const events = await sessionEndedEvents();
      Assert.deepEqual(
        events.map(event => [event.extra.outcome, event.extra.error_code]),
        expected,
        `Session ended by ${name}`
      );
      for (const event of events) {
        Assert.ok("duration" in event.extra, "A session duration was recorded");
      }

      // The whole point of session_id: each end pairs with exactly one
      // start, so an outcome can be attributed to the session that had it
      // without subtracting one population from another.
      const endedIds = events.map(event => event.extra.session_id);
      const startedIds = (await sessionStartedEvents()).map(
        event => event.extra.session_id
      );
      is(new Set(endedIds).size, endedIds.length, "Session ids are distinct");
      Assert.deepEqual(
        endedIds.toSorted(),
        startedIds.toSorted(),
        `Every session_ended pairs with a session_started for ${name}`
      );

      for (const [outcome, errorCode] of expected) {
        if (outcome == "error") {
          is(
            Glean.mediaSpeechRecognition.error[errorCode].testGetValue(),
            1,
            `error[${errorCode}] recorded for ${name}`
          );
        }
      }
    });
  }
});

// Timing metrics: only the presence of samples is asserted, never a specific
// duration.
add_task(async function test_session_init_time() {
  await flushAndReset();

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    is(await startSession(browser), "start", "Recognition session started");

    await Services.fog.testFlushAllChildren();
    const data = Glean.mediaSpeechRecognition.sessionInitTime.testGetValue();
    Assert.ok(data, "session_init_time has samples");
    is(data.count, 1, "One session init was timed");

    await endSession(browser, "abort");
  });
});

// Initialization failures that do not need a loaded model are exercised here.
// The timing metrics need the speech-recognition subsuite's real model/audio.
add_task(async function test_init_failure_concurrent_session() {
  await flushAndReset();

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    is(await startSession(browser), "start", "First session started");

    const second = await SpecialPowers.spawn(browser, [], async () => {
      const stream = await content.navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const recognition = new content.SpeechRecognition();
      recognition.processLocally = true;
      content.wrappedJSObject._second = recognition;
      return new Promise(resolve => {
        recognition.onstart = () => resolve("start");
        recognition.onerror = e => resolve(`error: ${e.error}`);
        recognition.start(stream.getAudioTracks()[0]);
      });
    });
    is(
      second,
      "error: service-not-allowed",
      "The second concurrent session is refused"
    );

    await Services.fog.testFlushAllChildren();
    is(
      Glean.mediaSpeechRecognition.initFailure.concurrent_session.testGetValue(),
      1,
      "init_failure[concurrent_session] recorded in the inference process"
    );
    is(
      Glean.mediaSpeechRecognition.error.service_not_allowed.testGetValue(),
      1,
      "error[service_not_allowed] recorded in the content process"
    );

    await endSession(browser, "abort");
  });
});

add_task(async function test_init_failure_model_not_installed() {
  await flushAndReset();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.modelHub.testing", false],
      // This label is about the path that fails instead of offering the
      // download, so opt out of install-on-start here.
      ["media.webspeech.recognition.install_on_start", false],
    ],
  });

  try {
    await BrowserTestUtils.withNewTab(PAGE, async browser => {
      is(
        await startSession(browser, { lang: "fr" }),
        "error: network",
        "Starting without an installed model fails asynchronously"
      );

      await Services.fog.testFlushAllChildren();
      is(
        Glean.mediaSpeechRecognition.initFailure.model_not_installed.testGetValue(),
        1,
        "init_failure[model_not_installed] is reachable from start()"
      );
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

// available() reports its answer through the availability counter on every
// path, including the early-outs that never reach the backend.
add_task(async function test_availability_counter() {
  await flushAndReset();

  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    // processLocally: false is unsupported, and resolves without consulting
    // the backend at all.
    const status = await SpecialPowers.spawn(browser, [], () =>
      content.SpeechRecognition.available({
        langs: ["en-US"],
        processLocally: false,
      })
    );
    is(status, "unavailable", "Remote recognition is unavailable");

    await Services.fog.testFlushAllChildren();
    is(
      Glean.mediaSpeechRecognition.availability.unavailable.testGetValue(),
      1,
      "availability[unavailable] recorded for the early-out"
    );
  });
});
