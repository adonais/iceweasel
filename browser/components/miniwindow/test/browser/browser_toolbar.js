/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function test_navbar_buttons_visible_and_wired() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  let miniWin = await popTabForTest(tab);
  let doc = miniWin.document;

  Assert.ok(
    doc.documentElement.hasAttribute("mini-window"),
    "popup window is a mini window"
  );

  let close = doc.getElementById("mini-window-close-button");
  let restore = doc.getElementById("mini-window-restore-button");
  Assert.ok(close, "nav-bar has the mini-window close button");
  Assert.ok(restore, "nav-bar has the mini-window restore button");

  Assert.ok(!close.hidden, "close button is un-hidden");
  Assert.ok(!restore.hidden, "restore button is un-hidden");
  Assert.ok(
    BrowserTestUtils.isVisible(close),
    "close button is laid out and visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(restore),
    "restore button is laid out and visible"
  );

  Assert.ok(miniWin.gURLBar, "reused real urlbar is present");
  Assert.ok(
    miniWin.gURLBar.readOnly,
    "reused urlbar is read-only in the popup"
  );

  let origin = window;
  restore.doCommand();
  await BrowserTestUtils.domWindowClosed(miniWin);
  Assert.ok(
    origin.gBrowser.selectedBrowser.currentURI.spec.includes("example.com"),
    "restore returned the tab to origin"
  );
  assertNoMiniWindowsOpen();

  removeTestTabs();
});
