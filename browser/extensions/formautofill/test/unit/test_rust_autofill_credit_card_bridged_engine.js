/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * The Rust credit card store's bridged sync engine, as reached from JS.
 *
 * The address version documents the shape; this covers what differs. The
 * number crosses the bridge in the clear -- sync encrypts the payload as a
 * whole, and the store keeps it encrypted under a key of its own -- so the
 * round trip below is also where that conversion is verified.
 */

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

const TEST_NUMBER = "4111111111111111";

// A test store gets a key of its own rather than the profile's NSS key, but
// generating it still goes through NSS.
async function newBridge(name) {
  const dbPath = FileTestUtils.getTempFile(name).path;
  await initRustComponents(PathUtils.profileDir);
  const store = await createAutofillStoreWithStaticKeyManager(
    dbPath,
    createAutofillKey()
  );
  const adapter = new RustAutofillCreditCardsAdapter(store);
  return { adapter, bridge: await adapter.bridgedEngine() };
}

/**
 * Advance the last-sync timestamp the only way a sync can: by acknowledging an
 * upload. The bridge exposes no setter.
 *
 * @param {object} bridge
 * @param {number} timestamp
 */
async function advanceLastSync(bridge, timestamp) {
  await bridge.syncStarted();
  await bridge.setUploaded(timestamp, []);
  await bridge.syncFinished();
}

add_task(async function test_sync_meta() {
  const { bridge } = await newBridge("cc-bridge-meta.sqlite");

  Assert.equal(await bridge.lastSync(), 0, "fresh store has never synced");
  Assert.equal(await bridge.syncId(), null, "no sync id before association");

  await bridge.ensureCurrentSyncId("some_guid");
  Assert.equal(await bridge.syncId(), "some_guid", "sync id was associated");

  await advanceLastSync(bridge, 3);
  Assert.equal(
    await bridge.lastSync(),
    3,
    "acknowledging an upload advances it"
  );

  await bridge.ensureCurrentSyncId("another_guid");
  Assert.equal(
    await bridge.lastSync(),
    0,
    "associating a new sync id resets the timestamp"
  );

  await advanceLastSync(bridge, 4);
  await bridge.resetSyncId();
  Assert.notEqual(await bridge.syncId(), "another_guid", "sync id was rotated");
  Assert.equal(await bridge.lastSync(), 0, "rotating resets the timestamp");

  await advanceLastSync(bridge, 5);
  await bridge.reset();
  Assert.equal(await bridge.lastSync(), 0, "reset clears the timestamp");
  Assert.equal(await bridge.syncId(), null, "reset clears the sync id");
});

add_task(async function test_sync_round_trip() {
  const { adapter, bridge } = await newBridge("cc-bridge-roundtrip.sqlite");

  const localGuid = await adapter.add({
    "cc-name": "Local Only",
    "cc-number": TEST_NUMBER,
    "cc-exp-month": 4,
    "cc-exp-year": 2030,
  });

  // syncStarted is where the component creates its sync staging temp tables.
  await bridge.syncStarted();

  // An incoming remote record, as the JS bridge hands it over: a JSON envelope
  // whose payload is itself a JSON string. Credit cards carry an explicit
  // `entry` object, and version is always 3.
  const incoming = JSON.stringify({
    id: "remote-only-cc",
    modified: 0,
    payload: JSON.stringify({
      id: "remote-only-cc",
      entry: {
        "cc-name": "Remote Only",
        "cc-number": "378282246310005",
        "cc-exp-month": 12,
        "cc-exp-year": 2031,
        "cc-type": "amex",
        version: 3,
      },
    }),
  });
  await bridge.storeIncoming([incoming]);

  const outgoing = await bridge.apply(0);
  const uploaded = outgoing.map(envelope =>
    JSON.parse(JSON.parse(envelope).payload)
  );
  const uploadedGuids = uploaded.map(payload => payload.id);
  Assert.ok(
    uploadedGuids.includes(localGuid),
    "the local-only record is staged for upload"
  );
  Assert.ok(
    !uploadedGuids.includes("remote-only-cc"),
    "the just-applied remote record is not echoed back"
  );

  // The store holds ciphertext, so the number has to be decrypted on the way
  // out. A record uploaded with the mask would overwrite the real number on
  // every other client.
  const local = uploaded.find(payload => payload.id == localGuid);
  Assert.equal(
    local.entry["cc-number"],
    TEST_NUMBER,
    "the number is uploaded in the clear, not as the stored mask"
  );

  // And encrypted on the way in: the record reads back through the adapter,
  // which decrypts with the store's own key.
  const applied = await adapter.get("remote-only-cc");
  Assert.ok(applied, "remote record was stored locally");
  Assert.equal(applied["cc-name"], "Remote Only", "with its fields intact");
  Assert.equal(
    await adapter.decryptField(applied, "cc-number"),
    "378282246310005",
    "and its number encrypted under this store's key"
  );

  await bridge.setUploaded(1234, [localGuid]);
  await bridge.syncFinished();
  Assert.equal(
    await bridge.lastSync(),
    1234,
    "acknowledging the upload advances last sync"
  );
});
