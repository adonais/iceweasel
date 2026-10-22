/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests the Search Tabs option from the menubar starts Address Bar search
 * mode for tabs.
 */
ChromeUtils.defineLazyGetter(this, "UrlbarTestUtils", () => {
  const { UrlbarTestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/UrlbarTestUtils.sys.mjs"
  );
  module.init(this);
  return module;
});

add_task(async function test_menu_search_tabs_with_window_open() {
  let searchTabsMenuEntry = document.getElementById("menu_searchTabs");
  is(
    searchTabsMenuEntry.getAttribute("key"),
    "key_searchTabs",
    "Menu item shows the Search Tabs shortcut"
  );

  searchTabsMenuEntry.doCommand();

  await isUrlbarInTabsSearchMode(window);
});

add_task(async function test_menu_search_tabs_opens_new_window() {
  let newWindowPromise = TestUtils.topicObserved(
    "browser-delayed-startup-finished"
  );

  info(
    "Executing command in untracked browser window (simulating non-browser window)."
  );
  BrowserWindowTracker.untrackForTestsOnly(window);
  document.getElementById("menu_searchTabs").doCommand();
  BrowserWindowTracker.track(window);

  info("Waiting for new window to open.");
  let [newWindow] = await newWindowPromise;
  await isUrlbarInTabsSearchMode(newWindow);
  await BrowserTestUtils.closeWindow(newWindow);
});

async function isUrlbarInTabsSearchMode(targetWin) {
  is(
    targetWin,
    BrowserWindowTracker.getTopWindow(),
    "Target window is top window."
  );
  await UrlbarTestUtils.promiseSearchComplete(targetWin);

  await UrlbarTestUtils.assertSearchMode(targetWin, {
    source: targetWin.gURLBar.searchModeForToken("%").source,
    entry: "historymenu",
  });
  await UrlbarTestUtils.exitSearchMode(targetWin);
  await UrlbarTestUtils.promisePopupClose(targetWin);
}
