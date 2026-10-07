/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Timer-driven auto-hide isn't exercised here to avoid flaky timing; instead
// this asserts the reveal wiring reacts to the events it listens for, toggling
// mini-window-revealed on #navigator-toolbox.
add_task(async function test_toolbox_reveal_wiring() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let miniWin = await popTabForTest(tab);
  let doc = miniWin.document;
  let toolbox = doc.getElementById("navigator-toolbox");

  Assert.ok(
    toolbox.classList.contains("mini-window-revealed"),
    "toolbox is revealed right after open"
  );

  // Notifications announce themselves with AlertActive, which bubbles out of
  // the notification box to the toolbox the reveal is wired to.
  toolbox.classList.remove("mini-window-revealed");
  doc
    .getElementById("notifications-toolbar")
    .dispatchEvent(new miniWin.CustomEvent("AlertActive", { bubbles: true }));
  Assert.ok(
    toolbox.classList.contains("mini-window-revealed"),
    "a notification appearing keeps the toolbox shown"
  );

  let popup = [...MiniWindowManager._miniwindows][0];
  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();

  removeTestTabs();
});

add_task(async function test_top_edge_reveals_toolbox() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let miniWin = await popTabForTest(tab);
  let toolbox = miniWin.document.getElementById("navigator-toolbox");

  // Park the pointer below the reveal strip first: MousePosTracker only
  // reports transitions, so entering has to be an actual change.
  await moveMouseTo(miniWin, 50, 100);
  toolbox.classList.remove("mini-window-revealed");

  await moveMouseTo(miniWin, 50, 2);
  await TestUtils.waitForCondition(
    () => toolbox.classList.contains("mini-window-revealed"),
    "pointer at the top edge reveals the toolbox"
  );

  let popup = [...MiniWindowManager._miniwindows][0];
  popup.close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();

  removeTestTabs();
});
