/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PassportSaveDoorhanger } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofillPrompter.sys.mjs"
);

const PASSPORT_FORM_URL =
  "https://example.org" +
  HTTP_TEST_PATH +
  "../fixtures/autocomplete_passport_basic.html";

// A form that captures the holder name as separate given/additional/family
// fields instead of a single combined passport-name field.
const PASSPORT_SPLIT_NAME_FORM_URL =
  "https://example.org" +
  HTTP_TEST_PATH +
  "../fixtures/autocomplete_passport_split_name.html";

// A form that captures each issue/expiry date as a single combined field
// (e.g. an <input type="date"> value) instead of separate month/day/year parts.
const PASSPORT_COMBINED_DATE_FORM_URL =
  "https://example.org" +
  HTTP_TEST_PATH +
  "../fixtures/autocomplete_passport_combined_date.html";

const PASSPORT_ENABLED_PREF = "extensions.formautofill.passports.enabled";

const TEST_PASSPORT = {
  "passport-name": "Jane Doe",
  "passport-country": "US",
  "passport-number": "X1234567",
  "passport-issue-date-month": "1",
  "passport-issue-date-day": "2",
  "passport-issue-date-year": "2020",
  "passport-expiry-date-month": "3",
  "passport-expiry-date-day": "4",
  "passport-expiry-date-year": "2030",
};

function recordToFormSelector(record) {
  const obj = {};
  for (const [key, value] of Object.entries(record)) {
    obj[`#${key}`] = value;
  }
  return obj;
}

async function expectSavedPassportsCount(expectedCount) {
  const passports = await getPassports();
  is(
    passports.length,
    expectedCount,
    `${expectedCount} passport(s) in storage`
  );
  return passports;
}

// The passports.supported pref has no default, so register one on the default
// branch here; otherwise the per-test "on" override would not propagate to the
// content process where field detection runs.
add_setup(async function () {
  Services.prefs
    .getDefaultBranch("")
    .setStringPref("extensions.formautofill.passports.supported", "off");
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.formautofill.passports.supported", "on"],
      ["extensions.formautofill.passports.enabled", true],
    ],
  });
  await removeAllRecords();
  registerCleanupFunction(removeAllRecords);
});

// The passport capture doorhanger appears on submit, is prefilled with the
// captured fields, and persists them when the user clicks Save.
add_task(async function test_passport_save_doorhanger() {
  await expectSavedPassportsCount(0);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: recordToFormSelector(TEST_PASSPORT),
      });
      await onPopupShown;

      // Every captured field is prefilled in the editable doorhanger.
      const notification = getNotification();
      for (const [key, value] of Object.entries(TEST_PASSPORT)) {
        const input = notification.querySelector(
          `#${PassportSaveDoorhanger.getInputId(key)}`
        );
        ok(input, `${key} input exists in the doorhanger`);
        is(input.value, value, `${key} is prefilled`);
      }

      await clickDoorhangerButton(MAIN_BUTTON);
    }
  );

  const passports = await expectSavedPassportsCount(1);
  for (const [key, value] of Object.entries(TEST_PASSPORT)) {
    is(String(passports[0][key] ?? ""), value, `${key} is saved`);
  }

  await removeAllRecords();
});

// Editing a field in the doorhanger before saving persists the edited value.
add_task(async function test_passport_save_edited_field() {
  await expectSavedPassportsCount(0);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: recordToFormSelector(TEST_PASSPORT),
      });
      await onPopupShown;

      const notification = getNotification();
      notification.querySelector(
        `#${PassportSaveDoorhanger.getInputId("passport-number")}`
      ).value = "Z7654321";

      await clickDoorhangerButton(MAIN_BUTTON);
    }
  );

  const passports = await expectSavedPassportsCount(1);
  is(passports[0]["passport-number"], "Z7654321", "edited number is saved");

  await removeAllRecords();
});

// A form that provides the country as a display name (e.g. "Germany") rather
// than an ISO code is prefilled in the doorhanger's country dropdown (which is
// keyed by code) and saved as the code.
add_task(async function test_passport_country_name_normalized_to_code() {
  await expectSavedPassportsCount(0);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: recordToFormSelector({
          ...TEST_PASSPORT,
          "passport-country": "Germany",
        }),
      });
      await onPopupShown;

      const notification = getNotification();
      const countryInput = notification.querySelector(
        `#${PassportSaveDoorhanger.getInputId("passport-country")}`
      );
      is(
        countryInput.value,
        "DE",
        "country display name is normalized to its code in the doorhanger"
      );

      await clickDoorhangerButton(MAIN_BUTTON);
    }
  );

  const passports = await expectSavedPassportsCount(1);
  is(passports[0]["passport-country"], "DE", "country code is saved");

  await removeAllRecords();
});

// A form that captures the name as separate given/additional/family fields is
// merged into the combined passport-name the doorhanger shows and stores.
add_task(async function test_passport_split_name_merged() {
  await expectSavedPassportsCount(0);

  const splitName = {
    "passport-given-name": "Jane",
    "passport-additional-name": "Q",
    "passport-family-name": "Doe",
    "passport-country": "US",
    "passport-number": "X1234567",
    "passport-issue-date-month": "1",
    "passport-issue-date-day": "2",
    "passport-issue-date-year": "2020",
    "passport-expiry-date-month": "3",
    "passport-expiry-date-day": "4",
    "passport-expiry-date-year": "2030",
  };

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_SPLIT_NAME_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-given-name",
        newValues: recordToFormSelector(splitName),
      });
      await onPopupShown;

      // The doorhanger has a single combined name field, prefilled with the
      // joined given/additional/family parts.
      const notification = getNotification();
      const nameInput = notification.querySelector(
        `#${PassportSaveDoorhanger.getInputId("passport-name")}`
      );
      ok(nameInput, "combined passport-name input exists in the doorhanger");
      is(nameInput.value, "Jane Q Doe", "split name parts are merged");

      await clickDoorhangerButton(MAIN_BUTTON);
    }
  );

  const passports = await expectSavedPassportsCount(1);
  is(passports[0]["passport-name"], "Jane Q Doe", "merged name is saved");

  await removeAllRecords();
});

