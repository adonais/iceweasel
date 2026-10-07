/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// A mini window hosts one tab and has no room for a sidebar, so it joins
// taskbar tabs as a single-tab window. SidebarController gates on that, and
// these check the gate is actually shut rather than just set.

add_task(async function test_origin_window_is_not_single_tab() {
  // Control: without this the checks below would pass in any window.
  Assert.ok(
    !SidebarController.inSingleTabWindow,
    "a normal browser window is not a single-tab window"
  );
});

add_task(async function test_mini_window_suppresses_the_sidebar() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  let popPromise = MiniWindowManager.popTab(tab);
  let miniWin = await opened;
  let popup = await popPromise;

  let controller = miniWin.SidebarController;
  Assert.ok(
    controller.inSingleTabWindow,
    "a mini window counts as a single-tab window"
  );
  Assert.strictEqual(
    controller.getUIState(),
    null,
    "a mini window reports no sidebar UI state to adopt"
  );
  Assert.ok(!controller.isOpen, "the sidebar starts closed");

  // The gate has to hold even when something asks for the sidebar directly,
  // which is what stops an adopted tab or a command from bringing it back.
  let shown = await controller.show("viewHistorySidebar");
  Assert.strictEqual(shown, false, "show() refuses to open a sidebar");
  Assert.ok(!controller.isOpen, "the sidebar is still closed after show()");

  let sidebarBox = miniWin.document.getElementById("sidebar-box");
  Assert.ok(
    !sidebarBox || sidebarBox.hidden,
    "the sidebar box is not showing in the mini window"
  );

  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();
  removeTestTabs();
});

add_task(async function test_returned_tab_leaves_the_origin_sidebar_alone() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let opened = BrowserTestUtils.domWindowOpenedAndLoaded(null);
  let popPromise = MiniWindowManager.popTab(tab);
  let miniWin = await opened;
  let popup = await popPromise;

  popup.returnToOriginWin(true);
  await BrowserTestUtils.domWindowClosed(miniWin);

  // Coming back from a window that reported no sidebar state must not leave
  // the origin window thinking it is a single-tab window too.
  Assert.ok(
    !SidebarController.inSingleTabWindow,
    "the origin window is still a normal window"
  );
  Assert.notStrictEqual(
    SidebarController.getUIState(),
    null,
    "the origin window still has sidebar UI state"
  );

  assertNoMiniWindowsOpen();
  removeTestTabs();
});
