"use strict";

const SHARE_BUTTON_PREF = "browser.urlbar.share-button.enabled";

add_task(async function shareButtonHiddenByDefault() {
  let shareButton = document.getElementById("share-button");
  ok(shareButton, "The share button exists in the urlbar");

  await SpecialPowers.pushPrefEnv({ clear: [[SHARE_BUTTON_PREF]] });
  ok(
    BrowserTestUtils.isHidden(shareButton),
    "The share button is hidden by default"
  );
  await SpecialPowers.popPrefEnv();
});

add_task(async function shareButtonVisibilityFollowsPref() {
  let shareButton = document.getElementById("share-button");
  ok(
    BrowserTestUtils.isVisible(shareButton),
    "The share button is visible when the pref is on"
  );

  await SpecialPowers.pushPrefEnv({ set: [[SHARE_BUTTON_PREF, false]] });
  ok(
    BrowserTestUtils.isHidden(shareButton),
    "The share button is hidden when the pref is off"
  );

  await SpecialPowers.popPrefEnv();
  ok(
    BrowserTestUtils.isVisible(shareButton),
    "The share button is visible again when the pref is back on"
  );
});

function assertButtonExpanded(button, expanded, message) {
  is(button.getAttribute("aria-expanded"), String(expanded), message);
}

async function testKeyboardActivation(key) {
  await BrowserTestUtils.withNewTab("https://example.com/", async () => {
    let shareButton = document.getElementById("share-button");
    assertButtonExpanded(
      shareButton,
      false,
      "The share button is collapsed before opening the panel"
    );

    ToolbarKeyboardNavigator._focusButton(shareButton);
    is(document.activeElement, shareButton, "The share button is focused");

    let panelShown = BrowserTestUtils.waitForEvent(
      document,
      "popupshown",
      true,
      e => e.target.id === "share-panel"
    );
    EventUtils.synthesizeKey(key);
    let panel = (await panelShown).target;

    is(panel.state, "open", "The panel stays open after keyboard activation");
    assertButtonExpanded(
      shareButton,
      true,
      "The share button is expanded while the panel is open"
    );

    let copyLinkButton = document.getElementById("share-panel-copy-link");
    await TestUtils.waitForCondition(
      () => document.activeElement === copyLinkButton,
      "Wait for focus to move to the first item in the panel"
    );

    let panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    EventUtils.synthesizeKey("KEY_Escape");
    await panelHidden;

    assertButtonExpanded(
      shareButton,
      false,
      "The share button is collapsed after the panel closes"
    );
    await TestUtils.waitForCondition(
      () => document.activeElement === shareButton,
      "Wait for focus to return to the share button"
    );
  });
}

add_task(async function shareButtonKeyboardActivationEnter() {
  await testKeyboardActivation("KEY_Enter");
});

add_task(async function shareButtonKeyboardActivationSpace() {
  await testKeyboardActivation(" ");
});

add_task(async function shareButtonVisibleInNewWindow() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let shareButton = win.document.getElementById("share-button");
  ok(
    BrowserTestUtils.isVisible(shareButton),
    "The share button is visible in a new window when the pref is on"
  );

  await BrowserTestUtils.closeWindow(win);
});
