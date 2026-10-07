/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXAMPLE_URL = "https://example.com/";

add_task(async function test_popping_only_tab_keeps_origin_alive() {
  let originWin = await BrowserTestUtils.openNewBrowserWindow();
  let og = originWin.gBrowser;

  let tab = og.selectedTab;
  BrowserTestUtils.startLoadingURIString(
    tab.linkedBrowser,
    EXAMPLE_URL + "solo"
  );
  await BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    EXAMPLE_URL + "solo"
  );
  Assert.equal(og.tabs.length, 1, "origin window has a single tab");

  // Popping the window's only tab must not fail (replaceTabWithWindow refuses
  // to move a last tab): a fresh tab is added first so the window survives.
  let pip = await popTabForTest(tab);
  Assert.ok(pip, "popping the only tab still opened a popup");
  Assert.equal(MiniWindowManager._miniwindows.size, 1, "popup registered");
  Assert.ok(!originWin.closed, "origin window did not close");
  Assert.equal(og.tabs.length, 1, "origin window kept alive by a fresh tab");
  Assert.notEqual(
    og.selectedTab.linkedBrowser.currentURI.spec,
    EXAMPLE_URL + "solo",
    "the remaining tab is a fresh new tab, not the popped one"
  );

  let popup = [...MiniWindowManager._miniwindows][0];
  let closed = BrowserTestUtils.domWindowClosed(pip);
  popup.close();
  await closed;
  assertNoMiniWindowsOpen();
  await BrowserTestUtils.closeWindow(originWin);
});

add_task(
  async function test_closing_last_tab_returns_popped_tabs_oldest_first() {
    let originWin = await BrowserTestUtils.openNewBrowserWindow();
    let og = originWin.gBrowser;

    let tabA = await BrowserTestUtils.openNewForegroundTab(
      og,
      EXAMPLE_URL + "a"
    );
    let tabB = await BrowserTestUtils.openNewForegroundTab(
      og,
      EXAMPLE_URL + "b"
    );

    // Pop A first (oldest), then B. Both leave originWin, which falls back to its
    // initial tab as the sole remaining tab.
    let pipA = await popTabForTest(tabA);
    let pipB = await popTabForTest(tabB);

    Assert.equal(
      og.tabs.length,
      1,
      "origin window is down to its last (initial) tab"
    );
    Assert.equal(
      MiniWindowManager._miniwindows.size,
      2,
      "two popups registered"
    );

    // Closing the last tab must not close the window; it returns the OLDEST
    // popped tab (A), focused.
    let aReturned = BrowserTestUtils.domWindowClosed(pipA);
    og.removeTab(og.selectedTab);
    await aReturned;

    Assert.ok(
      !originWin.closed,
      "origin window stayed open after closing its last tab"
    );
    Assert.equal(og.tabs.length, 1, "still a single tab (the returned one)");
    Assert.equal(
      og.selectedTab.linkedBrowser.currentURI.spec,
      EXAMPLE_URL + "a",
      "oldest popped tab (A) was returned and focused"
    );
    Assert.equal(MiniWindowManager._miniwindows.size, 1, "one popup left");

    // Closing again returns the next-oldest popped tab (B).
    let bReturned = BrowserTestUtils.domWindowClosed(pipB);
    og.removeTab(og.selectedTab);
    await bReturned;

    Assert.ok(!originWin.closed, "origin window still open after returning B");
    Assert.equal(
      og.selectedTab.linkedBrowser.currentURI.spec,
      EXAMPLE_URL + "b",
      "next-oldest popped tab (B) was returned and focused"
    );
    assertNoMiniWindowsOpen();

    // With no popped tabs left, closing the last tab closes the window as usual.
    let winClosed = BrowserTestUtils.domWindowClosed(originWin);
    og.removeTab(og.selectedTab);
    await winClosed;
    Assert.ok(originWin.closed, "window closed once no popped tabs remained");
  }
);
