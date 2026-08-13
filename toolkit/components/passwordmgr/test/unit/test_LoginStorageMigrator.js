/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Logic/unit tests for LoginStorageMigrator.
 *
 * These exercise the migrator's state machine, error handling and telemetry
 * against in-memory fake storages, so every test is deterministic: the migrator
 * is a one-shot `await run()` with no observers or polling. Real end-to-end
 * data movement against the actual Rust store is covered by
 * browser/browser_login_storage_migrator.js.
 */

"use strict";

const { LoginStorageMigrator } = ChromeUtils.importESModule(
  "resource://gre/modules/LoginStorageMigrator.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const PREF_ENABLED = "signon.storage.rust.enabled";
const PREF_ACTIVE = "signon.storage.rust.active";
const PREF_ATTEMPTS = "signon.storage.rust.migrationAttempts";

// Brings the shared state (prefs + telemetry) back to a known-clean baseline.
// Called at the start of every test so a previously failed test can't bleed in.
// signon.storage.rust.enabled is enabled by default, so the enabled/active prefs
// are set explicitly (not cleared) to make every test start from the
// JSON-primary state.
function resetState() {
  Services.prefs.setBoolPref(PREF_ENABLED, false);
  Services.prefs.setBoolPref(PREF_ACTIVE, false);
  Services.prefs.clearUserPref(PREF_ATTEMPTS);
  Services.fog.testResetFOG();
}

function makeJsonStorage({
  logins = [],
  vulnerable = [],
  isLoggedIn = true,
} = {}) {
  return {
    getAllLoginsCalls: 0,
    isLoggedIn,
    get decryptedPotentiallyVulnerablePasswords() {
      return vulnerable;
    },
    async getAllLogins(_includeDeleted) {
      this.getAllLoginsCalls++;
      return logins;
    },
  };
}

// `addResults(logins, batchIndex)` lets a test decide per-login success/failure;
// `throwOnRemoveAll` makes the first N removeAllLoginsAsync() calls throw (a
// fatal error); pass Infinity to always throw.
function makeRustStorage({
  addResults = null,
  throwOnRemoveAll = 0,
  throwOnVulnerable = false,
} = {}) {
  return {
    calls: [],
    addedBatches: [],
    added: [],
    vulnerable: [],
    removeAllCount: 0,
    async removeAllLoginsAsync() {
      this.removeAllCount++;
      this.calls.push("removeAll");
      this.added = [];
      if (this.removeAllCount <= throwOnRemoveAll) {
        throw new Error("removeAll failed");
      }
    },
    async clearAllPotentiallyVulnerablePasswords() {
      this.calls.push("clearVulnerable");
    },
    async addLoginsWithResultsAsync(logins) {
      this.calls.push("addLogins");
      this.addedBatches.push(logins);
      const results = addResults
        ? addResults(logins, this.addedBatches.length - 1)
        : logins.map(() => ({}));
      logins.forEach((login, i) => {
        if (!results[i] || !results[i].error) {
          this.added.push(login);
        }
      });
      return results;
    },
    async addPotentiallyVulnerablePasswords(passwords) {
      this.calls.push("addVulnerable");
      if (throwOnVulnerable) {
        throw new Error("vulnerable failed");
      }
      this.vulnerable.push(...passwords);
    },
  };
}

// Stands in for the primary password dialog. `accept` decides whether the user
// submits the correct password or cancels. Returns the CID to unregister.
function mockPrimaryPasswordPrompt(accept) {
  const prompt = {
    promptPassword(_dialogTitle, _text, password) {
      if (accept) {
        password.value = LoginTestUtils.primaryPassword.primaryPassword;
      }
      return accept;
    },
    QueryInterface: ChromeUtils.generateQI(["nsIPrompt"]),
  };
  const windowWatcher = {
    getNewPrompter: () => prompt,
    QueryInterface: ChromeUtils.generateQI(["nsIWindowWatcher"]),
  };
  return MockRegistrar.register(
    "@mozilla.org/embedcomp/window-watcher;1",
    windowWatcher
  );
}

add_setup(function () {
  Services.fog.initializeFOG();
  registerCleanupFunction(resetState);
});

// ---------------------------------------------------------------------------
// State routing
// ---------------------------------------------------------------------------

add_task(async function test_jsonPrimary_returns_json_without_migrating() {
  resetState();
  // enabled defaults to false => JSONPrimary
  const json = makeJsonStorage({ logins: [TestData.formLogin({})] });
  const rust = makeRustStorage();

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, json, "JSONPrimary returns the JSON store");
  Assert.equal(rust.calls.length, 0, "no migration performed");
  Assert.equal(json.getAllLoginsCalls, 0, "JSON store not read");
});

