// This test simulates opening the newtab page and moving it to a new window.
// Links in the page should still work.

// The only site setTestTopSites configures, and the only one this test may
// click. Addressed by URL because tiles pinned by an earlier test can also be
// in the row.
const TEST_URL = "https://example.com/";

add_task(async function test_newtab_to_window() {
  await setTestTopSites();

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:newtab",
    false
  );

  let swappedPromise = BrowserTestUtils.waitForEvent(
    tab.linkedBrowser,
    "SwapDocShells"
  );
  let newWindow = gBrowser.replaceTabWithWindow(tab);
  await swappedPromise;

  is(
    newWindow.gBrowser.selectedBrowser.currentURI.spec,
    "about:newtab",
    "about:newtab moved to window"
  );

  await waitForTopSiteLink(newWindow.gBrowser, TEST_URL);
  await openTopSiteInNewTab(newWindow.gBrowser, TEST_URL);

  is(newWindow.gBrowser.tabs.length, 2, "second page is opened");

  BrowserTestUtils.removeTab(newWindow.gBrowser.selectedTab);
  await BrowserTestUtils.closeWindow(newWindow);
});
