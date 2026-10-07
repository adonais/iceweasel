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
  AddressStorageMigrator: "resource://autofill/AutofillStorageMigrator.sys.mjs",
  CreditCardStorageMigrator:
    "resource://autofill/AutofillStorageMigrator.sys.mjs",
  JSONFile: "resource://gre/modules/JSONFile.sys.mjs",
  OSKeyStore: "resource://gre/modules/OSKeyStore.sys.mjs",
  Passports: "resource://autofill/PassportStorage.sys.mjs",
  RustAutofillAddressesAdapter:
    "resource://autofill/RustAutofillAddressStorage.sys.mjs",
  RustAutofillCreditCardsAdapter:
    "resource://autofill/RustAutofillCreditCardStorage.sys.mjs",
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

// The credit card counterparts of the three above. Kept separate rather than
// derived from a collection name so that each can be flipped on its own: the
// two migrations are independent and a profile can have moved one and not the
// other.
const CREDIT_CARD_RUST_ENABLED_PREF =
  "extensions.formautofill.creditCards.storage.rust.enabled";

const CREDIT_CARD_RUST_ACTIVE_PREF =
  "extensions.formautofill.creditCards.storage.rust.active";

const CREDIT_CARD_RUST_MIGRATION_TEST_PREF =
  "extensions.formautofill.creditCards.storage.rust.runMigrationTest";

// Observed rather than read once: the migration sets this mid-session, and a
// snapshot taken before that would keep handing back the JSON collection until
// the next restart.
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "addressRustActive",
  ADDRESS_RUST_ACTIVE_PREF,
  false
);

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "creditCardRustActive",
  CREDIT_CARD_RUST_ACTIVE_PREF,
  false
);

