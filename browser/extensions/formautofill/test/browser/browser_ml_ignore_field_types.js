/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

/* global add_heuristic_tests */

const { FormAutofillML } = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FormAutofillML.sys.mjs"
);

const IGNORE_PREF = "extensions.formautofill.useml.ignoreFieldTypes";
const EXPIRY_FIELD_TYPES = "cc-exp, cc-exp-month, cc-exp-year";

// The field names the stubbed model returns, in the order it is asked about the
// fields of a form. Each test sets its own list in `onTestSetup`.
let predictions = [];

// A month and a year dropdown that `_isExpirationMonthLikely` and
// `_isExpirationYearLikely` recognize by their options alone. The elements
// carry no id, name or label the regexp rules could match, so they are only
// classified by the heuristics if the option inspections ran.
const MONTH_OPTIONS = Array.from(
  { length: 12 },
  (_, i) => `<option value="${i + 1}">${i + 1}</option>`
).join("");
const YEAR_OPTIONS = Array.from({ length: 3 }, (_, i) => {
  const year = new Date().getFullYear() + i;
  return `<option value="${year}">${year}</option>`;
}).join("");

const INPUT_FIXTURE = `
  <p><label>Name: <input id="cc-name"></label></p>
  <p><label>Card Number: <input id="cc-number"></label></p>
  <p><label>Month: <input id="cc-exp-month"></label></p>
  <p><label>Year: <input id="cc-exp-year"></label></p>
  <p><label>CSC: <input id="cc-csc"></label></p>
  <p><label>Postal Code: <input id="postal-code" name="postal-code"/></label></p>`;

const SELECT_FIXTURE = `
  <p><label>Name: <input id="cc-name"></label></p>
  <p><label>Card Number: <input id="cc-number"></label></p>
  <p><select id="sel-a">${MONTH_OPTIONS}</select></p>
  <p><select id="sel-b">${YEAR_OPTIONS}</select></p>
  <p><label>CSC: <input id="cc-csc"></label></p>`;

add_setup(async function () {
  const detectFieldsStub = sinon
    .stub(FormAutofillML.prototype, "detectFields")
    .callsFake(async fieldDetails => {
      for (const fieldDetail of fieldDetails) {
        if (fieldDetail.fieldName || !fieldDetail.mlData) {
          continue;
        }
        Assert.greater(
          predictions.length,
          0,
          `The model was asked about ${fieldDetail.identifier} and has a prediction left`
        );
        fieldDetail.fieldName = predictions.shift();
        fieldDetail.reason = "ml";
      }
    });
  const getModelVersionStub = sinon
    .stub(FormAutofillML, "getModelVersion")
    .callsFake(() => "test1.0");

  registerCleanupFunction(() => {
    detectFieldsStub.restore();
    getModelVersionStub.restore();
  });

  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.formautofill.useml", true],
      ["extensions.formautofill.useml.nativeOnnxAvailable", true],
      ["extensions.formautofill.useml.successful", true],
    ],
  });

  // Earlier test files leave detected_cc_form_v2 events behind, which
  // assertTelemetry would otherwise read instead of the ones recorded here.
  await clearGleanTelemetry();
});

add_heuristic_tests([
  {
    description: "Text expiry fields, no field type ignored",
    fixtureData: INPUT_FIXTURE,
    prefs: [[IGNORE_PREF, ""]],
    onTestSetup: async () => {
      predictions = ["cc-exp-month", "cc-exp-year", "cc-csc", "postal-code"];
    },
    onTestComplete: async () => {
      Assert.equal(
        predictions.length,
        0,
        "The model was asked about every field the test set a prediction for"
      );
      await assertTelemetry({
        cc_exp_month: "ml",
        cc_exp_year: "ml",
      });
    },
    expectedResult: [
      {
        default: {
          reason: "ml",
        },
        fields: [
          { fieldName: "cc-name", reason: "fathom" },
          { fieldName: "cc-number", reason: "fathom" },
          { fieldName: "cc-exp-month" },
          { fieldName: "cc-exp-year" },
          { fieldName: "cc-csc" },
        ],
      },
      {
        invalid: true,
        fields: [{ fieldName: "postal-code", reason: "ml" }],
      },
    ],
  },
  {
    description: "Text expiry fields, expiry field types ignored",
    fixtureData: INPUT_FIXTURE,
    prefs: [[IGNORE_PREF, EXPIRY_FIELD_TYPES]],
    onTestSetup: async () => {
      predictions = ["cc-csc", "postal-code"];
    },
    onTestComplete: async () => {
      Assert.equal(
        predictions.length,
        0,
        "The model was asked about every field the test set a prediction for"
      );
      await assertTelemetry({
        cc_exp_month: "0",
        cc_exp_year: "0",
      });
    },
    expectedResult: [
      {
        fields: [
          { fieldName: "cc-name", reason: "fathom" },
          { fieldName: "cc-number", reason: "fathom" },
          { fieldName: "cc-exp-month", reason: "regex-heuristic" },
          { fieldName: "cc-exp-year", reason: "regex-heuristic" },
          { fieldName: "cc-csc", reason: "ml" },
        ],
      },
      {
        invalid: true,
        fields: [{ fieldName: "postal-code", reason: "ml" }],
      },
    ],
  },
  {
    description: "Expiry dropdowns, no field type ignored",
    fixtureData: SELECT_FIXTURE,
    prefs: [[IGNORE_PREF, ""]],
    onTestSetup: async () => {
      predictions = ["cc-exp-month", "cc-exp-year", "cc-csc"];
    },
    onTestComplete: async () => {
      Assert.equal(
        predictions.length,
        0,
        "The model was asked about every field the test set a prediction for"
      );
      await assertTelemetry({
        cc_exp_month: "ml",
        cc_exp_year: "ml",
      });
    },
    expectedResult: [
      {
        default: {
          reason: "ml",
        },
        fields: [
          { fieldName: "cc-name", reason: "fathom" },
          { fieldName: "cc-number", reason: "fathom" },
          { fieldName: "cc-exp-month" },
          { fieldName: "cc-exp-year" },
          { fieldName: "cc-csc" },
        ],
      },
    ],
  },
  {
    description: "Expiry dropdowns, expiry field types ignored",
    fixtureData: SELECT_FIXTURE,
    prefs: [[IGNORE_PREF, EXPIRY_FIELD_TYPES]],
    onTestSetup: async () => {
      predictions = ["cc-csc"];
    },
    onTestComplete: async () => {
      Assert.equal(
        predictions.length,
        0,
        "The model was asked about every field the test set a prediction for"
      );
      await assertTelemetry({
        cc_exp_month: "0",
        cc_exp_year: "0",
      });
    },
    expectedResult: [
      {
        fields: [
          { fieldName: "cc-name", reason: "fathom" },
          { fieldName: "cc-number", reason: "fathom" },
          { fieldName: "cc-exp-month", reason: "regex-heuristic" },
          { fieldName: "cc-exp-year", reason: "regex-heuristic" },
          { fieldName: "cc-csc", reason: "ml" },
        ],
      },
    ],
  },
]);

async function assertTelemetry(expected) {
  const events = Glean.creditcard.detectedCcFormV2.testGetValue();
  Assert.equal(
    events.length,
    1,
    "Expected 1 event of type detected_cc_form_v2."
  );

  for (const [key, value] of Object.entries(expected)) {
    Assert.equal(events[0].extra[key], value, `${key} is reported as ${value}`);
  }

  await clearGleanTelemetry();
}
