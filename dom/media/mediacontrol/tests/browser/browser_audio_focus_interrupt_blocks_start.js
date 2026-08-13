/**
 * While a tab's audio session is interrupted, the page cannot start or resume
 * audio on its own: a media element play(), a Web Audio resume(), and a Web
 * Speech speak() are all blocked until the interruption ends. Web Audio also
 * serves as the interrupt-arrival barrier, since it participates in the
 * suspend fan-out and its state transitions are observable.
 */
"use strict";

const PAGE_URL = GetTestWebBasedURL("file_interrupt_blocks_start.html");

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.audio_session.enabled", true],
      ["dom.audio_session.block_start_during_interrupt.enabled", true],
      ["media.audioFocus.webaudio.enabled", true],
      ["media.mediacontrol.testingevents.enabled", true],
      ["media.webspeech.synth.test", true],
    ],
  });
});

// An audible media element play() is rejected while the tab is interrupted, and
// works once the interruption ends. Inaudible media (muted, zero volume, no
// audio track) does not compete for audio focus, so it can still self-start.
add_task(async function test_media_element_play_blocked_during_interrupt() {
  const playMedia = (browser, id) =>
    SpecialPowers.spawn(browser, [id], elementId =>
      content.wrappedJSObject.playMedia(elementId)
    );
  const cancelMedia = (browser, id) =>
    SpecialPowers.spawn(browser, [id], elementId =>
      content.wrappedJSObject.cancelMedia(elementId)
    );

  await checkSourceGatedDuringInterrupt(
    async browser => {
      let outcome = await playMedia(browser, "audible");
      is(
        outcome,
        "NotAllowedError",
        "audible play() rejected while interrupted"
      );

      for (const id of ["muted", "vol0", "noaudio"]) {
        await SpecialPowers.spawn(browser, [id], elementId =>
          content.wrappedJSObject.waitForMetadata(elementId)
        );
        outcome = await playMedia(browser, id);
        is(
          outcome,
          "played",
          `inaudible '${id}' play() works while interrupted`
        );
        await cancelMedia(browser, id);
      }
    },
    async browser => {
      const outcome = await playMedia(browser, "audible");
      is(outcome, "played", "audible play() works after the interruption ends");
      await cancelMedia(browser, "audible");
    }
  );
});

// A page Web Audio resume() stays gated while interrupted; its deferred promise
// resolves and the context is running once the interruption ends. A resume()
// deferred during the interruption on a context the page then closes is settled
// (rejected), not left hanging.
add_task(async function test_web_audio_resume_blocked_during_interrupt() {
  await checkSourceGatedDuringInterrupt(
    async browser => {
      const state = await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.resumeWebAudioGated(2000)
      );
      is(state, "suspended", "Web Audio resume() gated while interrupted");

      // Closing a context whose resume() is deferred by the interruption must
      // settle (reject) that promise rather than leave it hanging.
      const settled = await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.closeContextWithDeferredResume(3000)
      );
      isnot(
        settled,
        "pending",
        "closing the context settles its deferred resume()"
      );
    },
    async browser => {
      const outcome = await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.awaitPendingResume(5000)
      );
      is(
        outcome,
        "running",
        "deferred resume() promise resolves once the interruption ends"
      );
    }
  );
});

// A page Web Speech speak() does not start while interrupted, and works once
// the interruption ends.
add_task(async function test_web_speech_speak_blocked_during_interrupt() {
  await checkSourceGatedDuringInterrupt(
    async browser => {
      const outcome = await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.speakAndRace(2000)
      );
      is(outcome, "error", "Web Speech speak() errors instead of starting");
    },
    async browser => {
      const outcome = await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.speakAndAwaitStart()
      );
      is(
        outcome,
        "started",
        "Web Speech speak() succeeds after the interruption"
      );
      await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.cancelSpeech()
      );
    }
  );
});

// Following are helper functions.

// Loads the combined page, starts Web Audio (the interrupt-arrival barrier),
// drives a system interruption, runs duringInterrupt() while the tab is gated,
// ends the interruption (waiting for Web Audio to resume so the gate is known
// to be cleared), then runs afterInterrupt().
async function checkSourceGatedDuringInterrupt(
  duringInterrupt,
  afterInterrupt
) {
  const tab = await createLoadedTabWrapper(PAGE_URL, { needCheck: false });
  const browser = tab.linkedBrowser;
  const controller = browser.browsingContext.mediaController;

  await SpecialPowers.spawn(browser, [], async () => {
    await content.wrappedJSObject.startWebAudio();
    await content.wrappedJSObject.waitForAudioContextState("running");
  });

  info("interrupt the tab; barrier is Web Audio becoming suspended");
  controller.pause("system-transient");
  await SpecialPowers.spawn(browser, [], () =>
    content.wrappedJSObject.waitForAudioContextState("suspended")
  );

  await duringInterrupt(browser);

  info("end the interruption; barrier is Web Audio becoming running again");
  controller.resume();
  await SpecialPowers.spawn(browser, [], () =>
    content.wrappedJSObject.waitForAudioContextState("running")
  );

  await afterInterrupt(browser);

  await tab.close();
}
