/*
 * This file contains tests for the Preferences search bar.
 */

/**
 * Test for searching for the "Languages" subdialog.
 */
add_task(async function () {
  await openPreferencesViaOpenPreferencesAPI("paneGeneral", {
    leaveOpen: true,
  });
  await evaluateSearchResults("Choose languages", "languagesGroup");
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
