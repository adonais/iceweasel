/**
 * End-to-end audio-focus interruption driven through the chrome
 * MediaController: pausing with a system reason suspends a tab's audible media
 * element, Web Audio, and Web Speech, and resuming revives them. A source that
 * takes ownership of its own state during the interruption (a page-suspended
 * AudioContext, a page-paused media element) is left alone, so a later
 * interruption end does not resume it.
 */
"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.audio_session.enabled", true],
      ["media.audioFocus.webaudio.enabled", true],
      ["media.mediacontrol.testingevents.enabled", true],
      ["media.webspeech.synth.test", true],
    ],
  });
});

const WEB_AUDIO_URL = GetTestWebBasedURL("file_web_audio.html");
const WEB_SPEECH_URL = GetTestWebBasedURL("file_web_speech.html");
const MEDIA_ELEMENT_URL = GetTestWebBasedURL("file_autoplay.html");
const MUTED_MEDIA_URL = GetTestWebBasedURL("file_muted_autoplay.html");

// A system audio-focus interruption suspends running Web Audio, and a resume
// brings it back.
add_task(async function test_web_audio_interrupt_suspend_resume() {
  const tab = await createLoadedTabWrapper(WEB_AUDIO_URL, { needCheck: false });
  const browser = tab.linkedBrowser;
  const controller = browser.browsingContext.mediaController;

  await startWebAudio(browser);
  is(await audioContextState(browser), "running", "Web Audio is running");

  info("system-transient interruption should suspend Web Audio");
  controller.pause("system-transient");
  await waitForAudioContextState(browser, "suspended");

  info("resume should revive the suspended Web Audio");
  controller.resume();
  await waitForAudioContextState(browser, "running");

  await tab.close();
});

// If the page suspends its own AudioContext while interrupted, it has taken
// over the suspended state; a later interruption end must not auto-resume it.
add_task(async function test_page_suspend_during_interrupt_is_not_resumed() {
  const tab = await createLoadedTabWrapper(WEB_AUDIO_URL, { needCheck: false });
  const browser = tab.linkedBrowser;
  const controller = browser.browsingContext.mediaController;

  await startWebAudio(browser);
  controller.pause("system-transient");
  await waitForAudioContextState(browser, "suspended");

  info("page explicitly suspends its AudioContext while interrupted");
  await SpecialPowers.spawn(browser, [], async () => {
    await content.ac.suspend();
  });

  info("a resume must leave the page-owned suspend untouched");
  controller.resume();
  // Once the page has suspended, the context stays suspended until the page
  // itself resumes, so this state is stable: a read returns "suspended" whether
  // or not the resume interrupt has been delivered yet. No polling needed.
  is(
    await audioContextState(browser),
    "suspended",
    "page-owned suspend is not auto-resumed"
  );

  info("only the page can resume its own AudioContext");
  await SpecialPowers.spawn(browser, [], async () => {
    await content.ac.resume();
  });
  is(await audioContextState(browser), "running", "page resume still works");

  await tab.close();
});

// A system audio-focus interruption pauses speaking Web Speech, and a resume
// revives it.
add_task(async function test_web_speech_interrupt_suspend_resume() {
  const tab = await createLoadedTabWrapper(WEB_SPEECH_URL, {
    needCheck: false,
  });
  const browser = tab.linkedBrowser;
  const controller = browser.browsingContext.mediaController;

  await SpecialPowers.spawn(browser, [], async () => {
    content.document.getElementById("start").click();
    await content.wrappedJSObject.waitForSpeechStart();
  });

  info("system-transient interruption should pause speech");
  controller.pause("system-transient");
  await SpecialPowers.spawn(browser, [], async () => {
    await content.wrappedJSObject.waitForSpeechPause();
  });
  ok(true, "speech paused on interruption");

  info("resume should revive the paused speech");
  controller.resume();
  await SpecialPowers.spawn(browser, [], async () => {
    await content.wrappedJSObject.waitForSpeechResume();
  });
  ok(true, "speech resumed on interruption end");

  await SpecialPowers.spawn(browser, [], () => {
    content.wrappedJSObject.cancelSpeech();
  });
  await tab.close();
});

// Note: there is no Web Speech analogue of
// test_page_suspend_during_interrupt_is_not_resumed. SpeechSynthesis.pause()
// is a no-op while the utterance is already paused (SpeechSynthesis.cpp), so a
// page cannot take over an interruption-pause the way it can take over an
// AudioContext suspend; an interruption end therefore resumes the speech.
// Giving Web Speech that parity is left to bug 2047321.

