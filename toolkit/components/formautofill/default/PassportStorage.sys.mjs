/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Storage of Form Autofill passport records.
 *
 * Unlike addresses and credit cards (kept in autofill-profiles.json), passports
 * are persisted in the Application Services `autofill` SQLite store. This module
 * adapts that store to the same collection API the JSON-backed collections
 * expose (`AutofillRecords` in FormAutofillStorageBase.sys.mjs), so callers use
 * `gFormAutofillStorage.passports` without knowing the backend.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AutofillDataTypes: "resource://gre/modules/shared/AutofillDataTypes.sys.mjs",
  NoSuchRecord:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  PassportRecord: "resource://gre/modules/shared/PassportRecord.sys.mjs",
  UpdatablePassportFields:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
});

// The collection name this store backs, from the data-type registry.
ChromeUtils.defineLazyGetter(
  lazy,
  "collectionName",
  () =>
    lazy.AutofillDataTypes.get(lazy.AutofillDataTypes.PASSPORT).collectionName
);

// The essential passport fields persisted on the Application Services
// `Passport`/`UpdatablePassportFields` struct. Any other fields a record
// carries (the split name parts and combined dates) are computed by
// PassportRecord and never stored.
export const VALID_PASSPORT_FIELDS = [
  "passport-name",
  "passport-country",
  "passport-number",
  "passport-issue-date-month",
  "passport-issue-date-day",
  "passport-issue-date-year",
  "passport-expiry-date-month",
  "passport-expiry-date-day",
  "passport-expiry-date-year",
];

/**
 * Convert a Form Autofill record into the `UpdatablePassportFields` the AS store
 * expects. Every field is required on the Rust side, so missing values fall back
 * to an empty string / 0.
 *
 * The record is normalized first so a combined `passport-{issue,expiry}-date`
 * field is collapsed into the month/day/year components the store persists.
 *
 * @param {object} record A Form Autofill passport record.
 * @returns {UpdatablePassportFields}
 */
function recordToUpdatablePassportFields(record) {
  // Work on a clone so normalization doesn't mutate the caller's object.
  record = { ...record };
  lazy.PassportRecord.normalizeFields(record);

  // Every field is required on the Rust side, so a missing string falls back to
  // "" and a missing date component to 0.
  return new lazy.UpdatablePassportFields({
    name: record["passport-name"] ?? "",
    country: record["passport-country"] ?? "",
    passportNumber: record["passport-number"] ?? "",
    issueDateMonth: Number(record["passport-issue-date-month"] ?? 0),
    issueDateDay: Number(record["passport-issue-date-day"] ?? 0),
    issueDateYear: Number(record["passport-issue-date-year"] ?? 0),
    expiryDateMonth: Number(record["passport-expiry-date-month"] ?? 0),
    expiryDateDay: Number(record["passport-expiry-date-day"] ?? 0),
    expiryDateYear: Number(record["passport-expiry-date-year"] ?? 0),
  });
}

/**
 * Convert a `Passport` returned by the AS store into a Form Autofill record.
 *
 * @param {Passport} passport
 * @returns {object}
 */
function passportToRecord(passport) {
  // The AS store keeps date components as integers (0 means unset), but Form
  // Autofill records use strings, so callers can compare and fill uniformly
  // with the other autofill types. Map 0 back to "".
  const dateComponent = value => (value ? String(value) : "");
  const record = {
    guid: passport.guid,
    "passport-name": passport.name,
    "passport-country": passport.country,
    "passport-number": passport.passportNumber,
    "passport-issue-date-month": dateComponent(passport.issueDateMonth),
    "passport-issue-date-day": dateComponent(passport.issueDateDay),
    "passport-issue-date-year": dateComponent(passport.issueDateYear),
    "passport-expiry-date-month": dateComponent(passport.expiryDateMonth),
    "passport-expiry-date-day": dateComponent(passport.expiryDateDay),
    "passport-expiry-date-year": dateComponent(passport.expiryDateYear),
    // The AS metadata already follows the Form Autofill naming convention.
    timeCreated: passport.timeCreated,
    timeLastUsed: passport.timeLastUsed,
    timeLastModified: passport.timeLastModified,
    timesUsed: passport.timesUsed,
  };
  // Derive the combined date fields so callers filling a single date input have
  // them available.
  lazy.PassportRecord.computeFields(record);
  return record;
}

/**
 * Passport collection backed by the Application Services `autofill` store.
 * Mirrors the public API of `AutofillRecords` for the operations passport
 * storage needs.
 */
export class Passports {
  /** @type {Promise<Store>} */
  #storePromise;

