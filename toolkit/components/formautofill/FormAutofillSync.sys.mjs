/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Changeset,
  Store,
  SyncEngine,
  Tracker,
} from "resource://services-sync/engines.sys.mjs";
import { BridgedEngine } from "resource://services-sync/bridged_engine.sys.mjs";
import { CryptoWrapper } from "resource://services-sync/record.sys.mjs";
import { Utils } from "resource://services-sync/util.sys.mjs";

import { SCORE_INCREMENT_XLARGE } from "resource://services-sync/constants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ADDRESS_SCHEMA_VERSION: "resource://autofill/FormAutofillStorageBase.sys.mjs",
  Log: "resource://gre/modules/Log.sys.mjs",
  RustAutofillAddressesAdapter:
    "resource://autofill/RustAutofillAddressStorage.sys.mjs",
  formAutofillStorage: "resource://autofill/FormAutofillStorage.sys.mjs",
  setupLoggerForTarget: "resource://gre/modules/AppServicesTracing.sys.mjs",
});

// A helper to sanitize address and creditcard records suitable for logging.
export function sanitizeStorageObject(ob) {
  if (!ob) {
    return null;
  }
  const allowList = ["timeCreated", "timeLastUsed", "timeLastModified"];
  let result = {};
  for (let key of Object.keys(ob)) {
    let origVal = ob[key];
    if (allowList.includes(key)) {
      result[key] = origVal;
    } else if (typeof origVal == "string") {
      result[key] = "X".repeat(origVal.length);
    } else {
      result[key] = typeof origVal; // *shrug*
    }
  }
  return result;
}

export function AutofillRecord(collection, id) {
  CryptoWrapper.call(this, collection, id);
}

AutofillRecord.prototype = {
  toEntry() {
    return Object.assign(
      {
        guid: this.id,
      },
      this.entry
    );
  },

  fromEntry(entry) {
    this.id = entry.guid;
    this.entry = entry;
    // The GUID is already stored in record.id, so we nuke it from the entry
    // itself to save a tiny bit of space. The formAutofillStorage clones profiles,
    // so nuking in-place is OK.
    delete this.entry.guid;
  },

  cleartextToString() {
    // And a helper so logging a *Sync* record auto sanitizes.
    let record = this.cleartext;
    return JSON.stringify({ entry: sanitizeStorageObject(record.entry) });
  },
};
Object.setPrototypeOf(AutofillRecord.prototype, CryptoWrapper.prototype);

// Profile data is stored in the "entry" object of the record.
Utils.deferGetSet(AutofillRecord, "cleartext", ["entry"]);

function FormAutofillStore(name, engine) {
  Store.call(this, name, engine);
}

FormAutofillStore.prototype = {
  _subStorageName: null, // overridden below.
  _storage: null,

  get storage() {
    if (!this._storage) {
      this._storage = lazy.formAutofillStorage[this._subStorageName];
    }
    return this._storage;
  },

  async getAllIDs() {
    let result = {};
    for (let { guid } of await this.storage.getAll({ includeDeleted: true })) {
      result[guid] = true;
    }
    return result;
  },

  async changeItemID(oldID, newID) {
    this.storage.changeGUID(oldID, newID);
  },

  // Note: this function intentionally returns false in cases where we only have
  // a (local) tombstone - and formAutofillStorage.get() filters them for us.
  async itemExists(id) {
    return Boolean(await this.storage.get(id));
  },

  async applyIncoming(remoteRecord) {
    if (remoteRecord.deleted) {
      this._log.trace("Deleting record", remoteRecord);
      this.storage.remove(remoteRecord.id, { sourceSync: true });
      return;
    }

    // Records from the remote might come from an older device. To ensure that
    // remote records from older devices can still sync with the local records,
    // we migrate the remote records. This enables the merging of older records
    // with newer records.
    //
    // Currently, this migration is only used for converting `*-name` fields to `name` fields.
    // The migration process involves:
    // 1. Generating a `name` field so we don't assume the `name` field is empty, thereby
    //    avoiding erasing its value.
    // 2. Removing deprecated *-name fields from the remote record because the autofill storage
    //    does not expect to see those fields.
    this.storage.migrateRemoteRecord(remoteRecord.entry);

    if (await this.itemExists(remoteRecord.id)) {
      // We will never get a tombstone here, so we are updating a real record.
      await this._doUpdateRecord(remoteRecord);
      return;
    }

    // No matching local record. Try to dedupe a NEW local record.
    let localDupeID = await this.storage.findDuplicateGUID(
      remoteRecord.toEntry()
    );
    if (localDupeID) {
      this._log.trace(
        `Deduping local record ${localDupeID} to remote`,
        remoteRecord
      );
      // Change the local GUID to match the incoming record, then apply the
      // incoming record.
      await this.changeItemID(localDupeID, remoteRecord.id);
      await this._doUpdateRecord(remoteRecord);
      return;
    }

    // We didn't find a dupe, either, so must be a new record (or possibly
    // a non-deleted version of an item we have a tombstone for, which add()
    // handles for us.)
    this._log.trace("Add record", remoteRecord);
    let entry = remoteRecord.toEntry();
    await this.storage.add(entry, { sourceSync: true });
  },

  async createRecord(id, collection) {
    this._log.trace("Create record", id);
    let record = new AutofillRecord(collection, id);
    let entry = await this.storage.get(id, {
      rawData: true,
    });
    if (entry) {
      record.fromEntry(entry);
    } else {
      // We should consider getting a more authortative indication it's actually deleted.
      this._log.debug(
        `Failed to get autofill record with id "${id}", assuming deleted`
      );
      record.deleted = true;
    }
    return record;
  },

  async _doUpdateRecord(record) {
    this._log.trace("Updating record", record);

    let entry = record.toEntry();
    let { forkedGUID } = await this.storage.reconcile(entry);
    if (this._log.level <= lazy.Log.Level.Debug) {
      let forkedRecord = forkedGUID ? await this.storage.get(forkedGUID) : null;
      let reconciledRecord = await this.storage.get(record.id);
      this._log.debug("Updated local record", {
        forked: sanitizeStorageObject(forkedRecord),
        updated: sanitizeStorageObject(reconciledRecord),
      });
    }
  },

  // NOTE: Because we re-implement the incoming/reconcilliation logic we leave
  // the |create|, |remove| and |update| methods undefined - the base
  // implementation throws, which is what we want to happen so we can identify
  // any places they are "accidentally" called.
};
Object.setPrototypeOf(FormAutofillStore.prototype, Store.prototype);

