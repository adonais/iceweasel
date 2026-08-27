/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const IMPROVED_CONTROLS_ENABLED_PREF =
  "media.videocontrols.picture-in-picture.improved-video-controls.enabled";
const PLAYBACK_SPEED_ENABLED_PREF =
  "media.videocontrols.picture-in-picture.playback-speed.enabled";

const videoID = "with-controls";

async function getVideoPlaybackRate(browser, id) {
  return SpecialPowers.spawn(browser, [id], async videoID => {
    return content.document.getElementById(videoID).playbackRate;
  });
}

async function setVideoPlaybackRate(browser, id, rate) {
  return SpecialPowers.spawn(browser, [id, rate], async (videoID, r) => {
    content.document.getElementById(videoID).playbackRate = r;
  });
}

function getReadoutRate(valueText) {
  return JSON.parse(valueText.getAttribute("data-l10n-args")).rate;
}

/**
 * Tests the playback speed controls in the Picture-in-Picture window:
 * the originating rate is carried into the panel, panel controls drive the
 * originating video, and changes made on the page sync back to the panel.
 */
add_task(async function test_playbackRate() {
  clearSavedPosition();

  await SpecialPowers.pushPrefEnv({
    set: [
      [IMPROVED_CONTROLS_ENABLED_PREF, true],
      [PLAYBACK_SPEED_ENABLED_PREF, true],
    ],
  });

  await BrowserTestUtils.withNewTab(
    {
      url: TEST_PAGE,
      gBrowser,
    },
    async browser => {
      await ensureVideosReady(browser);

      // Set a non-default rate on the page before opening PiP so we can verify
      // it is carried over when the player window opens.
      await setVideoPlaybackRate(browser, videoID, 1.5);

      let pipWin = await triggerPictureInPicture(browser, videoID);
      Assert.ok(pipWin, "Got Picture-in-Picture window.");

      let doc = pipWin.document;
      let playbackRateButton = doc.getElementById("playbackRate");
      let panel = doc.getElementById("playbackRateSettings");
      let slider = doc.getElementById("playback-rate-slider");
      let valueText = doc.getElementById("playback-rate-value");

      // The playback speed button is dropped from the end controls by a media
      // query on narrow or short player windows, so size the window up before
      // trying to click it. resizeTo fires no resize event when the window is
      // already at least this size, so only resize when it is smaller.
      let width = 640;
      let height = 360;
      if (pipWin.innerWidth < width || pipWin.innerHeight < height) {
        let resizePromise = BrowserTestUtils.waitForEvent(pipWin, "resize");
        pipWin.resizeTo(width, height);
        await resizePromise;
      }

      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isVisible(playbackRateButton),
        "Wait for the playback speed button to be visible."
      );

      Assert.equal(
        parseFloat(slider.value),
        1.5,
        "Slider reflects the originating video's rate on open."
      );
      Assert.equal(
        getReadoutRate(valueText),
        1.5,
        "Value readout reflects the rate."
      );

      // Opening the panel.
      Assert.ok(BrowserTestUtils.isHidden(panel), "Panel starts hidden.");
      // Retry the click: a synthesized click can still be delivered while the
      // player window is settling, in which case it misses the button and the
      // panel stays closed. Once a click lands the condition is true and no
      // further click is sent, so this cannot toggle the panel back shut.
      await TestUtils.waitForCondition(() => {
        EventUtils.synthesizeMouseAtCenter(playbackRateButton, {}, pipWin);
        return BrowserTestUtils.isVisible(panel);
      }, "Wait for the panel to open on button click.");

      // A preset button sets the originating video's rate.
      let rateChangePromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "ratechange",
        true
      );
      let twoXPreset = panel.querySelector(
        '.playback-rate-preset[data-rate="2"]'
      );
      EventUtils.synthesizeMouseAtCenter(twoXPreset, {}, pipWin);
      await rateChangePromise;

      Assert.equal(
        await getVideoPlaybackRate(browser, videoID),
        2,
        "Preset sets the originating video's playback rate."
      );
      Assert.equal(
        twoXPreset.getAttribute("aria-pressed"),
        "true",
        "The active preset is marked pressed."
      );

      // A rate change on the page syncs back into the panel.
      await setVideoPlaybackRate(browser, videoID, 0.5);
      await TestUtils.waitForCondition(
        () => parseFloat(slider.value) === 0.5,
        "Slider updates after the page changes the rate."
      );
      Assert.equal(
        getReadoutRate(valueText),
        0.5,
        "Value readout updates from the page."
      );
      Assert.equal(
        twoXPreset.getAttribute("aria-pressed"),
        "false",
        "The previously active preset is no longer marked pressed."
      );

      // The < and > keys step through the shortcut rate steps.
      let speedUpPromise = BrowserTestUtils.waitForContentEvent(
        browser,
        "ratechange",
        true
      );
      EventUtils.synthesizeKey(">", { shiftKey: true }, pipWin);
      await speedUpPromise;
      Assert.equal(
        await getVideoPlaybackRate(browser, videoID),
        0.75,
        "The > key steps up to the next rate step."
      );

      await ensureMessageAndClosePiP(browser, videoID, pipWin, false);

      // Don't leak the resized player window onto the next test.
      clearSavedPosition();
    }
  );
});

/**
 * Tests that the playback speed button stays hidden when the feature pref is
 * disabled, even with the improved controls shown.
 */
add_task(async function test_playbackRate_pref_disabled() {
  clearSavedPosition();

  await SpecialPowers.pushPrefEnv({
    set: [
      [IMPROVED_CONTROLS_ENABLED_PREF, true],
      [PLAYBACK_SPEED_ENABLED_PREF, false],
    ],
  });

  await BrowserTestUtils.withNewTab(
    {
      url: TEST_PAGE,
      gBrowser,
    },
    async browser => {
      await ensureVideosReady(browser);

      let pipWin = await triggerPictureInPicture(browser, videoID);
      Assert.ok(pipWin, "Got Picture-in-Picture window.");

      let playbackRateButton = pipWin.document.getElementById("playbackRate");
      Assert.ok(
        playbackRateButton.hidden,
        "Playback speed button is hidden when the pref is disabled."
      );

      // The shortcut keys are part of the feature, so they must stay inert too.
      EventUtils.synthesizeKey(">", { shiftKey: true }, pipWin);
      Assert.equal(
        await getVideoPlaybackRate(browser, videoID),
        1,
        "The > key does not change the rate when the pref is disabled."
      );

      await ensureMessageAndClosePiP(browser, videoID, pipWin, false);
    }
  );
});