// A system audio-focus interruption pauses an audible media element, and a
// resume revives it.
add_task(async function test_media_element_interrupt_suspend_resume() {
  const tab = await createLoadedTabWrapper(MEDIA_ELEMENT_URL, {
    needCheck: false,
  });
  const controller = tab.linkedBrowser.browsingContext.mediaController;

  await checkOrWaitUntilMediaStartedPlaying(tab, "autoplay");
  // The media-control listener registers as a receiver only once the element
  // is reported audible and its controller activates; wait for that before
  // driving the interruption so it reaches the element.
  await checkOrWaitUntilControllerBecomeActive(tab);

  info("system-transient interruption should pause the media element");
  controller.pause("system-transient");
  await checkOrWaitUntilMediaStoppedPlaying(tab, "autoplay");

  info("resume should revive the interrupted media element");
  controller.resume();
  await checkOrWaitUntilMediaStartedPlaying(tab, "autoplay");

  await tab.close();
});

// If the page pauses the element itself while it is interrupted, the page
// takes ownership of the paused state, so the interruption end must not
// resume it.
add_task(async function test_page_pause_during_interrupt_is_not_resumed() {
  const tab = await createLoadedTabWrapper(MEDIA_ELEMENT_URL, {
    needCheck: false,
  });
  const browser = tab.linkedBrowser;
  const controller = browser.browsingContext.mediaController;

  await checkOrWaitUntilMediaStartedPlaying(tab, "autoplay");
  await checkOrWaitUntilControllerBecomeActive(tab);

  info("interruption suspends the element");
  controller.pause("system-transient");
  await checkOrWaitUntilMediaStoppedPlaying(tab, "autoplay");

  info("page pauses the element itself while it is interrupted");
  await SpecialPowers.spawn(browser, [], () => {
    content.document.getElementById("autoplay").pause();
  });

  info("interruption end must not resume a page-paused element");
  controller.resume();
  const paused = await SpecialPowers.spawn(
    browser,
    [],
    () => content.document.getElementById("autoplay").paused
  );
  ok(paused, "page-paused media stays paused across the interruption end");

  await tab.close();
});

// Inaudible media (here, muted) does not compete for audio focus, so an
// interruption and its end leave it alone: it keeps playing throughout.
add_task(async function test_inaudible_media_is_unaffected_by_interrupt() {
  const tab = await createLoadedTabWrapper(MUTED_MEDIA_URL, {
    needCheck: false,
  });
  const controller = tab.linkedBrowser.browsingContext.mediaController;

  await checkOrWaitUntilMediaStartedPlaying(tab, "autoplay");

  info("inaudible media must keep playing while the tab is interrupted");
  controller.pause("system-transient");
  await ensureMediaKeepsPlaying(tab, "autoplay");

  info("and once the interruption ends");
  controller.resume();
  await ensureMediaKeepsPlaying(tab, "autoplay");

  await tab.close();
});

// below are helper functions.

// Muted media has no audible/state-change event to await, so confirm it is
// genuinely still playing by requiring several timeupdate events, which fire
// only while playback is progressing. A wrong interrupt-pause would either
// leave it paused (the assertions below fail) or stop timeupdate (this hangs
// and the test times out).
function ensureMediaKeepsPlaying(tab, elementId, timeupdateCount = 3) {
  return SpecialPowers.spawn(
    tab.linkedBrowser,
    [elementId, timeupdateCount],
    async (Id, count) => {
      const video = content.document.getElementById(Id);
      ok(!video.paused, "media is playing");
      await new Promise(resolve => {
        let seen = 0;
        video.addEventListener("timeupdate", function handler() {
          if (++seen >= count) {
            video.removeEventListener("timeupdate", handler);
            resolve();
          }
        });
      });
      ok(!video.paused, "media is still playing after progressing");
    }
  );
}

function startWebAudio(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    content.ac = new content.AudioContext();
    const osc = content.ac.createOscillator();
    osc.connect(content.ac.destination);
    osc.start();
    if (content.ac.state !== "running") {
      await content.ac.resume();
    }
  });
}

function audioContextState(browser) {
  return SpecialPowers.spawn(browser, [], () => content.ac.state);
}

function waitForAudioContextState(browser, expected) {
  return SpecialPowers.spawn(browser, [expected], async expected => {
    const ac = content.ac;
    if (ac.state === expected) {
      return;
    }
    await new Promise(resolve => {
      ac.addEventListener("statechange", function listener() {
        if (ac.state === expected) {
          ac.removeEventListener("statechange", listener);
          resolve();
        }
      });
    });
  });
}
