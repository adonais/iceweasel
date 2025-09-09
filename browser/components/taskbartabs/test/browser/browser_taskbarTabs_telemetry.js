/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  FileTestUtils: "resource://testing-common/FileTestUtils.sys.mjs",
  TaskbarTabsRegistry:
    "resource:///modules/taskbartabs/TaskbarTabsRegistry.sys.mjs",
  TaskbarTabsWindowManager:
    "resource:///modules/taskbartabs/TaskbarTabsWindowManager.sys.mjs",
  TaskbarTabsPin: "resource:///modules/taskbartabs/TaskbarTabsPin.sys.mjs",
  ShellService: "moz-src:///browser/components/shell/ShellService.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  MockRegistrar: "resource://testing-common/MockRegistrar.sys.mjs",
});

// We don't care about pinning or unpinning, so just do enough to fake errors.
let gShortcutPinResult = null;
const exposePinResult = () => {
  if (gShortcutPinResult !== null) {
    const error = new Error();
    error.name = gShortcutPinResult;
    throw error;
  }
};

const proxyNativeShellService = {
  ...ShellService.shellService,
  createWindowsIcon: sinon.stub().resolves(),
  createShortcut: sinon.stub().resolves("dummy_path"),
  deleteShortcut: sinon.stub().resolves("dummy_path"),
  pinShortcutToTaskbar: sinon.stub().callsFake(exposePinResult),
  unpinShortcutFromTaskbar: sinon.stub().callsFake(exposePinResult),
};

sinon.stub(ShellService, "shellService").value(proxyNativeShellService);

registerCleanupFunction(() => {
  sinon.restore();
});

// Don't use the normal TaskbarTabs module, since we don't want it to pin
// automatically.
const gRegistry = new TaskbarTabsRegistry();
const gWindowManager = new TaskbarTabsWindowManager();

const BASE_URL = "https://telemetry.example.org";
const PARSED_URL = Services.io.newURI(BASE_URL);

add_task(async function testInstallAndUninstallMetric() {
  Services.fog.testResetFOG();
  let snapshot;

  const taskbarTab = gRegistry.findOrCreateTaskbarTab(PARSED_URL, 0);

  snapshot = Glean.webApp.install.testGetValue();
  is(snapshot.length, 1, "Should have recorded an 'install' event");

  gRegistry.removeTaskbarTab(taskbarTab.id);
  snapshot = Glean.webApp.uninstall.testGetValue();
  is(snapshot.length, 1, "Should have recorded an 'uninstall' event");
});

add_task(async function testPinAndUnpinMetricSuccess() {
  let snapshot;

  const taskbarTab = gRegistry.findOrCreateTaskbarTab(PARSED_URL, 0);
  Services.fog.testResetFOG();

  gShortcutPinResult = null;

  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, gRegistry);
  snapshot = Glean.webApp.pin.testGetValue();
  is(snapshot.length, 1, "A single pin event was recorded");
  Assert.strictEqual(
    snapshot[0].extra.result,
    "Success",
    "The pin event should be successful"
  );

  await TaskbarTabsPin.unpinTaskbarTab(taskbarTab, gRegistry);
  snapshot = Glean.webApp.unpin.testGetValue();
  is(snapshot.length, 1, "A single unpin event was recorded");
  Assert.strictEqual(
    snapshot[0].extra.result,
    "Success",
    "The unpin event should be successful"
  );

  gRegistry.removeTaskbarTab(taskbarTab.id);
});

add_task(async function testPinAndUnpinMetricError() {
  let snapshot;

  const taskbarTab = gRegistry.findOrCreateTaskbarTab(PARSED_URL, 0);
  Services.fog.testResetFOG();

  gShortcutPinResult = "This test failed!";

  await TaskbarTabsPin.pinTaskbarTab(taskbarTab, gRegistry);
  snapshot = Glean.webApp.pin.testGetValue();
  is(snapshot.length, 1, "A single pin event was recorded");
  Assert.strictEqual(
    snapshot[0].extra.result,
    "This test failed!",
    "The pin event shows failure"
  );

  await TaskbarTabsPin.unpinTaskbarTab(taskbarTab, gRegistry);
  snapshot = Glean.webApp.unpin.testGetValue();
  is(snapshot.length, 1, "A single unpin event was recorded");
  Assert.strictEqual(
    snapshot[0].extra.result,
    "This test failed!",
    "The unpin event shows failure"
  );

  gRegistry.removeTaskbarTab(taskbarTab.id);
});

add_task(async function testActivateWhenWindowOpened() {
  const taskbarTab = gRegistry.findOrCreateTaskbarTab(PARSED_URL, 0);
  Services.fog.testResetFOG();

  const win1 = await gWindowManager.openWindow(taskbarTab);
  const win2 = await gWindowManager.openWindow(taskbarTab);

  const snapshot = Glean.webApp.activate.testGetValue();
  is(snapshot.length, 2, "Should record an activate event each time");

  await Promise.all([
    BrowserTestUtils.closeWindow(win1),
    BrowserTestUtils.closeWindow(win2),
  ]);

  gRegistry.removeTaskbarTab(taskbarTab.id);
});

add_task(async function testEjectMetric() {
  const taskbarTab = gRegistry.findOrCreateTaskbarTab(PARSED_URL, 0);
  Services.fog.testResetFOG();

  const win = await gWindowManager.openWindow(taskbarTab);

  is(Glean.webApp.eject.testGetValue(), null, "Should start with no events");

  await gWindowManager.ejectWindow(win);

  const snapshot = Glean.webApp.eject.testGetValue();
  is(snapshot.length, 1, "Should have recorded an event on ejection");

  const ejected = gBrowser.tabs[gBrowser.tabs.length - 1];
  const promise = BrowserTestUtils.waitForTabClosing(ejected);
  gBrowser.removeTab(ejected);
  await promise;

  gRegistry.removeTaskbarTab(taskbarTab.id);
});

add_task(async function testUsageTimeMetricSingleWindow() {
  const taskbarTab = gRegistry.findOrCreateTaskbarTab(PARSED_URL, 0);
  Services.fog.testResetFOG();

  const win = await gWindowManager.openWindow(taskbarTab);
  let promise;

  // Take focus away from that window.
  promise = BrowserTestUtils.waitForEvent(window, "focus");
  window.focus();
  await promise;

  // ...and give it back.
  promise = BrowserTestUtils.waitForEvent(win, "focus");
  win.focus();
  await promise;

  // now close it.
  await BrowserTestUtils.closeWindow(win);
  window.focus(); // for good measure

  const snapshot = Glean.webApp.usageTime.testGetValue();
  is(snapshot.count, 2, "Two separate intervals should be made");
  Assert.greater(snapshot.sum, 0, "Measured time should be nonzero");

  gRegistry.removeTaskbarTab(taskbarTab.id);
});
