/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * The desktop addresses engine, as Sync drives it.
 *
 * Not the Rust engine: BridgedAddressesEngine is a JS SyncEngine, and the
 * component's own engine sits behind the bridge, which
 * test_rust_autofill_address_bridged_engine.js drives directly against a
 * throwaway store. This file starts one layer up -- that Sync selects
 * BridgedAddressesEngine while the Rust store is the active one, and that syncs
 * driven through it carry records, tombstones, merges and duplicates in and out
 * of the store the browser is actually reading from.
 *
 * That pairing is the point. Sync and the browser have to agree on which store
 * is live -- if they disagree, incoming addresses land somewhere nobody reads
 * and local ones are never uploaded.
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
const { AddressesEngine, BridgedAddressesEngine } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofillSync.sys.mjs"
);
const { formAutofillStorage } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofillStorage.sys.mjs"
);
const { RustAutofillAddressesAdapter } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillAddressStorage.sys.mjs"
);

const ENABLED_PREF = "extensions.formautofill.addresses.storage.rust.enabled";
const ACTIVE_PREF = "extensions.formautofill.addresses.storage.rust.active";

const getBool = (pref, def = false) => Services.prefs.getBoolPref(pref, def);

function address(name, street) {
  return {
    name,
    "street-address": street,
    "address-level2": "Springfield",
    "address-level1": "IL",
    "postal-code": "62704",
    country: "US",
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
  await RustAutofillAddressesAdapter.getInstance().wipe();
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(ENABLED_PREF);
  Services.prefs.clearUserPref(ACTIVE_PREF);
});

// Bring the profile up the way a launch with the pref on does: migrate, verify,
// and hand addresses over to Rust. Once, in setup rather than per task, because
// initialize() is memoized -- a second call returns the first promise, exactly
// as it does in a session that only ever starts up once.
add_setup(async function () {
  Services.prefs.setBoolPref(ENABLED_PREF, true);
  await formAutofillStorage.initialize();
  Assert.ok(
    getBool(ACTIVE_PREF),
    "the empty profile migrated and the Rust store is serving addresses"
  );
});

add_task(async function test_sync_selects_the_engine_matching_the_store() {
  await Service.promiseInitialized;

  // Driven by setting the pref rather than by restarting: what is under test
  // here is that Sync follows it, and switchAlternatives is the hook that makes
  // it follow.
  Services.prefs.setBoolPref(ACTIVE_PREF, false);
  await Service.engineManager.switchAlternatives();
  Assert.ok(
    Service.engineManager.get("addresses") instanceof AddressesEngine,
    "the JSON store's engine is used while Rust is not active"
  );

  Services.prefs.setBoolPref(ACTIVE_PREF, true);
  await Service.engineManager.switchAlternatives();
  Assert.ok(
    Service.engineManager.get("addresses") instanceof BridgedAddressesEngine,
    "activating the Rust store switches sync onto its bridged engine"
  );

  // Rolling back has to take sync with it, or sync keeps writing into a store
  // the browser has stopped reading.
  Services.prefs.setBoolPref(ACTIVE_PREF, false);
  await Service.engineManager.switchAlternatives();
  Assert.ok(
    Service.engineManager.get("addresses") instanceof AddressesEngine,
    "deactivating switches sync back to the JSON engine"
  );

  Services.prefs.setBoolPref(ACTIVE_PREF, true);
  await Service.engineManager.switchAlternatives();
});

add_task(async function test_engine_initializes_against_the_rust_store() {
  const engine = new BridgedAddressesEngine(Service);
  await engine.initialize();
  try {
    Assert.ok(engine._bridge, "the engine got a bridge from the Rust store");
    Assert.equal(
      engine.version,
      1,
      "and reports the address schema version, which is what meta/global " +
        "records for the collection"
    );
    Assert.equal(
      engine.prefName,
      "addresses",
      "it reads the same enabled pref as the JSON engine, so switching " +
        "backend does not silently re-enable or disable address sync"
    );
    Assert.equal(
      engine.overrideTelemetryName,
      "rust-addresses",
      "and is distinguishable from the JSON engine in sync telemetry"
    );
  } finally {
    await engine.finalize();
  }
});

