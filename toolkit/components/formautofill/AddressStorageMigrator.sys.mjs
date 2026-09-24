/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AutofillApiError:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  isStoredAddressField:
    "resource://autofill/RustAutofillAddressStorage.sys.mjs",
  RustAutofillAddressesAdapter:
    "resource://autofill/RustAutofillAddressStorage.sys.mjs",
});

// Which generation of the dry run this profile has done, so a build that fixes
// a migration bug can bump TEST_VERSION and measure the same profiles again.
// Kept apart from rust.active: a dry run wipes the store when it is done, so
// counting it as a migration would let a later rust.enabled=true skip the copy
// and serve an empty store.
const TEST_VERSION_PREF =
  "extensions.formautofill.addresses.storage.rust.migrationTestVersion";
const TEST_VERSION = 1;

// How many launches have already tried and failed.
const ATTEMPTS_PREF =
  "extensions.formautofill.addresses.storage.rust.migrationAttempts";

// Each attempt re-imports the whole profile, so a store that can never be
// written must not pay that on every startup.
const MAX_ATTEMPTS = 3;

// Twelve or more base64 characters including at least one digit: a guid. The
// digit is what keeps CamelCase error type names out of the match.
const GUID_LIKE = /\b(?=[A-Za-z0-9+/]*[0-9])[A-Za-z0-9+/]{12,}\b/g;

// A failure is reported as a code to group on and a message to read. The
// message is free text -- a store's own error can name the record it was
// writing -- so blank the guids out of it and cap it.
const errorCodeOf = e =>
  e instanceof lazy.AutofillApiError ? e.constructor.name : "Unknown";

const errorTextOf = e =>
  String(e?.message ?? e)
    .replace(GUID_LIKE, "<id>")
    .slice(0, 200);

/**
 * Copy a profile's addresses from one store to the other, and check field by
 * field that they came out the same. A dry run does the copy only to measure it,
 * and leaves the caller to empty the target again.
 *
 * Runs at startup for a profile that has not migrated, and again each time the
 * pref that chooses the store is flipped -- in whichever direction that pref
 * has just gone, since the copy is written against a source and a target.
 */
export class AddressStorageMigrator {
  #logger = null;
  #source = null;
  #target = null;
  #attempt = 0;

