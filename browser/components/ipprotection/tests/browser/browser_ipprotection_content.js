/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { LINKS } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionWidget: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPProtectionPanel:
    "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs",
});

async function setAndUpdateIsSignedOut(content, isSignedOut) {
  content.state.isSignedOut = isSignedOut;
  content.requestUpdate();
  await content.updateComplete;
}

async function setAndUpdateHasUpgraded(content, hasUpgraded) {
  content.state.hasUpgraded = hasUpgraded;
  content.requestUpdate();
  await content.updateComplete;
}

async function resetStateToObj(content, originalState) {
  content.state = originalState;
  content.requestUpdate();
  await content.updateComplete;
}

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

  let originalState = structuredClone(content.state);

  await setAndUpdateIsSignedOut(content, false);

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(content.statusCardEl, "Status card should be present");

  // Test content before user upgrade
  await setAndUpdateHasUpgraded(content, false);
  Assert.ok(
    !content.activeSubscriptionEl,
    "Active subscription element should not be present"
  );
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

  // Test content after user upgrade
  await setAndUpdateHasUpgraded(content, true);

  Assert.ok(!content.upgradeEl, "Upgrade vpn element should not be present");

  await resetStateToObj(content, originalState);

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
  const fiveDaysInMS = 5 * 24 * 60 * 60 * 1000;
  const enabledSince = Date.now() - fiveDaysInMS;
  const mockLocation = {
    name: "United States",
    code: "us",
  };

  let content = await openPanel({
    isSignedOut: false,
    protectionEnabledSince: enabledSince,
    location: mockLocation,
  });

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(content.statusCardEl, "Status card should be present");
  Assert.equal(
    content.statusCardEl?.getAttribute("data-l10n-id"),
    l10nIdOff,
    "Status card connection toggle data-l10n-id should be correct by default"
  );
  Assert.equal(
    content.statusCardEl?.description,
    "",
    "Time string should be empty"
  );
  Assert.ok(content.locationEl, "Location details should be present");

  let flag = content.locationEl?.shadowRoot.querySelector("ipprotection-flag");

  Assert.ok(flag, "Flag component should be present");

  let animationLoadedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => !content.animationEl
  );
  let timerUpdatedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => JSON.parse(content.statusCardEl.dataset.l10nArgs).time != ""
  );

  // Set state as if protection is enabled
  content.state.isProtectionEnabled = true;
  content.state.protectionEnabledSince = enabledSince;
  content.requestUpdate();
  await Promise.all([
    content.updateComplete,
    timerUpdatedPromise,
    animationLoadedPromise,
  ]);

  Assert.equal(
    content.statusCardEl?.getAttribute("data-l10n-id"),
    l10nIdOn,
    "Status card connection toggle data-l10n-id should be correct when protection is enabled"
  );
  Assert.ok(content.animationEl, "Status card animation should be present");

  let animationUnloadedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => !content.animationEl
  );
  let timerStoppedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => JSON.parse(content.statusCardEl.dataset.l10nArgs).time === ""
  );

  // Set state as if protection is disabled
  content.state.isProtectionEnabled = false;
  content.requestUpdate();
  await Promise.all([
    content.updateComplete,
    animationUnloadedPromise,
    timerStoppedPromise,
  ]);

  Assert.equal(
    content.statusCardEl?.getAttribute("data-l10n-id"),
    l10nIdOff,
    "Status card connection toggle data-l10n-id should be correct when protection is disabled"
  );
  Assert.ok(
    !content.animationEl,
    "Status card animation should not be present"
  );

  await closePanel();
});

/**
 * Tests that the correct IPProtection events are dispatched on toggle.
 */
add_task(async function test_ipprotection_events_on_toggle() {
  const userEnableEventName = "IPProtection:UserEnable";
  const userDisableEventName = "IPProtection:UserDisable";

  // Reset service state.
  cleanupService();
  await IPProtectionService.updateState();

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

  setupService({
    isSignedIn: true,
    isEnrolled: true,
  });
  await IPProtectionService.updateState();

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
  let userEnabledPref = Services.prefs.getBoolPref(
    "browser.ipProtection.userEnabled",
    false
  );
  Assert.equal(userEnabledPref, true, "userEnabled pref should be set to true");

  let disableEventPromise = BrowserTestUtils.waitForEvent(
    window,
    userDisableEventName
  );
  content.connectionToggleEl.click();

  await disableEventPromise;
  Assert.ok("Disable event was found after clicking the toggle");
  userEnabledPref = Services.prefs.getBoolPref(
    "browser.ipProtection.userEnabled",
    true
  );
  Assert.equal(
    userEnabledPref,
    false,
    "userEnabled pref should be set to false"
  );

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
  cleanupService();
});

add_task(async function test_support_link() {
  let button = document.getElementById(lazy.IPProtectionWidget.WIDGET_ID);
  let panelView = PanelMultiView.getViewNode(
    document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  let panelInitPromise = BrowserTestUtils.waitForEvent(
    document,
    "IPProtection:Init"
  );
  // Open the panel
  button.click();
  await Promise.all([panelShownPromise, panelInitPromise]);

  let content = panelView.querySelector(lazy.IPProtectionPanel.CONTENT_TAGNAME);
  let originalState = structuredClone(content.state);
  content.state.hasUpgraded = false;
  content.state.isSignedOut = false;
  content.requestUpdate();
  await content.updateComplete;

  let supportLink = content.upgradeEl.querySelector("#vpn-support-link");
  Assert.ok(supportLink, "Support link should be present");

  let newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    LINKS.PRODUCT_URL
  );
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  supportLink.click();
  let newTab = await newTabPromise;
  await panelHiddenPromise;

  Assert.equal(
    gBrowser.selectedTab,
    newTab,
    "New tab is now open in a new foreground tab"
  );

  // To be safe, reset the entire state
  await resetStateToObj(content, originalState);

  BrowserTestUtils.removeTab(newTab);
});