add_task(async function test_sync_round_trip_through_the_active_store() {
  const engine = new BridgedAddressesEngine(Service);
  await engine.initialize();
  engine.enabled = true;

  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const server = await serverForFoo(engine);
  try {
    await SyncTestingInfrastructure(server);

    // A local address, added the way the browser adds one: through the active
    // store, which is Rust.
    const localGuid = await formAutofillStorage.addresses.add(
      address("Local Only", "1 Local Rd")
    );

    // A record another device uploaded.
    const collection = server.user("foo").collection("addresses");
    collection.insert(
      "remote-only-bb",
      encryptPayload({
        id: "remote-only-bb",
        entry: {
          ...address("Remote Only", "2 Remote Ave"),
          version: 1,
        },
      }),
      new_timestamp()
    );

    await sync_engine_and_validate_telem(engine, false);

    // Down: the remote record is readable from the store the browser reads.
    const applied = await formAutofillStorage.addresses.get("remote-only-bb");
    Assert.ok(applied, "the incoming record reached the active store");
    Assert.equal(applied.name, "Remote Only", "with its fields intact");
    Assert.equal(
      applied["street-address"],
      "2 Remote Ave",
      "including the ones the engine had to round-trip through the bridge"
    );

    // Up: the local record was uploaded rather than left behind.
    Assert.ok(
      collection.wbo(localGuid),
      "the locally added address was uploaded"
    );
    Assert.equal(
      collection.cleartext(localGuid).entry.name,
      "Local Only",
      "carrying the record the browser saved"
    );

    // Both records are now in the one store, which is the invariant that makes
    // switching the backend safe: nothing is stranded in the other one.
    const all = await formAutofillStorage.addresses.getAll();
    Assert.deepEqual(
      all.map(r => r.name).sort(),
      ["Local Only", "Remote Only"],
      "the active store holds both sides of the sync"
    );
  } finally {
    await engine.finalize();
    await promiseStopServer(server);
  }
});

add_task(async function test_deletions_sync_in_both_directions() {
  // A delete has to travel like any other change. If a local delete does not
  // reach the server, the user's other devices keep the address and re-upload
  // it, so it comes back; if an incoming delete is not applied, the address
  // the user removed elsewhere stays here.
  const engine = new BridgedAddressesEngine(Service);
  await engine.initialize();
  engine.enabled = true;
  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const server = await serverForFoo(engine);
  try {
    await SyncTestingInfrastructure(server);
    const collection = server.user("foo").collection("addresses");

    // Sync it up first: a record the server has never heard of cannot be
    // reported as deleted, so the delete below has to follow a real upload.
    const localGuid = await formAutofillStorage.addresses.add(
      address("Delete Me Locally", "1 Gone Rd")
    );
    await sync_engine_and_validate_telem(engine, false);
    Assert.ok(collection.wbo(localGuid), "the record reached the server");

    // Outgoing: deleting through the active store uploads a tombstone.
    await formAutofillStorage.addresses.remove(localGuid);
    await sync_engine_and_validate_telem(engine, false);
    Assert.equal(
      collection.cleartext(localGuid).deleted,
      true,
      "the local delete was uploaded as a tombstone"
    );

    // Incoming: a tombstone from another device removes the record here.
    // Server timestamps have centisecond precision and each sync sets the next
    // `newer=` bound from them, so a record written in the same tick as the
    // last sync is filtered out. Step them explicitly.
    const remoteGuid = "remote-del-aa";
    collection.insert(
      remoteGuid,
      encryptPayload({
        id: remoteGuid,
        entry: { ...address("Delete Me Remotely", "2 Away Ave"), version: 1 },
      }),
      new_timestamp() + 1
    );
    await sync_engine_and_validate_telem(engine, false);
    Assert.ok(
      await formAutofillStorage.addresses.get(remoteGuid),
      "the remote record arrived"
    );

    collection.insert(
      remoteGuid,
      encryptPayload({ id: remoteGuid, deleted: true }),
      new_timestamp() + 2
    );
    await sync_engine_and_validate_telem(engine, false);
    Assert.equal(
      await formAutofillStorage.addresses.get(remoteGuid),
      null,
      "the incoming tombstone removed it from the active store"
    );
  } finally {
    await engine.finalize();
    await promiseStopServer(server);
  }
});

add_task(async function test_writes_through_rust_schedule_a_sync() {
  // Sync does not poll: the tracker watches formautofill-storage-changed and
  // raises the engine's score, which is what schedules a sync. The engine
  // reuses FormAutofillTracker on the assumption that the Rust adapter fires
  // that notification too. If it does not, sync never triggers on its own --
  // and every other test here would still pass, since they all drive it by hand.
  const engine = new BridgedAddressesEngine(Service);
  await engine.initialize();
  const tracker = engine._tracker;
  tracker.onStart();
  try {
    tracker.resetScore();

    const guid = await formAutofillStorage.addresses.add(
      address("Tracked Add", "1 Tracked Rd")
    );
    Assert.greater(tracker.score, 0, "adding through Rust raises the score");

    tracker.resetScore();
    await formAutofillStorage.addresses.update(guid, {
      ...address("Tracked Update", "1 Tracked Rd"),
    });
    Assert.greater(tracker.score, 0, "so does updating");

    tracker.resetScore();
    await formAutofillStorage.addresses.remove(guid);
    Assert.greater(tracker.score, 0, "so does removing");

    // A record arriving from sync must not raise the score, or applying
    // incoming records would schedule another sync and never settle.
    tracker.resetScore();
    const syncedGuid = await formAutofillStorage.addresses.add(
      address("From Sync", "2 Synced Ave"),
      { sourceSync: true }
    );
    Assert.equal(
      tracker.score,
      0,
      "a write attributed to sync does not schedule another one"
    );

    await formAutofillStorage.addresses.remove(syncedGuid);
  } finally {
    tracker.onStop();
    await engine.finalize();
  }
});

