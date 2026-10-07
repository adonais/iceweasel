/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Exercises RustAutofillCreditCardsAdapter: JS credit card records round-trip
 * through the Rust Store, the number is stored encrypted and read back masked,
 * computed fields are reconstructed on read, and storage-changed observers
 * fire.
 */

const { RustAutofillCreditCardsAdapter } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillCreditCardStorage.sys.mjs"
);
const { RustAutofillAdapterBase } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillAdapterBase.sys.mjs"
);
const { Store } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs"
);
const { OSKeyStore } = ChromeUtils.importESModule(
  "resource://gre/modules/OSKeyStore.sys.mjs"
);

const TEST_NUMBER = "4111111111111111";
// 15 digits, so it exercises the mask this store cannot rebuild at its original
// width. See MASKED_NUMBER_LENGTH.
const TEST_NUMBER_AMEX = "378282246310005";

const TEST_RECORD = {
  "cc-name": "Jane Doe",
  "cc-number": TEST_NUMBER,
  "cc-exp-month": 4,
  "cc-exp-year": 2030,
};

// What a number reads back as: this store keeps only the last four digits, so
// the mask is rebuilt at a fixed width rather than the card's own.
function maskFor(number) {
  return "•".repeat(16 - 4) + number.slice(-4);
}

function waitForStorageChanged(expectedAction) {
  return new Promise(resolve => {
    Services.obs.addObserver(function obs(subject, _topic, action) {
      if (action != expectedAction) {
        return;
      }
      Services.obs.removeObserver(obs, "formautofill-storage-changed");
      resolve(subject.wrappedJSObject);
    }, "formautofill-storage-changed");
  });
}

async function newAdapter(name) {
  const store = await Store.init(FileTestUtils.getTempFile(name).path);
  return { store, adapter: new RustAutofillCreditCardsAdapter(store) };
}

add_task(async function test_adapter_crud_and_computed_fields() {
  const { adapter } = await newAdapter("autofill-cc-adapter.sqlite");

  // isEmpty() answers from a cached count and reports empty until something
  // primes it, so prime it first: without this the assertion passes whatever
  // the store holds.
  await adapter.refreshCount();
  Assert.ok(adapter.isEmpty(), "adapter starts empty");

  const addNotified = waitForStorageChanged("add");
  const guid = await adapter.add(TEST_RECORD);
  const addSubject = await addNotified;
  Assert.ok(guid, "add returns a guid");
  Assert.equal(
    addSubject.collectionName,
    "creditCards",
    "notifies creditCards"
  );
  Assert.equal(addSubject.guid, guid, "notifies the added guid");
  Assert.ok(!adapter.isEmpty(), "not empty after add");

  const fetched = await adapter.get(guid);
  Assert.equal(fetched.guid, guid, "guid round-trips");
  Assert.equal(fetched["cc-name"], "Jane Doe", "cc-name");
  Assert.equal(fetched["cc-exp-month"], 4, "cc-exp-month round-trips as i64");
  Assert.equal(fetched["cc-exp-year"], 2030, "cc-exp-year round-trips as i64");
  Assert.equal(fetched.timesUsed, 0, "timesUsed starts at 0");

  // The plaintext number is never handed back.
  Assert.notEqual(fetched["cc-number"], TEST_NUMBER, "number is not in clear");
  Assert.equal(
    fetched["cc-number"],
    maskFor(TEST_NUMBER),
    "masked number keeps the last four digits and nothing else"
  );
  Assert.equal(
    await OSKeyStore.decrypt(fetched["cc-number-encrypted"], "formautofill_cc"),
    TEST_NUMBER,
    "the stored ciphertext decrypts to the number that was written"
  );

  // Computed fields reconstructed by CreditCardRecord.computeFields.
  Assert.equal(fetched["cc-given-name"], "Jane", "computed cc-given-name");
  Assert.equal(fetched["cc-family-name"], "Doe", "computed cc-family-name");
  Assert.equal(fetched["cc-exp"], "2030-04", "computed cc-exp");
  // cc-type is stored, not re-detected: the number is masked by read time, so
  // re-detecting would clear it.
  Assert.equal(fetched["cc-type"], "visa", "cc-type survives the round trip");

  const all = await adapter.getAll();
  Assert.equal(all.length, 1, "getAll returns one");

  const names = await adapter.getSavedFieldNames();
  Assert.ok(names.has("cc-name"), "saved field names include cc-name");
  Assert.ok(
    names.has("cc-exp-month"),
    "saved field names include cc-exp-month"
  );

  await adapter.notifyUsed(guid);
  Assert.equal(
    (await adapter.get(guid)).timesUsed,
    1,
    "timesUsed incremented by notifyUsed"
  );

  const removeNotified = waitForStorageChanged("remove");
  await adapter.remove(guid);
  await removeNotified;
  Assert.ok(adapter.isEmpty(), "empty after remove");
});

