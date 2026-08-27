/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { FormAutofill } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofill.sys.mjs"
);

const EDIT_PASSPORT_DIALOG_URL =
  "chrome://formautofill/content/editPassport.xhtml";

// A complete passport record. Most tests hand it to the dialog directly as the
// edit argument (the same way the preferences code opens the dialog with a
// stored record) to exercise the dialog UI without touching storage. The
// save/edit tests below additionally round-trip it through the passport store
// to verify the dialog's submit path persists correctly.
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

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.formautofill.passports.supported", "on"]],
  });
  await removeAllRecords();
  registerCleanupFunction(removeAllRecords);
});

// Fill the (already open) edit-passport dialog's form from `record`. The
// fields are moz-input-text/moz-select custom elements that render their inner
// control asynchronously, so wait for each element to finish updating after
// assigning its value. Otherwise the inner <input> (and its validity state)
// still reflects the old value when the form is submitted.
async function fillPassportForm(doc, record) {
  for (let [id, value] of Object.entries(record)) {
    let field = doc.getElementById(id);
    field.value = value;
    field.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
    await field.updateComplete;
  }
}

add_task(async function test_cancelEditPassportDialog() {
  await testDialog(EDIT_PASSPORT_DIALOG_URL, win => {
    win.document.querySelector("#cancel").click();
  });
});

add_task(async function test_cancelEditPassportDialogWithESC() {
  await testDialog(EDIT_PASSPORT_DIALOG_URL, win => {
    EventUtils.synthesizeKey("VK_ESCAPE", {}, win);
  });
});

add_task(async function test_passportDialogPopulatesDropdowns() {
  await testDialog(EDIT_PASSPORT_DIALOG_URL, win => {
    let doc = win.document;

    // The country dropdown is populated from FormAutofill.countries, plus the
    // leading empty option declared in the markup.
    is(
      doc.querySelectorAll("#passport-country moz-option").length,
      FormAutofill.countries.size + 1,
      "Country dropdown has an option per country plus the empty option"
    );

    // Month dropdowns: empty option + 12 months. Day dropdowns: empty + 31.
    is(
      doc.querySelectorAll("#passport-issue-date-month moz-option").length,
      13,
      "Issue month dropdown has 12 months plus the empty option"
    );
    is(
      doc.querySelectorAll("#passport-expiry-date-day moz-option").length,
      32,
      "Expiry day dropdown has 31 days plus the empty option"
    );
    Assert.greater(
      doc.querySelectorAll("#passport-issue-date-year moz-option").length,
      1,
      "Issue year dropdown is populated"
    );

    doc.querySelector("#cancel").click();
  });
});

add_task(async function test_passportDialogPrefillsRecord() {
  await formAutofillStorage.passports.add(TEST_PASSPORT);
  const [stored] = await getPassports();

  await testDialog(
    EDIT_PASSPORT_DIALOG_URL,
    async win => {
      let doc = win.document;
      // Every field, including the date moz-selects, must reflect the record.
      // moz-select applies its value asynchronously (after its options are
      // processed), so wait for each element to finish updating first. This
      // also guards the "generate options before super.loadRecord" ordering.
      await Promise.all(
        Object.keys(TEST_PASSPORT).map(
          id => doc.getElementById(id).updateComplete
        )
      );
      for (let [id, value] of Object.entries(TEST_PASSPORT)) {
        is(
          doc.getElementById(id).value,
          String(value),
          `Dialog pre-populated "${id}" from the record`
        );
      }
      doc.querySelector("#cancel").click();
    },
    { record: stored }
  );

  await removeAllRecords();
});

add_task(async function test_passportDialogRequiresNumber() {
  await testDialog(EDIT_PASSPORT_DIALOG_URL, async win => {
    let doc = win.document;
    let numberField = doc.getElementById("passport-number");

    // The passport number is the only required field (it is the store's dedupe
    // key). Submitting an empty form marks the number invalid and keeps the
    // dialog open.
    doc.querySelector("#save").click();
    is(
      numberField.inputEl?.checkValidity() ?? false,
      false,
      "Passport number is invalid when empty"
    );
    ok(!win.closed, "Dialog stays open when the required number is missing");

    // The number alone satisfies validity; the name is optional.
    numberField.value = "X1234567";
    numberField.dispatchEvent(new win.Event("input", { bubbles: true }));
    await numberField.updateComplete;
    is(
      numberField.inputEl?.checkValidity(),
      true,
      "Passport number is valid once filled, even without a name"
    );

    doc.querySelector("#cancel").click();
  });
});

add_task(async function test_savePassport() {
  await testDialog(EDIT_PASSPORT_DIALOG_URL, async win => {
    await fillPassportForm(win.document, TEST_PASSPORT);
    win.document.querySelector("#save").click();
  });

  const passports = await getPassports();
  is(passports.length, 1, "only one passport is in storage");
  for (let [fieldName, fieldValue] of Object.entries(TEST_PASSPORT)) {
    is(passports[0][fieldName], fieldValue, "check " + fieldName);
  }

  await removeAllRecords();
});

add_task(async function test_editPassport() {
  await formAutofillStorage.passports.add(TEST_PASSPORT);
  const [stored] = await getPassports();

  await testDialog(
    EDIT_PASSPORT_DIALOG_URL,
    async win => {
      let numberField = win.document.getElementById("passport-number");
      numberField.value = "Y7654321";
      numberField.dispatchEvent(new win.Event("input", { bubbles: true }));
      await numberField.updateComplete;

      win.document.querySelector("#save").click();
    },
    {
      record: stored,
    }
  );

  const passports = await getPassports();
  is(passports.length, 1, "still only one passport is in storage");
  is(passports[0]["passport-number"], "Y7654321", "passport number changed");

  await removeAllRecords();
});
