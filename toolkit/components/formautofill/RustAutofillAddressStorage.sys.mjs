/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Rust-backed address storage adapter.
 *
 * Wraps the vendored application-services autofill `Store` (via the generated
 * UniFFI bindings) and presents the subset of the `AutofillRecords` interface
 * that desktop address consumers use, so it can back
 * `FormAutofillStorage.getAddresses()`.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ADDRESS_SCHEMA_VERSION: "resource://autofill/FormAutofillStorageBase.sys.mjs",
  RustAutofillStore: "resource://autofill/RustAutofillStore.sys.mjs",
  VALID_ADDRESS_FIELDS: "resource://autofill/FormAutofillStorageBase.sys.mjs",
  AddressBulkResultEntry:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  AddressBulkTombstoneResultEntry:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  AddressMeta:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  AddressRecord: "resource://gre/modules/shared/AddressRecord.sys.mjs",
  AddressTombstone:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  AutofillDataTypes: "resource://gre/modules/shared/AutofillDataTypes.sys.mjs",
  AutofillTelemetry: "resource://gre/modules/shared/AutofillTelemetry.sys.mjs",
  NoSuchRecord:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  UpdatableAddressFields:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  UpdatableAddressFieldsWithMeta:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
});

const logger = console.createInstance({
  prefix: "RustAutofillAddressStorage",
  maxLogLevelPref: "extensions.formautofill.loglevel",
});

const INTERNAL_FIELDS = new Set([
  "guid",
  "version",
  "timeCreated",
  "timeLastUsed",
  "timeLastModified",
  "timesUsed",
]);

// Canonical (stored) address fields: JS hyphenated key <-> Rust camelCase field.
const JS_TO_RUST_FIELD = {
  name: "name",
  organization: "organization",
  "street-address": "streetAddress",
  "address-level3": "addressLevel3",
  "address-level2": "addressLevel2",
  "address-level1": "addressLevel1",
  "postal-code": "postalCode",
  country: "country",
  tel: "tel",
  email: "email",
};

const storedFields = new Set([
  ...Object.keys(JS_TO_RUST_FIELD),
  ...INTERNAL_FIELDS,
]);

/**
 * Whether this store keeps a column for a field, as opposed to deriving it on
 * read or not recognising it at all.
 *
 * Used when comparing a record here against the same record in the JSON store,
 * to decide whether a difference means the copy is unfaithful. Only a stored
 * field can answer that. The copy carries the canonical fields and metadata and
 * nothing else, so those are the only ones a failed copy can corrupt.
 *
 * A derived field -- country-name, address-line*, the name, street and tel
 * components -- is deliberately excluded even though this store understands it.
 * The JSON store persists those at write time and hands back what it wrote,
 * while this one recomputes them on every read, so the two disagree whenever
 * the derivation has since changed. The common case is the app locale: a
 * profile that saved "US" addresses under en-US holds country-name "United
 * States", and the same records read here in a de build derive "Vereinigte
 * Staaten". Nothing was lost in the copy, but counting that as unfaithful
 * refused the migration and, because the generation had still been recorded,
 * refused it permanently.
 *
 * A migration does not compare them at all, for the same reason: the copy never
 * carried them.
 *
 * @param {string} field
 * @returns {boolean}
 */
export function isStoredAddressField(field) {
  return storedFields.has(field);
}

/**
 * Convert a JS address record (hyphenated keys) to the Rust
 * `UpdatableAddressFields`. All Rust fields are non-optional strings, so absent
 * values become "".
 */
function jsRecordToUpdatableAddressFields(record) {
  const fields = {};
  for (const [jsKey, rustKey] of Object.entries(JS_TO_RUST_FIELD)) {
    fields[rustKey] = record[jsKey] ?? "";
  }
  return new lazy.UpdatableAddressFields(fields);
}

/**
 * Convert a Rust `Address` to a JS address record: canonical fields, metadata,
 * schema version and computed fields.
 */
function addressToJsRecord(address) {
  const record = { guid: address.guid, version: lazy.ADDRESS_SCHEMA_VERSION };

  for (const [jsKey, rustKey] of Object.entries(JS_TO_RUST_FIELD)) {
    const value = address[rustKey];
    if (value !== undefined && value !== "") {
      record[jsKey] = value;
    }
  }

  record.timeCreated = address.timeCreated;
  record.timeLastUsed = address.timeLastUsed ?? 0;
  record.timeLastModified = address.timeLastModified;
  record.timesUsed = address.timesUsed;

  // Only the canonical fields are stored; the computed ones (country-name,
  // address-line*, *-name, tel-*) are derived on read.
  lazy.AddressRecord.computeFields(record);

  // computeFields leaves an empty placeholder for each field it could not
  // derive. A record handed to a consumer carries no empty or hidden keys.
  for (const key of Object.keys(record)) {
    if (key.startsWith("_") || record[key] === "") {
      delete record[key];
    }
  }

  return record;
}

