/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head_smartformfill_form_review.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_smartformfill_form_review.js",
  this
);

const { formAutofillStorage } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofillStorage.sys.mjs"
);
const { FormHistory } = ChromeUtils.importESModule(
  "resource://gre/modules/FormHistory.sys.mjs"
);

const ADDRESSES_ENABLED_PREF = "extensions.formautofill.addresses.enabled";

const SAVED_NAME = "Ana Souza";
const SAVED_EMAIL = "ana@example.com";
const TYPED_NAME = "Typed Name";
const TYPED_EMAIL = "typed@example.com";

// The form the review flow opens has a name and an email field, whose local
// guesses are the keys a saved address holds those values under.
const FORM_HISTORY_ENTRIES = [
  { fieldname: "name", value: TYPED_NAME },
  { fieldname: "email", value: TYPED_EMAIL },
];

/**
 * Saves an address and the form history entries every test needs.
 *
 * @param {object} address - Address record to save.
 * @returns {Promise<void>}
 */
async function saveStoredValues(address) {
  await formAutofillStorage.initialize();
  await formAutofillStorage.addresses.add(address);
  await FormHistory.update(
    FORM_HISTORY_ENTRIES.map(entry => ({ op: "add", ...entry }))
  );
}

/**
 * Answers value generation by filling each field from the candidate token of
 * its own type. Tokens are numbered per type in field order, and the form has
 * one field of each.
 *
 * @param {MockEngineManager} mockEngineManager - Manager used to capture the
 *   value-generation request.
 * @returns {Promise<Array<object>>} Generated fields joined with their IDs.
 */
function respondWithTokenFills(mockEngineManager) {
  return respondWithGeneratedFields(mockEngineManager, [
    { action: "fill_from_token", value: "§EMAIL_1§", confidence: "high" },
    { action: "fill_from_token", value: "§NAME_1§", confidence: "high" },
  ]);
}

/**
 * Reads the name and value of each field the review is offering.
 *
 * @param {MozBrowser} reviewBrowser - Browser hosting the review component.
 * @returns {Promise<Array<Array<string>>>} Field name and value pairs.
 */
async function getReviewedValues(reviewBrowser) {
  const snapshot = await getFormReviewSnapshot(reviewBrowser);
  return snapshot.fields.map(field => [field.name, field.value]);
}

/**
 * Opens the review, answers generation from the offered tokens, and reports
 * the values it ends up with.
 *
 * @param {FormReviewTestContext} context - Initialized test context.
 * @returns {Promise<Array<Array<string>>>} Field name and value pairs.
 */
async function getReviewedValuesForForm(context) {
  const { dialog, reviewBrowser } = await openFormReview(context);
  await respondWithTokenFills(context.mockEngineManager);
  await waitForFormReviewState(reviewBrowser, FORM_REVIEW_STATES.REVIEW);

  const values = await getReviewedValues(reviewBrowser);

  const dialogClosed = waitForFormReviewClose(context.win, dialog);
  await BrowserTestUtils.synthesizeKey("KEY_Escape", {}, reviewBrowser);
  await dialogClosed;

  return values;
}

describe("Smart Form Fill stored value candidates", () => {
  let context;

  afterEach(async () => {
    await cleanupFormReviewTest(context);
    context = null;

    await formAutofillStorage.addresses.removeAll();
    await FormHistory.update(
      FORM_HISTORY_ENTRIES.map(entry => ({ op: "remove", ...entry }))
    );
  });

  it("reads the field the local guess names out of the saved address", async () => {
    await saveStoredValues({ name: SAVED_NAME, country: "US" });
    context = await setupFormReviewTest();

    Assert.deepEqual(
      await getReviewedValuesForForm(context),
      [
        ["email", TYPED_EMAIL],
        ["name", SAVED_NAME],
      ],
      "The saved address answers the name field, and form history answers the email field it has no value for"
    );
  });

  it("offers nothing from the saved addresses when they are disabled", async () => {
    await saveStoredValues({
      name: SAVED_NAME,
      email: SAVED_EMAIL,
      country: "US",
    });
    context = await setupFormReviewTest();
    await SpecialPowers.pushPrefEnv({
      set: [[ADDRESSES_ENABLED_PREF, false]],
    });

    try {
      Assert.deepEqual(
        await getReviewedValuesForForm(context),
        [
          ["email", TYPED_EMAIL],
          ["name", TYPED_NAME],
        ],
        "Both fields fall back to form history when address autofill is off"
      );
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  });
});
