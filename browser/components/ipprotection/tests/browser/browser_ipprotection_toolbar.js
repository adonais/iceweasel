/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPProxyManager: "resource:///modules/ipprotection/IPPProxyManager.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

/**
 * Tests that toolbar widget is added and removed based on
 * `browser.ipProtection.enabled` controlled by Nimbus.
 */
add_task(async function toolbar_added_and_removed() {
  let widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP Protection widget should be added to the navbar"
  );
  let position = CustomizableUI.getPlacementOfWidget(
    IPProtectionWidget.WIDGET_ID
  ).position;
  // By default, the button for revamped sidebar is placed at the beginning of the navbar.
  let expectedPosition = Services.prefs.getBoolPref("sidebar.revamp") ? 8 : 7;
  Assert.equal(
    position,
    expectedPosition,
    "IP Protection widget added in the correct position"
  );
  // Disable the feature
  await cleanupExperiment();
  widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.equal(widget, null, "IP Protection widget is removed");

  // Reenable the feature
  await setupExperiment();
  widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP Protection widget should be added back to the navbar"
  );
});

/**
 * Tests that the toolbar icon state updates when the connection status changes
 */
add_task(async function toolbar_icon_status() {
  let button = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(button),
    "IP Protection widget should be added to the navbar"
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  let panelInitPromise = BrowserTestUtils.waitForEvent(
    document,
    "IPProtection:Init"
  );
  button.click();
  await Promise.all([panelShownPromise, panelInitPromise]);

  let panelView = PanelMultiView.getViewNode(
    document,
    IPProtectionWidget.PANEL_ID
  );
  let content = panelView.querySelector(IPProtectionPanel.CONTENT_TAGNAME);
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });
  IPProtectionService.updateState();
  await putServerInRemoteSettings();
  content.requestUpdate();
  await content.updateComplete;

  Assert.ok(content, "Panel content should be present");

  let statusCard = content.statusCardEl;
  let toggle = statusCard.connectionToggleEl;
  Assert.ok(toggle, "Status card connection toggle should be present");

  let vpnOnPromise = BrowserTestUtils.waitForEvent(
    lazy.IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => !!IPPProxyManager.activatedAt
  );
  // Toggle the VPN on
  toggle.click();
  await vpnOnPromise;
  Assert.ok(
    button.classList.contains("ipprotection-on"),
    "Toolbar icon should now show connected status"
  );
  let vpnOffPromise = BrowserTestUtils.waitForEvent(
    lazy.IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => lazy.IPProtectionService.state === lazy.IPProtectionStates.READY
  );
  // Toggle the VPN off
  toggle.click();
  await vpnOffPromise;
  Assert.ok(
    !button.classList.contains("ipprotection-on"),
    "Toolbar icon should now show disconnected status"
  );

  cleanupService();

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
});

/**
 * Tests that the toolbar icon in a new window has the previous status.
 */
add_task(async function toolbar_icon_status_new_window() {
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });
  IPProtectionService.updateState();

  let content = await openPanel();

  let vpnOnPromise = BrowserTestUtils.waitForEvent(
    lazy.IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => !!IPPProxyManager.activatedAt
  );
  // Toggle the VPN on
  let statusCard = content.statusCardEl;
  statusCard.connectionToggleEl.click();
  await vpnOnPromise;

  let button = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    button.classList.contains("ipprotection-on"),
    "Toolbar icon should now show connected status"
  );

  // Check the icon status is set for new windows
  let newWindow = await BrowserTestUtils.openNewBrowserWindow({
    url: "about:newtab",
  });
  let newButton = newWindow.document.getElementById(
    IPProtectionWidget.WIDGET_ID
  );
  Assert.ok(
    newButton.classList.contains("ipprotection-on"),
    "New toolbar icon should show connected status"
  );
  await BrowserTestUtils.closeWindow(newWindow);

  await setPanelState();
  // Clear userEnabled pref to avoid breaking tests
  Services.prefs.clearUserPref("browser.ipProtection.userEnabled");
  cleanupService();
});

