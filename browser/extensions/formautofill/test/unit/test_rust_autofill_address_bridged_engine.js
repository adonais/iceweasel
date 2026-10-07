/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * The Rust address store's bridged sync engine, as reached from JS.
 *
 * Desktop's BridgedEngine drives this interface; the Rust side answers it via
 * Store::addresses_bridged_engine(). These tests cover the sync-metadata
 * plumbing (last sync, sync id, reset) and one full incoming/outgoing round
 * trip. The equivalent Rust unit test cannot link NSS in a plain `cargo test`,
 * so this is where the bridge is actually verified.
 */

const { RustAutofillAddressesAdapter } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillAddressStorage.sys.mjs"
);
const { Store } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs"
);

async function newBridge(name) {
  const dbPath = FileTestUtils.getTempFile(name).path;
  const adapter = new RustAutofillAddressesAdapter(await Store.init(dbPath));
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
  const { bridge } = await newBridge("bridge-meta.sqlite");

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
  const { adapter, bridge } = await newBridge("bridge-roundtrip.sqlite");

  // A local-only record the server has never seen: it must come back out for
  // upload.
  const localGuid = await adapter.add({
    name: "Local Only",
    "street-address": "1 Local Rd",
    "address-level2": "Springfield",
    country: "US",
  });

  // syncStarted is where the component creates its sync staging temp tables,
  // so skipping it fails with "no such table: temp.addresses_sync_staging".
  await bridge.syncStarted();

  // An incoming remote record, as the JS bridge hands it over: a JSON envelope
  // whose payload is itself a JSON string.
  const incoming = JSON.stringify({
    id: "remote-only-bb",
    modified: 0,
    payload: JSON.stringify({
      id: "remote-only-bb",
      entry: {
        name: "Remote Only",
        "street-address": "2 Remote Ave",
        "address-level2": "Shelbyville",
        country: "US",
        version: 1,
      },
    }),
  });
  await bridge.storeIncoming([incoming]);

  // The collection's server last-modified time, in integer milliseconds.
  const outgoing = await bridge.apply(0);
  const uploadedGuids = outgoing.map(
    envelope => JSON.parse(JSON.parse(envelope).payload).id
  );
  Assert.ok(
    uploadedGuids.includes(localGuid),
    "the local-only record is staged for upload"
  );
  Assert.ok(
    !uploadedGuids.includes("remote-only-bb"),
    "the just-applied remote record is not echoed back"
  );

  // The incoming record was actually persisted, readable through the adapter.
  const applied = await adapter.get("remote-only-bb");
  Assert.ok(applied, "remote record was stored locally");
  Assert.equal(applied.name, "Remote Only", "with its fields intact");

  await bridge.setUploaded(1234, [localGuid]);
  await bridge.syncFinished();
  Assert.equal(
    await bridge.lastSync(),
    1234,
    "acknowledging the upload advances last sync"
  );
});
