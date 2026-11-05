/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * The credit card migration seen from the browser: a card saved by the JSON
 * store, copied across, and then used through the paths a card is used by.
 *
 * What the xpcshell tests cannot cover is the number. Each store encrypts under
 * its own key, so the copy decrypts and re-encrypts, and filling a form is the
 * only path that takes the ciphertext the receiving store wrote and asks for
 * the number back through the OS re-authentication the user would see.
 */

const ENABLED_PREF = "extensions.formautofill.creditCards.storage.rust.enabled";
const ACTIVE_PREF = "extensions.formautofill.creditCards.storage.rust.active";
const TEST_MODE_PREF =
  "extensions.formautofill.creditCards.storage.rust.runMigrationTest";
const TEST_VERSION_PREF =
  "extensions.formautofill.creditCards.storage.rust.migrationTestVersion";

const { RustAutofillCreditCardsAdapter } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillCreditCardStorage.sys.mjs"
);

const rustActive = () => Services.prefs.getBoolPref(ACTIVE_PREF, false);

const TEST_FORM = `<form id="form">
  <input id="cc-name" autocomplete="cc-name">
  <input id="cc-number" autocomplete="cc-number">
  <input id="cc-exp-month" autocomplete="cc-exp-month">
  <input id="cc-exp-year" autocomplete="cc-exp-year">
  <input type="submit"/>
</form>`;

const CC_FORM_URL =
  "https://example.org/document-builder.sjs?html=" + TEST_FORM;

const TEST_CARD = {
  "cc-name": "John Doe",
  "cc-number": "4111111111111111",
  "cc-exp-month": 4,
  "cc-exp-year": 2030,
};

// 15 digits, so the mask this store rebuilds on read is wider than the number
// the card was saved with. See MASKED_NUMBER_LENGTH.
const TEST_CARD_AMEX = {
  "cc-name": "Jane Roe",
  "cc-number": "378282246310005",
  "cc-exp-month": 12,
  "cc-exp-year": 2031,
};

// What the form holds once it is filled: the same card, with the month padded
// as autofill writes it.
const EXPECTED_FILL = {
  "cc-name": TEST_CARD["cc-name"],
  "cc-number": TEST_CARD["cc-number"],
  "cc-exp-month": "04",
  "cc-exp-year": String(TEST_CARD["cc-exp-year"]),
};

const EXPECTED_FILL_AMEX = {
  "cc-name": TEST_CARD_AMEX["cc-name"],
  "cc-number": TEST_CARD_AMEX["cc-number"],
  "cc-exp-month": "12",
  "cc-exp-year": String(TEST_CARD_AMEX["cc-exp-year"]),
};

/**
 * Move the profile to the store the pref names and wait for it, the way the
 * pref observer does at runtime.
 *
 * @param {boolean} rust Whether the Rust store should serve afterwards.
 */
async function switchTo(rust) {
  Services.prefs.setBoolPref(ENABLED_PREF, rust);
  await formAutofillStorage._creditCardSwitch;
  Assert.equal(
    Services.prefs.getBoolPref(ACTIVE_PREF, false),
    rust,
    `the profile is served by ${rust ? "Rust" : "JSON"}`
  );
}

/**
 * Fill the credit card form from the autocomplete popup and return what landed
 * in the fields. This is what reads the number back out of the store.
 *
 * @returns {Promise<object>} The filled values, keyed by field id.
 */
async function fillFromStorage(expected = EXPECTED_FILL) {
  let filled;
  await BrowserTestUtils.withNewTab(CC_FORM_URL, async browser => {
    await openPopupOn(browser, "#cc-name");
    await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
    await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
    await waitForAutofill(browser, "#cc-name", expected["cc-name"]);

    filled = await SpecialPowers.spawn(browser, [], () =>
      Object.fromEntries(
        ["cc-name", "cc-number", "cc-exp-month", "cc-exp-year"].map(id => [
          id,
          content.document.getElementById(id).value,
        ])
      )
    );
  });
  return filled;
}

