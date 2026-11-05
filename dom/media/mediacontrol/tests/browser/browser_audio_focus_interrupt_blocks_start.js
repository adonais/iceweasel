/**
 * While a tab's audio session is transiently interrupted, the page cannot
 * start or resume audio on its own: a media element play(), a Web Audio
 * resume(), and a Web Speech speak() are all blocked until the interruption
 * ends. A permanent loss blocks nothing. Web Audio also serves as the
 * interrupt-arrival barrier, since it participates in the suspend fan-out and
 * its state transitions are observable.
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

// An audible media element play() is rejected while the tab is transiently
// interrupted, and works after a permanent loss and once the interruption ends.
// Inaudible media (muted, zero volume, no audio track) does not compete for
// audio focus, so it can still self-start. A permanent loss pauses a playing
// element once, and a later focus gain does not resume it.
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
    async (browser, blocking) => {
      info("test audible media during interruption");
      let outcome = await playMedia(browser, "audible");
      is(
        outcome,
        blocking ? "NotAllowedError" : "played",
        "audible play() during the interruption"
      );
      await cancelMedia(browser, "audible");

      info("test inaudible media during interruption");
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

  await checkSourceAfterPermanentLoss(
    async tab => {
      is(
        await playMedia(tab.linkedBrowser, "audible"),
        "played",
        "the element plays"
      );
      // The element yields to an interruption only once it is audible.
      await checkOrWaitUntilControllerBecomeActive(tab);
    },
    async (tab, controller) => {
      controller.resume();
      ok(
        await SpecialPowers.spawn(
          tab.linkedBrowser,
          [],
          () => content.document.getElementById("audible").paused
        ),
        "the gain does not resume the element"
      );
      is(
        await playMedia(tab.linkedBrowser, "audible"),
        "played",
        "the page can play it again"
      );
    }
  );
});

// A page Web Audio resume() stays gated while transiently interrupted; its
// deferred promise resolves and the context is running once the interruption
// ends. After a permanent loss it runs right away. A resume() deferred during
// the interruption on a context the page then closes is settled (rejected),
// not left hanging. Web Audio paused by a permanent loss stays suspended across
// a window freeze and thaw.
add_task(async function test_web_audio_resume_blocked_during_interrupt() {
  await checkSourceGatedDuringInterrupt(
    async (browser, blocking) => {
      // A blocked resume() is given a while to show it stays deferred; an
      // allowed one is waited for.
      const state = await SpecialPowers.spawn(browser, [blocking], isBlocking =>
        content.wrappedJSObject.resumeWebAudioGated(isBlocking ? 2000 : 30000)
      );
      is(
        state,
        blocking ? "suspended" : "running",
        "Web Audio resume() during the interruption"
      );

      if (blocking) {
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
      }
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

  await checkSourceAfterPermanentLoss(
    async tab => {
      await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
        await content.wrappedJSObject.startWebAudio();
        await content.wrappedJSObject.waitForAudioContextState("running");
      });
    },
    async (tab, controller) => {
      await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
        await content.wrappedJSObject.waitForAudioContextState("suspended");
        // Suspending and resuming the window resumes every AudioContext the
        // page did not suspend itself.
        content.windowUtils.suspendTimeouts();
        content.windowUtils.resumeTimeouts();
      });
      controller.resume();
      await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
        const page = content.wrappedJSObject;
        // A wrong restart would arrive asynchronously; give it time to show.
        await new Promise(resolve => content.setTimeout(resolve, 1000));
        is(
          page.audioContextState(),
          "suspended",
          "neither a window thaw nor the gain restarts Web Audio"
        );
        is(
          await page.resumeWebAudioGated(30000),
          "running",
          "the page can resume Web Audio"
        );
      });
    }
  );
});

// A page Web Speech speak() does not start while transiently interrupted, and
// works after a permanent loss and once the interruption ends. A permanent loss
// pauses ongoing speech once, and a later focus gain does not resume it.
add_task(async function test_web_speech_speak_blocked_during_interrupt() {
  await checkSourceGatedDuringInterrupt(
    async (browser, blocking) => {
      const outcome = await SpecialPowers.spawn(
        browser,
        [blocking],
        isBlocking =>
          isBlocking
            ? content.wrappedJSObject.speakAndRace(2000)
            : content.wrappedJSObject.speakAndAwaitStart()
      );
      is(
        outcome,
        blocking ? "error" : "started",
        "Web Speech speak() during the interruption"
      );
      await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.cancelSpeech()
      );
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

  await checkSourceAfterPermanentLoss(
    async tab => {
      is(
        await SpecialPowers.spawn(tab.linkedBrowser, [], () =>
          content.wrappedJSObject.speakAndAwaitStart()
        ),
        "started",
        "speech starts"
      );
    },
    async (tab, controller) => {
      await SpecialPowers.spawn(tab.linkedBrowser, [], () =>
        ContentTaskUtils.waitForCondition(
          () => content.speechSynthesis.paused,
          "the loss pauses the speech"
        )
      );
      controller.resume();
      await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
        // A wrong resume would arrive asynchronously; give it time to show.
        await new Promise(resolve => content.setTimeout(resolve, 1000));
        ok(
          content.speechSynthesis.paused,
          "the gain does not resume the speech"
        );
        content.speechSynthesis.resume();
        await ContentTaskUtils.waitForCondition(
          () => !content.speechSynthesis.paused,
          "the page can resume the speech"
        );
        content.wrappedJSObject.cancelSpeech();
      });
    }
  );
});

// Following are helper functions.

// For a transient and a permanent loss: loads the combined page, starts Web
// Audio (the interrupt-arrival barrier), drives the loss, runs
// duringInterrupt(browser, blocking), ends the interruption, then runs
// afterInterrupt(). `blocking` is true for the transient loss, which keeps the
// page from starting audio.
async function checkSourceGatedDuringInterrupt(
  duringInterrupt,
  afterInterrupt
) {
  for (const reason of ["system-transient", "system-permanent"]) {
    const blocking = reason == "system-transient";
    const tab = await createLoadedTabWrapper(PAGE_URL, { needCheck: false });
    const browser = tab.linkedBrowser;
    const controller = browser.browsingContext.mediaController;

    await SpecialPowers.spawn(browser, [], async () => {
      await content.wrappedJSObject.startWebAudio();
      await content.wrappedJSObject.waitForAudioContextState("running");
    });

    info(
      `interrupt the tab with ${reason}; barrier is Web Audio becoming suspended`
    );
    controller.pause(reason);
    await SpecialPowers.spawn(browser, [], () =>
      content.wrappedJSObject.waitForAudioContextState("suspended")
    );

    await duringInterrupt(browser, blocking);

    controller.resume();
    if (blocking) {
      info("end the interruption; barrier is Web Audio becoming running again");
      await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.waitForAudioContextState("running")
      );
    } else {
      info("end the interruption");
    }

    await afterInterrupt(browser);

    await tab.close();
  }
}

// For a permanent loss, alone and after a transient one: loads the combined
// page, runs startSource(tab), drives the loss, then runs
// checkAfterLoss(tab, controller). The losses and later gains reach the page
// before the next SpecialPowers.spawn, as both go over the same IPC channel.
async function checkSourceAfterPermanentLoss(startSource, checkAfterLoss) {
  for (const reasons of [
    ["system-permanent"],
    ["system-transient", "system-permanent"],
  ]) {
    info(`interrupt the tab with ${reasons.join(" then ")}`);
    const tab = await createLoadedTabWrapper(PAGE_URL, { needCheck: false });
    const browser = tab.linkedBrowser;
    const controller = browser.browsingContext.mediaController;

    await startSource(tab);
    for (const reason of reasons) {
      controller.pause(reason);
    }
    await checkAfterLoss(tab, controller);

    await tab.close();
  }
}