add_task(async function test_concurrent_edits_are_merged_not_lost() {
  // Both sides change the same record between syncs, in different fields. The
  // merge happens inside Rust rather than in FormAutofillStore.reconcile, so
  // none of the JSON store's reconcile coverage says anything about it. Losing
  // either edit here is silent: the user just finds one of their changes gone.
  const engine = new BridgedAddressesEngine(Service);
  await engine.initialize();
  engine.enabled = true;
  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const server = await serverForFoo(engine);
  try {
    await SyncTestingInfrastructure(server);
    const collection = server.user("foo").collection("addresses");

    const guid = await formAutofillStorage.addresses.add({
      name: "Merge Me",
      "street-address": "1 Merge Way",
      "address-level2": "Springfield",
      "address-level1": "IL",
      "postal-code": "62704",
      country: "US",
    });
    await sync_engine_and_validate_telem(engine, false);

    // Local edit: set the organization.
    await formAutofillStorage.addresses.update(
      guid,
      { organization: "Local Org" },
      true // preserveOldProperties
    );

    // Remote edit to a different field of the same record.
    const remote = collection.cleartext(guid);
    collection.insert(
      guid,
      encryptPayload({
        id: guid,
        entry: { ...remote.entry, tel: "+16505551234", version: 1 },
      }),
      new_timestamp() + 1
    );

    await sync_engine_and_validate_telem(engine, false);

    const merged = await formAutofillStorage.addresses.get(guid);
    Assert.equal(
      merged.organization,
      "Local Org",
      "the local edit survived the merge"
    );
    Assert.equal(merged.tel, "+16505551234", "and so did the remote one");
    Assert.equal(
      merged["street-address"],
      "1 Merge Way",
      "with the untouched fields intact"
    );
  } finally {
    await engine.finalize();
    await promiseStopServer(server);
  }
});

add_task(async function test_unknown_fields_survive_a_sync_round_trip() {
  // The migration drops fields the Rust store has no column for, and we let a
  // profile through anyway on the grounds that the sync mirror carries them:
  // the outgoing query re-attaches unknown_fields from the last server payload,
  // as the logins store does with loginsM.enc_unknown_fields. That is a policy
  // decision resting on a mechanism, so the mechanism gets a test -- if it does
  // not hold, tolerating the divergence loses a newer client's data.
  const engine = new BridgedAddressesEngine(Service);
  await engine.initialize();
  engine.enabled = true;
  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const server = await serverForFoo(engine);
  try {
    await SyncTestingInfrastructure(server);
    const collection = server.user("foo").collection("addresses");

    // A record uploaded by a newer client, carrying a field this one does not
    // define. Downloading it is what populates the mirror.
    const guid = "unknownfld12";
    collection.insert(
      guid,
      encryptPayload({
        id: guid,
        entry: {
          ...address("Newer Client", "1 Future Way"),
          "some-future-field": "important value",
          version: 1,
        },
      }),
      new_timestamp()
    );
    await sync_engine_and_validate_telem(engine, false);

    const local = await formAutofillStorage.addresses.get(guid);
    Assert.ok(local, "the record arrived");
    Assert.equal(
      local["some-future-field"],
      undefined,
      "the Rust store has no column for the unknown field, as expected"
    );

    // Change something this client does understand, and push it back.
    await formAutofillStorage.addresses.update(
      guid,
      { organization: "Edited Here" },
      true
    );
    await sync_engine_and_validate_telem(engine, false);

    const uploaded = collection.cleartext(guid);
    Assert.equal(
      uploaded.entry.organization,
      "Edited Here",
      "the local edit reached the server"
    );
    Assert.equal(
      uploaded.entry["some-future-field"],
      "important value",
      "and the unknown field was re-attached from the mirror rather than lost"
    );
  } finally {
    await engine.finalize();
    await promiseStopServer(server);
  }
});

