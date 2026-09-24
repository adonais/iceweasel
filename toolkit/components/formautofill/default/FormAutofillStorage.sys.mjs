/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Implements an interface of the storage of Form Autofill.
 */

// We expose a singleton from this module. Some tests may import the
// constructor via the system global.
import {
  AddressesBase,
  CreditCardsBase,
  FormAutofillStorageBase,
} from "resource://autofill/FormAutofillStorageBase.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AutofillDataTypes: "resource://gre/modules/shared/AutofillDataTypes.sys.mjs",
  CreditCard: "resource://gre/modules/CreditCard.sys.mjs",
  AddressStorageMigrator: "resource://autofill/AddressStorageMigrator.sys.mjs",
  JSONFile: "resource://gre/modules/JSONFile.sys.mjs",
  OSKeyStore: "resource://gre/modules/OSKeyStore.sys.mjs",
  Passports: "resource://autofill/PassportStorage.sys.mjs",
  RustAutofillAddressesAdapter:
    "resource://autofill/RustAutofillAddressStorage.sys.mjs",
  RustAutofillStore: "resource://autofill/RustAutofillStore.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "logger", () =>
  console.createInstance({
    prefix: "FormAutofillStorage",
    maxLogLevelPref: "extensions.formautofill.loglevel",
  })
);

const PROFILE_JSON_FILE_NAME = "autofill-profiles.json";

// Intent: which store should serve addresses. Read at startup and watched
// afterwards, so flipping it copies the addresses over to the other store and
// serves them from there.
const ADDRESS_RUST_ENABLED_PREF =
  "extensions.formautofill.addresses.storage.rust.enabled";

// State, not intent: whether the Rust store is the one serving addresses.
// Managed by Firefox rather than by the user -- the pref above only asks, and a
// profile whose copy has not completed keeps reading from where its addresses
// are. Sync reads it to pick between the two engines.
const ADDRESS_RUST_ACTIVE_PREF =
  "extensions.formautofill.addresses.storage.rust.active";

// Dry-run the migration for telemetry while enabled is still false: the copy is
// verified, reported and then wiped.
const ADDRESS_RUST_MIGRATION_TEST_PREF =
  "extensions.formautofill.addresses.storage.rust.runMigrationTest";

// Observed rather than read once: the migration sets this mid-session, and a
// snapshot taken before that would keep handing back the JSON collection until
// the next restart.
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "addressRustActive",
  ADDRESS_RUST_ACTIVE_PREF,
  false
);

class Addresses extends AddressesBase {
  /**
   * The write half of the migration contract. Each of these writes `_data`
   * directly, so a record keeps the guid, timestamps and sync metadata it was
   * handed, and none of them notifies or announces anything.
   *
   * The derived fields are stripped and recomputed, as _saveRecord() does,
   * since a record read out of a store that computes them on read arrives with
   * them already set and this store persists what it is given.
   */
  /**
   * @param {Array<object>} records
   * @returns {Promise<Array<{guid: string}|{error: string}>>} One entry per
   *   record, in order.
   */
  async addManyWithMeta(records) {
    const results = [];
    for (const record of records) {
      const index = this._findIndexByGUID(record.guid, {
        includeDeleted: true,
      });
      if (index != -1) {
        if (!this._data[index].deleted) {
          results.push({ error: `a record with guid ${record.guid} exists` });
          continue;
        }
        // A tombstone here and a live record in the source means the source
        // has it back, from sync or from the store it was copied to. Unlike a
        // store with a column per field, this one can drop the tombstone and
        // take the record.
        this._data.splice(index, 1);
      }
      this._data.push(await this.#recordForMigration(record));
      results.push({ guid: record.guid });
    }
    this._store.saveSoon();
    return results;
  }

  /**
   * @param {Array<object>} records
   * @returns {Promise<Array<{guid: string}|{error: string}>>}
   */
  async updateManyWithMeta(records) {
    const results = [];
    for (const record of records) {
      const index = this._findIndexByGUID(record.guid);
      if (index == -1) {
        results.push({ error: `no record with guid ${record.guid}` });
        continue;
      }
      this._data[index] = await this.#recordForMigration(record);
      results.push({ guid: record.guid });
    }
    this._store.saveSoon();
    return results;
  }

  /**
   * Delete by guid, through remove() so that the rule about which deletions
   * leave a tombstone stays in one place. The one write here that announces
   * itself, once per record.
   *
   * @param {Array<string>} guids
   * @returns {Promise<Array<{guid: string}|{error: string}>>}
   */
  async removeMany(guids) {
    const results = [];
    for (const guid of guids) {
      if (!this._findByGUID(guid)) {
        results.push({ error: `no record with guid ${guid}` });
        continue;
      }
      this.remove(guid);
      results.push({ guid });
    }
    return results;
  }

  async #recordForMigration(record) {
    // Whatever the record arrives with, including no `_sync` at all: a store
    // that cannot export its sync metadata leaves the record looking unsynced,
    // which costs one upload. Keeping the entry this store already had would
    // cost more -- a counter of 0 from before the other store took over would
    // suppress the upload of everything done since.
    const stored = { ...record, version: this.version };
    await this._stripComputedFields(stored);
    await this.computeFields(stored);
    return stored;
  }
}

