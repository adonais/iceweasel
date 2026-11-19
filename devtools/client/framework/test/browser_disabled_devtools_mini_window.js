/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Check that DevTools can't be opened for mini window.

const TEST_URL = "data:text/html;charset=utf-8,Mini Window";

const { MiniWindowManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/miniwindow/MiniWindowManager.sys.mjs"
);

add_task(async function testKeyboardShortcutInMiniWindow() {
  info("Check that DevTools keyboard shortcut isn't active in mini window");
  await pushPref("browser.mini-window.enabled", true);
  const tab = await addTab(TEST_URL);
  const poppedChromeWindow = await openTabInMiniWindow(tab);

  const toolboxCountBeforeKeyboardShortcut = gDevTools.getToolboxes().length;
  EventUtils.synthesizeKey("VK_F12", {}, poppedChromeWindow);
  // Wait for a bit so the toolbox would have the time to be initialized
  await wait(1000);
  is(
    gDevTools.getToolboxes().length,
    toolboxCountBeforeKeyboardShortcut,
    "No toolbox were opened in the mini window"
  );

  const miniWindow = [...MiniWindowManager._miniwindows][0];
  miniWindow.close();
  await BrowserTestUtils.domWindowClosed(poppedChromeWindow);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function testMovingTabWithToolboxToMiniWindow() {
  info(
    "Check that the toolbox doesn't get reopened when the tab is moved to the mini window"
  );
  await pushPref("browser.mini-window.enabled", true);
  const tab = await addTab(TEST_URL);
  await gDevTools.showToolboxForTab(tab, {
    toolId: "settings",
  });

  const toolboxCountBeforeMovingToMiniWindow = gDevTools.getToolboxes().length;

  const poppedChromeWindow = await openTabInMiniWindow(tab);
  // Wait a bit so the toolbox could have been re-created in the mini window
  await wait(1000);
  is(
    gDevTools.getToolboxes().length,
    toolboxCountBeforeMovingToMiniWindow - 1,
    "The toolbox wasn't re-opened in the mini window"
  );

  const miniWindow = [...MiniWindowManager._miniwindows][0];
  miniWindow.close();
  await BrowserTestUtils.domWindowClosed(poppedChromeWindow);
  BrowserTestUtils.removeTab(tab);
});

async function openTabInMiniWindow(tab) {
  const opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  const winPromise = MiniWindowManager.popTab(tab);
  const miniWin = await opened;
  await winPromise;
  return miniWin;
}
