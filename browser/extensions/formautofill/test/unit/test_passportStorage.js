/*
 * Tests the passport collection exposed by FormAutofillStorage. Passports are
 * backed by the Application Services `autofill` SQLite store rather than the
 * JSON profile file, but expose the same collection API as addresses/credit
 * cards.
 *
 * That store lives at a single, fixed profile-level path, so every test shares
 * it; each ends with `passports.removeAll()` to leave a clean slate for the
 * next.
 */

"use strict";

const COLLECTION_NAME = "passports";

const TEST_PASSPORT = {
  "passport-name": "Jane Q Doe",
  "passport-country": "US",
  "passport-number": "X1234567",
  "passport-issue-date-month": 5,
  "passport-issue-date-day": 1,
  "passport-issue-date-year": 2020,
  "passport-expiry-date-month": 5,
  "passport-expiry-date-day": 1,
  "passport-expiry-date-year": 2030,
};

function assertPassportMatches(record, expected) {
  for (const [key, value] of Object.entries(expected)) {
    Assert.equal(record[key], value, `field "${key}" round-trips`);
  }
}

// Run a mutating operation and wait for the `formautofill-storage-changed`
// notification it is expected to emit, so each test confirms the notification
// fires. Returns whatever the operation resolves to.
async function expectStorageChanged(data, operation) {
  const observed = TestUtils.topicObserved(
    "formautofill-storage-changed",
    (subject, d) =>
      d == data && subject.wrappedJSObject.collectionName == COLLECTION_NAME
  );
  const result = await operation();
  await observed;
  return result;
}

