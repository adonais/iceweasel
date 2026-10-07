/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Rust-backed credit card storage adapter.
 *
 * The credit card half of `RustAutofillAdapterBase`, which holds everything
 * that is not specific to this collection. What is here follows from the Rust
 * credit card schema: the number is stored encrypted with only its last four
 * digits in the clear, so `cc-number` is derived as a mask on read and the
 * ciphertext derived on write.
 */

import {
  RustAutofillAdapterBase,
  INTERNAL_FIELDS,
} from "resource://autofill/RustAutofillAdapterBase.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CREDIT_CARD_SCHEMA_VERSION:
    "resource://autofill/FormAutofillStorageBase.sys.mjs",
  VALID_CREDIT_CARD_FIELDS:
    "resource://autofill/FormAutofillStorageBase.sys.mjs",
  AutofillDataTypes: "resource://gre/modules/shared/AutofillDataTypes.sys.mjs",
  CreditCardRecord: "resource://gre/modules/shared/CreditCardRecord.sys.mjs",
  CreditCardBulkResultEntry:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  CreditCardBulkTombstoneResultEntry:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  CreditCardMeta:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  CreditCardTombstone:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  UpdatableCreditCardFieldsWithMeta:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
  OSKeyStore: "resource://gre/modules/OSKeyStore.sys.mjs",
  UpdatableCreditCardFields:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs",
});

const logger = console.createInstance({
  prefix: "RustAutofillCreditCardStorage",
  maxLogLevelPref: "extensions.formautofill.loglevel",
});

// Canonical string fields: JS hyphenated key <-> Rust camelCase field. The
// expiry pair is handled apart from these because its columns are i64, and the
// number apart from those because it is stored encrypted.
const JS_TO_RUST_STRING_FIELD = {
  "cc-name": "ccName",
  "cc-type": "ccType",
};

// Split from the strings above only because these columns are i64: an empty
// string is what an absent string field is written as, and would not convert.
const JS_TO_RUST_INTEGER_FIELD = {
  "cc-exp-month": "ccExpMonth",
  "cc-exp-year": "ccExpYear",
};

// cc-number is in neither map: it is one JS field over two columns, ccNumberEnc
// and ccNumberLast4, and only the ciphertext is stored as it was given. Reading
// it back inverts, so `cc-number-encrypted` is what this store holds and
// `cc-number` is derived, as cc-exp and the name components are.
//
// Both are still comparable, but not by string equality -- see
// creditCardFieldDiffers.
const storedFields = new Set([
  ...Object.keys(JS_TO_RUST_STRING_FIELD),
  ...Object.keys(JS_TO_RUST_INTEGER_FIELD),
  "cc-number",
  "cc-number-encrypted",
  ...INTERNAL_FIELDS,
]);

/**
 * Whether this store holds a field of this name, as opposed to deriving it on
 * read or not recognising it at all.
 *
 * Used when comparing a record here against the same record in the JSON store,
 * to decide whether a difference means the copy is unfaithful. Only a stored
 * field can answer that. The copy carries the canonical fields and metadata and
 * nothing else, so those are the only ones a failed copy can corrupt.
 *
 * A derived field is deliberately excluded even though this store understands
 * it. The JSON store persists what it computed at write time and hands back
 * what it wrote, while this one recomputes on every read, so the two disagree
 * whenever the derivation has since changed -- for the whole population at
 * once, not for the records a copy damaged. Two cases:
 *
 *  - cc-type is re-detected from the number on every normalise, so a change to
 *    the detection table moves every stored card.
 * The name components and cc-exp are excluded for that reason.
 *
 * The two number fields are included, but neither compares as a string --
 * see creditCardFieldDiffers.
 *
 * @param {string} field
 * @returns {boolean}
 */
export function isStoredCreditCardField(field) {
  return storedFields.has(field);
}

