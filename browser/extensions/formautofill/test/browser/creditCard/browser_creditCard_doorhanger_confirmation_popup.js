/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_save_doorhanger_show_confirmation() {
  const onAdded = waitForStorageChangedEvents("add");
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#cc-name",
        newValues: {
          "#cc-name": "User 1",
          "#cc-number": "5577000055770004",
          "#cc-exp-month": "12",
          "#cc-exp-year": "2017",
        },
      });
      await onPopupShown;

      const hintShownAndVerified = verifyConfirmationHint(
        browser,
        false,
        "trust-icon-container",
        "confirmation-hint-payment-method-saved"
      );
      await clickDoorhangerButton(MAIN_BUTTON);
      await hintShownAndVerified;
    }
  );
  await onAdded;

  is((await getCreditCards()).length, 1, "The card is saved");
  await removeAllRecords();
});

add_task(async function test_update_doorhanger_show_confirmation() {
  await setStorage(TEST_CREDIT_CARD_1);

  const onUpdated = waitForStorageChangedEvents("update");
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#cc-name",
        newValues: {
          "#cc-name": "User 1",
          "#cc-number": TEST_CREDIT_CARD_1["cc-number"],
          "#cc-exp-month": TEST_CREDIT_CARD_1["cc-exp-month"],
          "#cc-exp-year": TEST_CREDIT_CARD_1["cc-exp-year"],
        },
      });
      await onPopupShown;

      const hintShownAndVerified = verifyConfirmationHint(
        browser,
        false,
        "trust-icon-container",
        "confirmation-hint-payment-method-updated"
      );
      await clickDoorhangerButton(MAIN_BUTTON);
      await hintShownAndVerified;
    }
  );
  await onUpdated;

  const creditCards = await getCreditCards();
  is(creditCards.length, 1, "The existing card is updated");
  is(creditCards[0]["cc-name"], "User 1", "The name is updated");
  await removeAllRecords();
});