class Addresses extends AddressesBase {}

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
  #creditCardSwitch = null;

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
      .then(() => this.#setUpCreditCardRustStorage())
      .then(() => {
        Services.prefs.addObserver(ADDRESS_RUST_ENABLED_PREF, this);
        Services.prefs.addObserver(CREDIT_CARD_RUST_ENABLED_PREF, this);
      });
    return this.#initPromise;
  }

  observe(subject, topic, data) {
    if (topic != "nsPref:changed") {
      return;
    }
    if (data == ADDRESS_RUST_ENABLED_PREF) {
      this.#switchAddressStorage();
    } else if (data == CREDIT_CARD_RUST_ENABLED_PREF) {
      this.#switchCreditCardStorage();
    }
  }

  _finalize() {
    if (this.#initPromise) {
      Services.prefs.removeObserver(ADDRESS_RUST_ENABLED_PREF, this);
      Services.prefs.removeObserver(CREDIT_CARD_RUST_ENABLED_PREF, this);
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

  /**
   * The credit card counterpart of #switchAddressStorage. Kept on its own
   * promise so a flip of one pref does not queue behind a copy of the other
   * collection.
   */
  #switchCreditCardStorage() {
    this.#creditCardSwitch = (this.#creditCardSwitch ?? this.initialize())
      .then(() => this.#migrateToEnabledCreditCardStorage())
      // Caught rather than left to reject: the next flip chains onto this
      // promise, and a rejected one would swallow every switch after it.
      .catch(e =>
        lazy.logger.error("Could not switch the credit card store", e)
      );
    return this.#creditCardSwitch;
  }

  // For test only: the switch the last pref flip started, so a test can wait
  // for one that is not going to change anything observable.
  get _creditCardSwitch() {
    return this.#creditCardSwitch;
  }

  /**
   * Copy the credit cards into the store the pref now names and hand the
   * profile over, or leave everything where it is if the copy does not
   * complete. The address version documents the reasoning; it is the same here.
   *
   * One thing differs. The copy reads each card's number in the clear so the
   * receiving store can encrypt it itself, which means it needs the OS key
   * store readable. #creditCardNumbersReadable settles that before any copying
   * starts, and a profile whose numbers cannot be read is left where it is.
   */
  async #migrateToEnabledCreditCardStorage() {
    const enabled = Services.prefs.getBoolPref(
      CREDIT_CARD_RUST_ENABLED_PREF,
      false
    );
    if (enabled == lazy.creditCardRustActive) {
      return;
    }

    const json = this.#jsonCreditCards();
    const rust = lazy.RustAutofillCreditCardsAdapter.getInstance();
    const [source, target] = enabled ? [json, rust] : [rust, json];

    if (!(await this.#creditCardNumbersReadable(source))) {
      return;
    }

    const migrator = new lazy.CreditCardStorageMigrator(source, target);
    if (
      await migrator.maybeRun({
        // Emptying the target first would mean a copy that fails partway leaves
        // the user with less than they started with.
        wipe: false,
      })
    ) {
      Services.prefs.setBoolPref(CREDIT_CARD_RUST_ACTIVE_PREF, enabled);

      Services.obs.notifyObservers(
        {
          wrappedJSObject: {
            sourceSync: false,
            guid: null,
            collectionName: lazy.AutofillDataTypes.get(
              lazy.AutofillDataTypes.CREDIT_CARD
            ).collectionName,
          },
        },
        "formautofill-storage-changed",
        "migrate"
      );
    }
  }

  /**
   * Whether the source's card numbers can be read, so the copy can hand them
   * over in the clear.
   *
   * Answered by decrypting one record, not by asking the OS key store, which
   * cannot answer it: ensureLoggedIn() without a reauth prompt reports success
   * unconditionally, whether or not the ciphertext the store holds is readable.
   *
   * Decrypting has the same side effect rather than avoiding it --
   * OSKeyStore.decrypt() goes through that same ensureLoggedIn(), which
   * generates a key when none exists. What spares a profile that has never
   * saved a card is the early return below: there is nothing to decrypt, so
   * the key store is never reached, and an empty profile still moves to the
   * other store. A profile that does hold a ciphertext has the key already.
   *
   * Neither direction prompts today, both stores encrypting through the OS key
   * store; RustAutofillCreditCardsAdapter documents why it does not yet hold a
   * key of its own. Once it does, decrypting a card out of it needs that key
   * generated and unlocked, so this check becomes a primary password prompt in
   * the copy-back direction and will have to answer without one.
   *
   * Settled once, before anything is copied, rather than discovered per record.
   * A copy that stops halfway leaves the profile split across two stores, and a
   * key store that is merely locked would otherwise spend the retry budget --
   * a deferral costs a launch, three failed attempts cost the migration for
   * good. LoginStorageMigrator settles the primary password up front for the
   * same reason.
   *
   * @param {object} source The store being copied from.
   * @returns {Promise<boolean>}
   */
  async #creditCardNumbersReadable(source) {
    const [canary] = await source.getAll();
    if (!canary) {
      return true;
    }
    try {
      await source._recordForMigrationExport(canary);
      return true;
    } catch (e) {
      lazy.logger.log(
        "Deferring the credit card migration: a number could not be read.",
        e
      );
      return false;
    }
  }

  /**
   * Settle which store serves credit cards at startup. The address version
   * documents the four combinations; this is the same, on its own prefs.
   */
  async #setUpCreditCardRustStorage() {
    const enabled = Services.prefs.getBoolPref(
      CREDIT_CARD_RUST_ENABLED_PREF,
      false
    );

    if (lazy.creditCardRustActive) {
      if (!enabled) {
        await this.#migrateToEnabledCreditCardStorage();
      }
      return;
    }

    const runMigrationDryRun =
      !enabled &&
      Services.prefs.getBoolPref(CREDIT_CARD_RUST_MIGRATION_TEST_PREF, false) &&
      lazy.CreditCardStorageMigrator.dryRunPending;
    if (!enabled && !runMigrationDryRun) {
      return;
    }

    if (!(await this.#creditCardNumbersReadable(this.#jsonCreditCards()))) {
      return;
    }

    const migrator = new lazy.CreditCardStorageMigrator(
      this.#jsonCreditCards(),
      lazy.RustAutofillCreditCardsAdapter.getInstance()
    );
    const migrated = await migrator.maybeRun({ dryRun: runMigrationDryRun });

    if (runMigrationDryRun) {
      await migrator.wipe();
      return;
    }

    if (!migrated) {
      return;
    }

    Services.prefs.setBoolPref(CREDIT_CARD_RUST_ACTIVE_PREF, true);
  }

  // The JSON collection, built on first use. Not the same question as
  // getCreditCards(), which answers with whichever store is serving.
  #jsonCreditCards() {
    if (!this._creditCards) {
      this._store.ensureDataReady();
      this._creditCards = new CreditCards(this._store);
    }
    return this._creditCards;
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
    return lazy.creditCardRustActive
      ? lazy.RustAutofillCreditCardsAdapter.getInstance()
      : this.#jsonCreditCards();
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
