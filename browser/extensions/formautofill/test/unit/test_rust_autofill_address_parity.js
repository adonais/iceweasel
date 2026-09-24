/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * The migration's field-level verification, driven over an edge-case corpus.
 *
 * Copying the addresses across is only worth anything if a record survives the
 * trip unchanged, and "unchanged" is decided by comparing the two stores field
 * by field -- the check AddressStorageMigrator runs and reports through
 * migrate_to_rust.diverged and migrate_record_divergence.
 *
 * The corpus is chosen to stress the part most likely to disagree: the JS store
 * normalises on write (name splitting, tel to E.164, street components, country
 * codes) and the Rust store recomputes the presentational fields on read, so
 * these are the records where the two could plausibly part company.
 */

const { FormAutofillStorage } = ChromeUtils.importESModule(
  "resource://autofill/FormAutofillStorage.sys.mjs"
);
const { RustAutofillAddressesAdapter } = ChromeUtils.importESModule(
  "resource://autofill/RustAutofillAddressStorage.sys.mjs"
);

const ENABLED_PREF = "extensions.formautofill.addresses.storage.rust.enabled";
const ACTIVE_PREF = "extensions.formautofill.addresses.storage.rust.active";

// Edge cases: intl, multiline street, full/unicode names, partial records,
// unnormalized phone/country to exercise JS normalization before storage.
const CORPUS = [
  {
    label: "full US",
    record: {
      name: "Jane Doe",
      organization: "Mozilla",
      "street-address": "331 E Evelyn Ave",
      "address-level2": "Mountain View",
      "address-level1": "CA",
      "postal-code": "94041",
      country: "US",
      tel: "+16505551234",
      email: "jane@example.com",
    },
  },
  {
    label: "Germany",
    record: {
      name: "Hans Müller",
      "street-address": "Marienplatz 8",
      "address-level2": "München",
      "postal-code": "80331",
      country: "DE",
      tel: "+498912345678",
    },
  },
  {
    label: "multiline street + full name",
    record: {
      name: "Dr. John Q. Public",
      "street-address": "123 Main St\nApt 4B",
      "address-level2": "Springfield",
      "address-level1": "IL",
      "postal-code": "62704",
      country: "US",
    },
  },
  {
    label: "unicode",
    record: {
      name: "José Núñez",
      organization: "Universität",
      "street-address": "Calle Ñoño 5",
      "address-level2": "Madrid",
      "postal-code": "28001",
      country: "ES",
    },
  },
  {
    label: "partial (name + country)",
    record: { name: "Solo Name", country: "US" },
  },
  {
    label: "org + email, no name",
    record: {
      organization: "Acme Corp",
      email: "info@acme.example",
      country: "US",
    },
  },
  {
    label: "unnormalized phone",
    record: {
      name: "Phone Test",
      "address-level1": "NY",
      country: "US",
      tel: "(212) 555-0199",
    },
  },
];

// The field names a divergence can be reported under. Asserting that none of
// them is ever named is what makes "no divergence" mean something: a check of
// only the fields this corpus sets would miss Rust inventing one.
const DIVERGENCE_FIELDS = [
  "name",
  "given-name",
  "additional-name",
  "family-name",
  "organization",
  "street-address",
  "address-line1",
  "address-line2",
  "address-line3",
  "address-level1",
  "address-level2",
  "address-level3",
  "postal-code",
  "country",
  "country-name",
  "tel",
  "tel-country-code",
  "tel-national",
  "tel-area-code",
  "tel-local",
  "tel-local-prefix",
  "tel-local-suffix",
  "email",
  "version",
  "timeCreated",
  "timeLastUsed",
  "timeLastModified",
  "timesUsed",
];

function diffRecords(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs = [];
  for (const key of keys) {
    if (a[key] !== b[key]) {
      diffs.push(
        `${key}: json=${JSON.stringify(a[key])} rust=${JSON.stringify(b[key])}`
      );
    }
  }
  return diffs;
}

registerCleanupFunction(() => {
  for (const pref of [ENABLED_PREF, ACTIVE_PREF]) {
    Services.prefs.clearUserPref(pref);
  }
});

add_task(async function test_migration_leaves_no_divergence() {
  Services.prefs.setBoolPref(ENABLED_PREF, false);
  Services.prefs.clearUserPref(ACTIVE_PREF);
  Services.fog.testResetFOG();
  // The adapter is a per-process singleton, so a case that reuses one cached by
  // an earlier test never opens the store and cannot observe this migration.
  RustAutofillAddressesAdapter._instance = null;

  // Seed JSON while Rust is off, which is the order a real profile does it in:
  // the addresses exist long before the migration is switched on.
  const jsonPath = FileTestUtils.getTempFile("parity-profiles.json").path;
  let storage = new FormAutofillStorage(jsonPath);
  await storage.initialize();
  const guids = [];
  for (const { record } of CORPUS) {
    guids.push(await storage.addresses.add(record));
  }
  await storage._finalize();

  // A restart with the pref on: migrate, verify, then serve from Rust.
  Services.prefs.setBoolPref(ENABLED_PREF, true);
  storage = new FormAutofillStorage(jsonPath);
  await storage.initialize();

  const event = Glean.formautofillAddresses.migrateToRust.testGetValue().at(-1);
  Assert.equal(event.extra.result, "ok", "the whole corpus migrated");
  Assert.equal(
    event.extra.source_total,
    String(CORPUS.length),
    "every record was attempted"
  );
  Assert.equal(
    event.extra.diverged,
    "0",
    "no record came out of Rust holding a different value"
  );

  const divergences =
    Glean.formautofillAddresses.migrateRecordDivergence.testGetValue() ?? [];
  Assert.deepEqual(divergences, [], "no record diverged");
  const named = divergences.flatMap(({ extra }) =>
    ["changed", "dropped", "added"].flatMap(key => extra[key]?.split(",") ?? [])
  );
  for (const field of DIVERGENCE_FIELDS) {
    Assert.ok(!named.includes(field), `no divergence reported for "${field}"`);
  }

  // The same comparison the migrator made, spelled out per record, so a failure
  // names the record and the field rather than just a count.
  const json = storage._addresses;
  const rust = storage.addresses;
  Assert.ok(
    Services.prefs.getBoolPref(ACTIVE_PREF, false),
    "Rust is serving addresses after the migration"
  );
  for (let i = 0; i < guids.length; i++) {
    const { label } = CORPUS[i];
    const jsonRecord = await json.get(guids[i]);
    const rustRecord = await rust.get(guids[i]);
    Assert.ok(rustRecord, `[${label}] record reached Rust`);
    Assert.deepEqual(
      diffRecords(jsonRecord, rustRecord),
      [],
      `[${label}] the Rust read is identical to the JSON read`
    );
  }

  await storage._finalize();
});
