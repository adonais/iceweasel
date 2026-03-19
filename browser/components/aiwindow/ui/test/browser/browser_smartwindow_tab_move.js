/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { TabStateFlusher } = ChromeUtils.importESModule(
  "resource:///modules/sessionstore/TabStateFlusher.sys.mjs"
);

// Drag a tab out of a smart window to detach it into a new window.
// The detached window should still be a smart window.
add_task(async function test_smartwindow_detach_tab() {
  let smartWin, detachedWin;
  registerCleanupFunction(async () => {
    if (detachedWin && !detachedWin.closed) {
      await BrowserTestUtils.closeWindow(detachedWin);
    }
    if (smartWin && !smartWin.closed) {
      await BrowserTestUtils.closeWindow(smartWin);
    }
  });
  smartWin = await openAIWindow();
  const tab1 = BrowserTestUtils.addTab(
    smartWin.gBrowser,
    "https://example.com"
  );
  await BrowserTestUtils.browserLoaded(tab1.linkedBrowser);
  const tab2 = BrowserTestUtils.addTab(smartWin.gBrowser, "about:newtab");
  await BrowserTestUtils.browserLoaded(tab2.linkedBrowser);
  await BrowserTestUtils.switchTab(smartWin.gBrowser, tab1);

  let prevBrowser = tab1.linkedBrowser;

  let delayedStartupPromise = BrowserTestUtils.waitForNewWindow();
  detachedWin = smartWin.gBrowser.replaceTabsWithWindow(tab1);
  await delayedStartupPromise;

  ok(
    !prevBrowser.frameLoader,
    "The swapped-from browser's frameloader has been destroyed"
  );

  Assert.ok(
    AIWindow.isAIWindowActive(detachedWin),
    "The detached window should still be a smart window"
  );

  let detachedBrowser = detachedWin.gBrowser;
  is(smartWin.gBrowser.visibleTabs.length, 2, "Two tabs now in the old window");
  is(detachedBrowser.visibleTabs.length, 1, "One tab in the detached window");

  let detachedTab = detachedBrowser.visibleTabs[0];
  await TabStateFlusher.flush(detachedTab.linkedBrowser);

  await BrowserTestUtils.closeWindow(detachedWin);
  await BrowserTestUtils.closeWindow(smartWin);
});
