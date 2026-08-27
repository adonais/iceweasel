/**
 * media.audio_session and media.audio_focus Glean telemetry. Each task resets
 * FOG, drives a real path (adoption, arbitration, interrupt/resume) with
 * dom.audio_session.enabled on, and asserts the recorded probe values.
 * Content-process probes are read after flushing child FOG data to the parent.
 */
"use strict";

const MEDIA_ELEMENT_URL = GetTestWebBasedURL("file_autoplay.html");
const TOP_URL =
  "https://example.com/browser/dom/media/mediacontrol/tests/browser/file_audiosessiontype_audible.html";
const IFRAME_URL =
  "https://example.org/browser/dom/media/mediacontrol/tests/browser/file_audiosessiontype_iframe.html";
const TOP_VIDEO_ID = "audible_video";
const IFRAME_VIDEO_ID = "iframe_video";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.audio_session.enabled", true],
      ["media.audioFocus.webaudio.enabled", true],
      ["media.mediacontrol.testingevents.enabled", true],
    ],
  });
});

// navigator.audioSession use and an explicit type assignment are recorded.
add_task(async function test_adoption() {
  Services.fog.testResetFOG();

  info("open an audible page and set an explicit audioSession.type");
  const tab = await createLoadedTabWrapper(MEDIA_ELEMENT_URL, {
    needCheck: false,
  });
  await checkOrWaitUntilMediaStartedPlaying(tab, "autoplay");
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.navigator.audioSession.type = "playback";
  });
  await Services.fog.testFlushAllChildren();

  Assert.greaterOrEqual(
    Glean.mediaAudioSession.apiUsed.testGetValue() ?? 0,
    1,
    "api_used recorded"
  );
  is(
    Glean.mediaAudioSession.typeSet.playback.testGetValue(),
    1,
    "type_set[playback] recorded"
  );

  await tab.close();
});

// An audible playback element becomes the selected session; a system
// interruption is recorded and its end is recorded as a recovery, and the
// element's resume is recorded.
add_task(async function test_interrupt_and_resume() {
  Services.fog.testResetFOG();
  const tab = await createLoadedTabWrapper(MEDIA_ELEMENT_URL, {
    needCheck: false,
  });
  const controller = tab.linkedBrowser.browsingContext.mediaController;

  info("play audible media so it becomes the selected audio session");
  await checkOrWaitUntilMediaStartedPlaying(tab, "autoplay");
  await checkOrWaitUntilControllerBecomeActive(tab);
  Assert.greaterOrEqual(
    Glean.mediaAudioSession.selectedChanged.testGetValue() ?? 0,
    1,
    "selected_changed recorded once a session is selected"
  );
  info("auto-typed selected session resolves to playback for audible media");
  Assert.greaterOrEqual(
    Glean.mediaAudioSession.effectiveAutoType.playback.testGetValue() ?? 0,
    1,
    "effective_auto_type[playback] recorded for the auto-typed selected session"
  );

  info("a system interruption pauses the media");
  controller.pause("system-transient");
  await checkOrWaitUntilMediaStoppedPlaying(tab, "autoplay");
  is(
    Glean.mediaAudioFocus.interruptCount.system_transient.testGetValue(),
    1,
    "interrupt_count[system_transient] recorded"
  );

  info("the interruption ends; the media resumes and recovers");
  controller.resume();
  await checkOrWaitUntilMediaStartedPlaying(tab, "autoplay");
  await Services.fog.testFlushAllChildren();

  const outcomes = Glean.mediaAudioFocus.interruptOutcome.testGetValue() ?? [];
  // One terminal outcome per interruption, so this reconciles with the single
  // interrupt_count above.
  Assert.deepEqual(
    outcomes.map(e => e.extra?.outcome),
    ["recovered"],
    "interrupt_outcome recorded exactly one recovery"
  );
  is(
    outcomes[0].extra?.cause,
    "system_transient",
    "interrupt_outcome cause is the transient loss"
  );
  Assert.greaterOrEqual(
    Glean.mediaAudioFocus.resumeDecision.media.testGetValue() ?? 0,
    1,
    "resume_decision[media] recorded"
  );

  await tab.close();
});

