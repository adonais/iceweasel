/*
 * This file contains tests for the Preferences search bar.
 */

// Opening about:preferences repeatedly is very slow under the macOS
// test-verify chaos passes; see bug 2052897.
requestLongerTimeout(4);

/**
 * Test for searching for the "Settings - Site Data" subdialog.
 */
add_task(async function () {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  await evaluateSearchResults("cookies", [
    "cookiesAndSiteData",
    "trackingGroup",
  ]);
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function () {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  await evaluateSearchResults("site data", ["cookiesAndSiteData"]);
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function () {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  await evaluateSearchResults("cache", ["cookiesAndSiteData"]);
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function () {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  await evaluateSearchResults("cross-site", ["trackingGroup"]);
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
