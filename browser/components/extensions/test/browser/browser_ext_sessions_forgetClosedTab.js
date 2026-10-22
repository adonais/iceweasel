"use strict";

const { TabStateFlusher } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs"
);
const { TabGroupTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TabGroupTestUtils.sys.mjs"
);

function getExtension(incognitoOverride) {
  function background() {
    browser.test.onMessage.addListener((msg, windowId, sessionId) => {
      if (msg === "check-sessions") {
        browser.sessions.getRecentlyClosed().then(recentlyClosed => {
          browser.test.sendMessage("recentlyClosed", recentlyClosed);
        });
      } else if (msg === "forget-tab") {
        browser.sessions.forgetClosedTab(windowId, sessionId).then(
          () => {
            browser.test.sendMessage("forgot-tab");
          },
          error => {
            browser.test.sendMessage("forget-reject", error.message);
          }
        );
      }
    });
  }

  return ExtensionTestUtils.loadExtension({
    manifest: {
      permissions: ["sessions", "tabs"],
    },
    background,
    incognitoOverride,
  });
}

async function openAndCloseTab(window, url) {
  const tab = await BrowserTestUtils.openNewForegroundTab(window.gBrowser, url);
  await TabStateFlusher.flush(tab.linkedBrowser);
  const sessionUpdatePromise = BrowserTestUtils.waitForSessionStoreUpdate(tab);
  BrowserTestUtils.removeTab(tab);
  await sessionUpdatePromise;
}

add_setup(async function prepare() {
  // Clean up any session state left by previous tests that might impact this one
  while (SessionStore.getClosedTabCountForWindow(window) > 0) {
    SessionStore.forgetClosedTab(window, 0);
  }
  await TestUtils.waitForTick();
});

add_task(async function test_sessions_forget_closed_tab() {
  let extension = getExtension();
  await extension.startup();

  let tabUrl = "http://example.com";
  await openAndCloseTab(window, tabUrl);
  await openAndCloseTab(window, tabUrl);

  extension.sendMessage("check-sessions");
  let recentlyClosed = await extension.awaitMessage("recentlyClosed");
  let recentlyClosedLength = recentlyClosed.length;
  let recentlyClosedTab = recentlyClosed[0].tab;

  // Check that forgetting a tab works properly
  extension.sendMessage(
    "forget-tab",
    recentlyClosedTab.windowId,
    recentlyClosedTab.sessionId
  );
  await extension.awaitMessage("forgot-tab");
  extension.sendMessage("check-sessions");
  let remainingClosed = await extension.awaitMessage("recentlyClosed");
  is(
    remainingClosed.length,
    recentlyClosedLength - 1,
    "One tab was forgotten."
  );
  is(
    remainingClosed[0].tab.sessionId,
    recentlyClosed[1].tab.sessionId,
    "The correct tab was forgotten."
  );

  // Check that re-forgetting the same tab fails properly
  extension.sendMessage(
    "forget-tab",
    recentlyClosedTab.windowId,
    recentlyClosedTab.sessionId
  );
  let errormsg = await extension.awaitMessage("forget-reject");
  is(
    errormsg,
    `Could not find closed tab using sessionId ${recentlyClosedTab.sessionId}.`
  );

  extension.sendMessage("check-sessions");
  remainingClosed = await extension.awaitMessage("recentlyClosed");
  is(
    remainingClosed.length,
    recentlyClosedLength - 1,
    "No extra tab was forgotten."
  );
  is(
    remainingClosed[0].tab.sessionId,
    recentlyClosed[1].tab.sessionId,
    "The correct tab remains."
  );

  await extension.unload();
});

add_task(async function test_sessions_forget_closed_tab_in_closed_group() {
  let extension = getExtension();
  await extension.startup();

  await openAndCloseTab(window, "https://example.com/?single");

  let tabs = [
    BrowserTestUtils.addTab(gBrowser, "https://example.com/?group1"),
    BrowserTestUtils.addTab(gBrowser, "https://example.com/?group2"),
  ];
  let group = gBrowser.addTabGroup(tabs);
  let groupId = group.id;
  await Promise.all(
    tabs.map(async tab => {
      await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
      await TabStateFlusher.flush(tab.linkedBrowser);
    })
  );
  await TabGroupTestUtils.removeTabGroup(group);

  let getClosedTabs = async () => {
    extension.sendMessage("check-sessions");
    let recentlyClosed = await extension.awaitMessage("recentlyClosed");
    return recentlyClosed.filter(({ tab }) => tab).map(({ tab }) => tab);
  };

  let closedTabs = await getClosedTabs();
  let groupTab = closedTabs.find(
    tab => tab.url == "https://example.com/?group1"
  );
  extension.sendMessage("forget-tab", groupTab.windowId, groupTab.sessionId);
  await extension.awaitMessage("forgot-tab");

  Assert.deepEqual(
    (await getClosedTabs()).map(tab => tab.sessionId),
    closedTabs.filter(tab => tab != groupTab).map(tab => tab.sessionId),
    "Only the group's first tab was forgotten."
  );

  SessionStore.forgetClosedTabGroup(window, groupId);
  while (SessionStore.getClosedTabCountForWindow(window) > 0) {
    SessionStore.forgetClosedTab(window, 0);
  }
  await extension.unload();
});

add_task(async function test_sessions_forget_closed_tab_private() {
  let pb_extension = getExtension("spanning");
  await pb_extension.startup();
  let extension = getExtension();
  await extension.startup();

  // Open a private browsing window.
  let privateWin = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });

  let tabUrl = "http://example.com";
  await openAndCloseTab(privateWin, tabUrl);

  pb_extension.sendMessage("check-sessions");
  let recentlyClosed = await pb_extension.awaitMessage("recentlyClosed");
  let recentlyClosedTab = recentlyClosed[0].tab;

  // Check that forgetting a tab works properly
  extension.sendMessage(
    "forget-tab",
    recentlyClosedTab.windowId,
    recentlyClosedTab.sessionId
  );
  let errormsg = await extension.awaitMessage("forget-reject");
  ok(/Invalid window ID/.test(errormsg), "could not access window");

  await BrowserTestUtils.closeWindow(privateWin);
  await extension.unload();
  await pb_extension.unload();
});
