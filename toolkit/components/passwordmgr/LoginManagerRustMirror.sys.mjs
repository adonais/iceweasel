/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  LoginHelper: "resource://gre/modules/LoginHelper.sys.mjs",
});

/* Check if an url has punicode encoded hostname */
function isPunycode(origin) {
  try {
    return origin && new URL(origin).hostname.startsWith("xn--");
  } catch (_) {
    return false;
  }
}

function recordIncompatibleFormats(runId, operation, loginInfo) {
  if (isPunycode(loginInfo.origin)) {
    Glean.pwmgr.rustIncompatibleLoginFormat.record({
      run_id: runId,
      issue: "nonAsciiOrigin",
      operation,
    });
  }
  if (isPunycode(loginInfo.formActionOrigin)) {
    Glean.pwmgr.rustIncompatibleLoginFormat.record({
      run_id: runId,
      issue: "nonAsciiFormAction",
      operation,
    });
  }

  if (loginInfo.origin === ".") {
    Glean.pwmgr.rustIncompatibleLoginFormat.record({
      run_id: runId,
      issue: "dotOrigin",
      operation,
    });
  }

  if (
    loginInfo.username?.includes("\n") ||
    loginInfo.username?.includes("\r")
  ) {
    Glean.pwmgr.rustIncompatibleLoginFormat.record({
      run_id: runId,
      issue: "usernameLineBreak",
      operation,
    });
  }
}

function recordMirrorStatus(runId, operation, status, error = null) {
  const poisoned = Services.prefs.getBoolPref(
    "signon.rustMirror.poisoned",
    false
  );

  let errorMessage = "";
  if (error) {
    errorMessage = error.message ?? String(error);
  }

  Glean.pwmgr.rustMirrorStatus.record({
    run_id: runId,
    operation,
    status,
    error_message: errorMessage,
    poisoned,
  });

  if (status === "failure" && !poisoned) {
    Services.prefs.setBoolPref("signon.rustMirror.poisoned", true);
  }
}

function recordMigrationStatus(
  runId,
  duration,
  numberOfLoginsToMigrate,
  numberOfLoginsMigrated
) {
  Glean.pwmgr.rustMigrationStatus.record({
    run_id: runId,
    duration_ms: duration,
    number_of_logins_to_migrate: numberOfLoginsToMigrate,
    number_of_logins_migrated: numberOfLoginsMigrated,
    had_errors: numberOfLoginsMigrated < numberOfLoginsToMigrate,
  });
}

function recordMigrationFailure(runId, error) {
  Glean.pwmgr.rustMigrationFailure.record({
    run_id: runId,
    error_message: error.message ?? String(error),
  });
}

export class LoginManagerRustMirror {
  #logger = null;
  #jsonStorage = null;
  #rustStorage = null;
  #isEnabled = false;
  #migrationInProgress = false;
  #observer = null;

  constructor(jsonStorage, rustStorage) {
    this.#logger = lazy.LoginHelper.createLogger("LoginManagerRustMirror");
    this.#jsonStorage = jsonStorage;
    this.#rustStorage = rustStorage;

    Services.prefs.addObserver("signon.rustMirror.enabled", () =>
      this.#maybeEnable(this)
    );

    this.#logger.log("Rust Mirror is ready.");

    this.#maybeEnable();
  }

