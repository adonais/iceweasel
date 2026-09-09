/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SLOW_URL =
  "https://example.com/browser/browser/components/tabbrowser/test/browser/statuspanel/slow_page.sjs";

/**
 * Test that the network status of a still-loading tab is shown again after
 * switching away from that tab and back, even when the load makes no further
 * progress in the meantime.
 */
add_task(async function test_statuspanel_restored_after_tab_switch() {
  let idleTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  let slowTab = BrowserTestUtils.addTab(gBrowser, SLOW_URL);
  gBrowser.selectedTab = slowTab;

  // Switching tabs replays the last status gBrowser recorded for the tab, and
  // that record is reset when the load starts.
  await new Promise(resolve => {
    let started = false;
    let listener = {
      onStateChange(browser, webProgress, request, stateFlags) {
        if (
          browser == slowTab.linkedBrowser &&
          webProgress.isTopLevel &&
          stateFlags & Ci.nsIWebProgressListener.STATE_START
        ) {
          started = true;
        }
      },
      onStatusChange(browser, webProgress, request, status, message) {
        if (started && browser == slowTab.linkedBrowser && message) {
          gBrowser.removeTabsProgressListener(listener);
          resolve();
        }
      },
    };
    gBrowser.addTabsProgressListener(listener);
  });

  await TestUtils.waitForCondition(
    () =>
      StatusPanel.isVisible &&
      StatusPanel.panel.getAttribute("type") == "status",
    "Waiting for the status panel to show a network status"
  );
  let status = StatusPanel._labelElement.value;
  info(`Network status: "${status}"`);

  gBrowser.selectedTab = idleTab;
  Assert.ok(
    !StatusPanel.isVisible,
    "Status panel should be hidden for the idle tab"
  );

  gBrowser.selectedTab = slowTab;
  Assert.ok(
    StatusPanel.isVisible,
    "Status panel should be visible again for the still-loading tab"
  );
  Assert.equal(
    StatusPanel.panel.getAttribute("type"),
    "status",
    "Status panel should show a network status"
  );
  Assert.equal(
    StatusPanel._labelElement.value,
    status,
    "Status panel should show the same network status as before"
  );

  BrowserTestUtils.removeTab(slowTab);
  BrowserTestUtils.removeTab(idleTab);
});
