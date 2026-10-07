/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// A window in fullscreen covers the screen, so the position we compute for a
// window that a tab is detached into gets clamped into the corner of the
// screen. Check that we leave the position of the new window alone in that
// case, and keep passing the drop position the rest of the time.

/**
 * Drags aTab out of the tab strip and returns the properties that would have
 * been passed to the new window, without opening one.
 *
 * @param {MozTabbrowserTab} aTab
 * @returns {object}
 */
async function detachTabWithoutOpeningWindow(aTab) {
  let props;
  let originalFn = gBrowser.replaceTabsWithWindow;
  gBrowser.replaceTabsWithWindow = (contextTab, options) => {
    props = options;
    return null;
  };
  try {
    await EventUtils.synthesizePlainDragAndDrop({
      srcElement: aTab,
      // destElement is null because tab detaching happens due to a
      // drag'n'drop on an invalid drop target.
      destElement: null,
      // Don't move horizontally because that could cause a tab move
      // animation, and there's code to prevent a tab detaching if the dragged
      // tab is released while the animation is running.
      stepX: 0,
      stepY: 100,
    });
  } finally {
    gBrowser.replaceTabsWithWindow = originalFn;
  }
  return props;
}

async function toggleFullScreen() {
  let fullScreenToggled = BrowserTestUtils.waitForEvent(window, "fullscreen");
  document.getElementById("View:FullScreen").doCommand();
  await fullScreenToggled;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    // Keep the tab strip visible in fullscreen so that we can drag a tab out
    // of it.
    set: [["browser.fullscreen.autohide", false]],
  });
  registerCleanupFunction(async () => {
    if (window.fullScreen) {
      await toggleFullScreen();
    }
  });
});

add_task(async function test_detach_from_normal_window() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  let props = await detachTabWithoutOpeningWindow(tab);
  ok(props, "The tab was detached");
  ok(Number.isFinite(props.screenX), "The drop position was passed along");
  ok(Number.isFinite(props.screenY), "The drop position was passed along");
  ok(
    !props.suppressinitialfullscreen,
    "The new window doesn't need to suppress its initial fullscreen"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_detach_from_fullscreen_window() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  await toggleFullScreen();
  ok(window.fullScreen, "The window is in fullscreen");

  let props = await detachTabWithoutOpeningWindow(tab);
  ok(props, "The tab was detached");
  ok(
    !("screenX" in props) && !("screenY" in props),
    "The new window picks its own position"
  );
  is(
    props.suppressinitialfullscreen,
    1,
    "The new window doesn't enter fullscreen on its initial show"
  );

  await toggleFullScreen();
  ok(!window.fullScreen, "The window left fullscreen");

  BrowserTestUtils.removeTab(tab);
});