add_task(async function test_update_without_restating_the_number() {
  const { adapter } = await newAdapter("autofill-cc-adapter-update.sqlite");
  const guid = await adapter.add(TEST_RECORD);

  // preserveOldProperties is how a caller edits one field without restating the
  // number. The stored cc-number is the mask, so the merge has to pick up the
  // decrypted number instead -- encrypting the mask would destroy the number.
  await adapter.update(guid, { "cc-name": "Jane Q. Doe" }, true);

  const updated = await adapter.get(guid);
  Assert.equal(updated["cc-name"], "Jane Q. Doe", "update persisted cc-name");
  Assert.equal(
    await OSKeyStore.decrypt(updated["cc-number-encrypted"], "formautofill_cc"),
    TEST_NUMBER,
    "the number survives an edit that did not restate it"
  );
  Assert.equal(
    updated["cc-number"],
    maskFor(TEST_NUMBER),
    "and the mask still shows the right last four"
  );
  // normalizeFields re-derives cc-type from the number, and the merged record
  // carries the decrypted one, so the type survives.
  Assert.equal(updated["cc-type"], "visa", "cc-type is not cleared");
  // The expiry does not, and this matches the JSON store rather than diverging
  // from it: normalizeFields writes "" into cc-exp-month and cc-exp-year for a
  // record that supplied neither, and "" is not undefined, so
  // preserveOldProperties never falls back to the stored value and the merge
  // drops the field. CreditCardsBase.update loses it the same way. Asserted so
  // the parity is pinned -- if the JSON store is ever fixed, this should fail.
  Assert.ok(
    !("cc-exp-month" in updated),
    "cc-exp-month is cleared, as it is in the JSON store"
  );
  Assert.ok(
    !("cc-exp-year" in updated),
    "cc-exp-year is cleared, as it is in the JSON store"
  );
});

add_task(async function test_update_after_a_scrub_does_not_store_the_mask() {
  const { store, adapter } = await newAdapter(
    "autofill-cc-adapter-scrubbed.sqlite"
  );
  const guid = await adapter.add(TEST_RECORD);

  // scrubEncryptedData() blanks cc_number_enc and leaves cc_number_last_4, so
  // the record still reads back with a mask but has no number behind it. A
  // merge that kept that mask would encrypt it and store it as the number.
  await store.scrubEncryptedData();

  const scrubbed = await adapter.get(guid);
  Assert.ok(
    !scrubbed["cc-number-encrypted"],
    "the ciphertext is gone after a scrub"
  );
  Assert.ok(scrubbed["cc-number"], "but the mask is still derived from last4");

  await Assert.rejects(
    adapter.update(guid, { "cc-name": "Jane Q. Doe" }, true),
    /Missing\/invalid cc-number/,
    "an update with no number to restore is refused rather than storing the mask"
  );
});

add_task(async function test_update_without_a_number_is_refused() {
  const { adapter } = await newAdapter("autofill-cc-adapter-nonumber.sqlite");
  const guid = await adapter.add(TEST_RECORD);

  // Without preserveOldProperties the merge takes every field from the caller,
  // and a masked cc-number does not validate, so nothing supplies a number.
  // CreditCardsBase.update refuses the same call for the same reason.
  await Assert.rejects(
    adapter.update(guid, {
      "cc-name": "Jane Q. Doe",
      "cc-number": (await adapter.get(guid))["cc-number"],
    }),
    /Missing\/invalid cc-number/,
    "an update that carries only the mask is refused"
  );
});