// interrupt_outcome is per suspended session: an interruption that suspends two
// sessions reports a recovery for each once both are returned to active.
add_task(async function test_interrupt_outcome_is_per_suspended_session() {
  Services.fog.testResetFOG();

  // Ambient is non-exclusive, so the main frame's session stays active
  // alongside the iframe's exclusive one and the interruption suspends both.
  info("main frame plays an audible video under an ambient session");
  const tab = await createLoadedTabWrapper(TOP_URL);
  const controller = tab.linkedBrowser.browsingContext.mediaController;
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.navigator.audioSession.type = "ambient";
  });
  await playMedia(tab, TOP_VIDEO_ID);

  info("inject a cross-origin iframe and start its audible video");
  await SpecialPowers.spawn(tab.linkedBrowser, [IFRAME_URL], async url => {
    const iframe = content.document.createElement("iframe");
    iframe.src = url;
    content.document.body.appendChild(iframe);
    await new Promise(r => (iframe.onload = r));
  });
  const iframeBC = tab.linkedBrowser.browsingContext.children[0];
  await SpecialPowers.spawn(iframeBC, [IFRAME_VIDEO_ID], async id => {
    await content.document.getElementById(id).play();
  });

  info("iframe takes an exclusive playback session");
  await SpecialPowers.spawn(iframeBC, [], () => {
    content.wrappedJSObject.setIframeAudioSessionType("playback");
  });
  // Only the iframe can produce a `playback` effective type here, and selection
  // picks it only once its browsing context is audible, so this is the signal
  // that both sessions are active and interruptible.
  await waitForEffectiveAudioSessionType(controller, "playback");

  info("a system interruption suspends both sessions");
  controller.pause("system-transient");
  await checkOrWaitUntilMediaStoppedPlaying(tab, TOP_VIDEO_ID);
  is(
    Glean.mediaAudioFocus.interruptCount.system_transient.testGetValue(),
    1,
    "one interruption counted for the two suspended sessions"
  );

  info("the interruption ends");
  controller.resume();
  await Services.fog.testFlushAllChildren();

  Assert.deepEqual(
    (Glean.mediaAudioFocus.interruptOutcome.testGetValue() ?? []).map(
      e => e.extra?.outcome
    ),
    ["recovered", "recovered"],
    "a recovery for each of the two suspended sessions"
  );

  await tab.close();
});

// A resume that does not follow an interruption reports no outcome at all.
add_task(async function test_resume_without_interruption_records_no_outcome() {
  Services.fog.testResetFOG();

  const tab = await createLoadedTabWrapper(MEDIA_ELEMENT_URL, {
    needCheck: false,
  });
  const controller = tab.linkedBrowser.browsingContext.mediaController;
  await checkOrWaitUntilMediaStartedPlaying(tab, "autoplay");
  await checkOrWaitUntilControllerBecomeActive(tab);

  info("resume without any preceding interruption");
  controller.resume();
  await Services.fog.testFlushAllChildren();

  Assert.deepEqual(
    Glean.mediaAudioFocus.interruptOutcome.testGetValue() ?? [],
    [],
    "no interrupt_outcome recorded when nothing was interrupted"
  );

  await tab.close();
});

// Two exclusive sessions in one tab (main frame + cross-origin iframe): when
// the iframe's exclusive session takes over, arbitration inactivates the main
// frame's session.
add_task(async function test_arbitration_inactivation() {
  Services.fog.testResetFOG();

  info("main frame plays an exclusive playback video");
  const tab = await createLoadedTabWrapper(TOP_URL);
  await playMedia(tab, TOP_VIDEO_ID);

  info("inject a cross-origin iframe and start its audible video");
  await SpecialPowers.spawn(tab.linkedBrowser, [IFRAME_URL], async url => {
    const iframe = content.document.createElement("iframe");
    iframe.src = url;
    content.document.body.appendChild(iframe);
    await new Promise(r => (iframe.onload = r));
  });
  const iframeBC = tab.linkedBrowser.browsingContext.children[0];
  await SpecialPowers.spawn(iframeBC, [IFRAME_VIDEO_ID], async id => {
    await content.document.getElementById(id).play();
  });

  info("iframe takes an exclusive session, displacing the main frame");
  await SpecialPowers.spawn(iframeBC, [], () => {
    content.wrappedJSObject.setIframeAudioSessionType("playback");
  });

  await TestUtils.waitForCondition(
    () =>
      (Glean.mediaAudioSession.inactivatedByArbitration.testGetValue() ?? 0) >=
      1,
    "waiting for arbitration to inactivate the displaced session"
  );
  Assert.greaterOrEqual(
    Glean.mediaAudioSession.inactivatedByArbitration.testGetValue() ?? 0,
    1,
    "inactivated_by_arbitration recorded"
  );

  await tab.close();
});
