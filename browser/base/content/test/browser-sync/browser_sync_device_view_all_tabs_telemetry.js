/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SyncedTabs } = ChromeUtils.importESModule(
  "resource://services-sync/SyncedTabs.sys.mjs"
);

const DEVICE = {
  id: "dev-desktop",
  name: "Laptop",
  type: "desktop",
  isCurrentDevice: false,
  lastAccessTime: Date.now(),
  availableCommands: {},
};

const CLIENT = {
  id: "client-desktop",
  name: DEVICE.name,
  lastModified: Date.now(),
  tabs: [
    {
      title: "Tab one",
      url: "https://example.com/one",
      icon: "",
      lastUsed: Date.now(),
      inactive: false,
    },
    {
      title: "Tab two",
      url: "https://example.com/two",
      icon: "",
      lastUsed: Date.now(),
      inactive: false,
    },
  ],
};

add_setup(async function () {
  gSync.init();
  await promiseSyncReady();
});

/**
 * Stubs out enough of FxA/Sync for the connected devices list to render a
 * single desktop device with recent tabs, and keeps the "view all" click from
 * opening the sidebar.
 */
function setupDeviceListMocks() {
  const sandbox = sinon.createSandbox();
  sandbox.stub(UIState, "get").returns({
    status: UIState.STATUS_SIGNED_IN,
    syncEnabled: true,
  });

  // Keep the panel's own init from racing with the manual device list update.
  sandbox.stub(SyncedTabs, "isConfiguredToSyncTabs").get(() => false);

  sandbox.stub(fxAccounts.device, "recentDeviceList").get(() => [DEVICE]);
  sandbox.stub(fxAccounts.device, "refreshDeviceList").resolves(true);
  sandbox.stub(SyncedTabs, "getTabClients").resolves([CLIENT]);
  sandbox
    .stub(Weave.Service.clientsEngine, "getClientFxaDeviceId")
    .callsFake(clientId => clientId.replace("client", "dev"));
  sandbox.stub(gSync, "getSendTabTargets").returns([DEVICE]);
  sandbox.stub(SidebarController, "show").resolves();

  return sandbox;
}

function assertViewAllEvent(events, menu) {
  Assert.equal(events?.length, 1, `One event recorded for the ${menu}`);
  Assert.equal(
    events[0].extra.fxa_status,
    UIState.STATUS_SIGNED_IN,
    "fxa_status is recorded"
  );
  Assert.equal(events[0].extra.fxa_avatar, "false", "fxa_avatar is recorded");
  Assert.equal(
    String(events[0].extra.fxa_sync_on),
    "true",
    "fxa_sync_on is recorded"
  );
}

/**
 * Clicking "View all tabs" in the per-device recent tabs subpanel of the
 * avatar menu records fxa_avatar_menu.click_view_all_synced_tabs.
 */
add_task(async function test_view_all_synced_tabs_avatar_menu() {
  const sandbox = setupDeviceListMocks();
  Services.fog.testResetFOG();

  // Open fxa panel from the avatar menu
  document.getElementById("fxa-toolbar-menu-button").click();
  let fxaView = PanelMultiView.getViewNode(document, "PanelUI-fxa");
  await BrowserTestUtils.waitForEvent(fxaView, "ViewShown");

  await fxaView.syncedTabsPanelList._doUpdateDeviceList();

  let devicesList = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-devices-list"
  );
  let deviceEntry = devicesList.querySelector(
    `.PanelUI-fxa-menu-device-entry[label="${DEVICE.name}"]`
  );
  Assert.ok(deviceEntry, "The device is listed in the account menu");

  let recentTabsPanel = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-device-recent-tabs"
  );
  let shown = BrowserTestUtils.waitForEvent(recentTabsPanel, "ViewShown");
  deviceEntry.click();
  await shown;

  let viewAllBtn = recentTabsPanel.querySelector(
    "#PanelUI-fxa-device-view-all-tabs"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(viewAllBtn),
    "The view all tabs button is visible"
  );

  let panel = recentTabsPanel.closest("panel");
  let hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  viewAllBtn.click();
  await hidden;
  await Services.fog.testFlushAllChildren();

  assertViewAllEvent(
    Glean.fxaAvatarMenu.clickViewAllSyncedTabs.testGetValue(),
    "account menu"
  );
  Assert.ok(
    !Glean.fxaAppMenu.clickViewAllSyncedTabs.testGetValue()?.length,
    "The event is not recorded for fxa_app_menu"
  );
  sandbox.restore();
});

/**
 * Clicking the "View all tabs" button for a device in the app menu
 * records fxa_app_menu.click_view_all_synced_tabs.
 */
add_task(async function test_view_all_synced_tabs_app_menu() {
  const sandbox = setupDeviceListMocks();
  Services.fog.testResetFOG();

  let mainViewShown = BrowserTestUtils.waitForEvent(PanelUI.panel, "ViewShown");
  PanelUI.show();
  await mainViewShown;

  // Open fxa panel from the app menu
  let fxaView = PanelMultiView.getViewNode(document, "PanelUI-fxa");
  let fxaViewShown = BrowserTestUtils.waitForEvent(fxaView, "ViewShown");
  document.getElementById("appMenu-fxa-label2").click();
  await fxaViewShown;

  await fxaView.syncedTabsPanelList._doUpdateDeviceList();

  let devicesList = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-devices-list"
  );
  Assert.ok(
    document.getElementById("appMenu-popup").contains(devicesList),
    "The devices list is inside the app menu"
  );

  let viewAllBtn = devicesList.querySelector(
    'toolbarbutton.subviewbutton[closemenu="none"]'
  );
  Assert.ok(viewAllBtn, "The view all tabs button is present in the app menu");

  let hidden = BrowserTestUtils.waitForEvent(PanelUI.panel, "popuphidden");
  viewAllBtn.click();
  await hidden;
  await Services.fog.testFlushAllChildren();

  assertViewAllEvent(
    Glean.fxaAppMenu.clickViewAllSyncedTabs.testGetValue(),
    "app menu"
  );
  Assert.ok(
    !Glean.fxaAvatarMenu.clickViewAllSyncedTabs.testGetValue()?.length,
    "The event is not recorded for fxa_avatar_menu"
  );
  sandbox.restore();
});
