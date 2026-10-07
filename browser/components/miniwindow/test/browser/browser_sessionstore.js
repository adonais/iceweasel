/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXAMPLE_URL = "https://example.com/";

add_task(async function test_popup_not_tracked_by_sessionstore() {
  // Not withNewTab: the tab is physically moved out of this window into the
  // popup, so withNewTab cannot track/clean up its own tab. Manage it here.
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);

  let windowCountBefore = JSON.parse(SessionStore.getBrowserState()).windows
    .length;

  let miniWin = await popTabForTest(tab);
  let popup = [...MiniWindowManager._miniwindows][0];

  let windowCountAfter = JSON.parse(SessionStore.getBrowserState()).windows
    .length;
  Assert.equal(
    windowCountAfter,
    windowCountBefore,
    "Popup added zero windows to the saved session state"
  );

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();

  removeTestTabs(EXAMPLE_URL);
});

add_task(async function test_quit_returns_tab_without_stealing_focus() {
  let keep = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    EXAMPLE_URL + "keep"
  );
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    EXAMPLE_URL + "popped"
  );
  gBrowser.selectedTab = keep;

  let miniWin = await popTabForTest(tab);

  // The shutdown teardown path (quit-application-granted) must return popped
  // tabs home WITHOUT changing the user's selected tab, so SessionStore saves
  // and restores the tab the user actually had focused.
  let closed = BrowserTestUtils.domWindowClosed(miniWin);
  MiniWindowManager.observe(null, "quit-application-granted");
  await closed;

  let back = gBrowser.tabs.find(
    t => t.linkedBrowser.currentURI.spec == EXAMPLE_URL + "popped"
  );
  Assert.ok(back, "popped tab returned to origin on quit teardown");
  Assert.equal(
    gBrowser.selectedTab,
    keep,
    "quit teardown did not steal selection"
  );
  Assert.notEqual(gBrowser.selectedTab, back, "returned tab is not focused");

  removeTestTabs(EXAMPLE_URL);
});
