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
 * Tests that clicking toolbar button opens the panel,
 * and the panel contains a `<ipprotection-content>` element.
 */
add_task(async function click_toolbar_button() {
  let button = document.getElementById(lazy.IPProtectionWidget.WIDGET_ID);
  let panelView = PanelMultiView.getViewNode(
    document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  // Open the panel
  button.click();
  await panelShownPromise;

  let component = panelView.querySelector(
    lazy.IPProtectionPanel.CONTENT_TAGNAME
  );
  Assert.ok(
    BrowserTestUtils.isVisible(component),
    "ipprotection-content component should be present"
  );

  let header = panelView.querySelector(
    lazy.IPProtectionPanel.CONTENT_TAGNAME
  ).headerEl;
  Assert.ok(
    BrowserTestUtils.isVisible(header),
    "ipprotection-header component should be present"
  );

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
});

/**
 * Tests that the panel also loads the custom elements in a new window.
 */
add_task(async function test_panel_in_new_window() {
  let newWindow = await BrowserTestUtils.openNewBrowserWindow({
    url: "about:newtab",
  });
  newWindow.focus();

  let button = newWindow.document.getElementById(
    lazy.IPProtectionWidget.WIDGET_ID
  );
  let panelView = PanelMultiView.getViewNode(
    newWindow.document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(newWindow.document, "popupshown");
  // Open the panel
  button.click();
  await panelShownPromise;

  let component = panelView.querySelector(
    lazy.IPProtectionPanel.CONTENT_TAGNAME
  );
  Assert.ok(
    BrowserTestUtils.isVisible(component),
    "ipprotection-content component should be present"
  );

  let header = panelView.querySelector(
    lazy.IPProtectionPanel.CONTENT_TAGNAME
  ).headerEl;
  Assert.ok(
    BrowserTestUtils.isVisible(header),
    "ipprotection-header component should be present"
  );

  await BrowserTestUtils.closeWindow(newWindow);
});

/**
 * Tests that sending IPProtection:Close closes the panel.
 */
add_task(async function test_close_panel() {
  let button = document.getElementById(lazy.IPProtectionWidget.WIDGET_ID);
  let panelView = PanelMultiView.getViewNode(
    document,
    lazy.IPProtectionWidget.PANEL_ID
  );

  let panelShownPromise = waitForPanelEvent(document, "popupshown");
  // Open the panel
  button.click();
  await panelShownPromise;

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");

  panelView.dispatchEvent(
    new CustomEvent("IPProtection:Close", { bubbles: true })
  );

  await panelHiddenPromise;

  Assert.ok(!BrowserTestUtils.isVisible(panelView), "Panel should be closed");
});
