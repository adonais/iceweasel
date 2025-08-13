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
 * Tests that the ip protection signed out panel subview has the correct content.
 */
add_task(async function test_signed_out_content() {
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

  content.state.isSignedIn = false;
  content.requestUpdate();
  await content.updateComplete;

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );

  let signedOutElement = content.shadowRoot.querySelector(
    "ipprotection-signedout"
  );
  let signedOutContent = signedOutElement.shadowRoot;
  let signedOutImg = signedOutContent.querySelector("#signed-out-vpn-img");
  let signedOutTitle = signedOutContent.querySelector(
    "#signed-out-vpn-message"
  );
  let signedOutButton = signedOutContent.querySelector("#sign-in-vpn");

  Assert.ok(signedOutContent, "Signed out content should be visible");
  Assert.ok(signedOutImg, "Signed out image should be visible");
  Assert.ok(signedOutTitle, "Signed out title should be visible");
  Assert.ok(signedOutButton, "Signed out button should be visible");

  // Close the panel
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  EventUtils.synthesizeKey("KEY_Escape");
  await panelHiddenPromise;
});
