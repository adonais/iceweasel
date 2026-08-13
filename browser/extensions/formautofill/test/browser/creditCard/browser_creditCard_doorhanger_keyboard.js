/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The credit card doorhanger must be keyboard-reachable as soon as it appears
// on form submission. This is controlled by the "noautofocus" attribute on the
// shared notification panel: when it is removed the panel joins the tab ring,
// when it is set to "true" the panel is unreachable with Tab (see bug 2050381).

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["toolkit.osKeyStore.unofficialBuildOnlyLogin", ""]],
  });
});

add_task(async function test_save_doorhanger_is_keyboard_reachable() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      let onPopupShown = waitForPopupShown();

      await focusUpdateSubmitForm(browser, {
        focusSelector: "#cc-name",
        newValues: {
          "#cc-name": "User 1",
          "#cc-number": "5577000055770004",
          "#cc-exp-month": "12",
          "#cc-exp-year": "2017",
          "#cc-type": "mastercard",
        },
      });

      await onPopupShown;

      ok(
        !PopupNotifications.panel.hasAttribute("noautofocus"),
        "Save credit card doorhanger is keyboard focusable on initial submission"
      );
    }
  );
});

add_task(async function test_update_doorhanger_is_keyboard_reachable() {
  await setStorage(TEST_CREDIT_CARD_1);
  let creditCards = await getCreditCards();
  is(creditCards.length, 1, "1 credit card in storage");

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      let onPopupShown = waitForPopupShown();

      await focusUpdateSubmitForm(browser, {
        focusSelector: "#cc-name",
        newValues: {
          "#cc-name": "Mark Smith",
          "#cc-number": TEST_CREDIT_CARD_1["cc-number"],
          "#cc-exp-month": TEST_CREDIT_CARD_1["cc-exp-month"],
          "#cc-exp-year": TEST_CREDIT_CARD_1["cc-exp-year"],
        },
      });

      await onPopupShown;

      ok(
        !PopupNotifications.panel.hasAttribute("noautofocus"),
        "Update credit card doorhanger is keyboard focusable on initial submission"
      );
    }
  );
  await removeAllRecords();
});
