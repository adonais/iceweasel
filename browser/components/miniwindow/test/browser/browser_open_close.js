/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function test_open_moves_tab_into_popup() {
  // Not withNewTab: the tab is physically moved out of this window into the
  // popup, so withNewTab cannot track/clean up its own tab. Manage it here.
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  let originWin = window;
  let tabCountBefore = gBrowser.tabs.length;

  let miniWin = await popTabForTest(tab);

  Assert.ok(miniWin, "Popup window opened");
  Assert.notEqual(miniWin, originWin, "Popup is a separate window");
  Assert.equal(
    gBrowser.tabs.length,
    tabCountBefore - 1,
    "Popped tab moved out of the origin window (no filler left behind)"
  );
  Assert.equal(MiniWindowManager._miniwindows.size, 1, "One popup registered");

  let popup = [...MiniWindowManager._miniwindows][0];
  Assert.equal(popup.state, "active", "Popup reached active state");
  Assert.equal(popup.tab.linkedBrowser.currentURI.spec, "https://example.com/");

  // close() discards the tab (recoverable in the origin window), so nothing is
  // left in the origin strip to clean up.
  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
});

add_task(async function test_open_in_tab_redirects_out_of_popup() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let miniWin = await popTabForTest(tab);
  let popup = [...MiniWindowManager._miniwindows][0];

  // A new-tab open from the chromeless popup must land in a real browser
  // window, not pile a second tab into the popup (mirrors taskbar tabs).
  let newTabOpened = BrowserTestUtils.waitForNewTab(
    gBrowser,
    REDIRECT_URL,
    true
  );
  miniWin.openTrustedLinkIn(REDIRECT_URL, "tab");
  let newTab = await newTabOpened;

  Assert.equal(miniWin.gBrowser.tabs.length, 1, "popup still has a single tab");
  Assert.ok(
    gBrowser.tabs.includes(newTab),
    "new tab opened in the origin window, not the popup"
  );

  BrowserTestUtils.removeTab(newTab);
  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  removeTestTabs();
});

add_task(async function test_content_target_blank_opens_in_origin_window() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, REDIRECT_URL);

  let miniWin = await popTabForTest(tab);
  let popup = [...MiniWindowManager._miniwindows][0];

  // Unlike openLinkIn above, a content-initiated open goes through the mini
  // window's own nsIBrowserDOMWindow; it must also land in a real browser
  // window rather than growing a tab strip in the mini window. Click the
  // fixture's target="_blank" link so the open carries a real user gesture.
  let newTabOpened = BrowserTestUtils.waitForNewTab(
    gBrowser,
    REDIRECT_URL + "?newtab=1",
    true
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#blank-link",
    {},
    popup.browser
  );
  let newTab = await newTabOpened;

  Assert.equal(miniWin.gBrowser.tabs.length, 1, "popup still has a single tab");
  Assert.ok(
    gBrowser.tabs.includes(newTab),
    "content target=_blank tab opened in the origin window, not the popup"
  );

  BrowserTestUtils.removeTab(newTab);
  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  removeTestTabs();
});

add_task(async function test_only_allowed_shortcuts_kept_in_popup() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let miniWin = await popTabForTest(tab);
  let popup = [...MiniWindowManager._miniwindows][0];

  let doc = miniWin.document;
  // This pops a cropped mini window, which frames one specific page, so
  // history navigation is disabled too - only reload and close stay enabled.
  let close = doc.getElementById("key_close");
  Assert.ok(
    close && !close.hasAttribute("disabled"),
    "close (Ctrl+W) stays enabled"
  );
  let back = doc.getElementById("goBackKb") || doc.getElementById("goBackKb2");
  Assert.equal(back?.getAttribute("disabled"), "true", "back is disabled");
  let forward =
    doc.getElementById("goForwardKb") || doc.getElementById("goForwardKb2");
  Assert.equal(
    forward?.getAttribute("disabled"),
    "true",
    "forward is disabled"
  );
  // Both the accel and the F5 reload shortcuts: leaving the accel ones
  // disabled would mean no working reload at all on macOS.
  for (let id of [
    "key_reload",
    "key_reload2",
    "key_reload_skip_cache",
    "key_reload_skip_cache2",
  ]) {
    let key = doc.getElementById(id);
    if (!key) {
      // key_reload_skip_cache2 is not built on macOS.
      continue;
    }
    Assert.ok(!key.hasAttribute("disabled"), `${id} stays enabled`);
  }
  for (let id of [
    "key_newNavigatorTab",
    "key_duplicateTab",
    "key_restoreLastClosedTabOrWindowOrSession",
    "key_selectTab1",
    "key_showAllTabs",
    "key_find",
  ]) {
    let key = doc.getElementById(id);
    Assert.ok(key, `${id} kept in the DOM`);
    Assert.equal(
      key.getAttribute("disabled"),
      "true",
      `${id} disabled in mini window`
    );
  }

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);

  removeTestTabs();
});
