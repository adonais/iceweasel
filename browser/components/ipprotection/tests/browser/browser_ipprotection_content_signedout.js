/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const lazy = {};

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

ChromeUtils.defineESModuleGetters(lazy, {
  IPProtectionWidget: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  IPProtectionPanel:
    "resource:///modules/ipprotection/IPProtectionPanel.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
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

  content.state.isSignedOut = true;
  content.requestUpdate();
  await content.updateComplete;

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );

  let signedOutContent = content.signedOutEl.shadowRoot;
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

/**
 * Tests sign-in button functionality
 */
add_task(async function test_signin_button() {
  let sandbox = sinon.createSandbox();
  sandbox
    .stub(lazy.SpecialMessageActions, "fxaSignInFlow")
    .callsFake(async function () {
      return true;
    });

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

  content.state.isSignedOut = true;
  content.requestUpdate();
  await content.updateComplete;

  Assert.ok(
    BrowserTestUtils.isVisible(content.signedOutEl),
    "Signed out element should be visible"
  );

  let signInButton =
    content.signedOutEl.shadowRoot.querySelector("#sign-in-vpn");
  Assert.ok(
    BrowserTestUtils.isVisible(signInButton),
    "Signed out button should be visible"
  );

  let signInPromise = BrowserTestUtils.waitForEvent(
    document,
    "IPProtection:SignIn"
  );
  let panelHiddenPromise = waitForPanelEvent(document, "popuphidden");
  signInButton.click();
  await Promise.all([signInPromise, panelHiddenPromise]);

  let panelShownAgainPromise = waitForPanelEvent(document, "popupshown");
  await lazy.IPProtectionService.startLoginFlow(gBrowser);
  await panelShownAgainPromise;

  // Close the panel
  let panelHiddenPromiseEnd = waitForPanelEvent(document, "popuphidden");

  panelView.dispatchEvent(
    new CustomEvent("IPProtection:Close", { bubbles: true })
  );

  await panelHiddenPromiseEnd;

  sandbox.restore();
});
