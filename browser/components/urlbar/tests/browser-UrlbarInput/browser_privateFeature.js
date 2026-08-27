/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that opening a URL in a new window propagates the `private` window
// feature from the source window: a private window's new windows are private,
// a non-private window's are not.

/**
 * Loads about:blank in a new window from the given window's urlbar. Shift makes
 * the load open in a new window (see BrowserUtils.whereToOpenLink).
 *
 * @param {Window} win The window whose urlbar drives the load.
 * @returns {Promise<Window>} The newly opened window.
 */
async function loadURLInNewWindow(win) {
  let newWinOpened = BrowserTestUtils.waitForNewWindow();
  win.gURLBar.focus();
  win.gURLBar.value = "about:blank";
  win.gURLBar.handleNavigation({
    event: new win.KeyboardEvent("keydown", { shiftKey: true }),
  });
  return newWinOpened;
}

function assertPrivate(newWin, expected, message) {
  let isPrivate =
    (newWin.docShell.treeOwner
      .QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIAppWindow).chromeFlags &
      Ci.nsIWebBrowserChrome.CHROME_PRIVATE_WINDOW) ==
    Ci.nsIWebBrowserChrome.CHROME_PRIVATE_WINDOW;
  Assert.equal(isPrivate, expected, message);
}

add_task(async function privateWindowOpensPrivateWindow() {
  let privateWin = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });

  let newWin = await loadURLInNewWindow(privateWin);
  assertPrivate(
    newWin,
    true,
    "New window opened from an existing private window should be marked as private"
  );

  await BrowserTestUtils.closeWindow(newWin);
  await BrowserTestUtils.closeWindow(privateWin);
});

add_task(async function nonPrivateWindowOpensNonPrivateWindow() {
  let win = await BrowserTestUtils.openNewBrowserWindow();

  let newWin = await loadURLInNewWindow(win);
  assertPrivate(
    newWin,
    false,
    "New window opened from a non-private window should not be marked as private"
  );

  await BrowserTestUtils.closeWindow(newWin);
  await BrowserTestUtils.closeWindow(win);
});