class CreditCards extends CreditCardsBase {
  constructor(store) {
    super(store);
  }

  async _encryptNumber(creditCard) {
    if (!("cc-number-encrypted" in creditCard)) {
      if ("cc-number" in creditCard) {
        let ccNumber = creditCard["cc-number"];
        if (lazy.CreditCard.isValidNumber(ccNumber)) {
          creditCard["cc-number"] =
            lazy.CreditCard.getLongMaskedNumber(ccNumber);
        } else {
          // Credit card numbers can be entered on versions of Firefox that don't validate
          // the number and then synced to this version of Firefox. Therefore, mask the
          // full number if the number is invalid on this version.
          creditCard["cc-number"] = "*".repeat(ccNumber.length);
        }
        creditCard["cc-number-encrypted"] =
          await lazy.OSKeyStore.encrypt(ccNumber);
      } else {
        creditCard["cc-number-encrypted"] = "";
      }
    }
  }
}

export class FormAutofillStorage extends FormAutofillStorageBase {
  #initPromise = null;
  // The switch in progress, if any. Kept so the next one queues behind it
  // rather than copying over the same pair of stores at the same time.
  #addressSwitch = null;

  /**
   * Settles which store serves addresses at startup, once the JSON store has
   * loaded, and returns a promise covering both so the "await initialize()"
   * contract still holds. Watching the pref for later changes is part of the
   * same chain, so nothing observes a flip before the profile has settled.
   *
   * Memoized, like the base's own initialize(): a repeat call hands back the
   * same promise rather than running the setup again.
   */
  initialize() {
    this.#initPromise ??= super
      .initialize()
      .then(() => this.#setUpAddressRustStorage())
      .then(() => Services.prefs.addObserver(ADDRESS_RUST_ENABLED_PREF, this));
    return this.#initPromise;
  }

  observe(subject, topic, data) {
    if (topic == "nsPref:changed" && data == ADDRESS_RUST_ENABLED_PREF) {
      this.#switchAddressStorage();
    }
  }

  _finalize() {
    if (this.#initPromise) {
      Services.prefs.removeObserver(ADDRESS_RUST_ENABLED_PREF, this);
    }
    return super._finalize();
  }

  /**
   * Copy the addresses from the store serving them to the one the pref now asks
   * for, and serve them from there.
   *
   * Queued behind initialize() and behind a switch already running: the two
   * would otherwise copy over the same pair of stores at once, and the second
   * would overwrite what the first had just read.
   *
   * A write that lands while the copy is running goes to the store that is
   * still serving, so it is in the source after the source has been read and
   * never reaches the target. The window is the length of one bulk copy.
   */
  #switchAddressStorage() {
    this.#addressSwitch = (this.#addressSwitch ?? this.initialize())
      .then(() => this.#migrateToEnabledAddressStorage())
      // Caught rather than left to reject: the next flip chains onto this
      // promise, and a rejected one would swallow every switch after it.
      .catch(e => lazy.logger.error("Could not switch the address store", e));
    return this.#addressSwitch;
  }

  // For test only: the switch the last pref flip started, so a test can wait
  // for one that is not going to change anything observable.
  get _addressSwitch() {
    return this.#addressSwitch;
  }

  /**
   * Copy the addresses into the store the pref now names and hand the profile
   * over, or leave everything where it is if the copy does not complete.
   *
   * The source is whichever store is serving and the target is the one the pref
   * asks for, so the copy carries the addresses the user can actually see. The
   * profile is handed over only once that copy has completed, which is what
   * keeps a failed switch on the store that still holds everything.
   *
   * The source is authoritative: the target ends up holding what the source
   * holds, which means losing whatever it had that the source does not, or the
   * user would find records they deleted in the other store back again.
   *
   * Copying out of the Rust store carries its records but not its pending
   * deletions, which it has no read for. The records deleted there are still
   * gone from the target afterwards; what is lost is the tombstone that would
   * have told the server, so a deletion not yet uploaded can come back on the
   * next sync.
   */
  async #migrateToEnabledAddressStorage() {
    const enabled = Services.prefs.getBoolPref(
      ADDRESS_RUST_ENABLED_PREF,
      false
    );
    if (enabled == lazy.addressRustActive) {
      return;
    }

    const json = this.#jsonAddresses();
    const rust = lazy.RustAutofillAddressesAdapter.getInstance();
    const [source, target] = enabled ? [json, rust] : [rust, json];

    const migrator = new lazy.AddressStorageMigrator(source, target);
    if (
      await migrator.maybeRun({
        // Emptying the target first would mean a copy that fails partway leaves
        // the user with less than they started with: the target's addresses
        // gone and the source's not yet arrived. Without it the worst a failed
        // switch costs is staying where it was.
        wipe: false,
      })
    ) {
      Services.prefs.setBoolPref(ADDRESS_RUST_ACTIVE_PREF, enabled);

      // The copy is silent, but the store answering a read has changed, and
      // what observers hold was computed from the other one -- the field names
      // FormAutofillStatus shares with the content processes, and the saved
      // profile count. The two stores hold the same records at this point, so
      // this is a recompute rather than news.
      Services.obs.notifyObservers(
        {
          wrappedJSObject: {
            sourceSync: false,
            guid: null,
            collectionName: lazy.AutofillDataTypes.get(
              lazy.AutofillDataTypes.ADDRESS
            ).collectionName,
          },
        },
        "formautofill-storage-changed",
        "migrate"
      );
    }
  }

