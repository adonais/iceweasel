/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This test ensures the about:addons tab is only
 * opened one time when in private browsing.
 */

add_task(async function test() {
  const lastUsed = "2026-01-01T00:00:00.000Z";
  await SpecialPowers.pushPrefEnv({
    set: [["browser.keys.openAddons.lastUsed", lastUsed]],
  });
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  let tab = (win.gBrowser.selectedTab = BrowserTestUtils.addTab(
    win.gBrowser,
    "about:addons"
  ));
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  await promiseWaitForFocus(win);

  EventUtils.synthesizeKey(
    AppConstants.platform == "macosx" ? "e" : "f",
    { shiftKey: true, accelKey: true },
    win
  );

  is(win.gBrowser.tabs.length, 2, "about:addons tab was re-focused.");
  is(win.gBrowser.currentURI.spec, "about:addons", "Addons tab was opened.");
  is(
    Services.prefs.getStringPref("browser.keys.openAddons.lastUsed"),
    lastUsed,
    "The new shortcut preserves the old Add-ons shortcut usage timestamp."
  );

  await BrowserTestUtils.closeWindow(win);
});