add_setup(async function () {
  // The number is decrypted for filling, which is where the OS prompt would
  // be. It is a prompt this suite cannot answer, and not what is under test.
  const osAuthWas = FormAutofillUtils.getOSAuthEnabled();
  FormAutofillUtils.setOSAuthEnabled(false);

  // Restored to whatever it was, rather than to what the manifest asks for:
  // the tasks below flip it both ways and the harness checks it afterwards.
  const enabledWas = Services.prefs.getBoolPref(ENABLED_PREF, false);

  await SpecialPowers.pushPrefEnv({
    set: [["extensions.formautofill.creditCards.enabled", true]],
  });

  registerCleanupFunction(async () => {
    FormAutofillUtils.setOSAuthEnabled(osAuthWas);
    await removeAllRecords();
    Services.prefs.setBoolPref(ENABLED_PREF, enabledWas);
    await formAutofillStorage._creditCardSwitch;
  });
});

add_task(async function test_a_migrated_card_fills_a_form() {
  // Saved while JSON is serving, so what fills the form is a card the
  // migration copied rather than one the Rust store was handed directly.
  await switchTo(false);
  await setStorage(TEST_CARD);
  await switchTo(true);

  const [stored] = await getCreditCards();
  Assert.equal(stored["cc-name"], TEST_CARD["cc-name"], "the card came across");
  Assert.ok(
    stored["cc-number"].endsWith("1111"),
    "with the last four digits it was saved with"
  );
  Assert.notEqual(
    stored["cc-number"],
    TEST_CARD["cc-number"],
    "and the number itself is not handed back in the clear"
  );

  Assert.deepEqual(
    await fillFromStorage(),
    EXPECTED_FILL,
    "the number the receiving store re-encrypted decrypts back to the card"
  );

  await removeAllRecords();
});

add_task(async function test_a_migrated_card_derives_its_read_fields() {
  // This store keeps the name, the expiry parts and the last four digits, and
  // derives the rest on read. A migrated card is where that shows: the number
  // it was saved with is gone by the time anything reads it back, so the mask
  // is rebuilt at a fixed width rather than the card's own.
  await switchTo(false);
  await setStorage(TEST_CARD_AMEX);
  await switchTo(true);

  const [stored] = await getCreditCards();
  Assert.equal(
    stored["cc-number"],
    "\u2022".repeat(12) + "0005",
    "the mask is rebuilt at a fixed width, not the 15 digits saved"
  );
  Assert.equal(stored["cc-given-name"], "Jane", "cc-given-name is derived");
  Assert.equal(stored["cc-family-name"], "Roe", "cc-family-name is derived");
  Assert.equal(stored["cc-exp"], "2031-12", "cc-exp is derived");
  Assert.equal(stored["cc-type"], "amex", "cc-type came across the copy");

  Assert.deepEqual(
    await fillFromStorage(EXPECTED_FILL_AMEX),
    EXPECTED_FILL_AMEX,
    "and the number still fills, however the mask was rebuilt"
  );

  await removeAllRecords();
});

add_task(async function test_a_card_captured_after_the_switch_is_saved() {
  // Nothing to copy, so the switch is only the handover: what is under test is
  // that capture writes into the store that took over, and that filling reads
  // back what it wrote.
  await switchTo(false);
  await switchTo(true);

  const onChanged = waitForStorageChangedEvents("add");
  await BrowserTestUtils.withNewTab(CC_FORM_URL, async browser => {
    const onPopupShown = waitForPopupShown();
    await focusUpdateSubmitForm(browser, {
      focusSelector: "#cc-name",
      newValues: {
        "#cc-name": TEST_CARD["cc-name"],
        "#cc-number": TEST_CARD["cc-number"],
        "#cc-exp-month": String(TEST_CARD["cc-exp-month"]),
        "#cc-exp-year": String(TEST_CARD["cc-exp-year"]),
      },
    });
    await onPopupShown;
    await clickDoorhangerButton(MAIN_BUTTON, 0);
  });
  await onChanged;

  const cards = await getCreditCards();
  Assert.equal(cards.length, 1, "the card was saved");
  Assert.deepEqual(
    await fillFromStorage(),
    EXPECTED_FILL,
    "and reads back as the number that was typed"
  );

  await removeAllRecords();
});

