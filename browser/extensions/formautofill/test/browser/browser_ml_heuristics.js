/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

/* global add_heuristic_tests */

const { FormAutofillML } = ChromeUtils.importESModule(
  "resource://gre/modules/shared/FormAutofillML.sys.mjs"
);

let detectedFields = [
  // first test
  "given-name",
  "family-name",
  "street-address",
  "address-level2",
  "address-level1",
  "postal-code",
  "country",
  // second test
  "postal-code",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
];

//eslint-disable-next-line no-unused-vars
function detectFields(fieldDetails) {
  for (let fd of fieldDetails) {
    if (fd.fieldName || !fd.mlData) {
      continue;
    }

    fd.fieldName = detectedFields.shift();
    fd.reason = "ml";
  }
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
      ["extensions.formautofill.useml.successful", false],
    ],
  });

  // Earlier test files leave detected_address_form events behind, which
  // assertTelemetry would otherwise read instead of the ones recorded here.
  await clearGleanTelemetry();
});

add_heuristic_tests([
  // This first test should run with "extensions.formautofill.useml.successful" set to false, so
  // should use heuristics and not ML inference.
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
    onTestComplete: async () => {
      // Assign the preference after the test.
      await SpecialPowers.pushPrefEnv({
        set: [["extensions.formautofill.useml.successful", true]],
      });
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