add_task(async function test_update_replacing_the_number() {
  const { adapter } = await newAdapter("autofill-cc-adapter-renumber.sqlite");
  const guid = await adapter.add(TEST_RECORD);

  const replacement = "5555555555554444";
  await adapter.update(guid, { ...TEST_RECORD, "cc-number": replacement });

  const updated = await adapter.get(guid);
  Assert.equal(
    await OSKeyStore.decrypt(updated["cc-number-encrypted"], "formautofill_cc"),
    replacement,
    "a restated number is re-encrypted"
  );
  Assert.equal(
    updated["cc-number"],
    maskFor(replacement),
    "and the mask follows the new number"
  );
  Assert.equal(updated["cc-type"], "mastercard", "cc-type follows the number");
});

add_task(async function test_shorter_number_reads_back_at_the_fixed_width() {
  const { adapter } = await newAdapter("autofill-cc-adapter-amex.sqlite");
  const guid = await adapter.add({
    ...TEST_RECORD,
    "cc-number": TEST_NUMBER_AMEX,
  });

  // Only the last four digits are stored, so the original length is gone and a
  // 15-digit card reads back one character wider than the JSON store wrote it.
  // Accepted, and the reason cc-number is not a stored field: a migration must
  // not read this as an unfaithful copy.
  const fetched = await adapter.get(guid);
  Assert.equal(
    fetched["cc-number"],
    maskFor(TEST_NUMBER_AMEX),
    "a 15-digit card is masked to the same width as a 16-digit one"
  );
  Assert.equal(
    fetched["cc-number"].length,
    16,
    "which is wider than the card it came from"
  );
  Assert.equal(fetched["cc-type"], "amex", "cc-type still detected");
  Assert.equal(
    await OSKeyStore.decrypt(fetched["cc-number-encrypted"], "formautofill_cc"),
    TEST_NUMBER_AMEX,
    "and the number itself is unharmed"
  );
});

add_task(async function test_record_without_an_expiry() {
  const { adapter } = await newAdapter("autofill-cc-adapter-noexp.sqlite");
  const guid = await adapter.add({
    "cc-name": "Jane Doe",
    "cc-number": TEST_NUMBER,
  });

  // The expiry columns are non-optional i64, so an absent expiry is stored as
  // 0 and has to read back as absent rather than as month 0 of year 0.
  const fetched = await adapter.get(guid);
  Assert.ok(!("cc-exp-month" in fetched), "no cc-exp-month");
  Assert.ok(!("cc-exp-year" in fetched), "no cc-exp-year");
  Assert.ok(!("cc-exp" in fetched), "and nothing computed from them");
  Assert.equal(fetched["cc-name"], "Jane Doe", "the rest of the record stands");
});

add_task(async function test_add_rejects_a_record_without_a_valid_number() {
  const { adapter } = await newAdapter("autofill-cc-adapter-invalid.sqlite");

  await Assert.rejects(
    adapter.add({ "cc-name": "Jane Doe", "cc-exp-month": 4 }),
    /Missing\/invalid cc-number/,
    "a record with no number is refused"
  );
  await Assert.rejects(
    adapter.add({ ...TEST_RECORD, "cc-number": "1234" }),
    /Missing\/invalid cc-number/,
    "a record whose number does not validate is refused"
  );
});

add_task(async function test_billing_address_guid_does_not_survive() {
  const { adapter } = await newAdapter("autofill-cc-adapter-billing.sqlite");

  // The Rust credit card schema has no column for it, so it is not in
  // JS_TO_RUST_FIELD and the write drops it. Asserted so that the day
  // application-services grows the column, this test is what says so.
  const guid = await adapter.add({
    ...TEST_RECORD,
    billingAddressGUID: "SomeAddressGuid",
  });
  Assert.ok(
    !("billingAddressGUID" in (await adapter.get(guid))),
    "billingAddressGUID is absent from the stored record"
  );
});

