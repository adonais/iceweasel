/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  ScreenshotsUtils:
    "moz-src:///browser/components/screenshots/ScreenshotsUtils.sys.mjs",
});

const { SELECTION_MODES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/screenshots/ScreenshotsSelectionModes.sys.mjs"
);

/**
 * Start a mini window Screenshots session and hand back the panel's
 * <screenshots-buttons> element once it has rendered.
 *
 * @param {XULBrowserElement} browser
 */
async function openChooser(browser) {
  await SimpleTest.promiseFocus(browser.ownerGlobal);
  await ScreenshotsUtils.start(browser, "MiniWindowToolbarButton", {
    mode: SELECTION_MODES.MINI_WINDOW,
  });
  let panel = await TestUtils.waitForCondition(
    () => ScreenshotsUtils.panelForBrowser(browser),
    "waiting for the buttons panel"
  );
  let buttons = panel.querySelector("screenshots-buttons");
  // The panel focuses its default button in a requestAnimationFrame that start()
  // does not await.
  let defaultButton = buttons.moveSelectionButton;
  await TestUtils.waitForCondition(
    () => defaultButton.getRootNode().activeElement === defaultButton,
    "waiting for the default chooser button to take focus"
  );
  return buttons;
}

add_task(async function test_chooser_renders_in_mini_window_mode() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  let browser = tab.linkedBrowser;

  let buttons = await openChooser(browser);
  let shadow = buttons.shadowRoot;

  Assert.ok(
    shadow.querySelector(".mini-window-chooser"),
    "the chooser is rendered instead of the save buttons"
  );
  Assert.ok(
    shadow.getElementById("move-selection"),
    "there is a move selection option"
  );
  Assert.ok(
    shadow.getElementById("move-full-tab"),
    "there is a move full tab option"
  );
  Assert.ok(
    !shadow.getElementById("visible-page"),
    "the Screenshots save buttons are not rendered"
  );

  ScreenshotsUtils.exit(browser);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_move_full_tab_pops_the_whole_tab() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  let browser = tab.linkedBrowser;

  let buttons = await openChooser(browser);

  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  buttons.shadowRoot.getElementById("move-full-tab").click();
  let miniWin = await opened;

  let popup = [...MiniWindowManager._miniwindows][0];
  Assert.ok(popup, "a mini window was created");
  Assert.ok(!popup.isCropped, "move full tab makes a full-tab mini window");

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs();
});

add_task(async function test_move_selection_dismisses_the_chooser() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  let browser = tab.linkedBrowser;

  let buttons = await openChooser(browser);
  let panel = ScreenshotsUtils.panelForBrowser(browser);
  Assert.ok(!panel.hidden, "the chooser is showing to begin with");

  await SimpleTest.promiseFocus(browser);

  // Picking the default gets the panel out of the way and leaves the overlay
  // up so the user can drag a region.
  buttons.shadowRoot.getElementById("move-selection").click();

  await TestUtils.waitForCondition(
    () => ScreenshotsUtils.panelForBrowser(browser)?.hidden,
    "waiting for the chooser to hide"
  );
  Assert.equal(
    ScreenshotsUtils.browserToScreenshotsState.get(browser)?.mode,
    SELECTION_MODES.MINI_WINDOW,
    "the mini window session is still running"
  );

  await SpecialPowers.spawn(browser, [], async () => {
    let screenshotsChild = content.windowGlobalChild.getActor(
      "ScreenshotsComponent"
    );
    await ContentTaskUtils.waitForCondition(
      () =>
        Services.focus.focusedElement === screenshotsChild.overlay.previewFace,
      "waiting for focus to land on the overlay"
    );
    Assert.ok(true, "focus followed the panel into the overlay");
  });

  ScreenshotsUtils.exit(browser);
  BrowserTestUtils.removeTab(tab);
});
