/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that tab telemetry can be collected while a browser window is opening,
 * when it's already listed by the window mediator but has no gBrowser yet.
 */
add_task(async function test_tab_telemetry_while_window_opening() {
  let checked = false;
  const observer = doc => {
    if (doc.documentURI !== AppConstants.BROWSER_CHROME_URL) {
      return;
    }
    Services.obs.removeObserver(observer, "document-element-inserted");
    const win = doc.defaultView;
    const windows = [...Services.wm.getEnumerator("navigator:browser")];
    Assert.ok(windows.includes(win), "The opening window is already listed");
    Assert.ok(!win.gBrowser, "The opening window has no gBrowser yet");
    try {
      BrowserUsageTelemetry.recordPinnedTabsCount();
      BrowserUsageTelemetry._onTabsOpened();
      BrowserUsageTelemetry._doOnTabGroupChange();
      BrowserUsageTelemetry._doOnTabGroupExpandOrCollapse();
      BrowserTelemetryUtils.computeSiteOriginCount(windows, false);
      Assert.ok(true, "Tab telemetry was collected");
    } catch (e) {
      Assert.ok(false, `Collecting tab telemetry threw: ${e}`);
    }
    checked = true;
  };
  Services.obs.addObserver(observer, "document-element-inserted");

  const win = await BrowserTestUtils.openNewBrowserWindow();
  Assert.ok(checked, "Tab telemetry was checked while the window was opening");
  await BrowserTestUtils.closeWindow(win);
});
