/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * The desktop credit cards engine, as Sync drives it.
 *
 * The address version documents the layering; this is the same one level up
 * from test_rust_autofill_credit_card_bridged_engine.js, which drives the
 * bridge directly against a throwaway store. What matters here is that Sync
 * selects BridgedCreditCardsEngine while the Rust store is the active one, and
 * that a sync driven through it carries cards in and out of the store the
 * browser is actually reading from.
 *
 * Cards add one thing addresses do not. The number crosses in the clear inside
 * the payload sync encrypts, while the store holds it encrypted under a key of
 * its own, so a round trip here is also the check that the store converts it in
 * both directions rather than the mask being uploaded.
 */

/* import-globals-from ../../../../../services/sync/tests/unit/head_appinfo.js */
/* import-globals-from ../../../../../services/common/tests/unit/head_helpers.js */
/* import-globals-from ../../../../../services/sync/tests/unit/head_helpers.js */
/* import-globals-from ../../../../../services/sync/tests/unit/head_http_server.js */

"use strict";

const { Service } = ChromeUtils.importESModule(
  "resource://services-sync/service.sys.mjs"
);
// serverForFoo() reads this off the test scope when it builds meta/global, so
// it is used despite nothing in this file naming it.
// eslint-disable-next-line no-unused-vars
const { STORAGE_VERSION } = ChromeUtils.importESModule(
  "resource://services-sync/constants.sys.mjs"
);
const { CreditCardsEngine, BridgedCreditCardsEngine } =
  ChromeUtils.importESModule("resource://autofill/FormAutofillSync.sys.mjs");
const { formAutofillStorage } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofillStorage.sys.mjs"
);
const { RustAutofillCreditCardsAdapter } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillCreditCardStorage.sys.mjs"
);
const { RustAutofillStore } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillStore.sys.mjs"
);
const { Status } = ChromeUtils.importESModule(
  "resource://services-sync/status.sys.mjs"
);
const { MASTER_PASSWORD_LOCKED } = ChromeUtils.importESModule(
  "resource://services-sync/constants.sys.mjs"
);

const ENABLED_PREF = "extensions.formautofill.creditCards.storage.rust.enabled";
const ACTIVE_PREF = "extensions.formautofill.creditCards.storage.rust.active";
// What `engine.enabled = true` writes.
const SYNC_ENGINE_PREF = "services.sync.engine.creditcards";

const TEST_NUMBER = "4111111111111111";
const REMOTE_NUMBER = "378282246310005";

const getBool = (pref, def = false) => Services.prefs.getBoolPref(pref, def);

function card(name, number) {
  return {
    "cc-name": name,
    "cc-number": number,
    "cc-exp-month": 4,
    "cc-exp-year": 2030,
  };
}

/**
 * Clear what a previous task left behind: the engine's sync metadata, and the
 * records themselves. wipeClient() cannot do the second part -- the store's
 * bridged engine implements wipe() as a no-op -- so the store is wiped
 * directly.
 *
 * @param {object} engine
 */
async function resetBetweenTasks(engine) {
  await engine.wipeClient();
  await RustAutofillCreditCardsAdapter.getInstance().wipe();
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(ENABLED_PREF);
  Services.prefs.clearUserPref(ACTIVE_PREF);
  Services.prefs.clearUserPref(SYNC_ENGINE_PREF);
});

add_setup(async function () {
  Services.prefs.setBoolPref(ENABLED_PREF, true);
  await formAutofillStorage.initialize();
  Assert.ok(
    getBool(ACTIVE_PREF),
    "the empty profile migrated and the Rust store is serving credit cards"
  );
});

add_task(async function test_sync_selects_the_engine_matching_the_store() {
  await Service.promiseInitialized;

  Services.prefs.setBoolPref(ACTIVE_PREF, false);
  await Service.engineManager.switchAlternatives();
  Assert.ok(
    Service.engineManager.get("creditcards") instanceof CreditCardsEngine,
    "the JSON store's engine is used while Rust is not active"
  );

  Services.prefs.setBoolPref(ACTIVE_PREF, true);
  await Service.engineManager.switchAlternatives();
  Assert.ok(
    Service.engineManager.get("creditcards") instanceof
      BridgedCreditCardsEngine,
    "activating the Rust store switches sync onto its bridged engine"
  );

  // Rolling back has to take sync with it, or sync keeps writing into a store
  // the browser has stopped reading.
  Services.prefs.setBoolPref(ACTIVE_PREF, false);
  await Service.engineManager.switchAlternatives();
  Assert.ok(
    Service.engineManager.get("creditcards") instanceof CreditCardsEngine,
    "deactivating switches sync back to the JSON engine"
  );

  Services.prefs.setBoolPref(ACTIVE_PREF, true);
  await Service.engineManager.switchAlternatives();
});

add_task(async function test_engine_initializes_against_the_rust_store() {
  const engine = new BridgedCreditCardsEngine(Service);
  await engine.initialize();
  try {
    Assert.ok(engine._bridge, "the engine got a bridge from the Rust store");
    Assert.equal(
      engine.version,
      CreditCardsEngine.prototype.version,
      "and reports the JSON engine's version in meta/global, so neither " +
        "engine wipes the server or locks the other out"
    );
    Assert.equal(
      engine.prefName,
      "creditcards",
      "it reads the same enabled pref as the JSON engine, so switching " +
        "backend does not silently re-enable or disable credit card sync"
    );
    Assert.equal(
      engine.overrideTelemetryName,
      "rust-creditcards",
      "and is distinguishable from the JSON engine in sync telemetry"
    );
  } finally {
    await engine.finalize();
  }
});