add_task(async function test_rustPrimary_returns_rust_without_migrating() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Services.prefs.setBoolPref(PREF_ACTIVE, true);
  const json = makeJsonStorage();
  const rust = makeRustStorage();

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, rust, "RustPrimary returns the Rust store");
  Assert.equal(rust.calls.length, 0, "no migration performed");
  Assert.equal(json.getAllLoginsCalls, 0, "JSON store not read");
});

add_task(async function test_revertPending_deactivates_rust() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, false);
  Services.prefs.setBoolPref(PREF_ACTIVE, true);
  Services.prefs.setIntPref(PREF_ATTEMPTS, 5);
  const json = makeJsonStorage();
  const rust = makeRustStorage();

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, json, "RevertPending returns the JSON store");
  Assert.equal(
    Services.prefs.getBoolPref(PREF_ACTIVE),
    false,
    "rust deactivated"
  );
  Assert.equal(Services.prefs.getIntPref(PREF_ATTEMPTS), 0, "attempts reset");
  Assert.equal(rust.calls.length, 0, "no migration performed");
});

add_task(async function test_exceedMigrationBudget_falls_back_to_json() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Services.prefs.setBoolPref(PREF_ACTIVE, false);
  Services.prefs.setIntPref(PREF_ATTEMPTS, 10);
  const json = makeJsonStorage({ logins: [TestData.formLogin({})] });
  const rust = makeRustStorage();

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, json, "exceeded budget returns the JSON store");
  Assert.equal(
    Services.prefs.getBoolPref(PREF_ENABLED),
    false,
    "rust disabled"
  );
  Assert.equal(Services.prefs.getIntPref(PREF_ATTEMPTS), 0, "attempts reset");
  Assert.equal(rust.calls.length, 0, "no migration performed");
});

// ---------------------------------------------------------------------------
// Successful migration
// ---------------------------------------------------------------------------

add_task(async function test_migration_completes_and_reports_status() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true); // active defaults false => Pending
  const logins = [
    TestData.formLogin({ username: "a" }),
    TestData.formLogin({ username: "b" }),
  ];
  const json = makeJsonStorage({ logins, vulnerable: ["vuln1"] });
  const rust = makeRustStorage();

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, rust, "completed migration returns the Rust store");
  Assert.equal(Services.prefs.getBoolPref(PREF_ACTIVE), true, "rust activated");
  Assert.equal(Services.prefs.getIntPref(PREF_ATTEMPTS), 0, "attempts reset");

  Assert.deepEqual(
    rust.calls.slice(0, 3),
    ["removeAll", "clearVulnerable", "addLogins"],
    "Rust store is cleared before logins are written"
  );
  Assert.equal(rust.added.length, 2, "both logins written to Rust");
  Assert.deepEqual(rust.vulnerable, ["vuln1"], "vulnerable password migrated");

  const events = Glean.pwmgr.rustMigrationStatus.testGetValue();
  Assert.equal(events.length, 1, "one status event");
  const { extra } = events[0];
  Assert.equal(extra.end_state, "RustPrimary");
  Assert.equal(extra.number_of_logins_to_migrate, "2");
  Assert.equal(extra.number_of_logins_migrated, "2");
  Assert.equal(extra.number_of_logins_quarantined, "0");
  Assert.equal(extra.number_of_vulnerable_passwords, "1");
  Assert.equal(extra.attempt, "0");
  Assert.ok(!("error_message" in extra), "no error_message on success");
  Assert.greaterOrEqual(Number(extra.duration_ms), 0, "duration_ms recorded");
});