/**
 * Whether a field disagrees between a record and its copy, for the two fields
 * where string equality is the wrong question.
 *
 * cc-number is a mask, rebuilt here at a fixed width and written by the JSON
 * store at the card's own, so the masks differ for any card that was not 16
 * digits long. What both do carry, in the clear, is the last four digits --
 * they are what the UI shows -- so those are what get compared. That is also
 * the comparison worth having: a card landing under the wrong guid, or a number
 * truncated in transit, shows up here and nowhere else.
 *
 * cc-number-encrypted compares by presence only. A migration decrypts and
 * re-encrypts, and encryption is not deterministic, so the bytes differ on
 * every record by design; what is still answerable is whether both sides hold a
 * number or neither does. An empty ciphertext is a legitimate state, which is
 * why this is a parity check rather than an assertion that one exists.
 *
 * Comparing the two plaintexts is the stronger check and is not made: the copy
 * lets go of the exported records before it verifies, so it would mean
 * decrypting every record again on both sides. The last four digits of
 * cc-number stand in for it.
 *
 * @param {string} field
 * @param {*} a The value on the record.
 * @param {*} b The value on its copy.
 * @returns {boolean}
 */
export function creditCardFieldDiffers(field, a, b) {
  switch (field) {
    case "cc-number":
      return String(a ?? "").slice(-4) !== String(b ?? "").slice(-4);
    case "cc-number-encrypted":
      return !a !== !b;
    default:
      return a !== b;
  }
}

/**
 * How wide to rebuild the mask on a number this store no longer holds in full.
 *
 * The JSON store masks the number it was given, so its `cc-number` is as long
 * as the card was. This store keeps only the last four digits, so the length is
 * gone and the mask is rebuilt at the width of the common case. A 14- or
 * 15-digit card reads back wider here than it was written.
 *
 * Consumers use `cc-number` for display, and the ones that need the number
 * itself decrypt `cc-number-encrypted`, so this costs presentation rather than
 * correctness.
 */
const MASKED_NUMBER_LENGTH = 16;

// What the mask is built from, and so what tells a masked number from a real
// one. See isMasked.
const MASK_CHARACTER = "•";

// A masked value is not a number: it is what a record reads back as once the
// number behind it is gone. Encrypting one would store it in place of the card,
// so every path that is about to encrypt refuses it.
const isMasked = value => String(value ?? "").includes(MASK_CHARACTER);

/**
 * Convert a JS credit card record to the Rust `UpdatableCreditCardFields`.
 *
 * The number is not encrypted here: the ciphertext is passed in, so that this
 * stays the same pure conversion its address counterpart is and the one place
 * that encrypts is visible at the call site.
 *
 * @param {object} record
 * @param {string} ccNumberEnc The record's number, already encrypted.
 */
function jsRecordToUpdatableCreditCardFields(record, ccNumberEnc) {
  const fields = {};
  for (const [jsKey, rustKey] of Object.entries(JS_TO_RUST_STRING_FIELD)) {
    fields[rustKey] = record[jsKey] ?? "";
  }
  for (const [jsKey, rustKey] of Object.entries(JS_TO_RUST_INTEGER_FIELD)) {
    fields[rustKey] = Number(record[jsKey]) || 0;
  }
  fields.ccNumberEnc = ccNumberEnc;
  fields.ccNumberLast4 = record["cc-number"]?.slice(-4) ?? "";
  return new lazy.UpdatableCreditCardFields(fields);
}

/**
 * Convert a Rust `CreditCard` to a JS credit card record: stored fields,
 * metadata, schema version and computed fields.
 */