  /**
   * @param {object} source The store to copy from: getAll(), plus `_data` if it
   *   keeps its records in one.
   * @param {object} target The store to copy into: addManyWithMeta(),
   *   updateManyWithMeta(), removeMany(), getAll(). A copy that wipes also needs
   *   wipe(); a source that has tombstones to hand over needs
   *   addManyTombstones(); a store that caches its record count needs
   *   refreshCount().
   */
  constructor(source, target) {
    this.#logger = console.createInstance({
      prefix: "AddressStorageMigrator",
      maxLogLevelPref: "extensions.formautofill.loglevel",
    });
    this.#source = source;
    this.#target = target;
  }

  /**
   * Whether this profile still owes a dry run of the current generation.
   *
   * Static so a caller can ask before it builds the stores: reaching the
   * migrator means constructing the Rust adapter, which opens autofill.db, and
   * the dry run is followed by a wipe. A profile that has already measured must
   * pay neither, every launch, for a run that is not going to happen.
   *
   * @returns {boolean}
   */
  static get dryRunPending() {
    return Services.prefs.getIntPref(TEST_VERSION_PREF, 0) < TEST_VERSION;
  }

  /**
   * Copy the records across, unless this profile has spent its attempts.
   *
   * Divergence is measured and reported, not acted on: a complete copy is the
   * only bar.
   *
   * @param {object} [options]
   * @param {boolean} [options.dryRun=false] Copy only to measure it: reports
   *   the run, returns false whatever the outcome, and records TEST_VERSION so
   *   the same generation never measures twice. Spends no attempt budget.
   * @param {boolean} [options.wipe=true] Empty the target first. See #migrate.
   * @returns {Promise<boolean>} Whether the copy completed. Always false for a
   *   dry run.
   */
  async maybeRun({ dryRun = false, wipe = true } = {}) {
    try {
      if (dryRun) {
        if (!AddressStorageMigrator.dryRunPending) {
          return false;
        }
        await this.#migrateAndReport({ wipe });
        Services.prefs.setIntPref(TEST_VERSION_PREF, TEST_VERSION);
        return false;
      }

      this.#attempt = Services.prefs.getIntPref(ATTEMPTS_PREF, 0);
      if (this.#attempt >= MAX_ATTEMPTS) {
        this.#logger.warn(
          `Not migrating addresses: ${this.#attempt} attempts already failed.`
        );
        return false;
      }

      const { ok } = await this.#migrateAndReport({ wipe });
      if (ok) {
        Services.prefs.clearUserPref(ATTEMPTS_PREF);
      } else {
        Services.prefs.setIntPref(ATTEMPTS_PREF, this.#attempt + 1);
      }
      return ok;
    } catch (e) {
      this.#logger.error("Could not run the address migration", e);
      return false;
    }
  }

  /**
   * Empty the target, records and tombstones both, and refresh its count.
   */
  async wipe() {
    try {
      await this.#target.wipe();
      await this.#target.refreshCount?.();
    } catch (e) {
      this.#logger.error("Could not wipe the address store", e);
    }
  }

  /**
   * Run the copy, then report it, and keep the reporting from deciding what the
   * copy did.
   *
   * @param {object} [options]
   * @param {boolean} [options.wipe=true] Handed to #migrate.
   * @returns {Promise<object>} What #migrate found. A copy can be complete
   *   (`ok`) and still not be faithful (`diverged`).
   */
  async #migrateAndReport({ wipe = true } = {}) {
    const startedAt = ChromeUtils.now();
    const result = await this.#migrate(this.#source, this.#target, { wipe });

    // Reporting cannot decide the outcome. A failure here -- Glean refusing an
    // event, say -- would otherwise leave the caller's bookkeeping undone: a
    // completed copy never activated, an attempt never counted, a dry run
    // measuring itself again on every launch.
    try {
      this._report(result, startedAt);
    } catch (e) {
      this.#logger.error("Could not report the migration", e);
    }

    return result;
  }

  /**
   * Record what the copy did: one migrate_to_rust event, and one
   * migrate_record_divergence per record that came out different, carrying the
   * same run id so the two join.
   *
   * Underscore-named so a test can replace it. Glean's own metrics cannot be
   * stubbed -- a category is read-only and each metric lookup returns a fresh
   * object -- so this is the only seam a test has for a reporting failure.
   *
   * @param {object} result What #migrate found.
   * @param {number} startedAt A ChromeUtils.now() reading from when the copy
   *   began, for duration_ms.
   */
  _report(result, startedAt) {
    // Read off the target rather than passed in, so the label cannot disagree
    // with the copy it describes.
    const direction =
      this.#target instanceof lazy.RustAutofillAddressesAdapter
        ? "to_rust"
        : "to_json";
    // Joins the run to the divergences it found.
    const runId = Services.uuid.generateUUID().toString();

    for (const divergence of result.divergences) {
      // Only the kinds that have anything, so the rest stay absent rather than
      // empty.
      const fields = {};
      for (const kind of ["changed", "dropped", "added"]) {
        if (divergence[kind].length) {
          fields[kind] = divergence[kind].join(",");
        }
      }

      Glean.formautofillAddresses.migrateRecordDivergence.record({
        run_id: runId,
        ...fields,
      });
    }

    // The counts say what failed; the message says why, when there is anything
    // to add.
    const errorMessage = result.threw ?? result.firstCause;

    Glean.formautofillAddresses.migrateToRust.record({
      run_id: runId,
      direction,
      attempt: this.#attempt,
      result: result.ok ? "ok" : "error",
      source_total: result.sourceTotal,
      target_total: result.targetTotal,
      migrated: result.migrated,
      failed: result.failed,
      failed_deletions: result.failedDeletions,
      diverged: result.diverged,
      duration_ms: Math.round(ChromeUtils.now() - startedAt),
      ...(result.errorCode ? { error_code: result.errorCode } : {}),
      ...(errorMessage ? { error_message: errorMessage } : {}),
    });
  }

  /**
   * Bulk-copy one store's records into another, preserving guids, timestamps
   * and sync metadata, and then read them back and compare them field by field.
   *
   * The source is authoritative either way, its deletions included: a record it
   * holds ends up in the target holding the source's values, and a record it has
   * deleted ends up deleted there too.
   *
   * What differs is how the target gets there. Wiping first makes a retry
   * idempotent and clears the tombstones that would otherwise stop a guid being
   * re-inserted, at the cost of emptying the target before anything is written
   * to it. Without a wipe the target is brought to the same place a record at a
   * time -- inserted, overwritten or deleted according to what it already holds
   * -- so a copy that goes wrong leaves it no emptier than it found it.
   *
   * Everything it finds is returned rather than reported.
   *
   * @param {object} source The store being copied from.
   * @param {object} target The store being copied into.
   * @param {object} [options]
   * @param {boolean} [options.wipe=true] Empty the target before copying.
   * @returns {Promise<object>} What the copy did: the counts either side of it,
   *   whether every record arrived, the first reason one was rejected, the
   *   records that came back different, and the error where it threw.
   */
  async #migrate(source, target, { wipe = true } = {}) {
    let sourceTotal = 0;
    let targetTotal = 0;
    let migrated = 0;
    let failed = 0;
    let failedDeletions = 0;
    let ok = false;
    let errorCode = null;
    let threw = null;
    let divergences = [];
    // Rejected records in one batch nearly always share a cause, so the first
    // is as much as the report needs.
    let firstCause = null;

    try {
      // `_data` for a store that keeps one: it is the only read that carries
      // the hidden `_sync` metadata the copy has to take across, and the only
      // one that includes the tombstones, both of which getAll() drops. A store
      // without one answers reads instead and has no tombstones to give.
      const raw = source._data ?? (await source.getAll());
      const records = raw.filter(record => !record.deleted);
      const tombstones = raw
        .filter(record => record.deleted)
        .map(record => ({
          guid: record.guid,
          timeDeleted: record.timeLastModified ?? 0,
        }));
      sourceTotal = records.length;

      if (wipe) {
        // Silent, like the bulk writes below: announcing this as a removeAll
        // would report the profile's addresses as cleared mid-startup.
        await target.wipe();
      }

      // What the target already holds decides how each record gets there. A
      // wipe leaves nothing, so everything is an insert.
      const heldRecords = new Map(
        wipe ? [] : (await target.getAll()).map(record => [record.guid, record])
      );
      const held = new Set(heldRecords.keys());
      const fresh = records.filter(record => !held.has(record.guid));

      // A record the target holds under the same timestamp is the same record,
      // so it is left alone rather than written again. That keeps a switch off
      // the disk for the records nobody touched, and keeps whatever the target
      // holds that the source cannot represent -- a field invented by a newer
      // client survives a trip through the store that has no column for it.
      //
      // A missing timestamp on either side counts as changed: two records that
      // cannot say when they were written are not known to be the same one.
      const overwrite = records.filter(record => {
        if (!held.has(record.guid)) {
          return false;
        }
        const there = heldRecords.get(record.guid);
        return (
          !record.timeLastModified ||
          !there.timeLastModified ||
          record.timeLastModified !== there.timeLastModified
        );
      });

      const results = [
        ...(fresh.length ? await target.addManyWithMeta(fresh) : []),
        ...(overwrite.length ? await target.updateManyWithMeta(overwrite) : []),
      ];
      for (const result of results) {
        if (result.error) {
          failed++;
          firstCause ??= errorTextOf(result.error);
          this.#logger.error(`Migration failed for a record: ${result.error}`);
        } else {
          migrated++;
        }
      }

      // The source is authoritative, so anything the target holds that the
      // source does not is stale -- a record the source has deleted, or one an
      // earlier copy left behind -- and is deleted rather than tombstoned. A
      // tombstone for a guid the target still holds is rejected anyway, and
      // deleting leaves one behind wherever the store keeps them, so the
      // deletion still reaches the server.
      const sourceGuids = new Set(records.map(record => record.guid));
      const stale = [...held].filter(guid => !sourceGuids.has(guid));

      // The rest of the source's deletions are imported as tombstones, so the
      // target does not upload records the source has already deleted. A source
      // with no tombstones to give has already had its deletions applied above,
      // as records the target holds and it does not.
      const unheld = tombstones.filter(t => !held.has(t.guid));

      // Both kinds count together. What tells them apart is the verdict: a
      // record that would not delete is still there, so the run fails on it,
      // while a tombstone that would not import leaves the target correct and
      // costs a deletion coming back at the next sync.
      const deletionResults = [
        ...(stale.length ? await target.removeMany(stale) : []),
        ...(unheld.length ? await target.addManyTombstones(unheld) : []),
      ];
      for (const result of deletionResults) {
        if (result.error) {
          failedDeletions++;
          firstCause ??= errorTextOf(result.error);
          this.#logger.error(`Could not apply a deletion: ${result.error}`);
        }
      }

      // Only a store that caches its count has anything to prime.
      await target.refreshCount?.();
      const stored = await target.getAll();
      targetTotal = stored.length;
      divergences = await this.#verify(source, target, stored);

      // Both ways round, and by guid rather than by count: a target holding the
      // right number of the wrong records has not copied everything, and one
      // still holding what the source deleted has copied too much. `extra`
      // catches a deletion that failed silently as well as one that reported
      // it.
      const storedGuids = new Set(stored.map(record => record.guid));
      const missing = records.filter(
        record => !storedGuids.has(record.guid)
      ).length;
      const extra = stored.filter(
        record => !sourceGuids.has(record.guid)
      ).length;
      ok = failed === 0 && missing === 0 && extra === 0;

      this.#logger.log(
        `Migrated ${migrated}/${sourceTotal} addresses ` +
          `(${failed} failed, ${failedDeletions} deletions failed, ` +
          `${missing} missing, ${extra} extra, count=${targetTotal}, ` +
          `diverged=${divergences.length}, verified=${ok}).`
      );
    } catch (e) {
      ok = false;
      errorCode = errorCodeOf(e);
      threw = errorTextOf(e);
      this.#logger.error("Address migration failed", e);
    }

    return {
      ok,
      sourceTotal,
      targetTotal,
      migrated,
      failed,
      failedDeletions,
      diverged: divergences.length,
      divergences,
      firstCause,
      errorCode,
      threw,
    };
  }

  /**
   * Check what the target holds against what the source holds, field by field,
   * and say which way each difference went.
   *
   * Both sides are read through getAll() rather than the raw rows the copy was
   * made from: only a difference a caller can see counts, and the two raw
   * shapes differ by design.
   *
   * Only the fields the copy carries are compared, which is the same set either
   * way round: the canonical fields and the metadata. One store derives the
   * presentational fields on read while the other persists what it computed, so
   * those differ whenever the derivation has changed -- most often with the app
   * locale -- and a field neither has a column for was never carried at all.
   *
   * @param {object} source The store copied from.
   * @param {object} target The store copied into.
   * @param {Array<object>} stored What the target holds after the copy.
   * @returns {Promise<Array<object>>} One entry per record that disagrees: the
   *   fields whose values differ, the ones the copy lost, and the ones it
   *   gained.
   */
  async #verify(source, target, stored) {
    const byGUID = new Map(stored.map(record => [record.guid, record]));
    const divergences = [];

    for (const record of await source.getAll()) {
      const copy = byGUID.get(record.guid);
      if (!copy) {
        // A record that never arrived is a count mismatch, not a divergence.
        continue;
      }
      // The union of both key sets, so a field the copy dropped and one it
      // invented are both caught, and only the fields the target is answerable
      // for: one it derives on read or has no column for cannot have been lost
      // by the copy.
      const differing = [
        ...new Set([...Object.keys(record), ...Object.keys(copy)]),
      ].filter(
        field =>
          lazy.isStoredAddressField(field) && record[field] !== copy[field]
      );
      if (!differing.length) {
        continue;
      }

      // Which way each field went: a name in `dropped` with its components in
      // `added` is a record the target decomposed rather than one it damaged.
      const divergence = { changed: [], dropped: [], added: [] };
      for (const field of differing) {
        if (!record[field]) {
          divergence.added.push(field);
        } else if (!copy[field]) {
          divergence.dropped.push(field);
        } else {
          divergence.changed.push(field);
        }
      }
      divergences.push(divergence);

      this.#logger.warn(
        `Migrated address differs from the source record on: ` +
          `${differing.join(", ")}`
      );
    }
    return divergences;
  }
}