add_task(async function test_migration_sorts_by_timePasswordChanged_desc() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  const older = TestData.formLogin({
    username: "older",
    timePasswordChanged: 100,
  });
  const newer = TestData.formLogin({
    username: "newer",
    timePasswordChanged: 200,
  });
  const json = makeJsonStorage({ logins: [older, newer] });
  const rust = makeRustStorage();

  await new LoginStorageMigrator(json, rust).run();

  const firstBatch = rust.addedBatches[0];
  Assert.equal(
    firstBatch[0].username,
    "newer",
    "most recently changed password is written first"
  );
  Assert.equal(firstBatch[1].username, "older");
});

// ---------------------------------------------------------------------------
// Per-login failures
// ---------------------------------------------------------------------------

add_task(async function test_migration_quarantines_duplicates() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  const login = TestData.formLogin({
    origin: "https://example.com",
    username: "dup",
  });
  login.QueryInterface(Ci.nsILoginMetaInfo);
  login.guid = "{11111111-1111-1111-1111-111111111111}";
  const json = makeJsonStorage({ logins: [login] });
  // First add reports the login as a duplicate; the rescued retry succeeds.
  const rust = makeRustStorage({
    addResults: (logins, batchIndex) =>
      batchIndex === 0
        ? logins.map(() => ({ error: { message: "Login already exists" } }))
        : logins.map(() => ({})),
  });

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, rust);
  const rescued = rust.addedBatches[1];
  Assert.equal(rescued.length, 1, "one duplicate rescued");
  Assert.ok(
    rescued[0].origin.startsWith("moz-pwmngr-fixed-"),
    "rescued duplicate origin rewritten to fixed scheme"
  );

  const { extra } = Glean.pwmgr.rustMigrationStatus.testGetValue()[0];
  Assert.equal(extra.number_of_logins_to_migrate, "1");
  Assert.equal(extra.number_of_logins_migrated, "1");
  Assert.equal(extra.number_of_logins_quarantined, "1");
});

add_task(async function test_migration_partial_failure_records_login_error() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  const ok = TestData.formLogin({ username: "ok" });
  const bad = TestData.formLogin({ username: "bad" });
  const json = makeJsonStorage({ logins: [ok, bad] });
  const rust = makeRustStorage({
    addResults: (logins, batchIndex) =>
      batchIndex === 0
        ? [{}, { error: { message: "Invalid login: bad data" } }]
        : logins.map(() => ({})),
  });

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, rust, "partial failure still completes the migration");
  Assert.equal(rust.addedBatches[1].length, 0, "non-duplicate is not rescued");

  const status = Glean.pwmgr.rustMigrationStatus.testGetValue()[0].extra;
  Assert.equal(status.number_of_logins_migrated, "1");
  Assert.equal(status.number_of_logins_to_migrate, "2");

  const errors = Glean.pwmgr.rustMigrationLoginError.testGetValue();
  Assert.equal(errors.length, 1, "one login error recorded");
  Assert.equal(
    errors[0].extra.error_message,
    "bad data",
    "error message is normalized"
  );
});

// ---------------------------------------------------------------------------
// Fatal failure, retry and abort
// ---------------------------------------------------------------------------

add_task(async function test_migration_fatal_aborts_and_increments_attempts() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Services.prefs.setIntPref(PREF_ATTEMPTS, 0);
  const json = makeJsonStorage({ logins: [TestData.formLogin({})] });
  const rust = makeRustStorage({ throwOnRemoveAll: Infinity });

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, json, "fatal migration falls back to the JSON store");
  Assert.equal(
    Services.prefs.getBoolPref(PREF_ACTIVE),
    false,
    "rust not activated"
  );
  Assert.equal(
    Services.prefs.getIntPref(PREF_ATTEMPTS),
    1,
    "attempt counter +1"
  );
  Assert.greater(
    rust.removeAllCount,
    1,
    "migration was retried within the session"
  );

  const events = Glean.pwmgr.rustMigrationStatus.testGetValue();
  Assert.greaterOrEqual(events.length, 1, "status event(s) recorded");
  const { extra } = events.at(-1);
  Assert.equal(extra.end_state, "MigrationPending");
  Assert.ok("error_message" in extra, "fatal error message recorded");
});

