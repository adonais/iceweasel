/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXAMPLE_URL = "https://example.com/";

add_task(async function test_close_discards_tab_recoverably() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    EXAMPLE_URL + "popped"
  );
  // Closed tabs live in a global pool, so count via getClosedTabCount().
  let closedBefore = SessionStore.getClosedTabCount();

  let miniWin = await popTabForTest(tab);
  let popup = [...MiniWindowManager._miniwindows][0];
  let countAfterPop = gBrowser.tabs.length;

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);

  // close() discards the tab rather than returning it to the origin strip...
  let back = gBrowser.tabs.find(
    t => t.linkedBrowser.currentURI.spec == EXAMPLE_URL + "popped"
  );
  Assert.ok(
    !back,
    "close discarded the popped tab (not returned to the strip)"
  );
  Assert.equal(
    gBrowser.tabs.length,
    countAfterPop,
    "no tab left behind in origin"
  );

  // ...but it is recoverable from the origin window's recently-closed list.
  await TestUtils.waitForCondition(
    () => SessionStore.getClosedTabCount() > closedBefore,
    "discarded tab is recoverable via recently-closed"
  );

  removeTestTabs(EXAMPLE_URL);
});

add_task(async function test_restore_returns_tab_to_middle_index() {
  // Pop a MIDDLE tab so "restore to remembered index" is distinguishable from
  // "append at the end" - the two coincide only for the last tab.
  await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL + "tab0");
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    EXAMPLE_URL + "tab1"
  );
  await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL + "tab2");
  let originalIndex = gBrowser.tabs.indexOf(tab);

  let miniWin = await popTabForTest(tab);
  let popup = [...MiniWindowManager._miniwindows][0];

  popup.returnToOriginWin(true);
  await BrowserTestUtils.domWindowClosed(miniWin);

  let back = gBrowser.tabs.find(
    t => t.linkedBrowser.currentURI.spec == EXAMPLE_URL + "tab1"
  );
  Assert.ok(back, "restored tab found in origin window");
  Assert.equal(
    gBrowser.tabs.indexOf(back),
    originalIndex,
    "tab restored to its original (middle) index"
  );
  let tab2 = gBrowser.tabs.find(
    t => t.linkedBrowser.currentURI.spec == EXAMPLE_URL + "tab2"
  );
  Assert.less(
    gBrowser.tabs.indexOf(back),
    gBrowser.tabs.indexOf(tab2),
    "restored tab sits before the tab that followed it"
  );

  removeTestTabs(EXAMPLE_URL);
});

add_task(async function test_restore_is_idempotent() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);
  let originalIndex = gBrowser.tabs.indexOf(tab);

  let miniWin = await popTabForTest(tab);
  let popup = [...MiniWindowManager._miniwindows][0];

  popup.returnToOriginWin(true);
  await BrowserTestUtils.domWindowClosed(miniWin);
  Assert.equal(popup.state, "closed", "popup closed after restore");
  // Count after the tab has been returned - a no-op second restore must not
  // change it (no filler, so the first restore adds the tab back).
  let countAfterRestore = gBrowser.tabs.length;

  // A second restore() once the popup is no longer OPENING/FRAMED/ACTIVE must
  // be a no-op: it should not throw or re-adopt a duplicate tab.
  popup.returnToOriginWin(true);
  Assert.equal(
    gBrowser.tabs.length,
    countAfterRestore,
    "second restore did not add a tab"
  );

  let back = gBrowser.tabs.find(
    t => t.linkedBrowser.currentURI.spec == EXAMPLE_URL
  );
  Assert.ok(back, "restored tab still present");
  Assert.equal(
    gBrowser.tabs.indexOf(back),
    originalIndex,
    "tab still at original index"
  );

  removeTestTabs(EXAMPLE_URL);
});
