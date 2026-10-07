/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A cropped mini window frames one specific page, so any real navigation
// returns the tab to its origin window, where the load continues. Full-tab
// mini windows keep normal in-window navigation, and same-document
// housekeeping (replaceState) never ejects.

const EXAMPLE_URL = "https://example.com/";
const NEXT_URL = REDIRECT_URL + "?abracadabra=1";

function croppedInfoFor(browser) {
  return {
    left: 10,
    top: 10,
    width: Math.floor(browser.clientWidth / 2),
    height: Math.floor(browser.clientHeight / 2),
    viewportWidth: browser.clientWidth,
    viewportHeight: browser.clientHeight,
    fullZoom: 1,
  };
}

add_task(async function test_cropped_navigation_returns_tab_home() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, REDIRECT_URL);
  let miniWin = await popTabForTest(tab, croppedInfoFor(tab.linkedBrowser));
  let mini = [...MiniWindowManager._miniwindows][0];

  // A user-initiated navigation away from the cropped page: click the
  // fixture button, which sets location.href.
  let closed = BrowserTestUtils.domWindowClosed(miniWin);
  await BrowserTestUtils.synthesizeMouseAtCenter("#redirect", {}, mini.browser);
  await closed;

  assertNoMiniWindowsOpen();
  await TestUtils.waitForCondition(
    () => gBrowser.selectedBrowser.currentURI.spec === NEXT_URL,
    "the navigation continued in the origin window"
  );
  Assert.ok(true, "Successfully navigated");

  removeTestTabs(EXAMPLE_URL);
});

add_task(async function test_replace_state_does_not_eject() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);
  let miniWin = await popTabForTest(tab, croppedInfoFor(tab.linkedBrowser));
  let mini = [...MiniWindowManager._miniwindows][0];

  // On-load URL housekeeping must not count as leaving the page.
  await SpecialPowers.spawn(mini.browser, [], () => {
    content.history.replaceState(null, "", "?pos=42");
  });
  // The eject is deferred to the main thread; give it a chance to (not) run.
  await TestUtils.waitForTick();
  await TestUtils.waitForTick();

  ok(!miniWin.closed, "mini window survived a replaceState");
  is(MiniWindowManager._miniwindows.size, 1, "mini window is still registered");

  mini.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs(EXAMPLE_URL);
});

add_task(async function test_full_tab_navigation_stays() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, REDIRECT_URL);
  let miniWin = await popWholeTabForTest(tab);
  let mini = [...MiniWindowManager._miniwindows][0];

  let loaded = BrowserTestUtils.browserLoaded(mini.browser, false, NEXT_URL);
  await BrowserTestUtils.synthesizeMouseAtCenter("#redirect", {}, mini.browser);
  await loaded;

  ok(!miniWin.closed, "full-tab mini window survived the navigation");
  is(MiniWindowManager._miniwindows.size, 1, "mini window is still registered");
  is(
    mini.browser.currentURI.spec,
    NEXT_URL,
    "the navigation happened inside the mini window"
  );

  mini.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs(EXAMPLE_URL);
});