/**
 * Adapter presenting the AutofillRecords address interface over the Rust Store.
 */
export class RustAutofillAddressesAdapter {
  // The profile's adapter. There is one autofill.db per profile, so there is one
  // of these; callers retrieve it rather than being handed one. Underscore-named
  // so a test can reset it, as RustAutofillStore._instance is.
  static _instance = null;

  /**
   * The profile's adapter, built without waiting for the store to open.
   *
   * @returns {RustAutofillAddressesAdapter}
   */
  static getInstance() {
    return (RustAutofillAddressesAdapter._instance ??=
      new RustAutofillAddressesAdapter(
        new lazy.RustAutofillStore().ensureOpen()
      ));
  }

  // Resolves to the Application Services autofill store. Held unresolved, as
  // Passports does: the store opens asynchronously but getAddresses() is
  // synchronous, so awaiting per operation is what lets a caller be handed the
  // collection before the database is ready.
  //
  // It also decides what a database that will not open looks like. Every
  // operation rejects, rather than the adapter being absent and the JSON store
  // quietly taking over -- that snapshot froze when Rust took over, and letting
  // the user edit it would strand those edits the next time the store opens.
  // Its lifecycle and shutdown blocker are owned by RustAutofillStore.
  #storePromise;
  #collectionName;
  // How many records the store holds, so isEmpty() can answer without awaiting.
  // Null until primed. See isEmpty().
  #count = null;

