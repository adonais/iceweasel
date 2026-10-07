/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Closing the last browser window on macOS leaves the browser running, and
 * SessionStore restores the pinned tabs and sidebar state of that window into
 * the next window that opens. SidebarController waits for that restore to
 * complete before applying tab layout changes, so this test makes sure such a
 * window still switches between vertical and horizontal tabs.
 */

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.animation.enabled", false],
      [VERTICAL_TABS_PREF, true],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
});

add_task(async function test_toggle_tabstrip_in_restored_last_window() {
  // Give SessionStore a closed window with a pinned tab to restore from.
  const win = await BrowserTestUtils.openNewBrowserWindow();
  await SidebarTestUtils.waitForTabstripOrientation(win, "vertical");
  const pinnedTab = BrowserTestUtils.addTab(win.gBrowser, "about:robots");
  await BrowserTestUtils.browserLoaded(pinnedTab.linkedBrowser);
  win.gBrowser.pinTab(pinnedTab);
  await BrowserTestUtils.closeWindow(win);
  Assert.greater(
    SessionStore.getClosedWindowCount(),
    0,
    "The closed window was saved."
  );

  // This is what the macOS window closing path notifies once the last browser
  // window goes away without the browser quitting.
  Services.obs.notifyObservers(null, "browser-lastwindow-close-granted");

  // A window opened from the Dock or with Cmd+N has no opener, so the sidebar
  // has no window to adopt its state from and relies on session restore.
  const restoredWin = await BrowserTestUtils.openNewBrowserWindow({
    openerWindow: null,
  });
  try {
    Assert.ok(
      restoredWin.gBrowser.tabs.some(tab => tab.pinned),
      "The closed window's pinned tab was restored into the new window."
    );

    let initialized = false;
    restoredWin.SidebarController.promiseInitialized.then(() => {
      initialized = true;
    });
    await TestUtils.waitForCondition(
      () => initialized,
      "SidebarController.promiseInitialized resolves in the restored window."
    );

    await SpecialPowers.pushPrefEnv({ set: [[VERTICAL_TABS_PREF, false]] });
    await SidebarTestUtils.waitForTabstripOrientation(
      restoredWin,
      "horizontal"
    );
    Assert.ok(
      restoredWin.document
        .getElementById("TabsToolbar")
        .contains(restoredWin.gBrowser.tabContainer),
      "Tab strip moved into the horizontal tabs toolbar."
    );
    Assert.ok(
      !restoredWin.document
        .getElementById(CustomizableUI.AREA_VERTICAL_TABSTRIP)
        .hasAttribute("visible"),
      "Vertical tabs toolbar is no longer visible."
    );
  } finally {
    await BrowserTestUtils.closeWindow(restoredWin);
  }

  await SpecialPowers.popPrefEnv();
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
});