// A form that captures each date as a single combined field is split into the
// month/day/year parts the doorhanger shows and stores.
add_task(async function test_passport_combined_date_split() {
  await expectSavedPassportsCount(0);

  const combinedDate = {
    "passport-name": "Jane Doe",
    "passport-country": "US",
    "passport-number": "X1234567",
    "passport-issue-date": "2019-04-12",
    "passport-expiry-date": "2029-04-11",
  };

  // The combined dates are split into these month/day/year parts.
  const expectedParts = {
    "passport-issue-date-month": "04",
    "passport-issue-date-day": "12",
    "passport-issue-date-year": "2019",
    "passport-expiry-date-month": "04",
    "passport-expiry-date-day": "11",
    "passport-expiry-date-year": "2029",
  };

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_COMBINED_DATE_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: recordToFormSelector(combinedDate),
      });
      await onPopupShown;

      // The doorhanger only has month/day/year inputs, prefilled from the
      // combined date values.
      const notification = getNotification();
      for (const [key, value] of Object.entries(expectedParts)) {
        const input = notification.querySelector(
          `#${PassportSaveDoorhanger.getInputId(key)}`
        );
        ok(input, `${key} input exists in the doorhanger`);
        is(input.value, value, `${key} is prefilled from the combined date`);
      }

      await clickDoorhangerButton(MAIN_BUTTON);
    }
  );

  const passports = await expectSavedPassportsCount(1);
  is(passports[0]["passport-number"], "X1234567", "number is saved");
  is(
    String(passports[0]["passport-issue-date-month"]),
    "4",
    "issue month saved"
  );
  is(String(passports[0]["passport-issue-date-day"]), "12", "issue day saved");
  is(
    String(passports[0]["passport-issue-date-year"]),
    "2019",
    "issue year saved"
  );
  is(
    String(passports[0]["passport-expiry-date-month"]),
    "4",
    "expiry month saved"
  );
  is(
    String(passports[0]["passport-expiry-date-day"]),
    "11",
    "expiry day saved"
  );
  is(
    String(passports[0]["passport-expiry-date-year"]),
    "2029",
    "expiry year saved"
  );

  await removeAllRecords();
});

// "Not now" dismisses the doorhanger without saving.
add_task(async function test_passport_not_now() {
  await expectSavedPassportsCount(0);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: recordToFormSelector(TEST_PASSPORT),
      });
      await onPopupShown;

      await clickDoorhangerButton(SECONDARY_BUTTON);
    }
  );

  await expectSavedPassportsCount(0);
});

// Submitting a passport whose number matches a stored one does not prompt; the
// existing record is just marked used (deduped by passport number).
add_task(async function test_passport_duplicate_not_shown() {
  await formAutofillStorage.passports.add(TEST_PASSPORT);
  await expectSavedPassportsCount(1);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_FORM_URL },
    async function (browser) {
      // A different name but the same number is still a duplicate. Wait for the
      // notifyUsed event to confirm the dedupe path ran instead of prompting.
      const onUsed = waitForStorageChangedEvents("notifyUsed");
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: recordToFormSelector({
          ...TEST_PASSPORT,
          "passport-name": "Someone Else",
        }),
      });
      await onUsed;

      await ensureNoDoorhanger();
    }
  );

  // No new record was added — still just the one stored passport.
  await expectSavedPassportsCount(1);

  await removeAllRecords();
});

// "Never save passports" does not save the passport and disables the feature.
add_task(async function test_passport_never_save() {
  await expectSavedPassportsCount(0);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_FORM_URL },
    async function (browser) {
      const onPopupShown = waitForPopupShown();
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: recordToFormSelector(TEST_PASSPORT),
      });
      await onPopupShown;

      // "Never save passports" is the second secondary action, reachable via
      // the doorhanger's dropmarker menu.
      await clickDoorhangerButton(MENU_BUTTON, 0);
    }
  );

  await expectSavedPassportsCount(0);
  is(
    SpecialPowers.getBoolPref(PASSPORT_ENABLED_PREF),
    false,
    "Passport autofill is disabled"
  );

  // Restore the enabled state for subsequent tests.
  Services.prefs.setBoolPref(PASSPORT_ENABLED_PREF, true);
  await removeAllRecords();
});

// No doorhanger is shown when passport autofill is disabled.
add_task(async function test_passport_not_shown_when_disabled() {
  await expectSavedPassportsCount(0);
  await SpecialPowers.pushPrefEnv({
    set: [[PASSPORT_ENABLED_PREF, false]],
  });

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_FORM_URL },
    async function (browser) {
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: recordToFormSelector(TEST_PASSPORT),
      });

      await ensureNoDoorhanger();
    }
  );

  await expectSavedPassportsCount(0);

  await SpecialPowers.popPrefEnv();
});
