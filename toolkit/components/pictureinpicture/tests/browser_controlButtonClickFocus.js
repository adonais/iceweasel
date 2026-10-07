/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const VIDEO_ID = "with-controls";

/**
 * Tests that pressing Space when PiP initializes immediately toggles playback
 * rather than activating any controls.
 */
add_task(async function test_space_toggles_playback_on_init() {
  await withPipWindow({}, async (browser, pipWin) => {
    Assert.ok(
      !pipWin.document.activeElement?.closest(".control-button"),
      "No control button should have focus when the window opens"
    );

    let pausedPromise = BrowserTestUtils.waitForContentEvent(
      browser,
      "pause",
      true
    );
    EventUtils.synthesizeKey(" ", {}, pipWin);
    await pausedPromise;

    Assert.ok(
      await isVideoPaused(browser, VIDEO_ID),
      "Space should pause the video right after opening the window"
    );
  });
});

/**
 * Tests that clicking a control button does not move focus onto it, so that
 * pressing Space afterwards toggles playback instead of re-activating the
 * clicked button.
 */
add_task(async function test_click_does_not_focus_control_button() {
  await withPipWindow({}, async (browser, pipWin) => {
    let seekForwardButton = pipWin.document.getElementById("seekForward");
    await BrowserTestUtils.waitForMutationCondition(
      seekForwardButton,
      { attributeFilter: ["hidden"] },
      () => !seekForwardButton.hidden,
      { msg: "Waiting for the seek forward button to be visible" }
    );

    let seeked = BrowserTestUtils.waitForContentEvent(browser, "seeked", true);
    EventUtils.synthesizeMouseAtCenter(seekForwardButton, {}, pipWin);
    await seeked;

    Assert.notEqual(
      pipWin.document.activeElement,
      seekForwardButton,
      "Clicking the seek forward button should not focus it"
    );

    // If the Space keypress activated the button again, the video would seek
    // instead of only pausing.
    let timeBeforeSpace = await getVideoCurrentTime(browser, VIDEO_ID);

    let pausedPromise = BrowserTestUtils.waitForContentEvent(
      browser,
      "pause",
      true
    );
    EventUtils.synthesizeKey(" ", {}, pipWin);
    await pausedPromise;

    Assert.ok(
      await isVideoPaused(browser, VIDEO_ID),
      "Space should pause the video after clicking a control button"
    );
    // Tolerate a few milliseconds difference in current time, to take into acccount
    // playback drift prior to pausing the video.
    Assert.less(
      Math.abs(
        (await getVideoCurrentTime(browser, VIDEO_ID)) - timeBeforeSpace
      ),
      1,
      "Video should not have seeked again"
    );
  });
});

/**
 * Tests that Space still activates a control button with keyboard focus.
 */
add_task(async function test_space_activates_focused_control_button() {
  await withPipWindow({}, async (browser, pipWin) => {
    let seekForwardButton = pipWin.document.getElementById("seekForward");
    await BrowserTestUtils.waitForMutationCondition(
      seekForwardButton,
      { attributeFilter: ["hidden"] },
      () => !seekForwardButton.hidden,
      { msg: "Waiting for the seek forward button to be visible" }
    );

    seekForwardButton.focus();

    let seeked = BrowserTestUtils.waitForContentEvent(browser, "seeked", true);
    EventUtils.synthesizeKey(" ", {}, pipWin);
    await seeked;

    Assert.ok(
      !(await isVideoPaused(browser, VIDEO_ID)),
      "Space should activate the focused button rather than pause the video"
    );
  });
});

/**
 * Tests that Space still activates the controls inside a settings panel, rather
 * than toggling playback.
 */
add_task(async function test_space_activates_panel_controls() {
  await withPipWindow(
    {
      // Test with the subtitles panel, so load text tracks.
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

      // Open the panel with the keyboard, so that focus moves into it.
      await openPanelWithKeyboard(pipWin, subtitlesButton, settingsPanel);

      let subtitlesToggle = pipWin.document.getElementById("subtitles-toggle");
      Assert.equal(
        pipWin.document.activeElement,
        subtitlesToggle,
        "Subtitles toggle should have focus after opening the panel"
      );

      let wasChecked = subtitlesToggle.checked;
      let toggleChanged = BrowserTestUtils.waitForEvent(
        subtitlesToggle,
        "change"
      );
      EventUtils.synthesizeKey(" ", {}, pipWin);
      await toggleChanged;

      Assert.notEqual(
        subtitlesToggle.checked,
        wasChecked,
        "Space should flip the subtitles toggle"
      );
      Assert.ok(
        !(await isVideoPaused(browser, VIDEO_ID)),
        "Video should still be playing, so Space did not toggle playback"
      );
    }
  );
});