add_task(async function test_resubmitting_a_stored_card_updates_it() {
  await switchTo(false);
  await switchTo(true);
  await setStorage(TEST_CARD);
  const [before] = await getCreditCards();

  // Same number, later expiry. Recognising it as the card already stored takes
  // decrypting every stored number, which is the store's own business now, and
  // a store that could not do it would save a second copy instead.
  const onChanged = waitForStorageChangedEvents("update");
  await BrowserTestUtils.withNewTab(CC_FORM_URL, async browser => {
    const onPopupShown = waitForPopupShown();
    await focusUpdateSubmitForm(browser, {
      focusSelector: "#cc-name",
      newValues: {
        "#cc-name": TEST_CARD["cc-name"],
        "#cc-number": TEST_CARD["cc-number"],
        "#cc-exp-month": String(TEST_CARD["cc-exp-month"]),
        "#cc-exp-year": "2031",
      },
    });
    await onPopupShown;
    await clickDoorhangerButton(MAIN_BUTTON, 0);
  });
  await onChanged;

  const cards = await getCreditCards();
  Assert.equal(cards.length, 1, "the stored card was updated, not duplicated");
  Assert.equal(cards[0].guid, before.guid, "keeping its guid");
  Assert.equal(cards[0]["cc-exp-year"], 2031, "with the expiry that was typed");

  await removeAllRecords();
});

add_task(async function test_the_number_survives_a_switch_back() {
  await switchTo(false);
  await setStorage(TEST_CARD);
  await switchTo(true);
  await switchTo(false);

  const cards = await getCreditCards();
  Assert.equal(cards.length, 1, "the card came back to JSON");
  Assert.deepEqual(
    await fillFromStorage(),
    EXPECTED_FILL,
    "with a number the JSON store can read, so the round trip is lossless"
  );

  await removeAllRecords();
});

add_task(async function test_a_declined_os_prompt_aborts_the_fill() {
  await switchTo(false);
  await setStorage(TEST_CARD);
  await switchTo(true);

  // Every other task here runs with OS re-authentication off. This one turns
  // it on and declines it, which is the path that decides whether the number
  // reaches the page at all.
  const { FormAutofillUtils: utils } = ChromeUtils.importESModule(
    "resource://gre/modules/shared/FormAutofillUtils.sys.mjs"
  );
  const realEnabled = utils.getOSAuthEnabled;
  const realVerify = utils.verifyUserOSAuth;
  utils.getOSAuthEnabled = () => true;
  utils.verifyUserOSAuth = async () => false;
  Services.fog.testResetFOG();

  try {
    await BrowserTestUtils.withNewTab(CC_FORM_URL, async browser => {
      await openPopupOn(browser, "#cc-name");
      await BrowserTestUtils.synthesizeKey("VK_DOWN", {}, browser);
      await BrowserTestUtils.synthesizeKey("VK_RETURN", {}, browser);
      await TestUtils.waitForCondition(
        () => Glean.formautofill.promptShownOsReauth.testGetValue()?.length,
        "the fill path reports how the prompt ended"
      );
      const filled = await SpecialPowers.spawn(browser, [], () =>
        [...content.document.querySelectorAll("input")].map(i => i.value)
      );
      Assert.ok(
        !filled.some(value => value == TEST_CARD["cc-number"]),
        "the number never reaches the page"
      );
    });
  } finally {
    utils.getOSAuthEnabled = realEnabled;
    utils.verifyUserOSAuth = realVerify;
  }

  const events = Glean.formautofill.promptShownOsReauth.testGetValue() ?? [];
  Assert.equal(
    events.at(-1).extra.trigger,
    "autofill",
    "recorded for the fill"
  );
  Assert.equal(
    events.at(-1).extra.result,
    "fail_user_canceled",
    "as a decline, which is what the user did, not an error"
  );

  await removeAllRecords();
});

// As a session starts: nothing has used the OS key store yet, so reading a
// number through it might put up a dialog of the OS's own.
function lockOSKeyStore() {
  OSKeyStore._isLocked = true;
}

const blockedEvents = () =>
  (Glean.formautofillCreditcards.migrateToRustBlocked.testGetValue() ?? []).map(
    event => event.extra
  );

