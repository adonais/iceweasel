/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

/* global add_heuristic_tests */

const { FormAutofillML } = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FormAutofillML.sys.mjs"
);

let detectedFields = [
  // first ML test
  "given-name",
  "family-name",
  "street-address",
  "address-level2",
  "address-level1",
  "postal-code",
  "country",
  // second ML test
  "postal-code",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  // third ML test
  "other",
  "tel",
  "given-name",
  // fourth ML test
  "other",
  "tel",
  "given-name",
  // sixth ML test
  "given-name",
];

let expectedDetectFieldsResult;

//eslint-disable-next-line no-unused-vars
function detectFields(fieldDetails) {
  if (!expectedDetectFieldsResult) {
    return false;
  }

  let mlFieldResults = [];
  let results = [];
  for (let fd of fieldDetails) {
    if (!FormAutofillUtils.canUseML(fd)) {
      continue;
    }

    mlFieldResults.push(fd);
    results.push({ label: detectedFields.shift() });
  }

  let ML = new FormAutofillML();
  ML.applyResults(mlFieldResults, results);

  return true;
}

add_setup(async function () {
  let detectFieldsStub = sinon.stub(FormAutofillML.prototype, "detectFields");
  let getModelVersionStub = sinon.stub(FormAutofillML, "getModelVersion");
  detectFieldsStub.callsFake(async (window, fieldDetails) => {
    return await detectFields(window, fieldDetails);
  });
  getModelVersionStub.callsFake(() => {
    return "test1.0";
  });

  registerCleanupFunction(() => {
    detectFieldsStub.restore();
    getModelVersionStub.restore();
  });

  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.formautofill.useml", true],
      ["extensions.formautofill.useml.nativeOnnxAvailable", true],
    ],
  });

  // Earlier test files leave detected_address_form events behind, which
  // assertTelemetry would otherwise read instead of the ones recorded here.
  await clearGleanTelemetry();
});

