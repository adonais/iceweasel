/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXAMPLE_URL = "https://example.com/";

add_task(async function test_popTab_opens_full_tab_mini_window() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);

  let miniWin = await popWholeTabForTest(tab);
  let doc = miniWin.document;

  ok(
    doc.documentElement.hasAttribute("mini-window"),
    "full-tab mini window is a mini window"
  );
  ok(
    !doc.documentElement.hasAttribute("cropped-mini-window"),
    "full-tab mini window is not marked as cropped"
  );

  // Full-tab mini windows keep history navigation.
  let back = doc.getElementById("goBackKb");
  ok(back && !back.hasAttribute("disabled"), "back shortcut stays enabled");
  isnot(
    miniWin.getComputedStyle(doc.getElementById("back-button")).display,
    "none",
    "back button is not hidden"
  );

  // A full-tab mini window is not framed: no transform, no page-sized browser
  // box - it lays out and scrolls like a normal window.
  let mini = [...MiniWindowManager._miniwindows][0];
  is(mini.browser.style.transform, "", "full-tab browser is not transformed");
  is(
    mini.browser.style.width,
    "",
    "full-tab browser is not laid out at a fixed page size"
  );

  mini.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs(EXAMPLE_URL);
});

add_task(async function test_cropped_mini_window_drops_history_navigation() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);
  let browser = tab.linkedBrowser;
  let cropInfo = {
    left: 10,
    top: 10,
    width: Math.floor(browser.clientWidth / 2),
    height: Math.floor(browser.clientHeight / 2),
    viewportWidth: browser.clientWidth,
    viewportHeight: browser.clientHeight,
    fullZoom: 1,
  };

  let miniWin = await popTabForTest(tab, cropInfo);
  let doc = miniWin.document;

  ok(
    doc.documentElement.hasAttribute("cropped-mini-window"),
    "region pop is marked as a cropped mini window"
  );

  // A crop frames one page: history navigation is disabled and hidden.
  for (let id of ["goBackKb", "goBackKb2", "goForwardKb", "goForwardKb2"]) {
    let key = doc.getElementById(id);
    if (key) {
      is(key.getAttribute("disabled"), "true", `${id} is disabled`);
    }
  }
  is(
    miniWin.getComputedStyle(doc.getElementById("back-button")).display,
    "none",
    "back button is hidden in a cropped mini window"
  );
  is(
    miniWin.getComputedStyle(doc.getElementById("forward-button")).display,
    "none",
    "forward button is hidden in a cropped mini window"
  );

  // Mute stays available in all mini windows.
  let mute = doc.getElementById("key_toggleMute");
  ok(mute && !mute.hasAttribute("disabled"), "mute shortcut stays enabled");

  let mini = [...MiniWindowManager._miniwindows][0];
  mini.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs(EXAMPLE_URL);
});

add_task(async function test_move_tab_context_menu_entry() {
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);
  let menu = document.getElementById("tabContextMenu");
  let item = document.getElementById("context_openTabInMiniWindow");

  async function openTabContextMenu() {
    let shown = BrowserTestUtils.waitForEvent(menu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(tab, { type: "contextmenu" });
    await shown;
  }
  async function closeTabContextMenu() {
    let hidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hidden;
  }

  // Hidden while the feature is disabled.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.mini-window.enabled", false]],
  });
  await openTabContextMenu();
  ok(item.hidden, "menu item is hidden when the pref is off");
  await closeTabContextMenu();
  await SpecialPowers.popPrefEnv();

  // Shown and functional with the feature enabled (the manifest default).
  await openTabContextMenu();
  ok(!item.hidden, "menu item is shown when the pref is on");

  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  item.doCommand();
  await closeTabContextMenu();
  let miniWin = await opened;

  await TestUtils.waitForCondition(
    () => MiniWindowManager._miniwindows.size === 1,
    "mini window registered"
  );
  ok(
    miniWin.document.documentElement.hasAttribute("mini-window"),
    "menu item opened a mini window"
  );
  ok(
    !miniWin.document.documentElement.hasAttribute("cropped-mini-window"),
    "menu item opens the full-tab flavor"
  );

  let mini = [...MiniWindowManager._miniwindows][0];
  mini.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs(EXAMPLE_URL);
});
