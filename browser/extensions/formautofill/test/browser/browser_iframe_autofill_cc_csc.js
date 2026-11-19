/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* global add_autofill_heuristic_tests */

const TEST_PROFILE = {
  "cc-name": "John Doe",
  "cc-number": "4111111111111111",
  "cc-exp-month": "04",
  "cc-exp-year": new Date().getFullYear() + 2,
  "cc-csc": "123",
};

add_setup(async function () {
  await switchCreditCardStore({ rust: true });
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.formautofill.creditCards.supported", "on"],
      ["extensions.formautofill.creditCards.enabled", true],
      ["extensions.formautofill.creditCards.cvv.supported", "on"],
      ["extensions.formautofill.creditCards.cvv.enabled", true],
      ["extensions.formautofill.heuristics.autofillSameOriginWithTop", true],
    ],
  });
});

add_autofill_heuristic_tests([
  /**
   * Test cc-csc in the main-frame
   */
  {
    description:
      "Fill cc-csc in a main-frame when the autofill is triggered in a first-party-origin iframe",
    fixtureData: `
      <p><label>Security Code: <input id="cc-csc" autocomplete="cc-csc"></label></p>
      <iframe src=\"${SAME_ORIGIN_CC_NAME}\"></iframe>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          {
            fieldName: "cc-csc",
            autofill: TEST_PROFILE["cc-csc"],
            preview: "•••",
          },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  {
    description:
      "Do not fill cc-csc in a main-frame when the autofill is triggered in a third-party-origin iframe",
    fixtureData: `
      <p><label>Security Code: <input id="cc-csc" autocomplete="cc-csc"></label></p>
      <iframe src=\"${CROSS_ORIGIN_CC_NAME}\"></iframe>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          { fieldName: "cc-csc", autofill: "" },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  /**
   * Test cc-csc in a first-party-origin iframe
   */
  {
    description:
      "Fill cc-csc in a first-party-origin iframe when the autofill is triggered in another first-party-origin iframe",
    fixtureData: `
      <iframe src=\"${SAME_ORIGIN_CC_CSC}\"></iframe>
      <iframe src=\"${SAME_ORIGIN_CC_NAME}\"></iframe>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          {
            fieldName: "cc-csc",
            autofill: TEST_PROFILE["cc-csc"],
            preview: "•••",
          },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  {
    description:
      "Do not fill cc-csc in a first-party-origin iframe when autofill is triggered in a third-party iframe",
    fixtureData: `
      <iframe src=\"${SAME_ORIGIN_CC_CSC}\"></iframe>
      <iframe src=\"${CROSS_ORIGIN_CC_NAME}\"></iframe>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          { fieldName: "cc-csc", autofill: "" },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  {
    description:
      "Fill cc-csc in a first-party-origin iframe when the autofill is triggered in the main-frame",
    fixtureData: `
      <iframe src=\"${SAME_ORIGIN_CC_CSC}\"></iframe>
      <p><label>Card Name: <input id="cc-name" autocomplete="cc-name"></label></p>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          {
            fieldName: "cc-csc",
            autofill: TEST_PROFILE["cc-csc"],
            preview: "•••",
          },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  /**
   * Test cc-csc in a third-party-origin iframe
   */
  {
    description:
      "Do not fill cc-csc in a third-party-origin iframe when the autofill is triggered in a first-party-origin iframe",
    fixtureData: `
      <iframe src=\"${CROSS_ORIGIN_CC_CSC}\"></iframe>
      <iframe src=\"${SAME_ORIGIN_CC_NAME}\"></iframe>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          { fieldName: "cc-csc", autofill: "" },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  {
    description:
      "Do not fill cc-csc in a third-party-origin iframe when the autofill is triggered in cross-origin third-party-origin iframe",
    fixtureData: `
      <iframe src=\"${CROSS_ORIGIN_CC_CSC}\"></iframe>
      <iframe src=\"${CROSS_ORIGIN_2_CC_NAME}\"></iframe>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          { fieldName: "cc-csc", autofill: "" },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  {
    description:
      "Do not fill cc-csc in a third-party-origin iframe when the autofill is triggered in the main-frame",
    fixtureData: `
      <iframe src=\"${CROSS_ORIGIN_CC_CSC}\"></iframe>
      <p><label>Card Name: <input id="cc-name" autocomplete="cc-name"></label></p>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          { fieldName: "cc-csc", autofill: "" },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  {
    description:
      "Fill cc-csc in a third-party-origin iframe when the autofill is triggered in a same-origin third-party-origin iframe",
    fixtureData: `
      <iframe src=\"${CROSS_ORIGIN_CC_CSC}\"></iframe>
      <iframe src=\"${CROSS_ORIGIN_CC_NAME}\"></iframe>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-name",
    expectedResult: [
      {
        fields: [
          {
            fieldName: "cc-csc",
            autofill: TEST_PROFILE["cc-csc"],
            preview: "•••",
          },
          { fieldName: "cc-name", autofill: TEST_PROFILE["cc-name"] },
        ],
      },
    ],
  },
  /**
   * Test the relaxed restriction still applies to other fields
   */
  {
    description:
      "Fill cc-exp but not cc-csc in a main-frame when the autofill is triggered in a third-party-origin iframe",
    fixtureData: `
      <p><label>Expiration Date: <input id="cc-exp" autocomplete="cc-exp"></label></p>
      <p><label>Security Code: <input id="cc-csc" autocomplete="cc-csc"></label></p>
      <iframe src=\"${CROSS_ORIGIN_CC_NUMBER}\"></iframe>
    `,
    profile: TEST_PROFILE,
    autofillTrigger: "#cc-number",
    expectedResult: [
      {
        fields: [
          {
            fieldName: "cc-exp",
            autofill: `${TEST_PROFILE["cc-exp-month"]}/${TEST_PROFILE["cc-exp-year"]}`,
          },
          { fieldName: "cc-csc", autofill: "" },
          { fieldName: "cc-number", autofill: TEST_PROFILE["cc-number"] },
        ],
      },
    ],
  },
]);