function FormAutofillTracker(name, engine) {
  Tracker.call(this, name, engine);
}

FormAutofillTracker.prototype = {
  async observe(subject, topic, data) {
    if (topic != "formautofill-storage-changed") {
      return;
    }
    if (
      subject &&
      subject.wrappedJSObject &&
      subject.wrappedJSObject.sourceSync
    ) {
      return;
    }
    switch (data) {
      case "add":
      case "update":
      case "remove":
        this.score += SCORE_INCREMENT_XLARGE;
        break;
      default:
        this._log.debug("unrecognized autofill notification", data);
        break;
    }
  },

  onStart() {
    Services.obs.addObserver(this, "formautofill-storage-changed");
  },

  onStop() {
    Services.obs.removeObserver(this, "formautofill-storage-changed");
  },
};
Object.setPrototypeOf(FormAutofillTracker.prototype, Tracker.prototype);

// This uses the same conventions as BookmarkChangeset in
// services/sync/modules/engines/bookmarks.js. Specifically,
// - "synced" means the item has already been synced (or we have another reason
//   to ignore it), and should be ignored in most methods.
class AutofillChangeset extends Changeset {
  constructor() {
    super();
  }

  getModifiedTimestamp(_id) {
    throw new Error("Don't use timestamps to resolve autofill merge conflicts");
  }

  has(id) {
    let change = this.changes[id];
    if (change) {
      return !change.synced;
    }
    return false;
  }

  delete(id) {
    let change = this.changes[id];
    if (change) {
      // Mark the change as synced without removing it from the set. We do this
      // so that we can update FormAutofillStorage in `trackRemainingChanges`.
      change.synced = true;
    }
  }
}

function FormAutofillEngine(service, name) {
  SyncEngine.call(this, name, service);
}

FormAutofillEngine.prototype = {
  // the priority for this engine is == addons, so will happen after bookmarks
  // prefs and tabs, but before forms, history, etc.
  syncPriority: 5,

  // We don't use SyncEngine.initialize() for this, as we initialize even if
  // the engine is disabled, and we don't want to be the loader of
  // FormAutofillStorage in this case.
  async _syncStartup() {
    await lazy.formAutofillStorage.initialize();
    await SyncEngine.prototype._syncStartup.call(this);
  },

  // We handle reconciliation in the store, not the engine.
  async _reconcile() {
    return true;
  },

  emptyChangeset() {
    return new AutofillChangeset();
  },

  async _uploadOutgoing() {
    this._modified.replace(this._store.storage.pullSyncChanges());
    await SyncEngine.prototype._uploadOutgoing.call(this);
  },

  // Typically, engines populate the changeset before downloading records.
  // However, we handle conflict resolution in the store, so we can wait
  // to pull changes until we're ready to upload.
  async pullAllChanges() {
    return {};
  },

  async pullNewChanges() {
    return {};
  },

  async trackRemainingChanges() {
    this._store.storage.pushSyncChanges(this._modified.changes);
  },

  _deleteId(id) {
    this._noteDeletedId(id);
  },

  async _resetClient() {
    await lazy.formAutofillStorage.initialize();
    this._store.storage.resetSync();
    await this.resetLastSync(0);
  },

  async _wipeClient() {
    await lazy.formAutofillStorage.initialize();
    this._store.storage.removeAll({ sourceSync: true });
  },
};
Object.setPrototypeOf(FormAutofillEngine.prototype, SyncEngine.prototype);

// The concrete engines

function AddressesRecord(collection, id) {
  AutofillRecord.call(this, collection, id);
}

