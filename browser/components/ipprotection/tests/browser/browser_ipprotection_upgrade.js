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

const { LINKS } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);

async function resetStateToObj(content, originalState) {
  content.state = originalState;
  content.requestUpdate();
  await content.updateComplete;
}

/**
 * Tests upgrade button functionality
 */
add_task(async function test_upgrade_button() {
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
  content.state.isSignedIn = true;
  content.requestUpdate();
  await content.updateComplete;

  let upgradeButton = content.upgradeEl.querySelector("#upgrade-vpn-button");
  Assert.ok(upgradeButton, "Upgrade vpn button should be present");

  let newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    LINKS.PRODUCT_URL + "#pricing"
  );
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  upgradeButton.click();
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

/**
 * Test functionality of the download button added post-upgrade
 */
add_task(async function test_download_button() {
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
  content.state.isSignedIn = true;
  content.state.hasUpgraded = true;
  content.requestUpdate();
  await content.updateComplete;

  let downloadButton = content.downloadButtonEl;

  Assert.ok(downloadButton, "Download vpn button should be present");

  let newTabPromise = BrowserTestUtils.waitForNewTab(
    gBrowser,
    LINKS.DOWNLOAD_URL
  );
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  downloadButton.click();
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