add_task(async function test_add_many_with_meta_bulk_import() {
  const { adapter } = await newAdapter("autofill-cc-adapter-bulk.sqlite");

  const records = [
    {
      ...TEST_RECORD,
      guid: "BulkGuid0001",
      timeCreated: 1600000000000,
      timeLastModified: 1600000000000,
      timesUsed: 1,
    },
    {
      ...TEST_RECORD,
      "cc-name": "John Roe",
      guid: "BulkGuid0002",
      timeCreated: 1600000002000,
      timeLastModified: 1600000002000,
      timesUsed: 5,
    },
  ];

  const results = await adapter.addManyWithMeta(records);
  Assert.equal(results.length, 2, "one result per input record");
  Assert.deepEqual(
    results.map(r => r.guid),
    ["BulkGuid0001", "BulkGuid0002"],
    "each result reports its preserved guid, in order"
  );
  Assert.ok(
    results.every(r => !r.error),
    "no per-record errors for valid records"
  );

  const all = await adapter.getAll();
  Assert.equal(all.length, 2, "both records imported");
  const byGuid = Object.fromEntries(all.map(r => [r.guid, r]));
  Assert.equal(byGuid.BulkGuid0002["cc-name"], "John Roe", "fields preserved");
  Assert.equal(byGuid.BulkGuid0002.timesUsed, 5, "timesUsed preserved");
  Assert.equal(
    byGuid.BulkGuid0001.timeCreated,
    1600000000000,
    "timeCreated preserved"
  );
  Assert.equal(
    byGuid.BulkGuid0001.timeLastModified,
    1600000000000,
    "timeLastModified preserved, rather than stamped with now"
  );
  // The number arrives in the clear and is encrypted on the way in, so what is
  // stored is this store's own ciphertext rather than the caller's.
  Assert.equal(
    await OSKeyStore.decrypt(
      byGuid.BulkGuid0001["cc-number-encrypted"],
      "formautofill_cc"
    ),
    TEST_NUMBER,
    "and the number was encrypted by this store"
  );
});

add_task(async function test_add_many_with_meta_isolates_per_record_failure() {
  const { adapter } = await newAdapter("autofill-cc-adapter-bulkfail.sqlite");

  // Two records sharing a guid: the second insert collides and must be
  // reported as an error without aborting the good one, and without leaving a
  // half-written row behind -- which is what the store's savepoint is for.
  const results = await adapter.addManyWithMeta([
    {
      ...TEST_RECORD,
      guid: "DupGuid00001",
      timeCreated: 1,
      timeLastModified: 1,
    },
    {
      ...TEST_RECORD,
      guid: "DupGuid00001",
      timeCreated: 2,
      timeLastModified: 2,
    },
  ]);

  Assert.equal(results.length, 2, "one result per input record");
  Assert.ok(!results[0].error, "first record succeeds");
  Assert.ok(
    results[1].error,
    "second (duplicate guid) record reports an error"
  );
  Assert.equal(
    (await adapter.getAll()).length,
    1,
    "the good record is still persisted despite the sibling failure"
  );
});

add_task(async function test_update_many_with_meta_replaces_metadata() {
  const { adapter } = await newAdapter("autofill-cc-adapter-updmany.sqlite");
  await adapter.addManyWithMeta([
    {
      ...TEST_RECORD,
      guid: "UpdGuid00001",
      timeCreated: 1,
      timeLastModified: 1,
    },
  ]);

  // Unlike update(), the metadata comes from the record rather than the store:
  // this is replicating another store, not recording an edit.
  const results = await adapter.updateManyWithMeta([
    {
      ...TEST_RECORD,
      "cc-name": "Renamed",
      guid: "UpdGuid00001",
      timeCreated: 1,
      timeLastModified: 999,
      timesUsed: 7,
    },
  ]);
  Assert.deepEqual(results, [{ guid: "UpdGuid00001" }], "reports the guid");

  const updated = await adapter.get("UpdGuid00001");
  Assert.equal(updated["cc-name"], "Renamed", "fields replaced");
  Assert.equal(
    updated.timeLastModified,
    999,
    "timeLastModified taken as given"
  );
  Assert.equal(updated.timesUsed, 7, "timesUsed taken as given");

  // A guid the store does not hold is an error, not an insert: the caller is
  // replicating, so a disagreement has to be reported rather than repaired.
  const missing = await adapter.updateManyWithMeta([
    { ...TEST_RECORD, guid: "NoSuchGuid01" },
  ]);
  Assert.ok(missing[0].error, "a missing guid reports an error");
  Assert.equal((await adapter.getAll()).length, 1, "and inserts nothing");
});