// Windows reads its key store without UI, so nothing waits for it there.
const KEY_STORE_WAITS = AppConstants.platform != "win";

add_task(
  { skip_if: () => !KEY_STORE_WAITS },
  async function test_a_switch_waits_for_the_first_fill() {
    await switchTo(false);
    await setStorage(TEST_CARD);

    // The pref asks for Rust before anything has used the OS key store. Copying
    // would mean being the first to read it, so the switch waits instead.
    lockOSKeyStore();
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    await formAutofillStorage._creditCardSwitch;
    Assert.ok(!rustActive(), "the switch waits for the key store");

    // Filling the card is what unlocks it, and the switch follows on its own.
    Assert.deepEqual(
      await fillFromStorage(),
      EXPECTED_FILL,
      "the first fill is served by JSON"
    );
    await formAutofillStorage._creditCardSwitch;
    Assert.ok(rustActive(), "and then the profile moves to Rust");
    Assert.deepEqual(
      await fillFromStorage(),
      EXPECTED_FILL,
      "whose copy of the card fills the next form"
    );

    await removeAllRecords();
  }
);

add_task(async function test_a_copy_back_does_not_wait_for_the_key_store() {
  await switchTo(false);
  await setStorage(TEST_CARD);
  await switchTo(true);

  // Filling from Rust reads NSS's key, so a profile Rust serves may never
  // unlock the OS key store. Turning the pref off still returns it to JSON.
  lockOSKeyStore();
  Assert.deepEqual(
    await fillFromStorage(),
    EXPECTED_FILL,
    "the card fills from Rust"
  );
  Assert.ok(!OSKeyStore.isLoggedIn, "without unlocking the OS key store");
  const dialogs = watchDialogs();
  try {
    await switchTo(false);
  } finally {
    dialogs.stop();
  }
  Assert.equal(dialogs.count, 0, "without the user being asked anything");
  Assert.equal(
    [...Services.obs.enumerateObservers(OSKeyStore.UNLOCKED_TOPIC)].length,
    0,
    "the copy back did not wait for an unlock"
  );
  Assert.deepEqual(
    await fillFromStorage(),
    EXPECTED_FILL,
    "and the card fills from JSON"
  );

  await removeAllRecords();
});

add_task(
  { skip_if: () => !KEY_STORE_WAITS },
  async function test_the_dry_run_waits_for_the_first_fill() {
    await switchTo(false);
    await setStorage(TEST_CARD);
    await SpecialPowers.pushPrefEnv({ set: [[TEST_MODE_PREF, true]] });
    Services.prefs.clearUserPref(TEST_VERSION_PREF);
    Services.fog.testResetFOG();

    // Asked for Rust and taken back before anything used the key store, which
    // leaves the dry run owed and the store locked.
    lockOSKeyStore();
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    await formAutofillStorage._creditCardSwitch;
    Services.prefs.setBoolPref(ENABLED_PREF, false);
    await formAutofillStorage._creditCardSwitch;
    Assert.equal(
      (Glean.formautofillCreditcards.migrateToRust.testGetValue() ?? []).length,
      0,
      "nothing is measured while the key store is locked"
    );
    Assert.deepEqual(
      blockedEvents(),
      [
        { reason: "keystore_locked", dry_run: "false" },
        { reason: "keystore_locked", dry_run: "true" },
      ],
      "but each copy held back is reported"
    );

    Assert.deepEqual(
      await fillFromStorage(),
      EXPECTED_FILL,
      "the fill that unlocks it is served by JSON"
    );
    await formAutofillStorage._creditCardSwitch;
    Assert.equal(
      Glean.formautofillCreditcards.migrateToRust.testGetValue()?.length,
      1,
      "and the dry run then measures the profile"
    );
    Assert.ok(!rustActive(), "without moving it");
    Assert.equal(
      (await RustAutofillCreditCardsAdapter.getInstance().getAll()).length,
      0,
      "and empties the Rust store again"
    );

    await SpecialPowers.popPrefEnv();
    await removeAllRecords();
  }
);