  /**
   * Settle which store serves addresses at startup.
   *
   * rust.active says where the addresses are and rust.enabled where they should
   * be, so all four combinations are settled here -- the pref decides at startup
   * as much as it does when it changes, or one turned off while the browser was
   * closed would go unnoticed until it was turned off again.
   */
  async #setUpAddressRustStorage() {
    const enabled = Services.prefs.getBoolPref(
      ADDRESS_RUST_ENABLED_PREF,
      false
    );

    if (lazy.addressRustActive) {
      if (!enabled) {
        // Copy back, the same way a flip mid-session would.
        await this.#migrateToEnabledAddressStorage();
      }
      // Otherwise nothing to do: getAddresses() already answers with the
      // adapter, and super.initialize() has already initialized it.
      return;
    }

    // Only when Rust is off: the real migration keeps what it copied, and the
    // dry run would wipe the store out from under it.
    const runMigrationDryRun =
      !enabled &&
      Services.prefs.getBoolPref(ADDRESS_RUST_MIGRATION_TEST_PREF, false) &&
      lazy.AddressStorageMigrator.dryRunPending;
    if (!enabled && !runMigrationDryRun) {
      return;
    }

    // Building the adapter starts opening autofill.db, so it is asked for only
    // once this profile is known to want it.
    //
    // The source is the JSON collection by name rather than getAddresses(),
    // which answers with whichever store is serving.
    //
    // Nothing here catches: this runs inside initialize(), which
    // FormAutofillParent starts and lets reject, so a throw would leave the
    // saved field names unset and autofill offering nothing at all. The
    // migrator reports its own failures and returns false instead.
    const migrator = new lazy.AddressStorageMigrator(
      this.#jsonAddresses(),
      lazy.RustAutofillAddressesAdapter.getInstance()
    );
    const migrated = await migrator.maybeRun({ dryRun: runMigrationDryRun });

    if (runMigrationDryRun) {
      // Measured, not read: put the store back the way it was found. Safe to
      // empty because nothing is serving from it -- the dry run only runs while
      // rust.enabled is off -- and the dry run recorded itself on its own pref,
      // so a later real migration still does its own copy.
      await migrator.wipe();
      return;
    }

    if (!migrated) {
      // An incomplete copy would show fewer addresses than the user has, so the
      // profile stays on JSON and the next launch retries.
      return;
    }

    Services.prefs.setBoolPref(ADDRESS_RUST_ACTIVE_PREF, true);
  }

  // The JSON collection, built on first use. Not the same question as
  // getAddresses(), which answers with whichever store is serving.
  #jsonAddresses() {
    if (!this._addresses) {
      this._store.ensureDataReady();
      this._addresses = new Addresses(this._store);
    }
    return this._addresses;
  }

  getAddresses() {
    return lazy.addressRustActive
      ? lazy.RustAutofillAddressesAdapter.getInstance()
      : this.#jsonAddresses();
  }

  getCreditCards() {
    if (!this._creditCards) {
      this._store.ensureDataReady();
      this._creditCards = new CreditCards(this._store);
    }
    return this._creditCards;
  }

  getPassports() {
    if (!this._passports) {
      const rustStore = new lazy.RustAutofillStore();
      this._passports = new lazy.Passports(rustStore.ensureOpen());
    }
    return this._passports;
  }

  /**
   * Loads the profile data from file to memory.
   *
   * @returns {JSONFile}
   *          The JSONFile store.
   */
  _initializeStore() {
    return new lazy.JSONFile({
      path: this._path,
      dataPostProcessor: this._dataPostProcessor.bind(this),
    });
  }

  _dataPostProcessor(data) {
    data.version = this.version;
    if (!data.addresses) {
      data.addresses = [];
    }
    if (!data.creditCards) {
      data.creditCards = [];
    }
    return data;
  }
}

// The singleton exposed by this module.
export const formAutofillStorage = new FormAutofillStorage(
  PathUtils.join(PathUtils.profileDir, PROFILE_JSON_FILE_NAME)
);