add_task(async function test_remove_many_and_tombstones() {
  const { adapter } = await newAdapter("autofill-cc-adapter-rmmany.sqlite");
  await adapter.addManyWithMeta([
    {
      ...TEST_RECORD,
      guid: "RmGuid000001",
      timeCreated: 1,
      timeLastModified: 1,
    },
    {
      ...TEST_RECORD,
      guid: "RmGuid000002",
      timeCreated: 1,
      timeLastModified: 1,
    },
  ]);

  const removed = await adapter.removeMany(["RmGuid000001"]);
  Assert.deepEqual(removed, [{ guid: "RmGuid000001" }], "reports the guid");
  Assert.equal((await adapter.getAll()).length, 1, "only that one is gone");

  // Tombstones for records deleted elsewhere and not yet uploaded. A guid the
  // store still holds is refused, and must not take the batch down with it.
  const results = await adapter.addManyTombstones([
    { guid: "RmGuid000002", timeDeleted: 1234 },
    { guid: "GoneGuid0001", timeDeleted: 5678 },
  ]);
  Assert.equal(results.length, 2, "one result per tombstone");
  Assert.ok(results[0].error, "a guid the store still holds is refused");
  Assert.deepEqual(results[1], { guid: "GoneGuid0001" }, "the other is taken");
  Assert.equal(
    (await adapter.getAll()).length,
    1,
    "and the live record is untouched"
  );

  // wipe() clears the tombstones too, so the same guids can be re-imported.
  await adapter.wipe();
  const reimported = await adapter.addManyWithMeta([
    {
      ...TEST_RECORD,
      guid: "GoneGuid0001",
      timeCreated: 1,
      timeLastModified: 1,
    },
  ]);
  Assert.ok(!reimported[0].error, "a wiped tombstone no longer blocks a guid");
});

add_task(async function test_record_for_migration_export() {
  const { adapter } = await newAdapter("autofill-cc-adapter-export.sqlite");
  const guid = await adapter.add(TEST_RECORD);

  const stored = await adapter.get(guid);
  const exported = await adapter._recordForMigrationExport(stored);

  // The receiving store encrypts under its own scheme, so the number crosses in
  // the clear and this store's ciphertext does not cross at all.
  Assert.equal(
    exported["cc-number"],
    TEST_NUMBER,
    "the number is handed over in the clear"
  );
  Assert.ok(
    !("cc-number-encrypted" in exported),
    "and this store's ciphertext is not"
  );
  Assert.equal(exported.guid, guid, "the rest of the record comes along");
  Assert.equal(exported["cc-name"], "Jane Doe", "including the name");

  // A copy, so the caller is still holding the record it read.
  Assert.equal(
    stored["cc-number"],
    maskFor(TEST_NUMBER),
    "the record passed in keeps its mask"
  );
  Assert.ok(stored["cc-number-encrypted"], "and its ciphertext");
});

add_task(async function test_migration_export_refuses_an_unreadable_number() {
  const { adapter } = await newAdapter("autofill-cc-adapter-exportbad.sqlite");

  // Unlike #stripComputedFields, which swallows a decrypt failure so the other
  // fields of an unreadable card can still be edited, an export has no such
  // excuse: handing the record over without its number would encrypt the mask
  // in place of the card. So it throws, and the migrator counts the record as
  // failed and leaves the source alone.
  await Assert.rejects(
    adapter._recordForMigrationExport({
      guid: "BadGuid00001",
      "cc-name": "Jane Doe",
      "cc-number": maskFor(TEST_NUMBER),
      "cc-number-encrypted": "this is not a ciphertext",
    }),
    /./,
    "a number that will not decrypt throws rather than being copied without it"
  );
});

add_task(async function test_migration_export_refuses_a_scrubbed_record() {
  const { store, adapter } = await newAdapter(
    "autofill-cc-adapter-exportscrub.sqlite"
  );
  const guid = await adapter.add(TEST_RECORD);

  // A scrub blanks cc_number_enc and leaves cc_number_last_4, so get() still
  // derives a mask but there is no ciphertext to decrypt. Handing that mask
  // over would have the receiving store encrypt it in place of the card, so
  // the export refuses it the same way it refuses a number that will not
  // decrypt.
  await store.scrubEncryptedData();
  const scrubbed = await adapter.get(guid);
  Assert.equal(
    scrubbed["cc-number"],
    maskFor(TEST_NUMBER),
    "the scrubbed record still reads back with a mask"
  );

  await Assert.rejects(
    adapter._recordForMigrationExport(scrubbed),
    /Got a masked cc-number when exporting/,
    "which the export refuses rather than handing over"
  );
});

