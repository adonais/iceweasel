/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { _LastSession } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs"
);
const { TaskbarTabsRegistry } = ChromeUtils.importESModule(
  "moz-src:///browser/components/taskbartabs/TaskbarTabsRegistry.sys.mjs"
);
const { TaskbarTabsWindowManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/taskbartabs/TaskbarTabsWindowManager.sys.mjs"
);

const EXAMPLE_URL = "https://example.com/";

async function openTaskbarTabWindow() {
  let registry = new TaskbarTabsRegistry({ save: () => {} }, []);
  let { taskbarTab } = registry.findOrCreateTaskbarTab(
    Services.io.newURI(EXAMPLE_URL),
    0
  );
  return new TaskbarTabsWindowManager().openWindow(taskbarTab);
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.taskbarTabs.enabled", true]],
  });
});

add_task(async function test_closing_mini_window_does_not_end_session() {
  let taskbarTabWin = await openTaskbarTabWindow();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    EXAMPLE_URL + "popped"
  );
  let miniWin = await popWholeTabForTest(tab);

  let lastSessionState = _LastSession.getState();
  let reEnabled = false;
  let observer = () => {
    reEnabled = true;
  };
  Services.obs.addObserver(observer, "sessionstore-last-session-re-enable");

  [...MiniWindowManager._miniwindows][0].close();
  await BrowserTestUtils.domWindowClosed(miniWin);
  assertNoMiniWindowsOpen();

  Services.obs.removeObserver(observer, "sessionstore-last-session-re-enable");
  Assert.equal(
    _LastSession.getState(),
    lastSessionState,
    "closing the mini window doesn't save the session as the last session"
  );
  Assert.ok(!reEnabled, "closing the mini window doesn't re-enable restore");

  await BrowserTestUtils.closeWindow(taskbarTabWin);
  removeTestTabs(EXAMPLE_URL);
});