  /**
   * @param {Promise<Store>} rustStore The shared Application Services `autofill`
   *   store, owned by FormAutofillStorageBase#rustStore and opened off the main
   *   thread. The AS store is local-only and keeps passports in plaintext, so no
   *   encryption key or further setup is required here.
   */
  constructor(rustStore) {
    this.#storePromise = rustStore;
  }

  /**
   * @returns {Promise<Store>} The shared, already-opening AS autofill store.
   */
  #ensureStore() {
    return this.#storePromise;
  }

  /**
   * Open the store eagerly. Provided for parity with the JSON-backed
   * collections; callers may also just use the collection directly.
   *
   * @returns {Promise}
   */
  async initialize() {
    await this.#ensureStore();
  }

  async add(record) {
    const store = await this.#ensureStore();
    const passport = await store.addPassport(
      recordToUpdatablePassportFields(record)
    );
    Services.obs.notifyObservers(
      {
        wrappedJSObject: {
          guid: passport.guid,
          collectionName: lazy.collectionName,
        },
      },
      "formautofill-storage-changed",
      "add"
    );
    return passport.guid;
  }

  async update(guid, record, preserveOldProperties = false) {
    // The AS store's UPDATE silently matches no rows for an unknown guid; throw
    // here so callers see the same error as the JSON-backed collections.
    const existing = await this.get(guid);
    if (!existing) {
      throw new Error("No matching record.");
    }
    const merged = preserveOldProperties ? { ...existing, ...record } : record;
    const store = await this.#ensureStore();
    await store.updatePassport(guid, recordToUpdatablePassportFields(merged));
    Services.obs.notifyObservers(
      {
        wrappedJSObject: {
          guid,
          collectionName: lazy.collectionName,
        },
      },
      "formautofill-storage-changed",
      "update"
    );
  }

  async get(guid) {
    try {
      const store = await this.#ensureStore();
      return passportToRecord(await store.getPassport(guid));
    } catch (e) {
      if (e instanceof lazy.NoSuchRecord) {
        return null;
      }
      throw e;
    }
  }

  async getAll() {
    const store = await this.#ensureStore();
    const passports = await store.getAllPassports();
    return passports.map(passportToRecord);
  }

  /**
   * Yield stored passports that are duplicates of `record`. The Application
   * Services store has no unique key beyond the passport number, so a record is
   * treated as a duplicate when it shares that number.
   *
   * @param {object} record A Form Autofill passport record.
   * @yields {object} Each stored record sharing the passport number.
   */
  async *getDuplicateRecords(record) {
    const number = record["passport-number"]?.toLowerCase();
    if (!number) {
      return;
    }
    for (const existing of await this.getAll()) {
      if (existing["passport-number"]?.toLowerCase() == number) {
        yield existing;
      }
    }
  }

  /**
   * Yield stored passports that match `record`. The Application Services store
   * exposes no richer match semantics than the passport-number dedupe, so this
   * mirrors `getDuplicateRecords`.
   *
   * @param {object} record A Form Autofill passport record.
   * @yields {object} Each matching stored record.
   */
  async *getMatchRecords(record) {
    yield* this.getDuplicateRecords(record);
  }

  async notifyUsed(guid) {
    const store = await this.#ensureStore();
    await store.touchPassport(guid);
    Services.obs.notifyObservers(
      {
        wrappedJSObject: {
          guid,
          collectionName: lazy.collectionName,
        },
      },
      "formautofill-storage-changed",
      "notifyUsed"
    );
  }

  async remove(guid) {
    const store = await this.#ensureStore();
    await store.deletePassport(guid);
    Services.obs.notifyObservers(
      {
        wrappedJSObject: {
          guid,
          collectionName: lazy.collectionName,
        },
      },
      "formautofill-storage-changed",
      "remove"
    );
  }

  async isEmpty() {
    const store = await this.#ensureStore();
    return (await store.countAllPassports()) == 0;
  }

  async getSavedFieldNames() {
    const records = await this.getAll();
    const fieldNames = new Set();
    for (const record of records) {
      for (const fieldName of VALID_PASSPORT_FIELDS) {
        if (record[fieldName]) {
          fieldNames.add(fieldName);
        }
      }
    }
    return fieldNames;
  }

  async removeAll() {
    const store = await this.#ensureStore();
    const passports = await store.getAllPassports();
    for (const { guid } of passports) {
      await store.deletePassport(guid);
    }
    Services.obs.notifyObservers(
      {
        wrappedJSObject: {
          collectionName: lazy.collectionName,
        },
      },
      "formautofill-storage-changed",
      "removeAll"
    );
  }
}
