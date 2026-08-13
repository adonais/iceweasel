/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const fxaDevices = [
  {
    id: 1,
    name: "Device 1",
    availableCommands: { "https://identity.mozilla.com/cmd/open-uri": "baz" },
    lastAccessTime: Date.now(),
  },
  {
    id: 2,
    name: "Device 2",
    availableCommands: { "https://identity.mozilla.com/cmd/open-uri": "boo" },
    lastAccessTime: Date.now() + 60000,
  },
];

let gSandbox;

add_setup(async function () {
  await promiseSyncReady();
  gSync.init();

  gSandbox = sinon.createSandbox();
  gSandbox
    .stub(Weave.Service.clientsEngine, "getClientByFxaDeviceId")
    .callsFake(fxaDeviceId => {
      let target = fxaDevices.find(c => c.id == fxaDeviceId);
      return target ? target.clientRecord : null;
    });
  gSandbox
    .stub(Weave.Service.clientsEngine, "getClientType")
    .returns("desktop");

  registerCleanupFunction(() => {
    gSandbox.restore();
  });
});

async function openFxaPanel() {
  let promiseViewShown = BrowserTestUtils.waitForEvent(
    PanelMultiView.getViewNode(document, "PanelUI-fxa"),
    "ViewShown"
  );
  await gSync.toggleAccountPanel(
    document.getElementById("fxa-toolbar-menu-button"),
    new MouseEvent("mousedown")
  );
  await promiseViewShown;
}

async function closeFxaPanel() {
  let widgetPanel = document.getElementById("customizationui-widget-panel");
  if (widgetPanel) {
    let panelHidden = BrowserTestUtils.waitForEvent(widgetPanel, "popuphidden");
    widgetPanel.hidePopup();
    await panelHidden;
  }
}

async function openFxaPanelFromAppMenu() {
  let mainViewShown = BrowserTestUtils.waitForEvent(PanelUI.panel, "ViewShown");
  PanelUI.show();
  await mainViewShown;
  let fxaViewShown = BrowserTestUtils.waitForEvent(
    PanelMultiView.getViewNode(document, "PanelUI-fxa"),
    "ViewShown"
  );
  document.getElementById("appMenu-fxa-label2").click();
  await fxaViewShown;
}

async function closeAppMenu() {
  if (PanelUI.panel.state == "closed") {
    return;
  }
  let panelHidden = BrowserTestUtils.waitForEvent(PanelUI.panel, "popuphidden");
  PanelUI.hide();
  await panelHidden;
}

// A synced client with a single tab, used to render a device's inline section
// in the app menu (where the "Send Current Page to This Device" option lives).
const appMenuSendTabClient = {
  id: "client1",
  name: "Device 1",
  lastModified: Date.now(),
  tabs: [
    {
      title: "Tab 1",
      url: "https://example.com/tab1",
      icon: "",
      lastUsed: Date.now(),
      inactive: false,
    },
  ],
};

// Opens the FxA panel from the app menu and renders a device's inline section.
// In the app menu, each device is rendered as its own section (rather than a
// button opening a subpanel), so the section is built into the app-menu devices
// list and its send tab telemetry is attributed to fxa_app_menu.
async function renderDeviceSectionFromAppMenu() {
  gSync.updateAllUI({
    status: UIState.STATUS_SIGNED_IN,
    syncEnabled: true,
    email: "foo@bar.com",
  });
  await openFxaPanelFromAppMenu();

  let panelview = PanelMultiView.getViewNode(document, "PanelUI-fxa");
  panelview.syncedTabsPanelList._appendDeviceSection(
    appMenuSendTabClient,
    fxaDevices[0]
  );
}

add_task(async function test_sendtab_exposed_app_menu() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  const sandbox = setupSendTabMocks({ fxaDevices });
  sandbox
    .stub(fxAccounts.commands.closeTab, "isDeviceCompatible")
    .returns(false);
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  await renderDeviceSectionFromAppMenu();

  await Services.fog.testFlushAllChildren();
  let appMenuExposed = Glean.fxaAppMenu.sendTabExposed.testGetValue();
  let avatarExposed = Glean.fxaAvatarMenu.sendTabExposed.testGetValue();
  Assert.ok(
    appMenuExposed && appMenuExposed.length,
    "send_tab_exposed recorded under fxa_app_menu when opened via hamburger"
  );
  Assert.ok(
    !avatarExposed || !avatarExposed.length,
    "send_tab_exposed not misattributed to fxa_avatar_menu"
  );

  await closeAppMenu();
  BrowserTestUtils.removeTab(tab);
  sandbox.restore();
});

