/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SUPPORTED_PREF = "extensions.formautofill.creditCards.cvv.supported";
const ENABLED_PREF = "extensions.formautofill.creditCards.cvv.enabled";

const CC_VALUES = {
  "#cc-name": "User 1",
  "#cc-number": "5577000055770004",
  "#cc-exp-month": "12",
  "#cc-exp-year": "2017",
};

add_setup(async function () {
  // The feature is gated on rollout as well as on the user's own choice. Roll
  // it out for the whole file so each task can toggle the enabled pref alone.
  await SpecialPowers.pushPrefEnv({ set: [[SUPPORTED_PREF, "on"]] });
});

/**
 * Submit the credit card form, accept the capture doorhanger, and hand the
 * saved record to the caller. `securityCode` is typed into the cc-csc field
 * that the form always has; pass "" to submit the form without a code.
 */
async function captureCard(securityCode = "123") {
  const onChanged = waitForStorageChangedEvents("add");

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();

      await focusUpdateSubmitForm(browser, {
        focusSelector: "#cc-name",
        newValues: { ...CC_VALUES, "#cc-csc": securityCode },
      });

      await onPopupShown;
      await clickDoorhangerButton(MAIN_BUTTON);
    }
  );
  await onChanged;

  const creditCards = await getCreditCards();
  is(creditCards.length, 1, "One credit card is saved");
  return creditCards[0];
}

add_task(async function test_security_code_saved_with_the_card() {
  await SpecialPowers.pushPrefEnv({ set: [[ENABLED_PREF, true]] });

  const creditCard = await captureCard();
  is(creditCard["cc-csc"], "123", "The submitted security code is saved");
  is(creditCard["cc-name"], "User 1", "The rest of the card is saved as usual");

  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_security_code_dropped_when_capture_is_off() {
  await SpecialPowers.pushPrefEnv({ set: [[ENABLED_PREF, false]] });

  const creditCard = await captureCard();
  ok(
    !("cc-csc" in creditCard),
    "The security code is left out of the saved card"
  );

  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_security_code_dropped_before_rollout() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "off"],
      [ENABLED_PREF, true],
    ],
  });

  const creditCard = await captureCard();
  ok(
    !("cc-csc" in creditCard),
    "A user who is not in the rollout saves no security code"
  );

  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_form_submitted_without_a_security_code() {
  await SpecialPowers.pushPrefEnv({ set: [[ENABLED_PREF, true]] });

  const creditCard = await captureCard("");
  ok(!creditCard["cc-csc"], "No security code is saved for the card");

  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});