AddressesRecord.prototype = {
  _logName: "Sync.Record.Addresses",
};
Object.setPrototypeOf(AddressesRecord.prototype, AutofillRecord.prototype);

function AddressesStore(name, engine) {
  FormAutofillStore.call(this, name, engine);
}

AddressesStore.prototype = {
  _subStorageName: "addresses",
};
Object.setPrototypeOf(AddressesStore.prototype, FormAutofillStore.prototype);

export function AddressesEngine(service) {
  FormAutofillEngine.call(this, service, "Addresses");
}

AddressesEngine.prototype = {
  _trackerObj: FormAutofillTracker,
  _storeObj: AddressesStore,
  _recordObj: AddressesRecord,

  get prefName() {
    return "addresses";
  },
};
Object.setPrototypeOf(AddressesEngine.prototype, FormAutofillEngine.prototype);

/**
 * The addresses engine backed by the Rust autofill store, used instead of
 * AddressesEngine when `...addresses.storage.rust.active` is set. Sync picks
 * between the two through registerAlternatives(), so whichever store is serving
 * the browser is the one that syncs.
 *
 * Reconciliation happens inside Rust, so BridgedEngine drives the store's
 * bridged engine instead of FormAutofillEngine's per-record store surface.
 * Change scoring still comes from FormAutofillTracker: the Rust adapter fires
 * the same formautofill-storage-changed notification.
 */
export function BridgedAddressesEngine(service) {
  BridgedEngine.call(this, "Addresses", service);
}

BridgedAddressesEngine.prototype = {
  _trackerObj: FormAutofillTracker,

  // The same priority FormAutofillEngine uses, so switching backend does not
  // reorder which engines sync first.
  syncPriority: 5,

  // Tells the Rust-backed engine apart from the JS one in sync telemetry.
  overrideTelemetryName: "rust-addresses",

  get prefName() {
    return "addresses";
  },

  async initialize() {
    await SyncEngine.prototype.initialize.call(this);
    // FormAutofillEngine avoids initialize() so that sync is not the loader of
    // FormAutofillStorage for a profile with address sync off. This engine
    // cannot: BridgedEngine needs the bridge, which only the store hands out,
    // and reset and wipe reach for it outside a sync.
    await lazy.formAutofillStorage.initialize();

    // Reconciling happens in Rust, and allowSkippedRecord below leaves a
    // rejected record skipped with only a Rust-side warning, which without
    // this would reach no sync log.
    lazy.setupLoggerForTarget("autofill", this._log);

    // bridgedEngine() waits on the store, so a database that will not open
    // rejects here and EngineManager.register skips the engine -- there is
    // nothing to sync from a store we cannot read.
    const rust = lazy.RustAutofillAddressesAdapter.getInstance();
    this._bridge = await rust.bridgedEngine();
    // Also the engine version in meta/global: bumping ADDRESS_SCHEMA_VERSION
    // would stop older and JSON-backed clients from syncing addresses at all.
    this._bridge.storageVersion = lazy.ADDRESS_SCHEMA_VERSION;
    this._bridge.allowSkippedRecord = true;
    this._bridge.getSyncId = async () => this._bridge.syncId();

    this._log.info("Got a bridged addresses engine!");
  },

  /**
   * Stands in for the bridge's own resetLastSync, which the autofill component
   * implements but does not expose over the FFI, unlike logins and tabs.
   * reset() zeroes the last-sync timestamp along with the mirror and the
   * tombstones, which is what the only caller -- _resetClient -- asks for:
   * drop the sync metadata and keep the records.
   */
  async resetLastSync() {
    await this._bridge.reset();
  },

  /**
   * The bridge applied these inside Rust, so no write went through the adapter
   * and nothing announced them.
   */
  async _processIncoming(newitems) {
    await BridgedEngine.prototype._processIncoming.call(this, newitems);
    const rust = lazy.RustAutofillAddressesAdapter.getInstance();
    await rust.notifySyncApplied();
  },
};
Object.setPrototypeOf(
  BridgedAddressesEngine.prototype,
  BridgedEngine.prototype
);

function CreditCardsRecord(collection, id) {
  AutofillRecord.call(this, collection, id);
}

CreditCardsRecord.prototype = {
  _logName: "Sync.Record.CreditCards",
};
Object.setPrototypeOf(CreditCardsRecord.prototype, AutofillRecord.prototype);

function CreditCardsStore(name, engine) {
  FormAutofillStore.call(this, name, engine);
}

CreditCardsStore.prototype = {
  _subStorageName: "creditCards",
};
Object.setPrototypeOf(CreditCardsStore.prototype, FormAutofillStore.prototype);

export function CreditCardsEngine(service) {
  FormAutofillEngine.call(this, service, "CreditCards");
}

CreditCardsEngine.prototype = {
  _trackerObj: FormAutofillTracker,
  _storeObj: CreditCardsStore,
  _recordObj: CreditCardsRecord,
  get prefName() {
    return "creditcards";
  },
};
Object.setPrototypeOf(
  CreditCardsEngine.prototype,
  FormAutofillEngine.prototype
);
