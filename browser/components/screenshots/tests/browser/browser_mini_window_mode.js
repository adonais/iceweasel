/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ScreenshotsUtils:
    "moz-src:///browser/components/screenshots/ScreenshotsUtils.sys.mjs",
});

const { SELECTION_MODES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/screenshots/ScreenshotsSelectionModes.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.mini-window.enabled", true]],
  });
});

async function getOverlayButtonIds(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    let screenshotsChild = content.windowGlobalChild.getActor(
      "ScreenshotsComponent"
    );
    let buttonsContainer =
      screenshotsChild.overlay.getElementById("buttons-container");
    return Array.from(buttonsContainer.querySelectorAll("button")).map(
      button => button.id
    );
  });
}

async function getOverlayMode(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    let screenshotsChild = content.windowGlobalChild.getActor(
      "ScreenshotsComponent"
    );
    return screenshotsChild.overlay.mode;
  });
}

add_task(async function test_mini_window_mode_shows_single_pop_button() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_PAGE,
    },
    async browser => {
      let helper = new ScreenshotsHelper(browser);

      ScreenshotsUtils.start(browser, "MiniWindowTest", {
        mode: SELECTION_MODES.MINI_WINDOW,
      });

      await TestUtils.waitForCondition(
        () => helper.isOverlayInitialized(),
        "Waiting for the overlay to initialize"
      );

      Assert.equal(
        await getOverlayMode(browser),
        SELECTION_MODES.MINI_WINDOW,
        "The overlay was initialized with mini-window mode"
      );

      helper.assertPanelNotVisible();

      let buttonIds = await getOverlayButtonIds(browser);
      Assert.deepEqual(
        buttonIds,
        ["mini-window-cancel-button", "reselect-button", "pop"],
        "mini-window mode renders dismiss, reselect and pop buttons"
      );

      ScreenshotsUtils.exit(browser);

      await TestUtils.waitForCondition(
        async () => !(await helper.isOverlayInitialized()),
        "Waiting for the overlay to be torn down"
      );
    }
  );
});

/**
 * Call what the mini window toolbar button and context menu item both call, so
 * these exercise the same path they do.
 */
function triggerMiniWindowEntryPoint(browser) {
  ScreenshotsUtils.toggle(browser, "TestEntryPoint", {
    mode: SELECTION_MODES.MINI_WINDOW,
  });
}

/**
 * Wait for the overlay to be showing in a given mode. The child tears the
 * overlay down and rebuilds it to change modes, so there is a window where it
 * reports the new mode while still being uninitialized.
 */
async function waitForOverlayMode(helper, browser, mode) {
  await TestUtils.waitForCondition(
    async () =>
      (await helper.isOverlayInitialized()) &&
      (await getOverlayMode(browser)) === mode,
    `Waiting for the overlay to be showing in ${mode} mode`
  );
}

add_task(async function test_screenshots_button_takes_over_mini_window() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_PAGE,
    },
    async browser => {
      let helper = new ScreenshotsHelper(browser);

      ScreenshotsUtils.start(browser, "MiniWindowTest", {
        mode: SELECTION_MODES.MINI_WINDOW,
      });
      await waitForOverlayMode(helper, browser, SELECTION_MODES.MINI_WINDOW);
      helper.assertPanelNotVisible();

      // The Screenshots toolbar button doesn't own this overlay, so it takes it
      // over instead of toggling it shut the way a second click would.
      helper.triggerUIFromToolbar();

      await waitForOverlayMode(helper, browser, SELECTION_MODES.SCREENSHOTS);

      Assert.deepEqual(
        await getOverlayButtonIds(browser),
        ["cancel", "copy", "download"],
        "the overlay rebuilt with the screenshots buttons"
      );

      await helper.waitForPanel();
      helper.assertPanelVisible();

      ScreenshotsUtils.exit(browser);
      await TestUtils.waitForCondition(
        async () => !(await helper.isOverlayInitialized()),
        "Waiting for the overlay to be torn down"
      );
    }
  );
});

add_task(async function test_mini_window_button_takes_over_screenshots() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_PAGE,
    },
    async browser => {
      let helper = new ScreenshotsHelper(browser);

      helper.triggerUIFromToolbar();
      await waitForOverlayMode(helper, browser, SELECTION_MODES.SCREENSHOTS);
      await helper.waitForPanel();
      helper.assertPanelVisible();

      triggerMiniWindowEntryPoint(browser);

      await waitForOverlayMode(helper, browser, SELECTION_MODES.MINI_WINDOW);

      Assert.deepEqual(
        await getOverlayButtonIds(browser),
        ["mini-window-cancel-button", "reselect-button", "pop"],
        "the overlay rebuilt with the mini-window buttons"
      );

      // Mini-window mode has no buttons panel, so the one screenshots mode left
      // behind has to be gone.
      helper.assertPanelNotVisible();

      ScreenshotsUtils.exit(browser);
      await TestUtils.waitForCondition(
        async () => !(await helper.isOverlayInitialized()),
        "Waiting for the overlay to be torn down"
      );
    }
  );
});

add_task(async function test_mini_window_entry_point_toggles_closed() {
  await BrowserTestUtils.withNewTab(
    {
      gBrowser,
      url: TEST_PAGE,
    },
    async browser => {
      let helper = new ScreenshotsHelper(browser);

      triggerMiniWindowEntryPoint(browser);
      await waitForOverlayMode(helper, browser, SELECTION_MODES.MINI_WINDOW);

      // Going through the same entry point again closes the overlay, matching
      // what a second click on the Screenshots button does.
      triggerMiniWindowEntryPoint(browser);

      await TestUtils.waitForCondition(
        async () => !(await helper.isOverlayInitialized()),
        "Waiting for the overlay to be toggled shut"
      );
    }
  );
});