add_task(async function test_sendtab_opened_app_menu() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  const sandbox = setupSendTabMocks({ fxaDevices });
  sandbox
    .stub(fxAccounts.commands.closeTab, "isDeviceCompatible")
    .returns(false);
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  await renderDeviceSectionFromAppMenu();

  await Services.fog.testFlushAllChildren();
  let appMenuOpened = Glean.fxaAppMenu.sendTabOpened.testGetValue();
  let avatarOpened = Glean.fxaAvatarMenu.sendTabOpened.testGetValue();
  Assert.ok(
    appMenuOpened && appMenuOpened.length,
    "send_tab_opened recorded under fxa_app_menu when opened via hamburger"
  );
  Assert.ok(
    !avatarOpened || !avatarOpened.length,
    "send_tab_opened not misattributed to fxa_avatar_menu"
  );

  await closeAppMenu();
  BrowserTestUtils.removeTab(tab);
  sandbox.restore();
});

add_task(async function test_sendtab_click_device_app_menu() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );
  const sandbox = setupSendTabMocks({ fxaDevices });
  sandbox
    .stub(fxAccounts.commands.closeTab, "isDeviceCompatible")
    .returns(false);
  sandbox.stub(fxAccounts, "flushLogFile").resolves();
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  await renderDeviceSectionFromAppMenu();

  let devicesList = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-devices-list"
  );
  let sendPageBtn = devicesList.querySelector(
    '[data-l10n-id="fxa-menu-device-send-current-page"]'
  );
  ok(sendPageBtn, "Send Current Page button rendered in the device section");
  sendPageBtn.click();

  await TestUtils.waitForCondition(async () => {
    await Services.fog.testFlushAllChildren();
    return !!Glean.fxaAppMenu.clickSendTab.testGetValue()?.length;
  }, "Waiting for click_send_tab telemetry under fxa_app_menu");

  let appMenuClicks = Glean.fxaAppMenu.clickSendTab.testGetValue();
  let avatarClicks = Glean.fxaAvatarMenu.clickSendTab.testGetValue();
  Assert.ok(
    appMenuClicks && appMenuClicks.length,
    "click_send_tab recorded under fxa_app_menu when clicked via hamburger"
  );
  Assert.equal(
    appMenuClicks[0].extra.action,
    "device",
    "Correct action for device click"
  );
  Assert.ok(
    !avatarClicks || !avatarClicks.length,
    "click_send_tab not misattributed to fxa_avatar_menu"
  );

  await closeAppMenu();
  BrowserTestUtils.removeTab(tab);
  sandbox.restore();
});

/**
 * Basic sanity test: send_tab_exposed is no longer fired on FxA panel open.
 * It is now fired per-device when opening the "Recent tabs" subpanel and
 * the "Send Current Page to This Device" button is shown.
 */
add_task(async function test_sendtab_exposed_not_on_panel_open() {
  const sandbox = setupSendTabMocks({ fxaDevices });
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  await openFxaPanel();

  await Services.fog.testFlushAllChildren();
  let exposedEvents = Glean.fxaAvatarMenu.sendTabExposed.testGetValue();
  Assert.ok(
    !exposedEvents || !exposedEvents.length,
    "send_tab_exposed is not fired on FxA panel open (now fires per-device)"
  );

  await closeFxaPanel();
  sandbox.restore();
});

/**
 * Test that telemetry is recorded for tab context menu.
 */