add_task(async function test_the_same_address_on_two_devices_is_deduped() {
  // Two devices independently save the same address, so it exists under two
  // guids. Sync has to collapse them, or the user ends up with a duplicate that
  // reappears on every device and never goes away. The JSON store does this in
  // FormAutofillStore.applyIncoming via findDuplicateGUID; the Rust engine does
  // it inside Rust, so that coverage does not carry over.
  const engine = new BridgedAddressesEngine(Service);
  await engine.initialize();
  engine.enabled = true;
  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const server = await serverForFoo(engine);
  try {
    await SyncTestingInfrastructure(server);
    const collection = server.user("foo").collection("addresses");

    const shared = {
      name: "Same Person",
      organization: "Same Org",
      "street-address": "1 Same Street",
      "address-level2": "Springfield",
      "address-level1": "IL",
      "postal-code": "62704",
      country: "US",
    };

    // Saved here, never synced.
    const localGuid = await formAutofillStorage.addresses.add({ ...shared });
    // The same address, saved on another device and already uploaded.
    const remoteGuid = "dupedaddr123";
    collection.insert(
      remoteGuid,
      encryptPayload({ id: remoteGuid, entry: { ...shared, version: 1 } }),
      new_timestamp()
    );

    await sync_engine_and_validate_telem(engine, false);

    const all = await formAutofillStorage.addresses.getAll();
    const matching = all.filter(r => r["street-address"] === "1 Same Street");
    Assert.equal(
      matching.length,
      1,
      `the two copies collapsed into one (got ${matching.length}: ` +
        `${matching.map(r => r.guid).join(", ")})`
    );
    Assert.equal(
      matching[0].guid,
      remoteGuid,
      "under the guid the server already knows, so other devices agree"
    );
    Assert.equal(
      await formAutofillStorage.addresses.get(localGuid),
      null,
      "and the local-only guid is gone"
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
  // an announcement a profile that gets its addresses from sync is offered no
  // autofill until the next restart.
  const engine = new BridgedAddressesEngine(Service);
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

    const collection = server.user("foo").collection("addresses");
    collection.insert(
      "announce-aaaa",
      encryptPayload({
        id: "announce-aaaa",
        entry: { ...address("Announced", "3 Notify St"), version: 1 },
      }),
      new_timestamp()
    );

    seen.length = 0;
    await sync_engine_and_validate_telem(engine, false);

    Assert.ok(
      await formAutofillStorage.addresses.get("announce-aaaa"),
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

add_task(async function test_first_sync_after_migrating_a_synced_profile() {
  // The handoff every already-syncing profile makes exactly once.
  //
  // The migration copies each record's guid, timestamps and change counter, so
  // a record that had been synced arrives in Rust clean (counter 0). What it
  // does not copy is the sync state: the Rust mirror is empty and the engine
  // has no syncId, so the first sync downloads the whole collection and meets
  // local records it has no mirror entry for. Reconciling those by guid rather
  // than treating them as new is what keeps the server from growing a duplicate
  // of every address the profile already had.
  const engine = new BridgedAddressesEngine(Service);
  await engine.initialize();
  engine.enabled = true;

  await resetBetweenTasks(engine);
  await engine.resetLocalSyncID();

  const server = await serverForFoo(engine);
  try {
    await SyncTestingInfrastructure(server);

    // A record the profile synced before it migrated: same guid on both sides,
    // and locally clean because the counter came across as 0.
    const guid = "carried-over1";
    const record = address("Carried Over", "4 Handoff Way");
    const rust = await RustAutofillAddressesAdapter.getInstance();
    const [imported] = await rust.addManyWithMeta([
      {
        ...record,
        guid,
        version: 1,
        timeCreated: 1,
        timeLastModified: 1,
        timesUsed: 0,
        _sync: { changeCounter: 0 },
      },
    ]);
    Assert.ok(imported.guid, "the synced record was carried across");

    const collection = server.user("foo").collection("addresses");
    collection.insert(
      guid,
      encryptPayload({ id: guid, entry: { ...record, version: 1 } }),
      new_timestamp()
    );

    // Asserted on this record rather than on the collection size: other tasks
    // in this file leave records of their own behind.
    const modifiedBefore = collection.wbo(guid).modified;
    await sync_engine_and_validate_telem(engine, false);

    Assert.equal(
      collection.wbo(guid).modified,
      modifiedBefore,
      "the carried-over record was not re-uploaded: it arrived clean, and the " +
        "empty mirror must not make the engine treat it as a local addition"
    );
    const carried = (await formAutofillStorage.addresses.getAll()).filter(
      r => r.name == "Carried Over"
    );
    Assert.equal(
      carried.length,
      1,
      "and there is one local copy, not a fork beside the incoming one"
    );
    Assert.equal(
      carried[0].guid,
      guid,
      "keeping the guid the server knows it by"
    );
  } finally {
    await engine.finalize();
    await promiseStopServer(server);
  }
});
