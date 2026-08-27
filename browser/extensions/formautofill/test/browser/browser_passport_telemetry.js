/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PASSPORT_FORM_URL =
  "https://example.org" +
  HTTP_TEST_PATH +
  "../fixtures/autocomplete_passport_basic.html";

const EDIT_PASSPORT_DIALOG_URL =
  "chrome://formautofill/content/editPassport.xhtml";

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

/**
 * Assert that exactly one `<method>_passport_form` Glean event was recorded and
 * that it carries a flow id and every extra key in `expectedExtra`.
 *
 * @param {string} method form interaction method, e.g. "detected" or "submitted"
 * @param {object} [expectedExtra] extra keys that must be present with the given values
 */
function assertPassportFormEvent(method, expectedExtra = null) {
  const eventMethod = method.replace(/(_[a-z])/g, c => c[1].toUpperCase());
  const events =
    Glean.passport[eventMethod + "PassportForm"].testGetValue() ?? [];
  Assert.equal(
    events.length,
    1,
    `Expected 1 event of type ${method}_passport_form.`
  );
  if (expectedExtra) {
    const extra = events[0].extra;
    Assert.ok(!!extra.value, "Flow id is present.");
    for (const [key, value] of Object.entries(expectedExtra)) {
      Assert.equal(extra[key], value, `Extra ${key} should match.`);
    }
  }
}

function assertPassportEventCount(name, expectedCount = 1) {
  Assert.equal(
    Glean.passport[name].testGetValue()?.length ?? 0,
    expectedCount,
    `Expected ${expectedCount} ${name} event(s).`
  );
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
      [PASSPORT_ENABLED_PREF, true],
    ],
  });
  await removeAllRecords();
  registerCleanupFunction(removeAllRecords);
});

// Opening the autofill popup on a stored passport, autofilling and submitting
// records the detected/popup_shown/filled/submitted form interaction events.
add_task(async function test_passport_popup_fill_submit() {
  await clearGleanTelemetry();
  await formAutofillStorage.passports.add(TEST_PASSPORT);

  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PASSPORT_FORM_URL },
    async function (browser) {
      await openPopupOn(browser, "#passport-name");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
      await waitForAutofill(
        browser,
        "#passport-number",
        TEST_PASSPORT["passport-number"]
      );

      // Submitting the autofilled record unchanged dedupes against the stored
      // passport (same number), so no capture doorhanger is shown.
      await focusUpdateSubmitForm(browser, {
        focusSelector: "#passport-name",
        newValues: {},
      });

      await Services.fog.testFlushAllChildren();
    }
  );

  const detectedFields = {
    name: "0",
    country: "0",
    number: "0",
    issue_date_month: "0",
    expiry_date_year: "0",
    given_name: "false",
    issue_date: "false",
  };
  assertPassportFormEvent("detected", detectedFields);
  assertPassportFormEvent("popup_shown", { field_name: "passport-name" });
  assertPassportFormEvent("filled", { name: "filled", number: "filled" });
  assertPassportFormEvent("submitted", {
    name: "autofilled",
    number: "autofilled",
  });

  await removeAllRecords();
});

// Submitting a new passport shows the capture doorhanger; the Save/Not now/Never
// save actions each record the matching capture_doorhanger event alongside the
// detected/submitted form interaction events.
add_task(async function test_passport_capture_doorhanger() {
  async function submitNewPassport(command, idx, expectSaved = false) {
    await BrowserTestUtils.withNewTab(
      { gBrowser, url: PASSPORT_FORM_URL },
      async function (browser) {
        const onPopupShown = waitForPopupShown();
        let onChanged;
        if (expectSaved) {
          onChanged = TestUtils.topicObserved("formautofill-storage-changed");
        }

        await focusUpdateSubmitForm(browser, {
          focusSelector: "#passport-name",
          newValues: recordToFormSelector(TEST_PASSPORT),
        });
        await onPopupShown;
        await clickDoorhangerButton(command, idx);

        if (expectSaved) {
          await onChanged;
        }

        await Services.fog.testFlushAllChildren();
      }
    );

    await removeAllRecords();
  }

  const expectedForm = () => {
    assertPassportFormEvent("detected", { name: "0", number: "0" });
    assertPassportFormEvent("submitted", {
      name: "user_filled",
      number: "user_filled",
    });
  };

  // Save
  await clearGleanTelemetry();
  await submitNewPassport(MAIN_BUTTON, undefined, true);
  expectedForm();
  assertPassportEventCount("showCaptureDoorhanger");
  assertPassportEventCount("saveCaptureDoorhanger");

  // Not now
  await clearGleanTelemetry();
  await submitNewPassport(SECONDARY_BUTTON);
  expectedForm();
  assertPassportEventCount("showCaptureDoorhanger");
  assertPassportEventCount("cancelCaptureDoorhanger");

  // Never save passports (second secondary action, reached via the menu button)
  await clearGleanTelemetry();
  await submitNewPassport(MENU_BUTTON, 0);
  expectedForm();
  assertPassportEventCount("showCaptureDoorhanger");
  assertPassportEventCount("disableCaptureDoorhanger");

  // "Never save" disables the feature; restore it for subsequent tests.
  Services.prefs.setBoolPref(PASSPORT_ENABLED_PREF, true);
  await removeAllRecords();
});

// Saving a new passport from the management edit dialog records the `add` manage
// event.
add_task(async function test_passport_manage_add() {
  await clearGleanTelemetry();

  await testDialog(EDIT_PASSPORT_DIALOG_URL, async win => {
    for (const [id, value] of Object.entries(TEST_PASSPORT)) {
      const field = win.document.getElementById(id);
      field.value = value;
      field.dispatchEvent(
        new win.document.defaultView.Event("input", { bubbles: true })
      );
      // The fields are custom elements that render their inner control
      // asynchronously; wait so validation sees the assigned value on submit.
      await field.updateComplete;
    }
    win.document.querySelector("#save").click();
  });

  assertPassportEventCount("addManage");

  await removeAllRecords();
});

// Opening the management edit dialog on a stored passport and saving records the
// `show_entry` and `edit` manage events.
add_task(async function test_passport_manage_edit() {
  await clearGleanTelemetry();
  await formAutofillStorage.passports.add(TEST_PASSPORT);
  const [stored] = await getPassports();

  await testDialog(
    EDIT_PASSPORT_DIALOG_URL,
    async win => {
      const numberField = win.document.getElementById("passport-number");
      numberField.value = "Y7654321";
      numberField.dispatchEvent(new win.Event("input", { bubbles: true }));
      await numberField.updateComplete;
      win.document.querySelector("#save").click();
    },
    { record: stored }
  );

  assertPassportEventCount("showEntryManage");
  assertPassportEventCount("editManage");

  await removeAllRecords();
});