add_heuristic_tests([
  // This first test runs where ML inference fails, so this should fallback to heuristics.
  {
    fixtureData: `
      <p><label>givenname: <input type="text" id="given-name" name="given-name"/></label></p>
      <p><label>familyname: <input type="text" id="family-name" name="family-name"/></label></p>
      <p><label>organization: <input type="text" id="organization" name="organization" autocomplete="organization"/></label></p>
      <p><label>streetAddress: <input type="search" id="street-address" name="street-address"/></label></p>
      <p><label>addressLevel2: <input type="text" id="address-level2" name="address-level2" /></label></p>
      <p><label>addressLevel1: <input type="text" id="address-level1" name="address-level1" autocomplete="off"/></label></p>
      <p><label>postalCode: <input type="text" id="postal-code" name="postal-code" autocomplete="unknown"/></label></p>
      <p><label>country: <input type="text" id="country" name="country"/></label></p>
      <p><label>tel: <input type="text" id="tel" name="tel" autocomplete="tel"/></label></p>
      <p><label>email: <input type="email" id="email" name="email"/></label></p>`,
    onTestStart: async () => {
      expectedDetectFieldsResult = false;
    },
    onTestComplete: async () => {
      // All other tests should have successful ML inference.
      expectedDetectFieldsResult = true;
      await assertTelemetry({
        given_name: "0",
        family_name: "0",
        organization: "true",
        street_address: "0",
        address_level2: "0",
        address_level1: "0",
        country: "0",
        tel: "true",
        email: "0",
      });
    },
    expectedResult: [
      {
        default: {
          reason: "regex-heuristic",
        },
        fields: [
          { fieldName: "given-name" },
          { fieldName: "family-name" },
          { fieldName: "organization", reason: "autocomplete" },
          { fieldName: "street-address" },
          { fieldName: "address-level2" },
          { fieldName: "address-level1" },
          { fieldName: "postal-code" },
          { fieldName: "country" },
          { fieldName: "tel", reason: "autocomplete" },
          { fieldName: "email" },
        ],
      },
    ],
  },
  {
    fixtureData: `
      <p><label>givenname: <input type="text" id="given-name" name="given-name"/></label></p>
      <p><label>familyname: <input type="text" id="family-name" name="family-name"/></label></p>
      <p><label>organization: <input type="text" id="organization" name="organization" autocomplete="organization" /></label></p>
      <p><label>streetAddress: <input type="search" id="street-address" name="street-address"/></label></p>
      <p><label>addressLevel2: <input type="text" id="address-level2" name="address-level2" /></label></p>
      <p><label>addressLevel1: <input type="text" id="address-level1" name="address-level1" autocomplete="off"/></label></p>
      <p><label>postalCode: <input type="text" id="postal-code" name="postal-code" autocomplete="unknown"/></label></p>
      <p><label>country: <input type="text" id="country" name="country"/></label></p>
      <p><label>tel: <input type="text" id="tel" name="tel" autocomplete="tel" /></label></p>
      <p><label>email: <input type="email" id="email" name="email"/></label></p>`,
    onTestComplete: async () => {
      await assertTelemetry({
        given_name: "ml",
        family_name: "ml",
        organization: "true",
        street_address: "ml",
        address_level2: "ml",
        address_level1: "ml",
        country: "ml",
        tel: "true",
        email: "0",
      });
    },
    expectedResult: [
      {
        default: {
          reason: "ml",
        },
        fields: [
          { fieldName: "given-name" },
          { fieldName: "family-name" },
          { fieldName: "organization", reason: "autocomplete" },
          { fieldName: "street-address" },
          { fieldName: "address-level2" },
          { fieldName: "address-level1" },
          { fieldName: "postal-code" },
          { fieldName: "country" },
          { fieldName: "tel", reason: "autocomplete" },
          { fieldName: "email", reason: "regex-heuristic" },
        ],
      },
    ],
  },
  {
    fixtureData: `
      <p><label>Name: <input id="cc-name"></label></p>
      <p><label>Card Number: <input id="cc-number"></label></p>
      <p><label>Expiration month: <input id="cc-exp-month"></label></p>
      <p><label>Expiration year: <input id="cc-exp-year"></label></p>
      <p><label>CSC: <input id="cc-csc"></label></p>
      <p><label>Postal Code: <input id="postal-code" name="postal-code"/></label></p>`,
    expectedResult: [
      {
        fields: [
          { fieldName: "cc-name", reason: "fathom" },
          { fieldName: "cc-number", reason: "fathom" },
          { fieldName: "cc-exp-month", reason: "ml" },
          { fieldName: "cc-exp-year", reason: "ml" },
          { fieldName: "cc-csc", reason: "ml" },
        ],
      },
      {
        invalid: true,
        fields: [{ fieldName: "postal-code", reason: "ml" }],
      },
    ],
  },
  // This tests when the ML gives different results than heuristics.
  {
    fixtureData: `
      <p><label>Organization<input id="special"></label></p>
      <p><label>tel: <input type="text" id="tel" name="tel"/></label></p>
      <p><label>email: <input type="email" id="email" name="email"/></label></p>
      <p><label>family name: <input id="family" name="familyname"/></label></p>`,
    expectedResult: [
      {
        fields: [
          { fieldName: "tel", reason: "ml" },
          // The model isn't used here because type="email" fields are always
          // considered email fields.
          { fieldName: "email", reason: "regex-heuristic" },
          // The model returns 'given-name' which overrides the heuristics.
          { fieldName: "given-name", reason: "ml" },
        ],
      },
    ],
  },
  // When extensions.formautofill.useml.other preference is set, when the
  // model returns 'other', the result is treated as unidentified.
  {
    fixtureData: `
      <p><label>Organization<input id="special"></label></p>
      <p><label>tel: <input type="text" id="tel" name="tel"/></label></p>
      <p><label>email: <input type="email" id="email" name="email"/></label></p>
      <p><label>family name: <input id="family" name="familyname"/></label></p>`,
    onTestSetup: () => {
      return SpecialPowers.pushPrefEnv({
        set: [["extensions.formautofill.useml.useHeuristicsForOther", true]],
      });
    },
    onTestComplete: () => {
      return SpecialPowers.popPrefEnv();
    },
    expectedResult: [
      {
        fields: [
          // The model returns 'other' so heuristics should be used.
          { fieldName: "organization", reason: "regex-heuristic" },
          { fieldName: "tel", reason: "ml" },
          // The model isn't used here because type="email" fields are always
          // considered email fields.
          { fieldName: "email", reason: "regex-heuristic" },
          // The model returns 'given-name' which overrides the heuristics.
          { fieldName: "given-name", reason: "ml" },
        ],
      },
    ],
  },
  // When a form has only two fields, the form isn't valid so don't load the ML inference.
  {
    fixtureData: `
      <label for="firstName">First:</label>
      <input id="firstName" name="firstName">
      <label for="lastName">Last:</label>
      <input id="lastName" name="lastName">`,
    expectedResult: [
      {
        invalid: true,
        fields: [
          { fieldName: "given-name", reason: "regex-heuristic" },
          { fieldName: "family-name", reason: "regex-heuristic" },
        ],
      },
    ],
  },
  // However if one of the fields has an autocomplete attribute, it is valid.
  {
    fixtureData: `
      <label for="firstName">First:</label>
      <input id="firstName" name="firstName">
      <label for="lastName">Last:</label>
      <input id="lastName" name="lastName" autocomplete="family-name">`,
    expectedResult: [
      {
        fields: [
          { fieldName: "given-name", reason: "ml" },
          { fieldName: "family-name", reason: "autocomplete" },
        ],
      },
    ],
  },
]);

async function assertTelemetry(expected) {
  const events = Glean.address.detectedAddressForm.testGetValue();
  Assert.equal(
    events.length,
    1,
    `Expected 1 event of type detected_address_form.`
  );

  const eventsExt = Glean.address.detectedAddressFormExt.testGetValue();
  Assert.equal(
    eventsExt.length,
    1,
    `Expected 1 event of type detected_address_form_ext.`
  );

  for (let [fieldName, reason] of Object.entries(expected)) {
    let value =
      fieldName in events[0].extra
        ? events[0].extra[fieldName]
        : eventsExt[0].extra[fieldName];
    Assert.equal(value, reason);
  }

  // Verify that the test ML engine is used.
  Assert.equal(eventsExt[0].extra.mlversion, "test1.0");

  Services.telemetry.clearEvents();
  Services.fog.testResetFOG();
}