add_task(async function test_add_get_getAll() {
  const profileStorage = await initProfileStorage("test_passport.json");
  const passports = profileStorage.passports;

  Assert.ok(await passports.isEmpty(), "collection starts empty");

  const guid = await expectStorageChanged("add", () =>
    passports.add(TEST_PASSPORT)
  );
  Assert.ok(guid, "add returns a guid");
  Assert.ok(!(await passports.isEmpty()), "collection is no longer empty");

  const record = await passports.get(guid);
  Assert.equal(record.guid, guid);
  assertPassportMatches(record, TEST_PASSPORT);
  Assert.ok(record.timeCreated, "timeCreated metadata is set");
  Assert.equal(record.timesUsed, 0, "timesUsed starts at 0");

  // Add a second passport so getAll is exercised with more than one record.
  const guid2 = await expectStorageChanged("add", () =>
    passports.add({
      ...TEST_PASSPORT,
      "passport-name": "John R Roe",
      "passport-number": "Y7654321",
    })
  );

  const all = await passports.getAll();
  Assert.equal(all.length, 2, "getAll returns every record");
  Assert.deepEqual(
    all.map(r => r.guid).sort(),
    [guid, guid2].sort(),
    "getAll includes both guids"
  );

  Assert.equal(await passports.get("not-a-guid"), null, "missing guid -> null");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_update() {
  const profileStorage = await initProfileStorage("test_passport_update.json");
  const passports = profileStorage.passports;

  const guid = await expectStorageChanged("add", () =>
    passports.add(TEST_PASSPORT)
  );
  await expectStorageChanged("update", () =>
    passports.update(guid, {
      ...TEST_PASSPORT,
      "passport-number": "Y7654321",
    })
  );

  const record = await passports.get(guid);
  Assert.equal(record["passport-number"], "Y7654321", "field updated");
  Assert.equal(record["passport-name"], TEST_PASSPORT["passport-name"]);

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_update_replaces_unspecified_fields_by_default() {
  const profileStorage = await initProfileStorage(
    "test_passport_update_replace.json"
  );
  const passports = profileStorage.passports;

  const guid = await expectStorageChanged("add", () =>
    passports.add(TEST_PASSPORT)
  );
  // A partial record with the default preserveOldProperties=false replaces the
  // whole record, so unspecified fields are cleared.
  await expectStorageChanged("update", () =>
    passports.update(guid, { "passport-name": "Only Name" })
  );

  const record = await passports.get(guid);
  Assert.equal(record["passport-name"], "Only Name");
  Assert.equal(
    record["passport-number"],
    "",
    "unspecified string field cleared"
  );
  Assert.strictEqual(
    record["passport-issue-date-year"],
    "",
    "unspecified date field cleared"
  );

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_update_preserveOldProperties_merges() {
  const profileStorage = await initProfileStorage(
    "test_passport_update_preserve.json"
  );
  const passports = profileStorage.passports;

  const guid = await expectStorageChanged("add", () =>
    passports.add(TEST_PASSPORT)
  );
  // With preserveOldProperties=true a partial record is merged onto the
  // existing one, keeping fields it does not mention.
  await expectStorageChanged("update", () =>
    passports.update(guid, { "passport-number": "Z9999999" }, true)
  );

  const record = await passports.get(guid);
  Assert.equal(
    record["passport-number"],
    "Z9999999",
    "specified field updated"
  );
  Assert.equal(
    record["passport-name"],
    TEST_PASSPORT["passport-name"],
    "unspecified field preserved"
  );
  Assert.equal(
    record["passport-issue-date-year"],
    TEST_PASSPORT["passport-issue-date-year"],
    "unspecified date field preserved"
  );

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_getSavedFieldNames() {
  const profileStorage = await initProfileStorage(
    "test_passport_fieldnames.json"
  );
  const passports = profileStorage.passports;

  // Dates left unset are stored as 0 and should not be reported as saved.
  await expectStorageChanged("add", () =>
    passports.add({
      "passport-name": "Jane",
      "passport-country": "US",
      "passport-number": "X1",
    })
  );

  const names = await passports.getSavedFieldNames();
  Assert.ok(names.has("passport-name"), "populated string field reported");
  Assert.ok(names.has("passport-country"));
  Assert.ok(names.has("passport-number"));
  Assert.ok(
    !names.has("passport-issue-date-year"),
    "unset (zero) date field is not reported"
  );

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_notifyUsed() {
  const profileStorage = await initProfileStorage("test_passport_used.json");
  const passports = profileStorage.passports;

  const guid = await expectStorageChanged("add", () =>
    passports.add(TEST_PASSPORT)
  );
  await expectStorageChanged("notifyUsed", () => passports.notifyUsed(guid));

  const record = await passports.get(guid);
  Assert.equal(record.timesUsed, 1, "timesUsed incremented");
  Assert.ok(record.timeLastUsed, "timeLastUsed is set");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_remove_and_removeAll() {
  const profileStorage = await initProfileStorage("test_passport_remove.json");
  const passports = profileStorage.passports;

  const guid = await expectStorageChanged("add", () =>
    passports.add(TEST_PASSPORT)
  );
  await expectStorageChanged("remove", () => passports.remove(guid));
  Assert.ok(await passports.isEmpty(), "record removed");

  await expectStorageChanged("add", () => passports.add(TEST_PASSPORT));
  await expectStorageChanged("add", () => passports.add(TEST_PASSPORT));
  await expectStorageChanged("removeAll", () => passports.removeAll());
  Assert.ok(await passports.isEmpty(), "removeAll clears the collection");
});

add_task(async function test_date_fields_round_trip_as_strings() {
  const profileStorage = await initProfileStorage("test_passport_coerce.json");
  const passports = profileStorage.passports;

  // Form submissions deliver every field as a string. Regardless of how they
  // are persisted (the store keeps date components as integers internally),
  // callers always read them back as strings, matching the other autofill
  // types. Unset components read back as "".
  const guid = await expectStorageChanged("add", () =>
    passports.add({
      "passport-name": "Jane",
      "passport-country": "US",
      "passport-number": "X1",
      "passport-issue-date-month": "5",
      "passport-issue-date-day": "1",
      "passport-issue-date-year": "2020",
    })
  );

  const record = await passports.get(guid);
  Assert.strictEqual(record["passport-issue-date-month"], "5");
  Assert.strictEqual(record["passport-issue-date-day"], "1");
  Assert.strictEqual(record["passport-issue-date-year"], "2020");
  // Unset date components read back as "".
  Assert.strictEqual(record["passport-expiry-date-year"], "");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_getAll_returns_every_record() {
  const profileStorage = await initProfileStorage("test_passport_getall.json");
  const passports = profileStorage.passports;

  const guidA = await expectStorageChanged("add", () =>
    passports.add(TEST_PASSPORT)
  );
  const guidB = await expectStorageChanged("add", () =>
    passports.add({
      ...TEST_PASSPORT,
      "passport-name": "John Other",
      "passport-number": "B0000000",
    })
  );

  const all = await passports.getAll();
  Assert.equal(all.length, 2, "getAll returns both records");

  const byGuid = new Map(all.map(r => [r.guid, r]));
  Assert.ok(byGuid.has(guidA) && byGuid.has(guidB), "both guids present");
  Assert.equal(
    byGuid.get(guidA)["passport-name"],
    TEST_PASSPORT["passport-name"]
  );
  Assert.equal(byGuid.get(guidB)["passport-number"], "B0000000");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_missing_guid_operations_match_json_collections() {
  const profileStorage = await initProfileStorage("test_passport_missing.json");
  const passports = profileStorage.passports;

  // remove and notifyUsed silently ignore unknown guids, matching the
  // JSON-backed collections.
  await expectStorageChanged("remove", () => passports.remove("no-such-guid"));
  await expectStorageChanged("notifyUsed", () =>
    passports.notifyUsed("no-such-guid")
  );
  Assert.ok(await passports.isEmpty(), "no record created by missing-guid ops");

  // update, however, must throw "No matching record." for parity with the
  // addresses/credit-card collections so callers see identical error handling.
  await Assert.rejects(
    passports.update("no-such-guid", TEST_PASSPORT),
    /No matching record/,
    "update on a missing guid rejects"
  );

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_combined_date_normalized_to_components() {
  const profileStorage = await initProfileStorage(
    "test_passport_combined_date.json"
  );
  const passports = profileStorage.passports;

  // A form with a single <input type="date"> submits the combined ISO field
  // rather than the month/day/year components. Storage must split it into the
  // components it persists.
  const guid = await expectStorageChanged("add", () =>
    passports.add({
      "passport-name": "Jane",
      "passport-country": "US",
      "passport-number": "X1234567",
      "passport-issue-date": "2020-05-01",
      "passport-expiry-date": "2030-12-09",
    })
  );

  const record = await passports.get(guid);
  Assert.strictEqual(record["passport-issue-date-year"], "2020");
  Assert.strictEqual(record["passport-issue-date-month"], "5");
  Assert.strictEqual(record["passport-issue-date-day"], "1");
  Assert.strictEqual(record["passport-expiry-date-year"], "2030");
  Assert.strictEqual(record["passport-expiry-date-month"], "12");
  Assert.strictEqual(record["passport-expiry-date-day"], "9");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_components_round_trip_to_combined_date() {
  const profileStorage = await initProfileStorage(
    "test_passport_compute_date.json"
  );
  const passports = profileStorage.passports;

  // Records stored as components expose the combined date on read, so a page
  // with a single date input can be filled.
  const guid = await expectStorageChanged("add", () =>
    passports.add(TEST_PASSPORT)
  );

  const record = await passports.get(guid);
  Assert.equal(record["passport-issue-date"], "2020-05-01");
  Assert.equal(record["passport-expiry-date"], "2030-05-01");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_explicit_components_win_over_combined_date() {
  const profileStorage = await initProfileStorage(
    "test_passport_date_precedence.json"
  );
  const passports = profileStorage.passports;

  // When a record carries both the components and a combined date, the explicit
  // components take precedence and the combined field is dropped.
  const guid = await expectStorageChanged("add", () =>
    passports.add({
      "passport-number": "X1234567",
      "passport-expiry-date": "2031-01-02",
      "passport-expiry-date-month": 5,
      "passport-expiry-date-day": 1,
      "passport-expiry-date-year": 2030,
    })
  );

  const record = await passports.get(guid);
  Assert.strictEqual(record["passport-expiry-date-year"], "2030");
  Assert.strictEqual(record["passport-expiry-date-month"], "5");
  Assert.strictEqual(record["passport-expiry-date-day"], "1");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_invalid_date_components_are_dropped() {
  const profileStorage = await initProfileStorage(
    "test_passport_invalid_date.json"
  );
  const passports = profileStorage.passports;

  // Out-of-range date parts are cleared during normalization, matching the
  // credit-card expiration handling.
  const guid = await expectStorageChanged("add", () =>
    passports.add({
      "passport-number": "X1234567",
      "passport-expiry-date-month": 13,
      "passport-expiry-date-day": 40,
      "passport-expiry-date-year": -3,
    })
  );

  const record = await passports.get(guid);
  Assert.strictEqual(record["passport-expiry-date-month"], "");
  Assert.strictEqual(record["passport-expiry-date-day"], "");
  Assert.strictEqual(record["passport-expiry-date-year"], "");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_unset_date_stays_unset_through_update() {
  const profileStorage = await initProfileStorage(
    "test_passport_unset_date.json"
  );
  const passports = profileStorage.passports;

  // A passport with no issue date (components stored as 0). A merge-update must
  // leave the unset year as 0 — not shift the 0 into a bogus year 2000.
  const guid = await expectStorageChanged("add", () =>
    passports.add({
      "passport-number": "X1234567",
      "passport-expiry-date-month": 5,
      "passport-expiry-date-day": 1,
      "passport-expiry-date-year": 2030,
    })
  );
  await expectStorageChanged("update", () =>
    passports.update(guid, { "passport-number": "Y7654321" }, true)
  );

  const record = await passports.get(guid);
  Assert.strictEqual(
    record["passport-issue-date-year"],
    "",
    "unset year stays empty"
  );
  Assert.strictEqual(record["passport-issue-date-month"], "");
  Assert.strictEqual(
    record["passport-expiry-date-year"],
    "2030",
    "set year kept"
  );

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_split_name_parts_joined_on_store() {
  const profileStorage = await initProfileStorage(
    "test_passport_split_name.json"
  );
  const passports = profileStorage.passports;

  // A form with separate given/additional/family fields (no combined name) plus
  // expiry-date components. Storage joins the name parts into the single
  // passport-name it persists, keeps the date components, and exposes both the
  // parts and the combined date again on read.
  const guid = await expectStorageChanged("add", () =>
    passports.add({
      "passport-number": "X1234567",
      "passport-given-name": "Jane",
      "passport-additional-name": "Q",
      "passport-family-name": "Doe",
      "passport-expiry-date-month": 5,
      "passport-expiry-date-day": 1,
      "passport-expiry-date-year": 2030,
    })
  );

  const record = await passports.get(guid);
  Assert.equal(record["passport-name"], "Jane Q Doe", "parts joined into name");
  Assert.equal(record["passport-given-name"], "Jane");
  Assert.equal(record["passport-additional-name"], "Q");
  Assert.equal(record["passport-family-name"], "Doe");
  Assert.strictEqual(record["passport-expiry-date-year"], "2030", "date kept");
  Assert.equal(
    record["passport-expiry-date"],
    "2030-05-01",
    "combined expiry date exposed"
  );

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_combined_name_split_on_read() {
  const profileStorage = await initProfileStorage(
    "test_passport_combined_name.json"
  );
  const passports = profileStorage.passports;

  // A form with a single name field plus a combined issue date. The name
  // round-trips and exposes the split parts, and the combined date is split
  // into the stored components.
  const guid = await expectStorageChanged("add", () =>
    passports.add({
      "passport-number": "X1234567",
      "passport-name": "Jane Q Doe",
      "passport-issue-date": "2020-05-01",
    })
  );

  const record = await passports.get(guid);
  Assert.equal(record["passport-name"], "Jane Q Doe");
  Assert.equal(record["passport-given-name"], "Jane");
  Assert.equal(record["passport-additional-name"], "Q");
  Assert.equal(record["passport-family-name"], "Doe");
  Assert.strictEqual(record["passport-issue-date-year"], "2020", "date split");
  Assert.strictEqual(record["passport-issue-date-month"], "5");
  Assert.strictEqual(record["passport-issue-date-day"], "1");

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_combined_name_wins_over_parts() {
  const profileStorage = await initProfileStorage(
    "test_passport_name_precedence.json"
  );
  const passports = profileStorage.passports;

  // When a record carries both the combined name and the parts, the combined
  // name takes precedence and the supplied parts are dropped.
  const guid = await expectStorageChanged("add", () =>
    passports.add({
      "passport-number": "X1234567",
      "passport-name": "Combined Name",
      "passport-given-name": "Ignored",
      "passport-family-name": "Parts",
    })
  );

  const record = await passports.get(guid);
  Assert.equal(record["passport-name"], "Combined Name");
  // The supplied "Ignored"/"Parts" are dropped; the parts exposed on read are
  // re-derived from the combined name.
  Assert.equal(
    record["passport-given-name"],
    "Combined",
    "supplied given dropped"
  );
  Assert.equal(
    record["passport-family-name"],
    "Name",
    "supplied family dropped"
  );

  await expectStorageChanged("removeAll", () => passports.removeAll());
});

add_task(async function test_persists_across_instances() {
  const { FormAutofillStorage } = ChromeUtils.importESModule(
    "resource://autofill/FormAutofillStorage.sys.mjs"
  );
  const path = PathUtils.join(
    PathUtils.profileDir,
    "test_passport_persist.json"
  );

  const storage1 = new FormAutofillStorage(path);
  await storage1.initialize();
  const guid = await expectStorageChanged("add", () =>
    storage1.passports.add(TEST_PASSPORT)
  );

  // A fresh storage instance pointed at the same path must see the record,
  // proving it was persisted to the SQLite store (not just kept in memory).
  const storage2 = new FormAutofillStorage(path);
  await storage2.initialize();
  const record = await storage2.passports.get(guid);
  Assert.notEqual(record, null, "record persisted across instances");
  assertPassportMatches(record, TEST_PASSPORT);

  await expectStorageChanged("removeAll", () => storage2.passports.removeAll());
});