add_task(async function test_sendtab_tab_context_menu() {
  const sandbox = setupSendTabMocks({ fxaDevices });
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  // Open a new tab
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  // Open tab context menu
  let contextMenu = document.getElementById("tabContextMenu");
  let popupShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");

  // Initialize TabContextMenu
  let evt = new Event("");
  tab.dispatchEvent(evt);
  gBrowser.selectedTab.focus();
  contextMenu.openPopup(tab, "end_after", 0, 0, true, false, evt);

  await popupShown;

  await Services.fog.testFlushAllChildren();
  let exposedEvents = Glean.tabContextMenu.sendTabExposed.testGetValue();
  Assert.ok(
    exposedEvents && exposedEvents.length,
    "send_tab_exposed event was recorded for tab context menu"
  );
  Assert.equal(
    exposedEvents[0].extra.device_count,
    "2",
    "Correct device count for tab context menu"
  );

  // Close the context menu
  let popupHidden = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  contextMenu.hidePopup();
  await popupHidden;

  BrowserTestUtils.removeTab(tab);
  sandbox.restore();
  info("Tab context menu telemetry test passed!");
});

/**
 * Test that click_send_tab is recorded when the user clicks "Send Current Page
 * to This Device" in the per-device recent tabs subpanel.
 */
add_task(async function test_click_send_tab_telemetry_recent_tabs_panel() {
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  const sandbox = setupSendTabMocks({ fxaDevices });
  sandbox
    .stub(fxAccounts.commands.closeTab, "isDeviceCompatible")
    .returns(false);
  sandbox.stub(fxAccounts, "flushLogFile").resolves();

  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  gSync.updateAllUI({
    status: UIState.STATUS_SIGNED_IN,
    syncEnabled: true,
    email: "foo@bar.com",
  });
  await openFxaPanel();

  let panelview = PanelMultiView.getViewNode(document, "PanelUI-fxa");
  let devicesListContainer = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-menu-devices-list"
  );

  let mockDevice = fxaDevices[0];
  let mockClient = {
    id: "client1",
    name: "Device 1",
    lastModified: Date.now(),
    tabs: [
      {
        title: "Tab 1",
        url: "https://example.com/tab1",
        icon: "",
        lastUsed: Date.now(),
        inactive: false,
      },
    ],
  };

  let subviewShown = BrowserTestUtils.waitForEvent(
    PanelMultiView.getViewNode(document, "PanelUI-fxa-device-recent-tabs"),
    "ViewShown"
  );
  panelview.syncedTabsPanelList._showDeviceRecentTabs(
    mockClient,
    mockDevice,
    devicesListContainer,
    new PointerEvent("click")
  );
  await subviewShown;

  let sendPageBtn = PanelMultiView.getViewNode(
    document,
    "PanelUI-fxa-device-send-current-page"
  );
  ok(!sendPageBtn.hidden, "Send Current Page button is visible");
  sendPageBtn.click();

  await TestUtils.waitForCondition(async () => {
    await Services.fog.testFlushAllChildren();
    return !!Glean.fxaAvatarMenu.clickSendTab.testGetValue()?.length;
  }, "Waiting for clickSendTab telemetry to be recorded");

  let clickEvents = Glean.fxaAvatarMenu.clickSendTab.testGetValue();
  Assert.equal(clickEvents[0].extra.action, "device", "action is 'device'");
  Assert.equal(
    clickEvents[0].extra.device_count,
    "2",
    "device_count matches number of send tab targets"
  );

  BrowserTestUtils.removeTab(tab);
  sandbox.restore();
});

/**
 * elements inside the Send Tab subviews
 * (PanelUI-fxa-menu-sendtab-{connect-phone,enable-sync,no-devices,
 * not-configured}) should resolve to "fxa_avatar_menu", so URL parameters and
 * telemetry are attributed correctly when the user is in those flows from
 * the avatar menu. These subviews are NOT nested inside PanelUI-fxa-menu
 * (they are siblings), so a contains() check would miss them. See
 * bug 2035981.
 */
add_task(async function test_get_entry_point_for_sendtab_subviews() {
  for (const id of [
    "PanelUI-fxa-menu-sendtab-connect-phone-button",
    "PanelUI-fxa-menu-sendtab-enable-sync-button",
  ]) {
    const button = PanelMultiView.getViewNode(document, id);
    Assert.ok(button, `${id} exists in the view cache`);
    Assert.equal(
      gSync._getEntryPointForElement(button),
      "fxa_avatar_menu",
      `${id} resolves to fxa_avatar_menu`
    );
  }
});
