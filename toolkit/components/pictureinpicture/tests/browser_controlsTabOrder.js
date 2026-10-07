/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that the first Tab press moves focus onto the play/pause button rather
 * than the first control in DOM order.
 */
add_task(async function test_first_tab_focuses_playpause() {
  await withPipWindow({}, async (browser, pipWin) => {
    let playpauseButton = pipWin.document.getElementById("playpause");

    EventUtils.synthesizeKey("KEY_Tab", {}, pipWin);

    Assert.equal(
      pipWin.document.activeElement,
      playpauseButton,
      "First Tab should focus the play/pause button"
    );
  });
});

/**
 * Tests that the first Shift+Tab press moves focus onto the seek backward
 * button rather than the last control in the DOM order.
 */
add_task(async function test_first_shift_tab_focuses_seek_backward() {
  await withPipWindow({}, async (browser, pipWin) => {
    let seekBackwardButton = pipWin.document.getElementById("seekBackward");
    await waitForControl(seekBackwardButton);

    EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true }, pipWin);

    Assert.equal(
      pipWin.document.activeElement,
      seekBackwardButton,
      "First Shift+Tab should focus the seek backward button"
    );
  });
});

/**
 * Tests that the first Shift+Tab press moves focus onto the next available
 * preceding control when the seek backward button is unavailable and
 * the window is narrower.
 */
add_task(
  async function test_first_shift_tab_focuses_preceding_control_smaller_window() {
    // Set the window to less than 300px wide so that seek buttons are hidden.
    await withPipWindow({ size: [272, 149] }, async (browser, pipWin) => {
      // Give the player time to make the seek backward button a usable feature first.
      // After layout finalizes, ensure the button is hidden because of the window size.
      let seekBackwardButton = pipWin.document.getElementById("seekBackward");
      await waitForControl(seekBackwardButton);
      Assert.ok(
        !seekBackwardButton.checkVisibility(),
        "Seek backward button should not be visible in a narrow window"
      );

      // The close and unpip buttons swap places depending on the platform.
      let expectedButton = pipWin.document.getElementById(
        AppConstants.platform == "macosx" ? "unpip" : "close"
      );

      EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true }, pipWin);

      Assert.equal(
        pipWin.document.activeElement,
        expectedButton,
        `First Shift+Tab should focus the #${expectedButton.id} button`
      );
    });
  }
);

/**
 * Tests that tabbing out of the playback speed panel reaches the subtitles
 * button, which is the next control in DOM order.
 */
add_task(async function test_tab_out_of_playback_rate_panel() {
  await withPipWindow(
    {
      // The subtitles button is only focusable once the video has text tracks,
      // so load a video with WebVTT to assert the full tab order.
      url: TEST_PAGE_WITH_WEBVTT,
      prefs: [
        ["media.videocontrols.picture-in-picture.playback-speed.enabled", true],
        [
          "media.videocontrols.picture-in-picture.display-text-tracks.enabled",
          true,
        ],
      ],
    },
    async (browser, pipWin) => {
      let playbackRateButton = pipWin.document.getElementById("playbackRate");
      let playbackRatePanel = pipWin.document.getElementById(
        "playbackRateSettings"
      );
      let playbackRateSlider = pipWin.document.getElementById(
        "playback-rate-slider"
      );
      let subtitlesButton = pipWin.document.getElementById("closed-caption");
      await waitForControl(subtitlesButton);

      await openPanelWithKeyboard(
        pipWin,
        playbackRateButton,
        playbackRatePanel
      );

      Assert.equal(
        pipWin.document.activeElement,
        playbackRateSlider,
        "Playback rate slider should have focus after opening the panel"
      );

      // Start from the last preset, which is the final tab stop in the panel.
      let presets = playbackRatePanel.querySelectorAll(".playback-rate-preset");
      Assert.greater(presets.length, 0, "Found playback rate presets");
      presets[presets.length - 1].focus();

      EventUtils.synthesizeKey("KEY_Tab", {}, pipWin);

      Assert.equal(
        pipWin.document.activeElement,
        subtitlesButton,
        "Tabbing out of the playback speed panel should focus the subtitles button"
      );
    }
  );
});

/**
 * Tests that tabbing out of the subtitles settings panel reaches the
 * fullscreen button, which is the next control in DOM order.
 */
add_task(async function test_tab_out_of_subtitles_panel() {
  await withPipWindow(
    {
      // The subtitles button is only focusable once the video has text tracks,
      // so load a video with WebVTT to assert the full tab order.
      url: TEST_PAGE_WITH_WEBVTT,
      prefs: [
        [
          "media.videocontrols.picture-in-picture.display-text-tracks.enabled",
          true,
        ],
        [
          "media.videocontrols.picture-in-picture.display-text-tracks.toggle.enabled",
          true,
        ],
      ],
    },
    async (browser, pipWin) => {
      let subtitlesButton = pipWin.document.getElementById("closed-caption");
      let settingsPanel = pipWin.document.getElementById("settings");
      let subtitlesToggle = pipWin.document.getElementById("subtitles-toggle");
      let fullscreenButton = pipWin.document.getElementById("fullscreen");

      await openPanelWithKeyboard(pipWin, subtitlesButton, settingsPanel);

      Assert.equal(
        pipWin.document.activeElement,
        subtitlesToggle,
        "Subtitles toggle should have focus after opening the panel"
      );

      // The font size radios form a single tab stop at the checked radio, which
      // is the final tab stop in the panel.
      let checkedFontSize = settingsPanel.querySelector(
        'input[type="radio"][name="cc-size"]:checked'
      );
      Assert.ok(checkedFontSize, "Found the checked font size radio");
      checkedFontSize.focus();

      EventUtils.synthesizeKey("KEY_Tab", {}, pipWin);

      Assert.equal(
        pipWin.document.activeElement,
        fullscreenButton,
        "Tabbing out of the subtitles panel should focus the fullscreen button"
      );
    }
  );
});