add_task(async function test_migration_export_allows_a_record_with_no_number() {
  const { adapter } = await newAdapter("autofill-cc-adapter-exportnone.sqlite");

  // No ciphertext and no mask either: nothing was lost, so there is nothing to
  // refuse. This is what keeps the guard above from failing a whole migration
  // over a record that never carried a number.
  const exported = await adapter._recordForMigrationExport({
    guid: "NoNumber0001",
    "cc-name": "Jane Doe",
  });
  Assert.equal(exported["cc-name"], "Jane Doe", "the record crosses unchanged");
  Assert.ok(!("cc-number" in exported), "still with no number");
});

add_task(async function test_bulk_import_refuses_a_masked_number() {
  const { adapter } = await newAdapter("autofill-cc-adapter-bulkmask.sqlite");

  // addManyWithMeta does not go through _validateRecord, so the mask is
  // refused in _fieldsWithMeta instead. A migration exports before it copies,
  // so this should be unreachable -- but encrypting a mask in place of the
  // card cannot be undone, and failing the run leaves the profile where it is.
  await Assert.rejects(
    adapter.addManyWithMeta([
      {
        ...TEST_RECORD,
        guid: "MaskGuid0001",
        "cc-number": maskFor(TEST_NUMBER),
        timeCreated: 1,
        timeLastModified: 1,
      },
    ]),
    /Got a masked cc-number when encrypting/,
    "the batch fails rather than storing the mask as the card number"
  );
  Assert.equal((await adapter.getAll()).length, 0, "and nothing was written");
});

add_task(async function test_update_cannot_store_a_mask_as_the_number() {
  const { store } = await newAdapter("autofill-cc-adapter-maskguard.sqlite");

  // A subclass that does not restore the number must still be unable to store
  // the mask as the card. The check lives where the invariant is asserted, not
  // where it is prepared, so it does not depend on the hook having run.
  class NoRestore extends RustAutofillCreditCardsAdapter {
    async _prepareStoredForMerge() {}
  }

  const adapter = new NoRestore(store);
  const guid = await adapter.add(TEST_RECORD);
  await Assert.rejects(
    adapter.update(guid, { "cc-name": "Jane Q. Doe" }, true),
    /Got a masked cc-number when encrypting/,
    "a masked number is refused rather than encrypted as the card"
  );
  Assert.equal(
    await OSKeyStore.decrypt(
      (await adapter.get(guid))["cc-number-encrypted"],
      "formautofill_cc"
    ),
    TEST_NUMBER,
    "and the stored number is untouched"
  );
});

add_task(async function test_get_instance_is_memoized_per_collection() {
  const sentinel = {};
  RustAutofillCreditCardsAdapter._instance = sentinel;
  Assert.equal(
    RustAutofillCreditCardsAdapter.getInstance(),
    sentinel,
    "getInstance hands back the adapter it already built"
  );
  // The base holding none is what keeps two collections from sharing one.
  Assert.equal(
    RustAutofillAdapterBase._instance,
    undefined,
    "the memoized adapter is stored on the subclass, not the base"
  );
  RustAutofillCreditCardsAdapter._instance = null;
});

add_task(async function test_subclass_must_define_a_data_type_getter() {
  class NoDataType extends RustAutofillAdapterBase {}
  Assert.throws(
    () => new NoDataType(Promise.resolve({})),
    /_dataType getter/,
    "the constructor refuses a subclass with no _dataType, rather than failing later"
  );
});

add_task(async function test_get_distinguishes_missing_from_unreadable() {
  const { adapter } = await newAdapter("autofill-cc-adapter-get.sqlite");

  Assert.equal(
    await adapter.get("NoSuchGuid01"),
    null,
    "a guid the store does not hold reads as null"
  );

  // A store that cannot be read must not answer "no such record": callers take
  // that as an empty slot, open the edit dialog blank as though the user were
  // creating a card, and saving writes a second record on top of the one that
  // could not be read.
  const unreadable = new RustAutofillCreditCardsAdapter({
    getCreditCard: () => Promise.reject(new Error("database is locked")),
  });
  await Assert.rejects(
    unreadable.get("AnyGuid00001"),
    /database is locked/,
    "a failure to read propagates rather than reading as not-found"
  );
});