add_task(async function test_sync_round_trip_carries_the_number() {
  const engine = new BridgedCreditCardsEngine(Service);
  await engine.initialize();
  engine.enabled = true;

  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const server = await serverForFoo(engine);
  try {
    await SyncTestingInfrastructure(server);

    const localGuid = await formAutofillStorage.creditCards.add(
      card("Local Only", TEST_NUMBER)
    );

    const collection = server.user("foo").collection("creditcards");
    collection.insert(
      "remote-card-aa",
      encryptPayload({
        id: "remote-card-aa",
        entry: {
          "cc-name": "Remote Only",
          "cc-number": REMOTE_NUMBER,
          "cc-exp-month": 12,
          "cc-exp-year": 2031,
          version: 3,
        },
      }),
      new_timestamp()
    );

    await sync_engine_and_validate_telem(engine, false);

    // Incoming: the store holds ciphertext under its own key, so the only way
    // to see what arrived is to decrypt it back out.
    const applied = await formAutofillStorage.creditCards.get("remote-card-aa");
    Assert.ok(applied, "the incoming card reached the active store");
    Assert.equal(
      await formAutofillStorage.creditCards.decryptField(applied, "cc-number"),
      REMOTE_NUMBER,
      "and its number is readable, so it was encrypted under this store's key"
    );

    // Outgoing: uploading the mask would overwrite the real number on every
    // other device.
    const uploaded = collection.cleartext(localGuid);
    Assert.ok(uploaded, "the local-only card was uploaded");
    Assert.equal(
      uploaded.entry["cc-number"],
      TEST_NUMBER,
      "with its number in the clear rather than the stored mask"
    );
  } finally {
    await engine.finalize();
    await promiseStopServer(server);
  }
});

add_task(async function test_incoming_records_announce_themselves() {
  // Reconciliation happens inside Rust, so nothing on the adapter sees the
  // records sync applies. FormAutofillStatus refreshes
  // FormAutofill:savedFieldNames from formautofill-storage-changed, so without
  // an announcement a profile that gets its cards from sync is offered no
  // autofill until the next restart.
  const engine = new BridgedCreditCardsEngine(Service);
  await engine.initialize();
  engine.enabled = true;

  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const server = await serverForFoo(engine);
  const seen = [];
  const observer = (subject, _topic, action) =>
    seen.push({ action, sourceSync: subject.wrappedJSObject.sourceSync });
  Services.obs.addObserver(observer, "formautofill-storage-changed");

  try {
    await SyncTestingInfrastructure(server);

    const collection = server.user("foo").collection("creditcards");
    collection.insert(
      "announce-cccc",
      encryptPayload({
        id: "announce-cccc",
        entry: { ...card("Announced", REMOTE_NUMBER), version: 3 },
      }),
      new_timestamp()
    );

    seen.length = 0;
    await sync_engine_and_validate_telem(engine, false);

    Assert.ok(
      await formAutofillStorage.creditCards.get("announce-cccc"),
      "the incoming record reached the store"
    );
    Assert.ok(
      seen.length,
      "and applying it announced formautofill-storage-changed"
    );
    Assert.ok(
      seen.every(n => n.sourceSync),
      "tagged sourceSync, so the tracker does not schedule another sync for it"
    );
    Assert.ok(
      seen.every(n => n.action != "notifyUsed"),
      "and not as notifyUsed, which FormAutofillStatus skips"
    );
  } finally {
    Services.obs.removeObserver(observer, "formautofill-storage-changed");
    await engine.finalize();
    await promiseStopServer(server);
  }
});

add_task(async function test_a_locked_primary_password_skips_the_sync() {
  // Uploading a card decrypts its number, and this store's key is NSS's, so a
  // sync that ran with the token locked would reach the store's authenticator
  // and prompt -- unasked for, in the background. The token itself is not
  // locked here: a real one stays locked for the rest of the process, and an
  // open Rust store outlives a token reset.
  const engine = new BridgedCreditCardsEngine(Service);
  await engine.initialize();
  engine.enabled = true;

  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const locked = Object.getOwnPropertyDescriptor(
    RustAutofillStore,
    "primaryPasswordLocked"
  );
  Object.defineProperty(RustAutofillStore, "primaryPasswordLocked", {
    configurable: true,
    get: () => true,
  });

  let reached = false;
  const bridge = engine._bridge;
  engine._bridge = new Proxy(bridge, {
    get(target, prop, receiver) {
      if (prop == "syncStarted") {
        reached = true;
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  const previousLogin = Status.login;
  try {
    await engine.sync();
    Assert.ok(!reached, "the sync did not reach the store");
    Assert.equal(
      Status.login,
      MASTER_PASSWORD_LOCKED,
      "and recorded the locked state, so the scheduler backs off and retries"
    );
  } finally {
    Status.login = previousLogin;
    engine._bridge = bridge;
    Object.defineProperty(RustAutofillStore, "primaryPasswordLocked", locked);
    await engine.finalize();
  }
});
