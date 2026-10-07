/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that the Picture-in-Picture player keeps keyboard focus, including
 * across its own fullscreen transitions (bug 1688932).
 *
 * On macOS the player is a non-activating window, and entering its fullscreen
 * destroys and recreates the native window to drop the titlebar, so these
 * checks cover the player surviving that round trip: fullscreen state, window
 * geometry, the focus manager's active window, and the controls still working
 * afterwards. The assertions are platform-independent: every one of them
 * describes behaviour the player is expected to have everywhere.
 *
 * These tests cannot tell whether the platform still delivers real keystrokes
 * to the recreated window, because the test harness injects events into the
 * widget directly and so bypasses the window server's own routing.
 */

const ACCEPTABLE_POSITION_DIFFERENCE = 5;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      // Tab must reach buttons, not just text fields. This is the default
      // everywhere except macOS, where it follows a system setting.
      ["accessibility.tabfocus", 7],
      [
        "media.videocontrols.picture-in-picture.keyboard-controls.enabled",
        true,
      ],
    ],
  });
});

/**
 * Returns the id of the player window's focused element, or "" when focus is
 * on the document body (that is, on no control in particular).
 */
function focusedControlID(pipWin) {
  let active = pipWin.document.activeElement;
  if (!active || active == pipWin.document.body) {
    return "";
  }
  return active.id;
}

/**
 * Tests that the player window is the focus manager's active window while it
 * is focused, so that Gecko routes keyboard input to it.
 */
add_task(async function player_isActiveWindowWhenFocused() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_PAGE);
  let browser = tab.linkedBrowser;
  await ensureVideosReady(browser);

  let pipWin = await triggerPictureInPicture(browser, "with-controls");
  Assert.ok(pipWin, "Got Picture-in-Picture window.");

  await TestUtils.waitForCondition(
    () => Services.focus.activeWindow == pipWin,
    "The player window became the active window."
  );
  Assert.equal(
    Services.focus.activeWindow,
    pipWin,
    "The focused player is the active window."
  );

  await BrowserTestUtils.closeWindow(pipWin);
  BrowserTestUtils.removeTab(tab);
});

/**
 * Tests that Tab moves focus between the player's own controls and never
 * leaves the player window.
 */
add_task(async function player_tabMovesFocusWithinPlayer() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_PAGE);
  let browser = tab.linkedBrowser;
  await ensureVideosReady(browser);

  let pipWin = await triggerPictureInPicture(browser, "with-controls");
  Assert.ok(pipWin, "Got Picture-in-Picture window.");

  let seen = new Set();
  for (let i = 0; i < 4; i++) {
    EventUtils.synthesizeKey("KEY_Tab", {}, pipWin);
    await pipWin.promiseDocumentFlushed(() => {});

    Assert.equal(
      Services.focus.activeWindow,
      pipWin,
      "The player is still the active window after Tab."
    );
    Assert.ok(
      pipWin.document.activeElement,
      "The player window still has a focused element after Tab."
    );
    seen.add(focusedControlID(pipWin));
  }

  seen.delete("");
  Assert.greaterOrEqual(
    seen.size,
    2,
    `Tab reached more than one control in the player: ${[...seen].join(", ")}`
  );

  await BrowserTestUtils.closeWindow(pipWin);
  BrowserTestUtils.removeTab(tab);
});

/**
 * Tests that the player stays the active window while it is fullscreen, that
 * it still takes keyboard input there, and that Escape returns it to its
 * previous size and position.
 */
