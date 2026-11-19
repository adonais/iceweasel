/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { FormAutofillStatus } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofillParent.sys.mjs"
);
const { RustAutofillCreditCardsAdapter } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillCreditCardStorage.sys.mjs"
);
const { createAutofillKey, createAutofillStoreWithStaticKeyManager } =
  ChromeUtils.importESModule(
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs"
  );
const { initialize: initRustComponents } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustInitRustComponents.sys.mjs"
);

const CVV_SUPPORTED_PREF = "extensions.formautofill.creditCards.cvv.supported";
const CVV_ENABLED_PREF = "extensions.formautofill.creditCards.cvv.enabled";
const RUST_ACTIVE_PREF =
  "extensions.formautofill.creditCards.storage.rust.active";

const CARD_1 = {
  "cc-name": "Jane Doe",
  "cc-number": "4111111111111111",
  "cc-exp-month": 4,
  "cc-exp-year": 2030,
};
const CARD_2 = {
  "cc-name": "John Doe",
  "cc-number": "5103059495477870",
  "cc-exp-month": 6,
  "cc-exp-year": 2031,
};

function savedCounts() {
  return [
    Glean.formautofillCreditcards.savedCount.testGetValue(),
    Glean.formautofillCreditcards.savedCvvCount.testGetValue(),
  ];
}

async function waitForCounts(expected, message) {
  await TestUtils.waitForCondition(
    () => ObjectUtils.deepEqual(savedCounts(), expected),
    message
  );
  Assert.deepEqual(savedCounts(), expected, message);
}

add_setup(async () => {
  Services.fog.initializeFOG();
  FormAutofillStatus.init();
  registerCleanupFunction(() => {
    FormAutofillStatus.uninit();
    Services.prefs.clearUserPref(CVV_SUPPORTED_PREF);
    Services.prefs.clearUserPref(CVV_ENABLED_PREF);
    Services.prefs.clearUserPref(RUST_ACTIVE_PREF);
  });
});

add_task(async function test_counts_are_reported_when_the_store_loads() {
  Services.fog.testResetFOG();
  await FormAutofillStatus.loadStorageOnIdle();
  await waitForCounts([0, 0], "0 is reported with no saved cards");
});

add_task(async function test_counts_follow_the_json_store() {
  Services.fog.testResetFOG();
  const creditCards = FormAutofillStatus.formAutofillStorage.creditCards;

  const guid = await creditCards.add(CARD_1);
  await creditCards.add(CARD_2);
  await waitForCounts([2, 0], "counts follow an add");

  await creditCards.remove(guid);
  await waitForCounts([1, 0], "counts follow a remove");

  await creditCards.removeAll();
  await waitForCounts([0, 0], "counts follow a clear");
});

add_task(async function test_counts_follow_the_rust_store() {
  Services.prefs.setStringPref(CVV_SUPPORTED_PREF, "on");
  Services.prefs.setBoolPref(CVV_ENABLED_PREF, true);
  Services.prefs.setBoolPref(RUST_ACTIVE_PREF, true);

  await initRustComponents(PathUtils.profileDir);
  const store = await createAutofillStoreWithStaticKeyManager(
    FileTestUtils.getTempFile("autofill-cc-saved-counts.sqlite").path,
    createAutofillKey()
  );
  const adapter = new RustAutofillCreditCardsAdapter(store);
  const storage = FormAutofillStatus.formAutofillStorage;
  sinon.stub(storage, "getCreditCards").returns(adapter);
  Services.fog.testResetFOG();

  const withCode = await adapter.add({ ...CARD_1, "cc-csc": "123" });
  await adapter.add(CARD_2);
  await waitForCounts([2, 1], "a card with a code is counted");

  await adapter.update(withCode, { "cc-csc": "" }, true);
  await waitForCounts([2, 0], "a cleared code is no longer counted");

  await adapter.update(withCode, { "cc-csc": "456" }, true);
  await waitForCounts([2, 1], "an edit that adds a code is counted");

  // Counting must not need the key, so it never prompts.
  const read = async () => {
    throw new Error("must not decrypt");
  };
  store.getCreditCard = store.getAllCreditCards = read;
  Assert.deepEqual(
    await adapter.getSavedCounts(),
    { total: 2, withSecurityCode: 1 },
    "counts are read without decrypting a card"
  );
  delete store.getCreditCard;
  delete store.getAllCreditCards;

  await adapter.removeAll();
  await waitForCounts([0, 0], "counts follow a clear");

  storage.getCreditCards.restore();
});

add_task(async function test_cvv_saving_enabled_is_reported_at_startup() {
  Services.prefs.setStringPref(CVV_SUPPORTED_PREF, "on");
  Services.prefs.setBoolPref(RUST_ACTIVE_PREF, true);
  for (const enabled of [true, false]) {
    Services.prefs.setBoolPref(CVV_ENABLED_PREF, enabled);
    Services.fog.testResetFOG();
    await FormAutofillStatus.loadStorageOnIdle();
    Assert.equal(
      Glean.formautofillCreditcards.cvvSavingEnabled.testGetValue(),
      enabled,
      `cvv_saving_enabled is ${enabled}`
    );
  }

  Services.prefs.setStringPref(CVV_SUPPORTED_PREF, "off");
  Services.fog.testResetFOG();
  await FormAutofillStatus.loadStorageOnIdle();
  Assert.equal(
    Glean.formautofillCreditcards.cvvSavingEnabled.testGetValue(),
    null,
    "cvv_saving_enabled is not set when security codes aren't supported"
  );
});
