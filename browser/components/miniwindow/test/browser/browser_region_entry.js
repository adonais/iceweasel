/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  ScreenshotsUtils:
    "moz-src:///browser/components/screenshots/ScreenshotsUtils.sys.mjs",
});

const { SELECTION_MODES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/screenshots/ScreenshotsSelectionModes.sys.mjs"
);

const EXAMPLE_URL = "https://example.com/";

add_task(async function test_mini_window_from_region() {
  // Not withNewTab: miniWindowFromRegion pops the tab into a new window, so
  // withNewTab cannot track/clean up its own tab. Manage it here.
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);
  let browser = tab.linkedBrowser;

  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  await ScreenshotsUtils.miniWindowFromRegion(
    {
      // Page-absolute selection smaller than the viewport.
      region: { left: 10, top: 20, width: 100, height: 80 },
      viewportWidth: browser.clientWidth,
      viewportHeight: browser.clientHeight,
    },
    browser
  );
  let miniWin = await opened;

  Assert.ok(miniWin, "miniWindowFromRegion opened a popup window");
  Assert.equal(MiniWindowManager._miniwindows.size, 1, "One popup registered");

  let popup = [...MiniWindowManager._miniwindows][0];
  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();

  removeTestTabs(EXAMPLE_URL);
});

add_task(async function test_open_panel_renders_chooser_in_mini_window_mode() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);
  let browser = tab.linkedBrowser;

  // Mini window reuses the Screenshots overlay, but its panel offers what to
  // move rather than the Save-visible / Save-full-page buttons.
  ScreenshotsUtils.setPerBrowserState(browser, {
    mode: SELECTION_MODES.MINI_WINDOW,
  });
  ScreenshotsUtils.openPanel(browser);

  let panel = ScreenshotsUtils.panelForBrowser(browser);
  Assert.ok(panel, "openPanel created a panel for a mini-window browser");

  let shadow = panel.querySelector("screenshots-buttons").shadowRoot;
  Assert.ok(
    shadow.querySelector(".mini-window-chooser"),
    "the panel renders the chooser rather than the save buttons"
  );
  Assert.ok(
    !shadow.getElementById("visible-page"),
    "the Screenshots save buttons are not rendered"
  );

  // This task now leaves a panel behind, unlike when openPanel was a no-op.
  ScreenshotsUtils.closePanel(browser);
  ScreenshotsUtils.browserToScreenshotsState.delete(browser);
  BrowserTestUtils.removeTab(tab);
});