function creditCardToJsRecord(creditCard) {
  const record = {
    guid: creditCard.guid,
    version: lazy.CREDIT_CARD_SCHEMA_VERSION,
  };

  for (const [jsKey, rustKey] of Object.entries(JS_TO_RUST_STRING_FIELD)) {
    const value = creditCard[rustKey];
    if (value !== undefined && value !== "") {
      record[jsKey] = value;
    }
  }

  // 0 is how an absent expiry reaches us: the columns are non-optional i64 and
  // a record written without one stored zero.
  for (const [jsKey, rustKey] of Object.entries(JS_TO_RUST_INTEGER_FIELD)) {
    if (creditCard[rustKey]) {
      record[jsKey] = creditCard[rustKey];
    }
  }

  if (creditCard.ccNumberEnc) {
    record["cc-number-encrypted"] = creditCard.ccNumberEnc;
  }
  if (creditCard.ccNumberLast4) {
    record["cc-number"] =
      MASK_CHARACTER.repeat(
        Math.max(0, MASKED_NUMBER_LENGTH - creditCard.ccNumberLast4.length)
      ) + creditCard.ccNumberLast4;
  }

  record.timeCreated = creditCard.timeCreated;
  record.timeLastUsed = creditCard.timeLastUsed ?? 0;
  record.timeLastModified = creditCard.timeLastModified;
  record.timesUsed = creditCard.timesUsed;

  // Only the name components and cc-exp are derived here. cc-type is stored:
  // computeFields re-detects it from cc-number, which is masked by now, and
  // leaves it alone when it cannot read one.
  lazy.CreditCardRecord.computeFields(record);

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
 * Adapter presenting the AutofillRecords credit card interface over the Rust
 * Store.
 */
export class RustAutofillCreditCardsAdapter extends RustAutofillAdapterBase {
  static _instance = null;

  get _dataType() {
    return lazy.AutofillDataTypes.CREDIT_CARD;
  }

  get _logger() {
    return logger;
  }

  get _recordApi() {
    return lazy.CreditCardRecord;
  }

  get _validFields() {
    return lazy.VALID_CREDIT_CARD_FIELDS;
  }

  _recordFromRust(creditCard) {
    return creditCardToJsRecord(creditCard);
  }

  _normalize(record, preserveEmptyFields = false) {
    lazy.CreditCardRecord.normalizeFields(record);
    this._normalizeCanonicalFields(record, preserveEmptyFields);
    if (!Object.keys(record).length) {
      throw new Error("Record contains no valid field.");
    }
    return record;
  }

  // ---- Store operations -------------------------------------------------

  _countAll(store) {
    return store.countAllCreditCards();
  }

  _get(store, guid) {
    return store.getCreditCard(guid);
  }

  _getAll(store) {
    return store.getAllCreditCards();
  }

  _delete(store, guid) {
    return store.deleteCreditCard(guid);
  }

  _deleteAll(store) {
    return store.deleteAllCreditCards();
  }

  _touch(store, guid) {
    return store.touchCreditCard(guid);
  }

  async _add(store, record) {
    return store.addCreditCard(
      jsRecordToUpdatableCreditCardFields(
        record,
        await this.#encryptNumber(record)
      )
    );
  }

  async _update(store, guid, record) {
    return store.updateCreditCard(
      guid,
      jsRecordToUpdatableCreditCardFields(
        record,
        await this.#encryptNumber(record)
      )
    );
  }

  _addManyWithMeta(store, entries) {
    return store.addManyCreditCardsWithMeta(entries);
  }

  _toBulkOutcome(result) {
    return result instanceof lazy.CreditCardBulkResultEntry.Error
      ? { error: result.message }
      : { guid: result.creditCard.guid };
  }

  _addManyTombstones(store, tombstones) {
    return store.addManyCreditCardTombstones(
      tombstones.map(
        t =>
          new lazy.CreditCardTombstone({
            guid: t.guid,
            timeDeleted: t.timeDeleted,
          })
      )
    );
  }

  _toBulkTombstoneOutcome(result) {
    return result instanceof lazy.CreditCardBulkTombstoneResultEntry.Error
      ? { error: result.message }
      : { guid: result.guid };
  }

  _updateWithMeta(store, entry) {
    return store.updateCreditCardWithMeta(entry);
  }

  // ---- Credit card specifics --------------------------------------------

  /**
   * Reject a complete record that cannot be stored. Mirrors
   * CreditCardsBase._validateFields, and is called where that is: on the whole
   * record, after a merge rather than before one, because the field it requires
   * can arrive from either side.
   *
   * normalizeFields drops a number that does not validate, so an invalid number
   * and a missing one reach this the same way.
   *
   * A masked number is refused too. `cc-number` is held masked, and
   * _prepareStoredForMerge is what replaces it with the decrypted number before
   * a merge can take it -- so a mask arriving here means that did not happen,
   * and #encryptNumber would store the mask in place of the card. Checking it
   * where the invariant is asserted keeps it from depending on the hook having
   * run.
   *
   * @param {object} record
   */
  _validateRecord(record) {
    if (!record["cc-number"]) {
      throw new Error("Missing/invalid cc-number");
    }
  }

  /**
   * Restore the number, so a stored record can be merged with. Mirrors
   * CreditCardsBase._stripComputedFields: `cc-number` is held masked and the
   * number itself only in `cc-number-encrypted`, so a merge that kept the mask
   * would encrypt it as though it were the number.
   *
   * The mask goes first and is put back only by a decryption that succeeded.
   * There is nothing to restore it from otherwise -- scrubEncryptedData() blanks
   * `cc_number_enc` and leaves `cc_number_last_4`, so a record can hold a mask
   * and no ciphertext -- and leaving it would store the mask as the number.
   * _validateRecord refuses the update instead.
   *
   * @param {object} record The record, modified in place.
   */
  async _prepareStoredForMerge(record) {
    const encrypted = record["cc-number-encrypted"];
    delete record["cc-number"];
    if (!encrypted) {
      return;
    }
    try {
      record["cc-number"] = await lazy.OSKeyStore.decrypt(
        encrypted,
        "formautofill_cc"
      );
    } catch (e) {
      if (e.result == Cr.NS_ERROR_ABORT) {
        throw e;
      }
      // Quietly recover, so an entry whose number cannot be decrypted can still
      // be updated -- by a caller that supplies a new number.
    }
  }

  /**
   * As the JSON store does before it saves: normalizeFields derives cc-type
   * from the number, so an edit that did not carry one left it empty and the
   * merge dropped it. Without this the stored type is cleared.
   *
   * @param {object} record The record, modified in place.
   */
  _recomputeBeforeWrite(record) {
    lazy.CreditCardRecord.computeFields(record);
  }

  /**
   * The record's number, encrypted for storage.
   *
   * Interim, and the only place this adapter encrypts. OSKeyStore is the same
   * mechanism and key as the JSON store's `cc-number-encrypted`, so a number
   * written here stays readable by every existing consumer and no new key is
   * introduced; the store treats `cc_number_enc` as opaque on every path used
   * here. The Application Services key API is deliberately unused until who
   * owns that key is settled -- when it is, this, _prepareStoredForMerge and
   * _recordForMigrationExport are what change, all three being the places this
   * file reaches for a key.
   *
   * @param {object} record A record _validateRecord has accepted.
   * @returns {Promise<string>}
   */
  #encryptNumber(record) {
    // The only place that encrypts, and so where a mask is refused: storing
    // one would put it in place of the card number.
    if (isMasked(record["cc-number"])) {
      throw new Error("Got a masked cc-number when encrypting");
    }
    return lazy.OSKeyStore.encrypt(record["cc-number"]);
  }

  /**
   * For the migration only. The metadata is taken from the record as given
   * rather than advanced, so unlike a user's edit this neither refreshes
   * timeLastModified nor increments the sync change counter.
   *
   * The record arrives with its number in the clear, from the source store's
   * _recordForMigrationExport, and is encrypted here -- this store encrypts on
   * its own terms rather than inheriting the other's ciphertext. Today that is
   * the same OS key store either way; when this store owns its own key, only
   * #encryptNumber changes.
   *
   * @param {object} record
   */
  async _fieldsWithMeta(record) {
    const fields = jsRecordToUpdatableCreditCardFields(
      record,
      record["cc-number"] ? await this.#encryptNumber(record) : ""
    );
    return new lazy.UpdatableCreditCardFieldsWithMeta({
      fields,
      meta: new lazy.CreditCardMeta({
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
   * Hand a card over with its number in the clear, so the receiving store can
   * encrypt it under its own scheme. The counterpart of
   * CreditCardsBase._recordForMigrationExport, and refuses the same way: a
   * record whose number will not decrypt throws rather than being copied
   * without it.
   *
   * @param {object} record
   * @returns {Promise<object>}
   */
  async _recordForMigrationExport(record) {
    const exported = { ...record };
    if (!exported["cc-number-encrypted"]) {
      // Nothing to read the number out of. scrubEncryptedData() blanks
      // cc_number_enc and keeps cc_number_last_4, so a scrubbed record reads
      // back as a mask with no ciphertext -- the number is already gone, and
      // handing the mask over has the receiving store encrypt it in place of
      // the card. Refuse it, as a decrypt failure below does. A record that
      // never had a number has no mask either, and crosses unchanged.
      if (isMasked(exported["cc-number"])) {
        throw new Error("Got a masked cc-number when exporting");
      }
      return exported;
    }
    exported["cc-number"] = await lazy.OSKeyStore.decrypt(
      exported["cc-number-encrypted"],
      "formautofill_cc"
    );
    delete exported["cc-number-encrypted"];
    return exported;
  }
}
