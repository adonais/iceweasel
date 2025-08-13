/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionWidget: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPProtectionPanel:
    "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs",
});

/**
 * Tests that the ip protection main panel view has the correct content.
 */
add_task(async function test_main_content() {
  let button = document.getElementById(lazy.IPProtectionWidget.WIDGET_ID);
  let panelView = PanelMultiView.getViewNode(
    document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  // Open the panel
  button.click();
  await panelShownPromise;

  let content = panelView.querySelector(lazy.IPProtectionPanel.CONTENT_TAGNAME);

  content.state.isSignedIn = true;
  content.requestUpdate();
  await content.updateComplete;

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(content.statusCardEl, "Status card should be present");
  Assert.ok(content.upgradeEl, "Upgrade vpn element should be present");
  Assert.ok(
    content.upgradeEl.querySelector("#upgrade-vpn-title"),
    "Upgrade vpn title should be present"
  );
  Assert.ok(
    content.upgradeEl.querySelector("#upgrade-vpn-paragraph"),
    "Upgrade vpn paragraph should be present"
  );
  Assert.ok(
    content.upgradeEl.querySelector("#upgrade-vpn-button"),
    "Upgrade vpn button should be present"
  );

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
});

/**
 * Tests UI updates to the status card in the panel after enable/disable.
 */
add_task(async function test_status_card() {
  const l10nIdOn = "ipprotection-connection-status-on";
  const l10nIdOff = "ipprotection-connection-status-off";

  let button = document.getElementById(lazy.IPProtectionWidget.WIDGET_ID);
  let panelView = PanelMultiView.getViewNode(
    document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  // Open the panel
  button.click();
  await panelShownPromise;

  let content = panelView.querySelector(lazy.IPProtectionPanel.CONTENT_TAGNAME);
  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(content.statusCardEl, "Status card should be present");
  Assert.equal(
    content.connectionTitleEl?.getAttribute("data-l10n-id"),
    l10nIdOff,
    "Status card connection toggle data-l10n-id should be correct by default"
  );
  Assert.ok(content.state, "State should be present");

  // Set state as if protection is enabled
  content.state.isProtectionEnabled = true;

  content.requestUpdate();
  await content.statusCardEl.updateComplete;

  Assert.equal(
    content.connectionTitleEl?.getAttribute("data-l10n-id"),
    l10nIdOn,
    "Status card connection toggle data-l10n-id should be correct when protection is enabled"
  );

  // Set state as if protection is disabled
  content.state.isProtectionEnabled = false;

  content.requestUpdate();
  await content.statusCardEl.updateComplete;

  Assert.equal(
    content.connectionTitleEl?.getAttribute("data-l10n-id"),
    l10nIdOff,
    "Status card connection toggle data-l10n-id should be correct when protection is disabled"
  );

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
});

/**
 * Tests that the correct IPProtection events are dispatched on toggle.
 */
add_task(async function test_ipprotection_events_on_toggle() {
  const userEnableEventName = "IPProtection:UserEnable";
  const userDisableEventName = "IPProtection:UserDisable";

  let button = document.getElementById(lazy.IPProtectionWidget.WIDGET_ID);
  let panelView = PanelMultiView.getViewNode(
    document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  // Open the panel
  button.click();
  await panelShownPromise;

  let content = panelView.querySelector(lazy.IPProtectionPanel.CONTENT_TAGNAME);
  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(content.statusCardEl, "Status card should be present");
  Assert.ok(
    content.connectionToggleEl,
    "Status card connection toggle should be present"
  );

  let enableEventPromise = BrowserTestUtils.waitForEvent(
    window,
    userEnableEventName
  );
  content.connectionToggleEl.click();

  await enableEventPromise;
  Assert.ok("Enable event was found after clicking the toggle");

  let disableEventPromise = BrowserTestUtils.waitForEvent(
    window,
    userDisableEventName
  );
  content.connectionToggleEl.click();

  await disableEventPromise;
  Assert.ok("Disable event was found after clicking the toggle");

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
});
