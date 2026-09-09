/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Picking a result in the newtab address bar loads it against the tab the page
// is in, in the same tab or a new one depending on the modifiers.

"use strict";

const TEST_URL = "https://example.com/";

async function pickHeuristic(browser, modifiers) {
  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: TEST_URL,
  });
  await BrowserTestUtils.synthesizeKey("KEY_Enter", modifiers, browser);
}

add_task(async function sameTab() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let loaded = BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    TEST_URL
  );
  await pickHeuristic(tab.linkedBrowser, {});
  await loaded;

  Assert.equal(gBrowser.selectedTab, tab, "the load stayed in the same tab");
  Assert.equal(
    tab.linkedBrowser.currentURI.spec,
    TEST_URL,
    "the newtab tab navigated to the picked URL"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function modifierOpensNewTab() {
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let opened = BrowserTestUtils.waitForNewTab(gBrowser, TEST_URL, true);
  await pickHeuristic(tab.linkedBrowser, { altKey: true });
  let newTab = await opened;

  Assert.equal(
    tab.linkedBrowser.currentURI.spec,
    "about:newtab",
    "the newtab tab stayed where it was"
  );
  let { value } = await NewtabSearchbarTestUtils.getState(tab.linkedBrowser);
  Assert.equal(value, TEST_URL, "the bar kept what was typed");

  BrowserTestUtils.removeTab(newTab);
  BrowserTestUtils.removeTab(tab);
});