  #removeJsonStoreObserver() {
    if (this.#observer) {
      Services.obs.removeObserver(
        this.#observer,
        "passwordmgr-storage-changed"
      );
      this.#observer = null;
    }
  }

  #addJsonStoreObserver() {
    if (!this.#observer) {
      this.#observer = (subject, _, eventName) =>
        this.#onJsonStorageChanged(eventName, subject);
      Services.obs.addObserver(this.#observer, "passwordmgr-storage-changed");
    }
  }

  #maybeEnable() {
    const enabled =
      Services.prefs.getBoolPref("signon.rustMirror.enabled", true) &&
      !lazy.LoginHelper.isPrimaryPasswordSet();

    return enabled ? this.enable() : this.disable();
  }

  async enable() {
    if (this.#isEnabled) {
      return;
    }

    this.#removeJsonStoreObserver();
    this.#isEnabled = true;

    try {
      await this.#maybeRunMigration();
      this.#addJsonStoreObserver();
      this.#logger.log("Rust Mirror is enabled.");
    } catch (e) {
      this.#logger.error("Login migration failed", e);
      recordMirrorStatus("migration-enable", "failure", e);
    }
  }

  disable() {
    if (!this.#isEnabled) {
      return;
    }

    this.#removeJsonStoreObserver();

    this.#isEnabled = false;
    this.#logger.log("Rust Mirror is disabled.");

    // Since we'll miss updates we'll need to migrate again once disabled
    Services.prefs.setBoolPref("signon.rustMirror.migrationNeeded", true);
  }

  async #onJsonStorageChanged(eventName, subject) {
    this.#logger.log(`received change event ${eventName}...`);

    // eg in case a primary password has been set after enabling
    if (!this.#isEnabled || lazy.LoginHelper.isPrimaryPasswordSet()) {
      this.#logger.log("Mirror is not active. Change will not be mirrored.");
      return;
    }

    if (this.#migrationInProgress) {
      this.#logger.log(`Migration in progress, skipping event ${eventName}`);
      return;
    }

    const runId = Services.uuid.generateUUID();
    let loginToModify;
    let newLoginData;

    switch (eventName) {
      case "addLogin":
        this.#logger.log(`adding login ${subject.guid}...`);
        try {
          recordIncompatibleFormats(runId, "add", subject);
          await this.#rustStorage.addLoginsAsync([subject]);
          recordMirrorStatus(runId, "add", "success");
          this.#logger.log(`added login ${subject.guid}.`);
        } catch (e) {
          this.#logger.error("mirror-error:", e);
          recordMirrorStatus(runId, "add", "failure", e);
        }
        break;

      case "modifyLogin":
        loginToModify = subject.queryElementAt(0, Ci.nsILoginInfo);
        newLoginData = subject.queryElementAt(1, Ci.nsILoginInfo);
        this.#logger.log(`modifying login ${loginToModify.guid}...`);
        try {
          recordIncompatibleFormats(runId, "modify", newLoginData);
          this.#rustStorage.modifyLogin(loginToModify, newLoginData);
          recordMirrorStatus(runId, "modify", "success");
          this.#logger.log(`modified login ${loginToModify.guid}.`);
        } catch (e) {
          this.#logger.error("error: modifyLogin:", e);
          recordMirrorStatus(runId, "modify", "failure", e);
        }
        break;

      case "removeLogin":
        this.#logger.log(`removing login ${subject.guid}...`);
        try {
          this.#rustStorage.removeLogin(subject);
          recordMirrorStatus(runId, "remove", "success");
          this.#logger.log(`removed login ${subject.guid}.`);
        } catch (e) {
          this.#logger.error("error: removeLogin:", e);
          recordMirrorStatus(runId, "remove", "failure", e);
        }
        break;

      case "removeAllLogins":
        this.#logger.log("removing all logins...");
        try {
          this.#rustStorage.removeAllLogins();
          recordMirrorStatus(runId, "remove-all", "success");
          this.#logger.log("removed all logins.");
        } catch (e) {
          this.#logger.error("error: removeAllLogins:", e);
          recordMirrorStatus(runId, "remove-all", "failure", e);
        }
        break;

      // re-migrate on importLogins event
      case "importLogins":
        this.#logger.log("re-migrating logins after import...");
        await this.#migrate();
        break;

      default:
        this.#logger.error(`error: received unhandled event "${eventName}"`);
        break;
    }

    Services.obs.notifyObservers(
      null,
      `rust-mirror.event.${eventName}.finished`
    );
  }

  async #maybeRunMigration() {
    if (!this.#isEnabled || lazy.LoginHelper.isPrimaryPasswordSet()) {
      this.#logger.log("Mirror is not active. Migration will not run.");
      return;
    }

    const migrationNeeded = Services.prefs.getBoolPref(
      "signon.rustMirror.migrationNeeded",
      false
    );

    // eg in case a primary password has been set after enabling
    if (!migrationNeeded) {
      this.#logger.log("No migration needed.");
      return;
    }

    this.#logger.log("Migration is needed");

    await this.#migrate();
  }

  async #migrate() {
    if (this.#migrationInProgress) {
      this.#logger.log("Migration already in progress.");
      return;
    }

    this.#logger.log("Starting migration...");

    // We ignore events during migration run. Once we switch the
    // stores over, we will run an initial migration again to ensure
    // consistancy.
    this.#migrationInProgress = true;

    const t0 = Date.now();
    const runId = Services.uuid.generateUUID();
    let numberOfLoginsToMigrate = 0;
    let numberOfLoginsMigrated = 0;

    try {
      this.#rustStorage.removeAllLogins();
      this.#logger.log("Cleared existing Rust logins.");

      Services.prefs.setBoolPref("signon.rustMirror.poisoned", false);

      const logins = await this.#jsonStorage.getAllLogins();
      numberOfLoginsToMigrate = logins.length;

      const results = await this.#rustStorage.addLoginsAsync(logins, true);
      for (const { error } of results) {
        if (error) {
          this.#logger.error("error during migration:", error.message);
          recordMigrationFailure(runId, error);
        } else {
          numberOfLoginsMigrated += 1;
        }
      }

      this.#logger.log(
        `Successfully migrated ${numberOfLoginsMigrated}/${numberOfLoginsToMigrate} logins.`
      );

      // Migration complete, don't run again
      Services.prefs.setBoolPref("signon.rustMirror.migrationNeeded", false);

      this.#logger.log("Migration complete.");
    } catch (e) {
      this.#logger.error("migration error:", e);
    } finally {
      const duration = Date.now() - t0;
      recordMigrationStatus(
        runId,
        duration,
        numberOfLoginsToMigrate,
        numberOfLoginsMigrated
      );
      this.#migrationInProgress = false;

      // Notify about the finished migration. This is used in tests.
      Services.obs.notifyObservers(null, "rust-mirror.migration.finished");
    }
  }
}