add_task(async function player_staysActiveAcrossFullscreen() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_PAGE);
  let browser = tab.linkedBrowser;
  await ensureVideosReady(browser);

  let pipWin = await triggerPictureInPicture(browser, "with-controls");
  Assert.ok(pipWin, "Got Picture-in-Picture window.");

  let before = {
    x: pipWin.screenX,
    y: pipWin.screenY,
    width: pipWin.outerWidth,
    height: pipWin.outerHeight,
  };
  Assert.ok(
    !pipWin.document.fullscreenElement,
    "The player does not start out fullscreen."
  );

  let fullscreenButton = pipWin.document.getElementById("fullscreen");
  await promiseFullscreenEntered(pipWin, async () => {
    EventUtils.synthesizeMouseAtCenter(fullscreenButton, {}, pipWin);
  });

  Assert.equal(
    pipWin.document.fullscreenElement,
    pipWin.document.body,
    "The player's body is the fullscreen element."
  );
  Assert.ok(
    pipWin.outerWidth > before.width && pipWin.outerHeight > before.height,
    `The fullscreen player grew: ${before.width}x${before.height} -> ` +
      `${pipWin.outerWidth}x${pipWin.outerHeight}`
  );

  // Note that synthesized events are delivered straight to the widget, so this
  // checks the focus manager's bookkeeping rather than the platform's idea of
  // which window receives real keystrokes.
  Assert.equal(
    Services.focus.activeWindow,
    pipWin,
    "The player is still the active window in fullscreen."
  );

  let seeked = BrowserTestUtils.waitForContentEvent(browser, "seeked", true);
  EventUtils.synthesizeKey("KEY_ArrowRight", {}, pipWin);
  Assert.ok(await seeked, "An arrow key still reaches the fullscreen player.");

  // Escape leaves fullscreen rather than closing the player, so this also
  // shows that key events are routed to the recreated window.
  await promiseFullscreenExited(pipWin, async () => {
    EventUtils.synthesizeKey("KEY_Escape", {}, pipWin);
  });

  Assert.ok(
    !pipWin.document.fullscreenElement,
    "Escape took the player out of fullscreen."
  );
  Assert.ok(!pipWin.closed, "Escape did not close the player.");
  Assert.equal(
    Services.focus.activeWindow,
    pipWin,
    "The player is still the active window after leaving fullscreen."
  );

  await TestUtils.waitForCondition(
    () =>
      Math.abs(pipWin.outerWidth - before.width) <=
        ACCEPTABLE_POSITION_DIFFERENCE &&
      Math.abs(pipWin.outerHeight - before.height) <=
        ACCEPTABLE_POSITION_DIFFERENCE,
    "The player returned to its pre-fullscreen size."
  );
  Assert.lessOrEqual(
    Math.abs(pipWin.screenX - before.x),
    ACCEPTABLE_POSITION_DIFFERENCE,
    "The player returned to its pre-fullscreen x position."
  );
  Assert.lessOrEqual(
    Math.abs(pipWin.screenY - before.y),
    ACCEPTABLE_POSITION_DIFFERENCE,
    "The player returned to its pre-fullscreen y position."
  );

  await BrowserTestUtils.closeWindow(pipWin);
  BrowserTestUtils.removeTab(tab);
});

/**
 * Tests that the player's controls still work after a fullscreen round trip,
 * which recreates the native window on macOS.
 */
add_task(async function player_controlsWorkAfterFullscreenRoundTrip() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_PAGE);
  let browser = tab.linkedBrowser;
  await ensureVideosReady(browser);

  let pipWin = await triggerPictureInPicture(browser, "with-controls");
  Assert.ok(pipWin, "Got Picture-in-Picture window.");

  let fullscreenButton = pipWin.document.getElementById("fullscreen");
  await promiseFullscreenEntered(pipWin, async () => {
    EventUtils.synthesizeMouseAtCenter(fullscreenButton, {}, pipWin);
  });
  await promiseFullscreenExited(pipWin, async () => {
    EventUtils.synthesizeMouseAtCenter(fullscreenButton, {}, pipWin);
  });

  Assert.ok(
    !pipWin.document.fullscreenElement,
    "The fullscreen button left fullscreen."
  );

  // Mouse input: the play/pause button still toggles playback.
  let wasPaused = await isVideoPaused(browser, "with-controls");
  let playbackChanged = BrowserTestUtils.waitForContentEvent(
    browser,
    wasPaused ? "play" : "pause",
    true
  );
  EventUtils.synthesizeMouseAtCenter(
    pipWin.document.getElementById("playpause"),
    {},
    pipWin
  );
  await playbackChanged;
  Assert.equal(
    await isVideoPaused(browser, "with-controls"),
    !wasPaused,
    "The play/pause button still works."
  );

  // Keyboard input: Tab still moves focus inside the player.
  EventUtils.synthesizeKey("KEY_Tab", {}, pipWin);
  await pipWin.promiseDocumentFlushed(() => {});
  Assert.ok(
    pipWin.document.activeElement,
    "Tab still moves focus within the player after fullscreen."
  );

  // The close button still closes the player.
  let pipClosed = BrowserTestUtils.domWindowClosed(pipWin);
  EventUtils.synthesizeMouseAtCenter(
    pipWin.document.getElementById("close"),
    {},
    pipWin
  );
  await pipClosed;
  Assert.ok(pipWin.closed, "The close button still closes the player.");

  BrowserTestUtils.removeTab(tab);
});
