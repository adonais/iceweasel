/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXAMPLE_URL = "https://example.com/";

add_task(async function test_origin_window_close_tears_down_popup() {
  let originWin = await BrowserTestUtils.openNewBrowserWindow();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    originWin.gBrowser,
    EXAMPLE_URL
  );

  let cropInfo = fullViewportCropInfo(tab.linkedBrowser);
  let miniWin = await popTabForTest(tab, cropInfo);

  Assert.equal(MiniWindowManager._miniwindows.size, 1, "One popup registered");
  let popup = [...MiniWindowManager._miniwindows][0];
  Assert.equal(popup.state, "active", "Popup reached active state");
  Assert.equal(
    popup.originWin,
    originWin,
    "Popup is bound to the second window"
  );

  // Closing the origin window routes through the manager's SSWindowClosing
  // handler (returnToOriginWin), which tears the popup down rather than
  // leaking a chromeless always-on-top window.
  let popupClosed = BrowserTestUtils.domWindowClosed(miniWin);
  await BrowserTestUtils.closeWindow(originWin);
  await popupClosed;

  assertNoMiniWindowsOpen();
});
