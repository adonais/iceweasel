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

add_task(async function shareButtonVisibleInNewWindow() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let shareButton = win.document.getElementById("share-button");
  ok(
    BrowserTestUtils.isVisible(shareButton),
    "The share button is visible in a new window when the pref is on"
  );

  await BrowserTestUtils.closeWindow(win);
});
