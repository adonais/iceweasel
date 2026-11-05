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
  "#cc-csc": "123",
};

/**
 * Submit the credit card form and wait for the capture doorhanger. The
 * callback receives the doorhanger content once it is shown.
 */
async function withDoorhanger(newValues, callback) {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CREDITCARD_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#cc-name",
        newValues,
      });
      await onPopupShown;

      await callback(
        getNotification().querySelector(".credit-card-capture-content")
      );
    }
  );
}

function descriptionL10nId(content) {
  return content.firstElementChild.getAttribute("data-l10n-id");
}

add_setup(async function () {
  // The security code is supported only while the Rust store serves.
  await switchCreditCardStore({ rust: true });
});

add_task(async function test_save_doorhanger_before_rollout() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "off"],
      [ENABLED_PREF, true],
    ],
  });

  await withDoorhanger(CC_VALUES, async content => {
    is(
      descriptionL10nId(content),
      "credit-card-save-doorhanger-description",
      "The doorhanger says the security code won't be saved"
    );
    ok(
      !content.querySelector("moz-checkbox"),
      "The security codes checkbox is not shown"
    );
    await clickDoorhangerButton(SECONDARY_BUTTON);
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_save_doorhanger_when_capture_is_off() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "on"],
      [ENABLED_PREF, false],
    ],
  });

  await withDoorhanger(CC_VALUES, async content => {
    is(
      descriptionL10nId(content),
      "credit-card-save-doorhanger-description",
      "The doorhanger says the security code won't be saved"
    );

    const checkbox = content.querySelector("moz-checkbox");
    ok(checkbox, "The security codes checkbox is shown");
    await checkbox.updateComplete;
    ok(!checkbox.checked, "The security codes checkbox is unchecked");

    const prefChanged = TestUtils.waitForPrefChange(ENABLED_PREF);
    checkbox.click();
    await prefChanged;
    ok(
      Services.prefs.getBoolPref(ENABLED_PREF),
      "Checking the checkbox turns saving security codes back on"
    );

    await clickDoorhangerButton(SECONDARY_BUTTON);
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_save_doorhanger_while_json_store_serves() {
  await switchCreditCardStore({ rust: false });
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "on"],
      [ENABLED_PREF, true],
    ],
  });

  await withDoorhanger(CC_VALUES, async content => {
    is(
      descriptionL10nId(content),
      "credit-card-save-doorhanger-description",
      "The doorhanger says the security code won't be saved"
    );
    ok(
      !content.querySelector("moz-checkbox"),
      "The security codes checkbox is not shown"
    );
    await clickDoorhangerButton(SECONDARY_BUTTON);
  });

  await SpecialPowers.popPrefEnv();
  await switchCreditCardStore({ rust: true });
});

add_task(async function test_save_doorhanger_checkbox_toggles_pref() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "on"],
      [ENABLED_PREF, true],
    ],
  });

  await withDoorhanger(CC_VALUES, async content => {
    is(
      descriptionL10nId(content),
      "credit-card-save-doorhanger-description-security-code",
      "The doorhanger says the security code is saved"
    );

    const checkbox = content.querySelector("moz-checkbox");
    ok(checkbox, "The security codes checkbox is shown");
    await checkbox.updateComplete;
    ok(checkbox.checked, "The security codes checkbox is checked");
    is(
      checkbox.getAttribute("support-page"),
      "credit-card-autofill",
      "The checkbox links to the support page"
    );

    let prefChanged = TestUtils.waitForPrefChange(ENABLED_PREF);
    checkbox.click();
    await prefChanged;
    ok(
      !Services.prefs.getBoolPref(ENABLED_PREF),
      "Unchecking the checkbox disables saving security codes"
    );

    prefChanged = TestUtils.waitForPrefChange(ENABLED_PREF);
    checkbox.click();
    await prefChanged;
    ok(
      Services.prefs.getBoolPref(ENABLED_PREF),
      "Checking the checkbox enables saving security codes"
    );

    prefChanged = TestUtils.waitForPrefChange(ENABLED_PREF);
    checkbox.click();
    await prefChanged;

    await clickDoorhangerButton(SECONDARY_BUTTON);
  });

  ok(
    !Services.prefs.getBoolPref(ENABLED_PREF),
    "Dismissing the doorhanger keeps the checkbox choice"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_update_doorhanger_shows_checkbox() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "on"],
      [ENABLED_PREF, true],
    ],
  });
  await setStorage(TEST_CREDIT_CARD_1);

  await withDoorhanger(
    {
      "#cc-name": "Mark Smith",
      "#cc-number": TEST_CREDIT_CARD_1["cc-number"],
      "#cc-exp-month": TEST_CREDIT_CARD_1["cc-exp-month"],
      "#cc-exp-year": TEST_CREDIT_CARD_1["cc-exp-year"],
    },
    async content => {
      is(
        descriptionL10nId(content),
        "credit-card-save-doorhanger-description-security-code",
        "The update doorhanger says the security code is saved"
      );
      ok(
        content.querySelector("moz-checkbox"),
        "The security codes checkbox is shown"
      );

      const onChanged = waitForStorageChangedEvents("update");
      await clickDoorhangerButton(MAIN_BUTTON);
      await onChanged;
    }
  );

  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});

async function uncheckSecurityCodes(content) {
  const checkbox = content.querySelector("moz-checkbox");
  await checkbox.updateComplete;
  const prefChanged = TestUtils.waitForPrefChange(ENABLED_PREF);
  checkbox.click();
  await prefChanged;
}

add_task(async function test_save_doorhanger_unchecked_drops_security_code() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "on"],
      [ENABLED_PREF, true],
    ],
  });

  await withDoorhanger(CC_VALUES, async content => {
    await uncheckSecurityCodes(content);

    const onChanged = waitForStorageChangedEvents("add");
    await clickDoorhangerButton(MAIN_BUTTON);
    await onChanged;
  });

  const creditCards = await getCreditCards();
  is(creditCards.length, 1, "One credit card is saved");
  is(creditCards[0]["cc-name"], "User 1", "The card is saved");
  ok(
    !("cc-csc" in creditCards[0]),
    "The security code is not saved once the checkbox is unchecked"
  );

  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_update_doorhanger_unchecked_keeps_security_code() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SUPPORTED_PREF, "on"],
      [ENABLED_PREF, true],
    ],
  });
  await setStorage({ ...TEST_CREDIT_CARD_1, "cc-csc": "123" });

  await withDoorhanger(
    {
      "#cc-name": "Mark Smith",
      "#cc-number": TEST_CREDIT_CARD_1["cc-number"],
      "#cc-exp-month": TEST_CREDIT_CARD_1["cc-exp-month"],
      "#cc-exp-year": TEST_CREDIT_CARD_1["cc-exp-year"],
      "#cc-csc": "456",
    },
    async content => {
      await uncheckSecurityCodes(content);

      const onChanged = waitForStorageChangedEvents("update");
      await clickDoorhangerButton(MAIN_BUTTON);
      await onChanged;
    }
  );

  // Unchecking turned CVV off, and storage hides the code from reads until it
  // is back on.
  await SpecialPowers.pushPrefEnv({ set: [[ENABLED_PREF, true]] });
  const creditCards = await getCreditCards();
  is(creditCards.length, 1, "The existing card is updated");
  is(creditCards[0]["cc-name"], "Mark Smith", "The card is updated");
  is(
    creditCards[0]["cc-csc"],
    "123",
    "The stored security code is kept once the checkbox is unchecked"
  );

  await SpecialPowers.popPrefEnv();
  await removeAllRecords();
  await SpecialPowers.popPrefEnv();
});
