/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

function createCmdLine(tag, action, state) {
  return Cu.createCommandLine(
    [
      "--notification-windowsTag",
      tag,
      "--notification-windowsAction",
      JSON.stringify(action),
    ],
    null,
    state
  );
}

function runCmdLine(cmdLine) {
  let cmdLineHandler = Cc["@mozilla.org/browser/final-clh;1"].getService(
    Ci.nsICommandLineHandler
  );
  cmdLineHandler.handle(cmdLine);
}

function simulateNotificationClickWithExistingWindow(action) {
  let cmdLine = createCmdLine(
    "dummyTag",
    action,
    Ci.nsICommandLine.STATE_REMOTE_AUTO
  );
  runCmdLine(cmdLine);
}

function simulateNotificationClickWithNewWindow(action) {
  let cmdLine = createCmdLine(
    "dummyTag",
    action,
    Ci.nsICommandLine.STATE_INITIAL_LAUNCH
  );
  runCmdLine(cmdLine);
}

add_task(async function test_basic() {
  let newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    "https://example.com/"
  );

  simulateNotificationClickWithExistingWindow({
    action: "",
    origin: "https://example.com",
  });

  let newTab = await newTabPromise;
  ok(newTab, "New tab should be opened.");
  BrowserTestUtils.removeTab(newTab);
});

// launchUrl was used pre-140, we can remove it when we are confident enough
// that there's no old notification with launchUrl lying around anymore
add_task(async function test_legacy_launchUrl() {
  let newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    "https://example.com/"
  );

  simulateNotificationClickWithExistingWindow({
    action: "",
    launchUrl: "https://example.com",
  });

  let newTab = await newTabPromise;
  ok(newTab, "New tab should be opened.");
  BrowserTestUtils.removeTab(newTab);
});

add_task(async function test_invalid_origin_with_path() {
  let newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    "https://example.com/"
  );

  simulateNotificationClickWithExistingWindow({
    action: "",
    origin: "https://example.com/example/",
  });

  let newTab = await newTabPromise;
  ok(newTab, "New tab should be opened.");
  BrowserTestUtils.removeTab(newTab);
});

add_task(async function test_user_context() {
  let newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    "https://example.com/"
  );

  simulateNotificationClickWithExistingWindow({
    action: "",
    origin: "https://example.com^userContextId=1",
  });

  let newTab = await newTabPromise;
  registerCleanupFunction(() => BrowserTestUtils.removeTab(newTab));
  ok(newTab, "New tab should be opened.");

  is(newTab.userContextId, 1, "The correct user context ID is used.");
});

add_task(async function test_basic_initial_load() {
  let controller = new AbortController();
  let { signal } = controller;

  BrowserTestUtils.concealWindow(window, { signal });

  // (Cannot use "url" here because the first tab will be a new tab page)
  let newWinPromise = BrowserTestUtils.waitForNewWindow();

  // This will open a new browser window and then a tab
  simulateNotificationClickWithNewWindow({
    action: "",
    origin: "https://example.com",
  });

  let newWin = await newWinPromise;
  ok(newWin, "New window should be opened.");

  // In case the tab is already opened...
  let newTab = newWin.gBrowser.tabs.find(
    tab => tab.linkedBrowser.currentURI.spec === "https://example.com/"
  );

  // If not let's wait for one
  if (!newTab) {
    newTab = await BrowserTestUtils.waitForLocationChange(
      newWin.gBrowser,
      "https://example.com/"
    );
  }

  ok(newTab, "New tab should be opened.");
  BrowserTestUtils.closeWindow(newWin);

  controller.abort();
});