add_task(async function customize_toolbar_remove_widget() {
  let widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP Protection toolbaritem should be visible"
  );
  let prevPosition = CustomizableUI.getPlacementOfWidget(
    IPProtectionWidget.WIDGET_ID
  ).position;

  let stoppedEventPromise = BrowserTestUtils.waitForEvent(
    lazy.IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => lazy.IPProtectionService.state === lazy.IPProtectionStates.READY
  );
  CustomizableUI.removeWidgetFromArea(IPProtectionWidget.WIDGET_ID);
  // VPN should disconect when the toolbaritem is removed
  await stoppedEventPromise;
  Assert.ok(
    !BrowserTestUtils.isVisible(widget),
    "Toolbaritem is no longer visible"
  );

  CustomizableUI.addWidgetToArea(
    IPProtectionWidget.WIDGET_ID,
    CustomizableUI.AREA_NAVBAR,
    prevPosition
  );
});

/**
 * Tests that toolbar widget can be moved and will not reset
 * back to the initial area on re-init.
 */
add_task(async function toolbar_placement_customized() {
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });

  let start = CustomizableUI.getPlacementOfWidget(IPProtectionWidget.WIDGET_ID);
  Assert.equal(
    start.area,
    CustomizableUI.AREA_NAVBAR,
    "IP Protection widget is initially added to the nav bar"
  );

  // Move widget to overflow
  CustomizableUI.addWidgetToArea(
    IPProtectionWidget.WIDGET_ID,
    CustomizableUI.AREA_FIXED_OVERFLOW_PANEL
  );

  let end = CustomizableUI.getPlacementOfWidget(IPProtectionWidget.WIDGET_ID);
  Assert.equal(
    end.area,
    CustomizableUI.AREA_FIXED_OVERFLOW_PANEL,
    "IP Protection widget moved to the overflow area"
  );

  // Disable the feature
  await cleanupExperiment();
  let widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.equal(widget, null, "IP Protection widget is removed");

  const waitForStateChange = BrowserTestUtils.waitForEvent(
    lazy.IPProtectionService,
    "IPProtectionService:StateChanged",
    false,
    () => lazy.IPProtectionService.state === lazy.IPProtectionStates.READY
  );

  // Reenable the feature
  await setupExperiment();

  await waitForStateChange;

  let restored = CustomizableUI.getPlacementOfWidget(
    IPProtectionWidget.WIDGET_ID
  );
  Assert.equal(
    restored.area,
    CustomizableUI.AREA_FIXED_OVERFLOW_PANEL,
    "IP Protection widget is still in the overflow area"
  );

  CustomizableUI.addWidgetToArea(
    IPProtectionWidget.WIDGET_ID,
    start.area,
    start.position
  );
});

/**
 * Tests that toolbar widget can be removed and will not be re-added.
 */
add_task(async function toolbar_removed() {
  setupService({
    isSignedIn: true,
    isEnrolled: true,
  });

  let start = CustomizableUI.getPlacementOfWidget(IPProtectionWidget.WIDGET_ID);
  Assert.equal(
    start.area,
    CustomizableUI.AREA_NAVBAR,
    "IP Protection widget is initially added to the nav bar"
  );

  // Remove from the toolbar
  CustomizableUI.removeWidgetFromArea(IPProtectionWidget.WIDGET_ID);

  let end = CustomizableUI.getPlacementOfWidget(IPProtectionWidget.WIDGET_ID);
  Assert.equal(end, null, "IP Protection widget is removed");

  // Disable the feature
  await cleanupExperiment();

  const waitForStateChange = BrowserTestUtils.waitForEvent(
    lazy.IPProtectionService,
    "IPProtectionService:StateChanged",
    false,
    () => lazy.IPProtectionService.state === lazy.IPProtectionStates.READY
  );

  // Reenable the feature
  await setupExperiment();

  await waitForStateChange;

  let restored = CustomizableUI.getPlacementOfWidget(
    IPProtectionWidget.WIDGET_ID
  );
  Assert.equal(restored, null, "IP Protection widget is still removed");

  CustomizableUI.addWidgetToArea(
    IPProtectionWidget.WIDGET_ID,
    start.area,
    start.position
  );
});
