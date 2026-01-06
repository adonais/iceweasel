/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPProxyManager: "resource:///modules/ipprotection/IPPProxyManager.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

const { ERRORS } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);

async function resetStateToObj(content, originalState) {
  content.state = originalState;
  content.requestUpdate();
  await content.updateComplete;
}

/**
 * Tests that the toggled event is recorded when the VPN
 * is turned on or off
 */
add_task(async function user_toggle_on_and_off() {
  let button = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(button),
    "IP Protection widget should be added to the navbar"
  );

  await putServerInRemoteSettings();

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

  Assert.ok(content, "Panel content should be present");

  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });
  IPProtectionService.updateState();
  await content.updateComplete;

  let statusCard = content.shadowRoot.querySelector("ipprotection-status-card");

  let toggle = statusCard.connectionToggleEl;
  Assert.ok(toggle, "Status card connection toggle should be present");

  Services.fog.testResetFOG();
  await Services.fog.testFlushAllChildren();
  let vpnOnPromise = BrowserTestUtils.waitForEvent(
    lazy.IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => !!IPPProxyManager.activatedAt
  );
  // Toggle the VPN on
  toggle.click();
  await vpnOnPromise;
  let toggledEvents = Glean.ipprotection.toggled.testGetValue();
  Assert.equal(toggledEvents.length, 1, "should have recorded a toggle");
  Assert.equal(toggledEvents[0].category, "ipprotection");
  Assert.equal(toggledEvents[0].name, "toggled");
  Assert.equal(toggledEvents[0].extra.enabled, "true");
  Assert.equal(toggledEvents[0].extra.userAction, "true");

  let vpnOffPromise = BrowserTestUtils.waitForEvent(
    lazy.IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => !IPPProxyManager.activatedAt
  );
  // Toggle the VPN off
  toggle.click();
  await vpnOffPromise;
  toggledEvents = Glean.ipprotection.toggled.testGetValue();
  Assert.equal(toggledEvents.length, 2, "should have recorded a second toggle");
  Assert.equal(toggledEvents[1].category, "ipprotection");
  Assert.equal(toggledEvents[1].name, "toggled");
  Assert.equal(toggledEvents[1].extra.enabled, "false");
  Assert.equal(toggledEvents[1].extra.userAction, "true");
  Assert.greater(
    Math.ceil(toggledEvents[1].extra.duration),
    0,
    "Should have positive duration"
  );

  Services.fog.testResetFOG();
  cleanupService();

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
});

/**
 * Tests that the toggled event is recorded when the VPN
 * turns off at browser shutdown
 */
add_task(async function toggle_off_on_shutdown() {
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
  Assert.ok(content, "Panel content should be present");

  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });
  IPProtectionService.updateState();
  await content.updateComplete;
  await putServerInRemoteSettings();

  let statusCard = content.statusCardEl;
  let toggle = statusCard.connectionToggleEl;
  Assert.ok(toggle, "Status card connection toggle should be present");

  Services.fog.testResetFOG();

  let vpnOnPromise = BrowserTestUtils.waitForEvent(
    lazy.IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => !!IPPProxyManager.activatedAt
  );
  // Toggle the VPN on
  toggle.click();
  await vpnOnPromise;
  let toggledEvents = Glean.ipprotection.toggled.testGetValue();
  Assert.equal(toggledEvents.length, 1, "should have recorded a toggle");
  Assert.equal(toggledEvents[0].category, "ipprotection");
  Assert.equal(toggledEvents[0].name, "toggled");
  Assert.equal(toggledEvents[0].extra.enabled, "true");
  Assert.equal(toggledEvents[0].extra.userAction, "true");

  // Simulate closing the window
  lazy.IPProtectionService.uninit();
  toggledEvents = Glean.ipprotection.toggled.testGetValue();
  Assert.equal(toggledEvents.length, 2, "should have recorded a second toggle");
  Assert.equal(toggledEvents[1].category, "ipprotection");
  Assert.equal(toggledEvents[1].name, "toggled");
  Assert.equal(toggledEvents[1].extra.enabled, "false");
  Assert.equal(toggledEvents[1].extra.userAction, "false");
  Assert.greater(
    Math.ceil(toggledEvents[1].extra.duration),
    0,
    "Should have positive duration"
  );

  // Clear userEnabled pref to avoid breaking tests
  Services.prefs.clearUserPref("browser.ipProtection.userEnabled");

  Services.fog.testResetFOG();
  // Re-initialize to avoid breaking tests that follow
  cleanupService();
  await lazy.IPProtectionService.init();
  let widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP Protection widget should be added back to the navbar"
  );
});

/**
 * Tests that the click upgrade button event is recorded when CTA is clicked
 */
add_task(async function click_upgrade_button() {
  let button = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(button),
    "IP Protection widget should be added to the navbar"
  );

  lazy.IPProtectionService.setState(IPProtectionStates.READY);
  await putServerInRemoteSettings();

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

  Assert.ok(content, "Panel content should be present");

  content.state.isSignedOut = false;
  content.requestUpdate();
  await content.updateComplete;

  let upgradeButton = content.upgradeEl.querySelector("#upgrade-vpn-button");

  Services.fog.testResetFOG();
  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser);
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  upgradeButton.click();
  let newTab = await newTabPromise;
  await panelHiddenPromise;

  let upgradeEvent = Glean.ipprotection.clickUpgradeButton.testGetValue();
  Assert.equal(upgradeEvent.length, 1, "should have recorded a toggle");

  Services.fog.testResetFOG();

  BrowserTestUtils.removeTab(newTab);
});

/**
 * Tests that the error event is recorded when an error is triggered
 */
add_task(async function test_error_state() {
  Services.fog.testResetFOG();
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

  lazy.IPPProxyManager.setErrorState(ERRORS.GENERIC, ERRORS.GENERIC);
  let errorEvent = Glean.ipprotection.error.testGetValue();
  Assert.equal(errorEvent.length, 1, "should have recorded an error");
  Services.fog.testResetFOG();
  await closePanel();
});