add_task(async function test_migration_retries_then_completes() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  const json = makeJsonStorage({ logins: [TestData.formLogin({})] });
  const rust = makeRustStorage({ throwOnRemoveAll: 2 }); // fail twice, then succeed

  const result = await new LoginStorageMigrator(json, rust).run();

  Assert.equal(result, rust, "completes after transient failures");
  Assert.equal(Services.prefs.getBoolPref(PREF_ACTIVE), true, "rust activated");
  Assert.equal(
    Services.prefs.getIntPref(PREF_ATTEMPTS),
    0,
    "attempts reset on success"
  );
});

// ---------------------------------------------------------------------------
// Primary Password
// ---------------------------------------------------------------------------

add_task(async function test_primaryPassword_prompt_accepted_migrates() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  await LoginTestUtils.primaryPassword.enable();
  const cid = mockPrimaryPasswordPrompt(true);
  try {
    const json = makeJsonStorage({
      logins: [TestData.formLogin({})],
      isLoggedIn: false,
    });
    const rust = makeRustStorage();

    const result = await new LoginStorageMigrator(json, rust).run();

    Assert.equal(
      result,
      rust,
      "accepting the Primary Password prompt proceeds with migration"
    );
    Assert.equal(
      Services.prefs.getBoolPref(PREF_ACTIVE),
      true,
      "rust activated"
    );
    const { extra } = Glean.pwmgr.rustMigrationStatus.testGetValue()[0];
    Assert.equal(extra.primary_password_set, "true");
  } finally {
    MockRegistrar.unregister(cid);
    await LoginTestUtils.primaryPassword.disable();
  }
});

add_task(async function test_primaryPassword_prompt_canceled_defers() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  Services.prefs.setIntPref(PREF_ATTEMPTS, 3);
  await LoginTestUtils.primaryPassword.enable();
  const cid = mockPrimaryPasswordPrompt(false);
  try {
    const json = makeJsonStorage({
      logins: [TestData.formLogin({})],
      isLoggedIn: false,
    });
    const rust = makeRustStorage();

    const result = await new LoginStorageMigrator(json, rust).run();

    Assert.equal(
      result,
      json,
      "canceling the Primary Password prompt defers to the JSON store"
    );
    Assert.equal(rust.calls.length, 0, "no migration performed");
    Assert.equal(
      Services.prefs.getBoolPref(PREF_ACTIVE),
      false,
      "rust not activated"
    );
    Assert.equal(
      Services.prefs.getIntPref(PREF_ATTEMPTS),
      3,
      "canceling does not consume the attempt budget"
    );
    Assert.equal(
      Glean.pwmgr.rustMigrationStatus.testGetValue(),
      null,
      "no status event for a deferred run"
    );
  } finally {
    MockRegistrar.unregister(cid);
    await LoginTestUtils.primaryPassword.disable();
  }
});

add_task(async function test_primaryPassword_unlocked_migrates() {
  resetState();
  Services.prefs.setBoolPref(PREF_ENABLED, true);
  const sandbox = sinon.createSandbox();
  sandbox.stub(LoginHelper, "isPrimaryPasswordSet").returns(true);
  try {
    const json = makeJsonStorage({
      logins: [TestData.formLogin({})],
      isLoggedIn: true,
    });
    const rust = makeRustStorage();

    const result = await new LoginStorageMigrator(json, rust).run();

    Assert.equal(result, rust, "unlocked Primary Password migrates");
    Assert.equal(
      Services.prefs.getBoolPref(PREF_ACTIVE),
      true,
      "rust activated"
    );
    const { extra } = Glean.pwmgr.rustMigrationStatus.testGetValue()[0];
    Assert.equal(extra.primary_password_set, "true");
  } finally {
    sandbox.restore();
  }
});