add_task(
  { skip_if: () => KEY_STORE_WAITS },
  async function test_windows_switches_without_waiting_for_an_unlock() {
    await switchTo(false);
    await setStorage(TEST_CARD);

    lockOSKeyStore();
    const dialogs = watchDialogs();
    try {
      await switchTo(true);
    } finally {
      dialogs.stop();
    }
    Assert.equal(dialogs.count, 0, "without the user being asked anything");
    Assert.equal(
      [...Services.obs.enumerateObservers(OSKeyStore.UNLOCKED_TOPIC)].length,
      0,
      "the switch did not wait for an unlock"
    );
    Assert.deepEqual(
      await fillFromStorage(),
      EXPECTED_FILL,
      "and the card fills from Rust"
    );

    await removeAllRecords();
  }
);

add_task(async function test_a_switch_waits_behind_a_busy_key_store() {
  await switchTo(false);
  await setStorage(TEST_CARD);

  // Another key store operation is in flight on the unlocked store -- a reauth
  // dialog of the user's, say. The switch waits for it rather than sharing it.
  let settle;
  OSKeyStore._pendingUnlockPromise = new Promise(resolve => (settle = resolve));
  try {
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    await formAutofillStorage._creditCardSwitch;
    Assert.ok(!rustActive(), "the switch waits for the operation");
  } finally {
    // Settled the way OSKeyStore settles one.
    OSKeyStore._pendingUnlockPromise = null;
    settle({ authenticated: true });
  }

  await TestUtils.waitForCondition(rustActive, "then switches on its own");
  await formAutofillStorage._creditCardSwitch;
  Assert.deepEqual(
    await fillFromStorage(),
    EXPECTED_FILL,
    "and the card fills from Rust"
  );

  await removeAllRecords();
});

add_task(async function test_an_empty_profile_switches_without_the_key_store() {
  await switchTo(false);
  await removeAllRecords();

  // Nothing to decrypt, so nothing waits on the key store or reaches it --
  // asking it anything would create a key store entry for every profile that
  // never saved a card.
  lockOSKeyStore();
  const realDecrypt = OSKeyStore.decrypt;
  const realEnsure = OSKeyStore.ensureLoggedIn;
  let touched = 0;
  OSKeyStore.decrypt = async function (...args) {
    touched++;
    return realDecrypt.apply(this, args);
  };
  OSKeyStore.ensureLoggedIn = async function (...args) {
    touched++;
    return realEnsure.apply(this, args);
  };
  try {
    await switchTo(true);
  } finally {
    OSKeyStore.decrypt = realDecrypt;
    OSKeyStore.ensureLoggedIn = realEnsure;
  }
  Assert.equal(touched, 0, "the key store was not consulted");
  Assert.equal(
    [...Services.obs.enumerateObservers(OSKeyStore.UNLOCKED_TOPIC)].length,
    0,
    "nor is its unlock waited for"
  );
});

const PRIMARY_PASSWORD = "omgsecret!";
const token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
  Ci.nsIPKCS11Token
);

/**
 * Count the prompts shown until `stop()`: the dialogs a primary password
 * prompt would reach the user through, and the OS key store's requests to
 * re-authenticate the user, which ask for a prompt message rather than false.
 */
function watchDialogs() {
  let count = 0;
  const observer = () => count++;
  Services.obs.addObserver(observer, "common-dialog-loaded");
  const realEnsure = OSKeyStore.ensureLoggedIn;
  OSKeyStore.ensureLoggedIn = function (reauth, ...rest) {
    if (reauth !== false) {
      count++;
    }
    return realEnsure.call(this, reauth, ...rest);
  };
  return {
    get count() {
      return count;
    },
    stop() {
      Services.obs.removeObserver(observer, "common-dialog-loaded");
      OSKeyStore.ensureLoggedIn = realEnsure;
    },
  };
}