  /**
   * @param {Promise<Store>} storePromise The Application Services autofill
   *   store, still opening. RustAutofillStore owns the single per-profile
   *   autofill.db connection; a test may pass its own.
   */
  constructor(storePromise) {
    this.#storePromise = storePromise;
    this.#collectionName = lazy.AutofillDataTypes.get(
      lazy.AutofillDataTypes.ADDRESS
    ).collectionName;
  }

  #store() {
    return this.#storePromise;
  }

  /**
   * Fire storage-changed and refresh the saved-profile count.
   *
   * AutofillRecords.observe() handles the same topic and records the count from
   * the JSON collection, which holds nothing while this store is the active one.
   * Reading the count before notifying and recording it synchronously afterwards
   * leaves this value as the one that stands.
   *
   * @param {string} guid
   * @param {boolean} sourceSync
   * @param {string} action
   * @param {object} [options]
   * @param {boolean} [options.countChanged=true] Whether the operation can have
   *   changed how many records the store holds. update() and notifyUsed() cannot,
   *   so they answer from the cached count rather than paying a round-trip for a
   *   number that has not moved. The count is still recorded either way: the JSON
   *   collection observes these events too and records its own zero, and this is
   *   what has to land after it.
   */
  async #notifyAndRecordCount(
    guid,
    sourceSync,
    action,
    { countChanged = true } = {}
  ) {
    if (countChanged || this.#count === null) {
      await this.refreshCount();
    }
    this.#notify(guid, sourceSync, action);
    lazy.AutofillTelemetry.recordAutofillProfileCount(
      lazy.AutofillDataTypes.ADDRESS,
      this.#count
    );
  }

  /**
   * Get the collection ready to be read from, the same contract the JSON
   * collection answers: FormAutofillStorageBase.initialize() calls this on
   * whichever store getAddresses() hands back.
   *
   * Priming the count is all it takes here -- isEmpty() is synchronous and
   * answers from it.
   *
   * Does not throw. It runs inside the storage's memoized initialize(), which
   * FormAutofillParent starts and does not catch, so a rejection would be
   * handed to every later caller -- credit cards and passports included -- for
   * the life of the process. A store that will not open reports itself on the
   * first read instead.
   */
  async initialize() {
    try {
      await this.refreshCount();
    } catch (e) {
      logger.error("Could not read the Rust address store", e);
    }
  }

  /**
   * Read the record count from the store and remember it, so that the
   * synchronous isEmpty() has an answer.
   *
   * Called on initialize() and on every write that notifies, and by the caller
   * of a bulk write -- wipe() and addMany*() -- which do not notify.
   */
  async refreshCount() {
    this.#count = await (await this.#store()).countAllAddresses();
    return this.#count;
  }

  #notify(guid, sourceSync, action) {
    Services.obs.notifyObservers(
      {
        wrappedJSObject: {
          sourceSync,
          guid,
          collectionName: this.#collectionName,
        },
      },
      "formautofill-storage-changed",
      action
    );
  }

  // ---- CRUD / UI --------------------------------------------------------

  /**
   * Add a new record and return the guid the store assigns it.
   *
   * Replicating a record that already has an identity is addManyWithMeta's
   * job.
   */
  async add(record, { sourceSync = false, action = "add" } = {}) {
    const normalized = this.#normalize(structuredClone(record));
    const address = await (
      await this.#store()
    ).addAddress(jsRecordToUpdatableAddressFields(normalized));
    await this.#notifyAndRecordCount(address.guid, sourceSync, action);
    return address.guid;
  }

  /**
   * Bring a record to its canonical form and reject one that cannot be stored.
   * Mirrors AutofillRecords._normalizeRecord: the canonical fields are
   * normalised, unknown fields are left alone to round-trip, and metadata may
   * not be set through this path.
   *
   * @param {object} record The record, normalised in place.
   * @param {boolean} [preserveEmptyFields=false] Keep a field whose value is the
   *   empty string instead of dropping it. update() passes true, because there
   *   an empty value means "clear this field" and has to survive as far as the
   *   merge; on a new record the same empty value only means the field was never
   *   supplied, and storing it would be noise.
   * @returns {object} The same record.
   */
  _normalizeRecord(record, preserveEmptyFields = false) {
    return this.#normalize(record, preserveEmptyFields);
  }

  /**
   * Fill in the fields derived from the canonical ones, in place.
   *
   * Callers that build a record from a form rather than reading one from here
   * -- FormAutofillParent, deciding whether a submitted address is worth a
   * doorhanger -- normalise and compute it themselves before comparing it
   * against what is stored, so both entry points have to exist on whichever
   * store is active.
   *
   * @param {object} record
   */
  async computeFields(record) {
    if (!record.deleted) {
      lazy.AddressRecord.computeFields(record);
    }
  }

  #normalize(record, preserveEmptyFields = false) {
    lazy.AddressRecord.normalizeFields(record);
    for (const key of Object.keys(record)) {
      if (!lazy.VALID_ADDRESS_FIELDS.includes(key)) {
        if (INTERNAL_FIELDS.has(key)) {
          throw new Error(`"${key}" is not a valid field.`);
        }
        continue;
      }
      if (typeof record[key] !== "string" && typeof record[key] !== "number") {
        throw new Error(
          `"${key}" contains invalid data type: ${typeof record[key]}`
        );
      }
      if (!preserveEmptyFields && record[key] === "") {
        delete record[key];
      }
    }
    const keys = Object.keys(record);
    // normalizeFields always leaves a country behind, falling back to the
    // app's default region when the record named none, so a record holding
    // nothing but a country is an empty record rather than a country-only one.
    // Same rule, for the same reason, as AutofillRecords._normalizeRecord.
    if (!keys.length || (keys.length == 1 && keys[0] == "country")) {
      throw new Error("Record contains no valid field.");
    }
    return record;
  }

  /**
   * Bulk-import records exactly as given, keeping the guid, timestamps and
   * change counter each arrives with, in a single Rust transaction. Returns a
   * per-record `{ guid }` or `{ error }`, so one bad record does not abort the
   * batch. Emits no observer events.
   *
   * This is how the migration copies records the JSON store created and still
   * identifies. Both stores have to hold a record under the same guid, or they
   * hold two unrelated datasets and no record in one can be compared against,
   * or updated from, its counterpart in the other.
   */
  async addManyWithMeta(records) {
    const entries = records.map(record =>
      this.#updatableFieldsWithMeta(record)
    );
    const results = await (
      await this.#store()
    ).addManyAddressesWithMeta(entries);
    return results.map(result =>
      result instanceof lazy.AddressBulkResultEntry.Error
        ? { error: result.message }
        : { guid: result.address.guid }
    );
  }

  /**
   * Bulk-import tombstones for records deleted locally but not yet uploaded, in
   * a single Rust transaction. Same per-record result shape as addManyWithMeta.
   * A profile without them re-uploads the records it has already deleted.
   *
   * @param {Array<{guid: string, timeDeleted: number}>} tombstones
   */
  async addManyTombstones(tombstones) {
    const results = await (
      await this.#store()
    ).addManyAddressTombstones(
      tombstones.map(
        t =>
          new lazy.AddressTombstone({
            guid: t.guid,
            timeDeleted: t.timeDeleted,
          })
      )
    );
    return results.map(result =>
      result instanceof lazy.AddressBulkTombstoneResultEntry.Error
        ? { error: result.message }
        : { guid: result.guid }
    );
  }

  /**
   * Bulk-replace stored records with the ones handed in, one at a time. Same
   * per-record result shape as addManyWithMeta, and silent in the same way: no
   * notification and no count refresh.
   *
   * The metadata is replaced rather than merged: timestamps, use count and
   * sync change counter all come from the record handed in, where update()
   * leaves all of them to the store.
   *
   * A guid this store does not hold reports an error rather than being
   * inserted.
   *
   * @param {Array<object>} records
   * @returns {Promise<Array<{guid: string}|{error: string}>>}
   */
  async updateManyWithMeta(records) {
    const store = await this.#store();
    const results = [];
    for (const record of records) {
      try {
        await store.updateAddressWithMeta(
          this.#updatableFieldsWithMeta(record)
        );
        results.push({ guid: record.guid });
      } catch (e) {
        results.push({ error: String(e?.message ?? e) });
      }
    }
    return results;
  }

  /**
   * Delete records by guid, one at a time, without announcing them. Leaves a
   * tombstone for each guid the server knows about, as remove() does.
   *
   * @param {Array<string>} guids
   * @returns {Promise<Array<{guid: string}|{error: string}>>}
   */
  async removeMany(guids) {
    const store = await this.#store();
    const results = [];
    for (const guid of guids) {
      try {
        await store.deleteAddress(guid);
        results.push({ guid });
      } catch (e) {
        results.push({ error: String(e?.message ?? e) });
      }
    }
    return results;
  }

  // For the migration only. The metadata is taken from the record as given
  // rather than advanced, so unlike a user's edit this neither refreshes
  // timeLastModified nor increments the sync change counter.
  #updatableFieldsWithMeta(record) {
    return new lazy.UpdatableAddressFieldsWithMeta({
      fields: jsRecordToUpdatableAddressFields(record),
      meta: new lazy.AddressMeta({
        guid: record.guid,
        timeCreated: record.timeCreated ?? 0,
        timeLastUsed: record.timeLastUsed || null,
        timeLastModified: record.timeLastModified ?? record.timeCreated ?? 0,
        timesUsed: record.timesUsed ?? 0,
        // A record with no `_sync` metadata has never been synced, which counts
        // as one change pending upload rather than none.
        syncChangeCounter: record._sync?.changeCounter ?? 1,
      }),
    });
  }

  /**
   * Apply `record`'s fields to the stored record `guid`. The store keeps the
   * guid and the metadata, refreshes timeLastModified, and counts the edit as a
   * change pending upload.
   *
   * With `preserveOldProperties`, a field the caller omits keeps its stored
   * value; without it, an omitted or empty field is cleared. Mirrors
   * AutofillRecords.update().
   */
  async update(
    guid,
    record,
    preserveOldProperties = false,
    { sourceSync = false, action = "update" } = {}
  ) {
    const stored = await this.get(guid);
    if (!stored) {
      // The same error the store would raise for the write below, so a missing
      // record groups under one code however it was detected.
      throw new lazy.NoSuchRecord(guid);
    }
    // The computed fields are derived on read, so drop them before merging and
    // let them be recomputed from whatever the merge produces.
    const merged = { guid, version: stored.version };
    const incoming = this.#normalize(structuredClone(record), true);

    let hasValidField = false;
    for (const field of lazy.VALID_ADDRESS_FIELDS) {
      let value = incoming[field];
      if (preserveOldProperties && value === undefined) {
        value = stored[field];
      }
      if (value !== undefined && value !== "") {
        hasValidField = true;
        merged[field] = value;
      }
    }
    if (!hasValidField) {
      throw new Error("Record contains no valid field.");
    }

    // The content columns only. updateAddress leaves the metadata alone,
    // refreshes time_last_modified and increments the change counter, which is
    // what an edit means; the with-meta call would replace that counter with a
    // value this side cannot read.
    await (
      await this.#store()
    ).updateAddress(guid, jsRecordToUpdatableAddressFields(merged));
    await this.#notifyAndRecordCount(guid, sourceSync, action, {
      countChanged: false,
    });
  }

  /**
   * @returns {Promise<boolean>} Whether a record was deleted. False means the
   *   guid was not present.
   */
  async remove(guid, { sourceSync = false, action = "remove" } = {}) {
    const removed = await (await this.#store()).deleteAddress(guid);
    // Nothing changed, so nothing to announce. The JSON collection returns
    // without notifying for a guid it does not hold, and an event here would
    // put every observer -- including the saved-field-names recompute -- to
    // work over a store that has not moved.
    if (!removed) {
      logger.warn("attempting to remove non-existing entry", guid);
      return false;
    }
    await this.#notifyAndRecordCount(guid, sourceSync, action);
    return removed;
  }

  /**
   * Remove every address, one at a time, leaving a tombstone for each so the
   * deletions reach the server. This is the user asking for their addresses to
   * be deleted; wipe() is the one that discards that bookkeeping.
   */
  async removeAll({ sourceSync = false, action = "removeAll" } = {}) {
    const store = await this.#store();
    for (const address of await store.getAllAddresses()) {
      await store.deleteAddress(address.guid);
    }
    await this.#notifyAndRecordCount(null, sourceSync, action);
  }

  /**
   * Drop every address and every tombstone, silently, so the collection can be
   * rebuilt from scratch. Temporary, and goes away with the JSON store.
   *
   * The tombstones have to go too. Deleting a record sync knows about leaves one
   * behind, and the store refuses to insert a guid it holds a tombstone for, so
   * a wipe that kept them could only ever run once.
   */
  async wipe() {
    await (await this.#store()).deleteAllAddresses();
  }

  async get(guid) {
    let address;
    try {
      address = await (await this.#store()).getAddress(guid);
    } catch (e) {
      // Only a missing record is an answer; anything else is a failure to read,
      // and must not be reported as one. A locked or corrupt database returned
      // as "no such record" opens the edit dialog blank, as though the caller
      // were creating a new address, and saving that writes a second record on
      // top of the one that could not be read. It also has update() raise
      // NoSuchRecord for what was really a SQL error, so the migration
      // attributes the failure to the wrong error_code.
      if (e instanceof lazy.NoSuchRecord) {
        return null;
      }
      throw e;
    }
    return address && addressToJsRecord(address);
  }

  async getAll() {
    const addresses = await (await this.#store()).getAllAddresses();
    return addresses.map(addressToJsRecord);
  }

  async notifyUsed(guid, { sourceSync = false, action = "notifyUsed" } = {}) {
    // touch_address is a bare UPDATE ... WHERE guid, so it reports nothing back
    // for a guid the store does not hold and cannot be used to detect one. Read
    // first, matching the JSON collection, which returns without notifying when
    // the record has been deleted since it was filled.
    if (!(await this.get(guid))) {
      logger.debug("Cannot notify. No record found with guid:", guid);
      return;
    }
    // touchAddress bumps the change counter as well as the use count, where the
    // JSON collection leaves it alone: filling a form queues the record for
    // upload at the next sync. Nothing here can separate the two -- they are one
    // statement in the store.
    await (await this.#store()).touchAddress(guid);
    await this.#notifyAndRecordCount(guid, sourceSync, action, {
      countChanged: false,
    });
  }

  /**
   * Synchronous, matching the JSON collection: callers render from it without
   * awaiting -- FormAutofillPrompter.renderDescription() is called from a
   * synchronous render() -- and a promise there would read as "always
   * non-empty". Answers from the count refreshCount() and every notified write
   * maintain, and reports empty until something primes it.
   *
   * @returns {boolean}
   */
  isEmpty() {
    return (this.#count ?? 0) === 0;
  }

  async getSavedFieldNames() {
    // Every non-empty field that is not internal metadata, computed fields
    // included: autofill decides which form fields it can offer from this set.
    const fieldNames = new Set();
    for (const record of await this.getAll()) {
      for (const [key, value] of Object.entries(record)) {
        if (value && !INTERNAL_FIELDS.has(key)) {
          fieldNames.add(key);
        }
      }
    }
    return fieldNames;
  }

  /**
   * The store's bridged sync engine, driven through mozIBridgedSyncEngine.
   *
   * This is how the Rust store syncs: change detection and reconciliation
   * happen inside Rust, so none of the per-record sync methods on the JSON
   * collection have a counterpart here. Nothing selects it yet.
   *
   * @returns {Promise<AddressesBridgedEngine>}
   */
  async bridgedEngine() {
    return (await this.#store()).addressesBridgedEngine();
  }
}
