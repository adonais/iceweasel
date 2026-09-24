/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Exercises RustAutofillAddressesAdapter: JS address records (hyphenated
 * keys) round-trip through the Rust Store, computed fields are reconstructed on
 * read, and storage-changed observers fire.
 */

const { RustAutofillAddressesAdapter } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillAddressStorage.sys.mjs"
);
const { Store } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAutofill.sys.mjs"
);

const TEST_RECORD = {
  name: "Jane Doe",
  organization: "Mozilla",
  "street-address": "331 E Evelyn Ave",
  "address-level2": "Mountain View",
  "address-level1": "CA",
  "postal-code": "94041",
  country: "US",
  tel: "+16505551234",
  email: "jane@example.com",
};

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

add_task(async function test_adapter_crud_and_computed_fields() {
  const dbPath = FileTestUtils.getTempFile("autofill-adapter.sqlite").path;
  const adapter = new RustAutofillAddressesAdapter(await Store.init(dbPath));

  // isEmpty() answers from a cached count and reports empty until something
  // primes it, so prime it first: without this the assertion passes whatever
  // the store holds.
  await adapter.refreshCount();
  Assert.ok(adapter.isEmpty(), "adapter starts empty");

  // add -> fires "add" with the addresses collection
  const addNotified = waitForStorageChanged("add");
  const guid = await adapter.add(TEST_RECORD);
  const addSubject = await addNotified;
  Assert.ok(guid, "add returns a guid");
  Assert.equal(addSubject.collectionName, "addresses", "notifies addresses");
  Assert.equal(addSubject.guid, guid, "notifies the added guid");
  Assert.ok(!adapter.isEmpty(), "not empty after add");

  // get -> canonical fields round-trip (hyphenated keys) + computed fields
  const fetched = await adapter.get(guid);
  Assert.equal(fetched.guid, guid, "guid round-trips");
  Assert.equal(fetched["street-address"], "331 E Evelyn Ave", "street-address");
  Assert.equal(fetched["address-level1"], "CA", "address-level1");
  Assert.equal(fetched["postal-code"], "94041", "postal-code");
  Assert.equal(fetched.email, "jane@example.com", "email");
  // computed fields reconstructed by AddressRecord.computeFields
  Assert.equal(fetched["given-name"], "Jane", "computed given-name");
  Assert.equal(fetched["family-name"], "Doe", "computed family-name");
  Assert.ok(fetched["country-name"], "computed country-name present");
  Assert.equal(fetched.timesUsed, 0, "timesUsed starts at 0");

  // getAll
  const all = await adapter.getAll();
  Assert.equal(all.length, 1, "getAll returns one");

  // getSavedFieldNames
  const names = await adapter.getSavedFieldNames();
  Assert.ok(
    names.has("street-address"),
    "saved field names include street-address"
  );
  Assert.ok(names.has("email"), "saved field names include email");

  // notifyUsed -> timesUsed increments
  await adapter.notifyUsed(guid);
  Assert.equal(
    (await adapter.get(guid)).timesUsed,
    1,
    "timesUsed incremented by notifyUsed"
  );

  // update
  await adapter.update(guid, { ...TEST_RECORD, name: "Jane Q. Doe" });
  const updated = await adapter.get(guid);
  Assert.equal(updated.name, "Jane Q. Doe", "update persisted name");
  Assert.equal(
    updated["family-name"],
    "Doe",
    "computed family-name after update"
  );

  // remove -> empty
  const removeNotified = waitForStorageChanged("remove");
  await adapter.remove(guid);
  await removeNotified;
  Assert.ok(adapter.isEmpty(), "empty after remove");
});

add_task(async function test_add_many_with_meta_bulk_import() {
  const dbPath = FileTestUtils.getTempFile("autofill-adapter-bulk.sqlite").path;
  const adapter = new RustAutofillAddressesAdapter(await Store.init(dbPath));

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
      guid: "BulkGuid0002",
      name: "John Roe",
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
  Assert.equal(byGuid.BulkGuid0002.name, "John Roe", "fields preserved");
  Assert.equal(byGuid.BulkGuid0002.timesUsed, 5, "timesUsed preserved");
  Assert.equal(
    byGuid.BulkGuid0002["street-address"],
    "331 E Evelyn Ave",
    "canonical fields preserved"
  );
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
  Assert.equal(
    (await adapter.get("BulkGuid0001")).guid,
    "BulkGuid0001",
    "and each record is retrievable by the guid it kept"
  );
});

add_task(async function test_add_many_with_meta_isolates_per_record_failure() {
  const dbPath = FileTestUtils.getTempFile(
    "autofill-adapter-bulkfail.sqlite"
  ).path;
  const adapter = new RustAutofillAddressesAdapter(await Store.init(dbPath));

  // Two records sharing a guid: the second insert collides (duplicate primary
  // key) and must be reported as an error without aborting the good one.
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

add_task(async function test_get_distinguishes_missing_from_unreadable() {
  const dbPath = FileTestUtils.getTempFile("autofill-adapter-get.sqlite").path;
  const adapter = new RustAutofillAddressesAdapter(await Store.init(dbPath));

  Assert.equal(
    await adapter.get("NoSuchGuid01"),
    null,
    "a guid the store does not hold reads as null"
  );

  // A store that cannot be read must not answer "no such record": callers take
  // that as an empty slot. FormAutofillPreferences opens the edit dialog blank
  // as though the user were creating an address, and saving it writes a second
  // record on top of the one that could not be read.
  const unreadable = new RustAutofillAddressesAdapter({
    getAddress: () => Promise.reject(new Error("database is locked")),
  });
  await Assert.rejects(
    unreadable.get("AnyGuid00001"),
    /database is locked/,
    "a failure to read propagates rather than reading as not-found"
  );
});