add_task(async function test_a_primary_password_keeps_the_profile_on_json() {
  await switchTo(false);
  await setStorage(TEST_CARD);

  // The Rust store's key is NSS's, which the password guards, so the pref is
  // not acted on, with the token unlocked or locked, and nothing is asked.
  await token.changePassword("", PRIMARY_PASSWORD);
  Services.fog.testResetFOG();
  const dialogs = watchDialogs();
  try {
    for (const locked of [false, true]) {
      if (locked) {
        await token.logout();
      }
      Services.prefs.setBoolPref(ENABLED_PREF, true);
      await formAutofillStorage._creditCardSwitch;
      Assert.ok(!rustActive(), `the profile stays on JSON, locked: ${locked}`);
      Services.prefs.setBoolPref(ENABLED_PREF, false);
      await formAutofillStorage._creditCardSwitch;
    }
    Assert.deepEqual(
      await fillFromStorage(),
      EXPECTED_FILL,
      "and its card still fills"
    );
    Assert.equal(dialogs.count, 0, "without the user being asked anything");
    Assert.deepEqual(
      blockedEvents(),
      [
        { reason: "primary_password", dry_run: "false" },
        { reason: "primary_password", dry_run: "false" },
      ],
      "and each copy held back is reported"
    );
  } finally {
    dialogs.stop();
    await token.changePassword(PRIMARY_PASSWORD, "");
  }

  await removeAllRecords();
});

add_task(async function test_a_copy_back_waits_for_the_token() {
  // Moved to Rust before the password was set.
  await switchTo(false);
  await setStorage(TEST_CARD);
  await switchTo(true);

  await token.changePassword("", PRIMARY_PASSWORD);
  const dialogs = watchDialogs();
  try {
    // Locked, the Rust store would read the card back without its number, so
    // the copy back waits, asking nothing.
    await token.logout();
    Services.prefs.setBoolPref(ENABLED_PREF, false);
    await formAutofillStorage._creditCardSwitch;
    Assert.ok(
      rustActive(),
      "the profile stays on Rust while the token is locked"
    );
    Assert.equal(dialogs.count, 0, "asking nothing");

    // Unlocked for a reason of the user's own: they answer the token's prompt.
    const answer = subject => {
      const dialog = subject.Dialog;
      SpecialPowers.wrap(dialog.ui.password1Textbox).setUserInput(
        PRIMARY_PASSWORD
      );
      dialog.ui.button0.click();
    };
    Services.obs.addObserver(answer, "common-dialog-loaded");
    try {
      await token.login(false);
    } finally {
      Services.obs.removeObserver(answer, "common-dialog-loaded");
    }
    Assert.ok(token.isLoggedIn, "the user unlocked the token");
    const shown = dialogs.count;

    // The next flip then copies it back.
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    await formAutofillStorage._creditCardSwitch;
    Services.prefs.setBoolPref(ENABLED_PREF, false);
    await formAutofillStorage._creditCardSwitch;
    Assert.ok(!rustActive(), "and then the copy back runs");
    Assert.equal(dialogs.count, shown, "without asking anything more");
  } finally {
    dialogs.stop();
    await token.changePassword(PRIMARY_PASSWORD, "");
  }

  Assert.deepEqual(
    await fillFromStorage(),
    EXPECTED_FILL,
    "and the card fills from JSON"
  );

  await removeAllRecords();
});

add_task(async function test_removing_the_password_lets_the_profile_migrate() {
  await switchTo(false);
  await setStorage(TEST_CARD);

  const dialogs = watchDialogs();
  try {
    await token.changePassword("", PRIMARY_PASSWORD);
    Services.prefs.setBoolPref(ENABLED_PREF, true);
    await formAutofillStorage._creditCardSwitch;
    Assert.ok(!rustActive(), "with the password set, the profile stays");

    // Removed, the next flip is free to move it.
    await token.changePassword(PRIMARY_PASSWORD, "");
    Services.prefs.setBoolPref(ENABLED_PREF, false);
    await formAutofillStorage._creditCardSwitch;
    await switchTo(true);
    Assert.equal(dialogs.count, 0, "without the user being asked anything");
  } finally {
    dialogs.stop();
    if (token.hasPassword) {
      await token.changePassword(PRIMARY_PASSWORD, "");
    }
  }

  Assert.deepEqual(
    await fillFromStorage(),
    EXPECTED_FILL,
    "and the card fills from Rust"
  );

  await removeAllRecords();
});
