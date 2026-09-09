"use strict";

const CC_URL =
  "https://example.org/browser/browser/extensions/formautofill/test/browser/creditCard/autocomplete_creditcard_basic.html";

const TEST_CARD_WITH_CSC = {
  "cc-name": "John Doe",
  "cc-number": "4111111111111111",
  "cc-exp-month": 4,
  "cc-exp-year": new Date().getFullYear() + 2,
  "cc-csc": "123",
};

async function getFieldValues(browser, properties) {
  return SpecialPowers.spawn(browser, [properties], props => {
    const result = {};
    for (const [selector, property] of Object.entries(props)) {
      result[selector] = content.document.querySelector(selector)[property];
    }
    return result;
  });
}

add_setup(async function () {
  // head.js force-enables OS auth for this directory, which would make filling
  // the card number block on a reauth prompt. Reauth is not what this file
  // tests, so revert the stub and turn it off.
  sinon.restore();
  const oldOSAuth = FormAutofillUtils.getOSAuthEnabled();
  FormAutofillUtils.setOSAuthEnabled(false);
  registerCleanupFunction(() => {
    FormAutofillUtils.setOSAuthEnabled(oldOSAuth);
  });

  await removeAllRecords();
  await setStorage(TEST_CARD_WITH_CSC);
});

add_task(async function test_csc_round_trips_through_storage() {
  const cards = await getCreditCards();
  is(cards.length, 1, "One credit card is saved");
  is(cards[0]["cc-csc"], "123", "cc-csc survives the storage round trip");

  const savedFieldNames = Services.ppmm.sharedData.get(
    "FormAutofill:savedFieldNames"
  );
  ok(
    savedFieldNames.has("cc-csc"),
    "A stored cc-csc reaches savedFieldNames with no special casing"
  );
});

add_task(async function test_no_cvv_when_pref_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.formautofill.creditCards.cvv.enabled", false]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CC_URL },
    async function (browser) {
      await SimpleTest.promiseFocus(browser);

      await focusAndWaitForFieldsIdentified(browser, "#cc-csc");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await ensureNoAutocompletePopup(browser);

      await triggerAutofillAndPreview(
        browser,
        "#cc-number",
        async () => {
          const { "#cc-csc": preview } = await getFieldValues(browser, {
            "#cc-csc": "previewValue",
          });
          is(preview, "", "The security code is not previewed");
        },
        async () => {
          const values = await getFieldValues(browser, {
            "#cc-csc": "value",
            "#cc-number": "value",
          });
          is(values["#cc-csc"], "", "The security code is not filled");
          is(
            values["#cc-number"],
            "4111111111111111",
            "The rest of the card is still filled"
          );
        },
        async () => {
          const { "#cc-number": cleared } = await getFieldValues(browser, {
            "#cc-number": "value",
          });
          is(cleared, "", "Clearing the form clears the card number");
        }
      );
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_cvv_autofills_when_pref_enabled() {
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.formautofill.creditCards.cvv.enabled", true]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CC_URL },
    async function (browser) {
      await triggerAutofillAndPreview(
        browser,
        "#cc-csc",
        async () => {
          const { "#cc-csc": preview } = await getFieldValues(browser, {
            "#cc-csc": "previewValue",
          });
          is(preview, "•••", "The security code preview is masked");
        },
        async () => {
          const values = await getFieldValues(browser, {
            "#cc-csc": "value",
            "#cc-number": "value",
          });
          is(values["#cc-csc"], "123", "The real security code is filled");
          is(
            values["#cc-number"],
            "4111111111111111",
            "The rest of the card is filled too"
          );
        },
        async () => {
          const { "#cc-csc": cleared } = await getFieldValues(browser, {
            "#cc-csc": "value",
          });
          is(cleared, "", "Clearing the form clears the security code");
        }
      );
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_cvv_entry_is_named_after_the_field() {
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.formautofill.creditCards.cvv.enabled", true]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: CC_URL },
    async function (browser) {
      await openPopupOn(browser, "#cc-csc");

      const ariaLabel =
        getDisplayedPopupItems(browser)[0].getAttribute("aria-label");
      is(
        ariaLabel,
        "Visa CVC ••••1111",
        "Entry is named after the field and identified by the card number"
      );
      ok(!ariaLabel.includes("123"), "The security code is not announced");

      await closePopup(browser);
    }
  );

  await SpecialPowers.popPrefEnv();
});
