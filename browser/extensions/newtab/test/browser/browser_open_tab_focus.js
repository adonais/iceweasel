/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_TOP_SITE_URL = "https://example.com/";

add_task(async function test_open_tab_focus() {
  await setTestTopSites();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:newtab",
    false
  );
  // Specially wait for potentially preloaded browsers
  let browser = tab.linkedBrowser;
  await waitForPreloaded(browser);
  await waitForTopSiteLink(gBrowser, TEST_TOP_SITE_URL);
  let newTab = await openTopSiteInNewTab(gBrowser, TEST_TOP_SITE_URL);

  Assert.strictEqual(
    gBrowser.selectedTab,
    tab,
    "The original tab is still the selected tab"
  );
  BrowserTestUtils.removeTab(newTab);
  BrowserTestUtils.removeTab(tab); // The original tab
});
