/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 *
 * Integration tests for LoginStorageMigrator against the real JSON and Rust
 * storage backends. The migrator's branching/error handling is covered by the
 * deterministic unit tests in unit/test_LoginStorageMigrator.js; here we drive
 * it through the real prefs and assert that data actually moves into the Rust
 * store. Migration is invoked via `await run()`, so there is no observer or
 * polling and therefore no timing race.
 */

"use strict";

const { LoginManagerStorage } = ChromeUtils.importESModule(
  "resource://passwordmgr/passwordstorage.sys.mjs"
);
const { LoginManagerRustStorage } = ChromeUtils.importESModule(
  "resource://gre/modules/storage-rust.sys.mjs"
);
const { LoginStorageMigrator } = ChromeUtils.importESModule(
  "resource://gre/modules/LoginStorageMigrator.sys.mjs"
);

const PREF_ENABLED = "signon.storage.rust.enabled";
const PREF_ACTIVE = "signon.storage.rust.active";
const PREF_ATTEMPTS = "signon.storage.rust.migrationAttempts";
const PREF_VULN = "signon.management.page.vulnerable-passwords.enabled";

// This test drives JSON->Rust migration itself and requires the JSON store to be
// the active store at startup. When the Rust backend is forced on at startup the
// migrator has already run, so getActiveStore() returns the Rust store and the
// premise no longer holds. Skip in that case.
const isRustBackend = Services.prefs.getBoolPref(PREF_ENABLED, false);

let jsonStore;
let rustStore;

// Brings both real stores and the prefs back to a clean baseline. Called at the
// start of every test (so a prior failure can't bleed in) and once at the end.
async function cleanup() {
  await LoginTestUtils.clearData();
  // clearData() does not clear vulnerable passwords, so do that explicitly.
  await jsonStore.clearAllPotentiallyVulnerablePasswords();
  await rustStore.removeAllLoginsAsync();
  await rustStore.clearAllPotentiallyVulnerablePasswords();
  for (const pref of [PREF_ENABLED, PREF_ACTIVE, PREF_ATTEMPTS, PREF_VULN]) {
    Services.prefs.clearUserPref(pref);
  }
  Services.fog.testResetFOG();
}

async function migrate() {
  return new LoginStorageMigrator(jsonStore, rustStore).run();
}

add_setup(async function () {
  if (isRustBackend) {
    return;
  }
  await Services.logins.initializationPromise;
  jsonStore = LoginManagerStorage.getActiveStore();
  rustStore = new LoginManagerRustStorage();
  await rustStore.initialize();
  Services.fog.initializeFOG();
  registerCleanupFunction(cleanup);
});

// Keeps the file reporting a result when every test is skipped under the Rust
// backend (an all-skipped browser test file is otherwise flagged as empty).
add_task(async function report_result_under_rust_backend() {
  if (isRustBackend) {
    Assert.ok(true, "Migration test requires a JSON-active startup; skipping");
  }
});

add_task(async function test_migration_moves_logins_to_rust() {
  await cleanup();
  await LoginTestUtils.addLogin({
    username: "alice",
    password: "pw-alice",
    origin: "https://alice.example.com",
  });
  await LoginTestUtils.addLogin({
    username: "bob",
    password: "pw-bob",
    origin: "https://bob.example.com",
  });

  // MigrationPending: rust is the target but not yet active.
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Services.prefs.setBoolPref(PREF_ACTIVE, false);

  const result = await migrate();

  Assert.equal(result, rustStore, "migration returns the Rust store");
  Assert.ok(Services.prefs.getBoolPref(PREF_ACTIVE), "rust.active is set");
  Assert.equal(
    (await rustStore.getAllLogins()).length,
    2,
    "both logins are present in the Rust store"
  );
  Assert.equal(
    (await jsonStore.getAllLogins(false)).length,
    2,
    "the JSON store is retained (migration is non-destructive)"
  );
}).skip(isRustBackend);

add_task(async function test_migration_is_idempotent() {
  await cleanup();
  await LoginTestUtils.addLogin({
    username: "alice",
    password: "pw-alice",
    origin: "https://alice.example.com",
  });

  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Services.prefs.setBoolPref(PREF_ACTIVE, false);
  await migrate();
  Assert.equal((await rustStore.getAllLogins()).length, 1, "login migrated");

  // Force a second migration pass; the Rust store is cleared first, so the
  // login count must not double.
  Services.prefs.setBoolPref(PREF_ACTIVE, false);
  await migrate();
  Assert.equal(
    (await rustStore.getAllLogins()).length,
    1,
    "no duplicates after re-migrating"
  );
}).skip(isRustBackend);

add_task(async function test_migration_quarantines_real_duplicate() {
  await cleanup();
  // Both origins normalize to https://example.com in Rust, so they collide on
  // the dedup key; the older-password login is quarantined.
  const stale = LoginTestUtils.testData.formLogin({
    origin: "https://example.com/stale",
    formActionOrigin: "https://example.com",
    username: "alice",
    password: "stale-password",
    timePasswordChanged: 1000,
  });
  const fresh = LoginTestUtils.testData.formLogin({
    origin: "https://example.com/fresh",
    formActionOrigin: "https://example.com",
    username: "alice",
    password: "fresh-password",
    timePasswordChanged: 8000,
  });
  await Services.logins.addLoginAsync(stale);
  await Services.logins.addLoginAsync(fresh);

  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Services.prefs.setBoolPref(PREF_ACTIVE, false);
  await migrate();

  const rustLogins = await rustStore.getAllLogins();
  Assert.equal(rustLogins.length, 2, "both logins persisted in Rust");
  const winner = rustLogins.find(l => l.origin === "https://example.com");
  const rescued = rustLogins.find(l =>
    l.origin.startsWith("moz-pwmngr-fixed-")
  );
  Assert.ok(winner, "winner kept its original-scheme origin");
  Assert.ok(rescued, "duplicate was quarantined under moz-pwmngr-fixed://");
  Assert.equal(
    winner.password,
    "fresh-password",
    "the most recently changed password wins the collision"
  );
}).skip(isRustBackend);

add_task(async function test_migration_moves_vulnerable_passwords() {
  await cleanup();
  Services.prefs.setBoolPref(PREF_VULN, true);

  const login = LoginTestUtils.testData.formLogin({
    username: "vuln-user",
    password: "vuln-password",
  });
  await Services.logins.addLoginAsync(login);
  const [stored] = await jsonStore.getAllLogins(false);
  await Services.logins.addPotentiallyVulnerablePassword(stored);

  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Services.prefs.setBoolPref(PREF_ACTIVE, false);
  await migrate();

  Assert.ok(
    await rustStore.isPotentiallyVulnerablePassword(stored),
    "vulnerable password migrated to the Rust store"
  );
}).skip(isRustBackend);
