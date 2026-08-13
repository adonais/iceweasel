/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { CustomizableUITestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/CustomizableUITestUtils.sys.mjs"
);

const gCUITestUtils = new CustomizableUITestUtils(window);

async function withReferralsPref(enabled, task) {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.referrals.enabled", enabled]],
  });
  try {
    await task();
  } finally {
    await SpecialPowers.popPrefEnv();
  }
}

add_task(async function test_hidden_when_disabled() {
  await withReferralsPref(false, async () => {
    await gCUITestUtils.openMainMenu();
    const button = document.getElementById("appMenu-referrals-button");
    const separator = document.getElementById("appMenu-referrals-separator");
    ok(button, "Referrals app menu button exists");
    ok(button.hidden, "Referrals button is hidden when the pref is disabled");
    ok(
      separator.hidden,
      "Referrals separator is hidden when the pref is disabled"
    );
    await gCUITestUtils.hideMainMenu();
  });
});

add_task(async function test_visible_and_opens_tab_when_enabled() {
  await withReferralsPref(true, async () => {
    await gCUITestUtils.openMainMenu();
    const button = document.getElementById("appMenu-referrals-button");
    const separator = document.getElementById("appMenu-referrals-separator");
    ok(!button.hidden, "Referrals button is visible when the pref is enabled");
    ok(
      !separator.hidden,
      "Referrals separator is visible when the pref is enabled"
    );
    is(
      button.getAttribute("type"),
      "open-to-new",
      "Referrals button shows the open-in-new trailing icon"
    );

    const promiseHidden = BrowserTestUtils.waitForEvent(
      PanelUI.panel,
      "popuphidden"
    );

    button.click();

    // Clicking the item closes the app menu.
    await promiseHidden;

    await TestUtils.waitForCondition(
      () => gBrowser.currentURI.displaySpec === "about:referrals",
      "Waiting for the referrals tab to be opened"
    );

    gBrowser.removeTab(gBrowser.selectedTab);
  });
});
