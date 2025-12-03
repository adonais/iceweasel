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

  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser);
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
