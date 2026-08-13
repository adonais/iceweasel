const PAGE =
  "https://example.com/browser/dom/media/mediacontrol/tests/browser/file_non_autoplay.html";
const testVideoId = "video";

add_task(async function setupTestingPref() {
  await SpecialPowers.pushPrefEnv({
    set: [["media.mediacontrol.testingevents.enabled", true]],
  });
});

// Resolve once the controller's audible state reaches `audible`, driven by its
// onaudiblechange event (resolving immediately if it is already in that state).
function waitForControllerAudible(controller, audible) {
  return new Promise(resolve => {
    if (controller.isAudible === audible) {
      resolve();
      return;
    }
    controller.addEventListener("audiblechange", function handler() {
      if (controller.isAudible === audible) {
        controller.removeEventListener("audiblechange", handler);
        resolve();
      }
    });
  });
}

/**
 * Muting and unmuting through the MediaController must update its muted state
 * (isMuted) and silence then restore the tab's audio.
 */
add_task(async function testControllerMuteUnmute() {
  info(`open page`);
  const tab = await createLoadedTabWrapper(PAGE);
  const controller = tab.controller;
  ok(!controller.isMuted, "controller starts unmuted");

  info(`start media; the controller should become audible`);
  await Promise.all([
    waitForControllerAudible(controller, true),
    playMedia(tab, testVideoId),
  ]);
  ok(controller.isAudible, "media is audible before muting");

  info(`mute via the controller; it should become inaudible`);
  const inaudible = waitForControllerAudible(controller, false);
  controller.mute();
  ok(controller.isMuted, "controller reports being muted");
  await inaudible;
  ok(!controller.isAudible, "media is inaudible after muting");

  info(`unmute via the controller; it should become audible again`);
  const audibleAgain = waitForControllerAudible(controller, true);
  controller.unmute();
  ok(!controller.isMuted, "controller reports being unmuted");
  await audibleAgain;
  ok(controller.isAudible, "media is audible again after unmuting");

  info(`remove tab`);
  await tab.close();
});

/**
 * Switching a media element to a new source while the tab is muted stops the
 * element from being controlled. Unmuting afterwards must still restore the
 * tab's audio, rather than leaving the element silently muted.
 */
add_task(async function testSwitchSourceWhileMutedThenUnmute() {
  info(`open page`);
  const tab = await createLoadedTabWrapper(PAGE);
  const controller = tab.controller;

  info(`start media; the controller should become audible`);
  await Promise.all([
    waitForControllerAudible(controller, true),
    playMedia(tab, testVideoId),
  ]);

  info(`mute via the controller; it should become inaudible`);
  const inaudible = waitForControllerAudible(controller, false);
  controller.mute();
  ok(controller.isMuted, "controller reports being muted");
  await inaudible;
  ok(!controller.isAudible, "media is inaudible after muting");

  info(`switch the media element to a new source while still muted`);
  await SpecialPowers.spawn(tab.linkedBrowser, [testVideoId], async Id => {
    const video = content.document.getElementById(Id);
    video.src = "gizmo.mp4?switch=1";
    video.load();
    ok(
      await video.play().then(
        () => true,
        () => false
      ),
      "new source started playing"
    );
  });
  ok(!controller.isAudible, "new source stays silent while the tab is muted");

  info(`unmute via the controller; the new source should become audible`);
  const audibleAgain = waitForControllerAudible(controller, true);
  controller.unmute();
  ok(!controller.isMuted, "controller reports being unmuted");
  await audibleAgain;
  ok(controller.isAudible, "media is audible again after switching source");

  info(`remove tab`);
  await tab.close();
});

/**
 * Media that only starts playing after the tab is muted must be silenced while
 * the tab stays muted, and become audible once the tab is unmuted.
 */
add_task(async function testStartNewMediaWhileMutedThenUnmute() {
  info(`open page and mute before any media plays`);
  const tab = await createLoadedTabWrapper(PAGE);
  const controller = tab.controller;
  controller.mute();
  ok(controller.isMuted, "controller reports being muted");

  info(`start media while the tab is muted`);
  await SpecialPowers.spawn(tab.linkedBrowser, [testVideoId], async Id => {
    const video = content.document.getElementById(Id);
    ok(
      await video.play().then(
        () => true,
        () => false
      ),
      "media started playing"
    );
  });
  ok(!controller.isAudible, "media stays silent while the tab is muted");

  info(`unmute via the controller; the media should become audible`);
  const audible = waitForControllerAudible(controller, true);
  controller.unmute();
  ok(!controller.isMuted, "controller reports being unmuted");
  await audible;
  ok(controller.isAudible, "media becomes audible after unmuting");

  info(`remove tab`);
  await tab.close();
});
