/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  BackupError: "resource:///modules/backup/BackupError.mjs",
  ERRORS: "chrome://browser/content/backup/backup-constants.mjs",
});

const BACKUP_RETRY_LIMIT_PREF_NAME = "browser.backup.backup-retry-limit";
const DISABLED_ON_IDLE_RETRY_PREF_NAME =
  "browser.backup.disabled-on-idle-backup-retry";
const BACKUP_ERROR_CODE_PREF_NAME = "browser.backup.errorCode";
const MINIMUM_TIME_BETWEEN_BACKUPS_SECONDS_PREF_NAME =
  "browser.backup.scheduled.minimum-time-between-backups-seconds";
const SCHEDULED_BACKUPS_ENABLED_PREF_NAME = "browser.backup.scheduled.enabled";
const BACKUP_DEBUG_INFO_PREF_NAME = "browser.backup.backup-debug-info";
const BACKUP_DEFAULT_LOCATION_PREF_NAME = "browser.backup.location";

function bsInProgressStateUpdate(bs, isBackupInProgress) {
  // Check if already in desired state
  if (bs.state.backupInProgress === isBackupInProgress) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const listener = () => {
      if (bs.state.backupInProgress === isBackupInProgress) {
        bs.removeEventListener("BackupService:StateUpdate", listener);
        resolve();
      }
    };

    bs.addEventListener("BackupService:StateUpdate", listener);
  });
}

add_setup(async () => {
  const TEST_PROFILE_PATH = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testBackup"
  );

  Services.prefs.setStringPref(
    BACKUP_DEFAULT_LOCATION_PREF_NAME,
    TEST_PROFILE_PATH
  );
  Services.prefs.setBoolPref(SCHEDULED_BACKUPS_ENABLED_PREF_NAME, true);
  Services.prefs.setIntPref(BACKUP_RETRY_LIMIT_PREF_NAME, 2);
  Services.prefs.setBoolPref(DISABLED_ON_IDLE_RETRY_PREF_NAME, false);

  setupProfile();

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref(BACKUP_DEFAULT_LOCATION_PREF_NAME);
    Services.prefs.clearUserPref(SCHEDULED_BACKUPS_ENABLED_PREF_NAME);
    Services.prefs.clearUserPref(BACKUP_RETRY_LIMIT_PREF_NAME);
    Services.prefs.clearUserPref(DISABLED_ON_IDLE_RETRY_PREF_NAME);

    await IOUtils.remove(TEST_PROFILE_PATH, { recursive: true });
  });
});

add_task(async function test_retry_limit() {
  Services.fog.testResetFOG();

  let bs = new BackupService();
  let sandbox = sinon.createSandbox();
  // Make createBackup fail intentionally
  const createBackupFailureStub = sandbox
    .stub(bs, "resolveArchiveDestFolderPath")
    .rejects(new BackupError("forced failure", ERRORS.UNKNOWN));

  // stub out idleDispatch
  sandbox.stub(ChromeUtils, "idleDispatch").callsFake(callback => callback());

  sandbox.spy(bs, "createBackup");

  const n = Services.prefs.getIntPref(BACKUP_RETRY_LIMIT_PREF_NAME);
  // now that we have an idle service, let's call create backup RETRY_LIMIT times
  for (let i = 0; i <= n; i++) {
    // ensure that there is no error code set
    Services.prefs.setIntPref(BACKUP_ERROR_CODE_PREF_NAME, ERRORS.NONE);

    bs.createBackupOnIdleDispatch({});

    // #backupInProgress is set to true
    await bsInProgressStateUpdate(bs, true);
    // #backupInProgress is set to false
    await bsInProgressStateUpdate(bs, false);

    // wait a tick for the prefs to update
    await new Promise(executeSoon);

    Assert.equal(
      bs.createBackup.callCount,
      i + 1,
      "createBackup was called on idle"
    );
    Assert.equal(
      Services.prefs.getIntPref(BACKUP_ERROR_CODE_PREF_NAME),
      ERRORS.UNKNOWN,
      "Error code has been set"
    );

    if (i < n) {
      Assert.equal(
        Glean.browserBackup.backupThrottled.testGetValue(),
        null,
        "backupThrottled telemetry was not sent yet"
      );
    } else {
      // On this call, createBackup _was_ called, but the next call will be
      // ignored. However, the telemetry ping is sent now.
      Assert.equal(
        Glean.browserBackup.backupThrottled.testGetValue().length,
        1,
        "backupThrottled telemetry was sent"
      );
    }
  }
  // check if it switched to no longer creating backups on idle
  const previousCalls = bs.createBackup.callCount;

  bs.createBackupOnIdleDispatch({});

  // wait a tick for the pref to update
  await new Promise(executeSoon);

  Assert.equal(
    bs.createBackup.callCount,
    previousCalls,
    "createBackup was not called again after hitting the retry limit"
  );
  Assert.ok(
    Services.prefs.getBoolPref(DISABLED_ON_IDLE_RETRY_PREF_NAME),
    "Disable on idle has been enabled"
  );

  Services.fog.testResetFOG();
  Services.prefs.setIntPref(MINIMUM_TIME_BETWEEN_BACKUPS_SECONDS_PREF_NAME, 0);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(
      MINIMUM_TIME_BETWEEN_BACKUPS_SECONDS_PREF_NAME
    );
  });

  // add a buffer between lastAttempt and now
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 10));

  bs.createBackupOnIdleDispatch({});

  // #backupInProgress is set to true
  await bsInProgressStateUpdate(bs, true);

  Assert.equal(
    bs.createBackup.callCount,
    previousCalls + 1,
    "createBackup was called again"
  );

  Assert.equal(
    Glean.browserBackup.backupThrottled.testGetValue(),
    null,
    "backupThrottled telemetry was not sent after resuming backups"
  );

  // #backupInProgress is set to false
  await bsInProgressStateUpdate(bs, false);

  // let's restore the failing function in createBackup
  createBackupFailureStub.restore();

  // Now, on idleDispatch, we don't expect any failures

  // add a buffer between lastAttempt and now
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 10));

  let testProfilePath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testBackup_profile"
  );

  // calling createBackup directly to avoid race conditions with reliably
  // awaiting createBackup to finish from a call to idleDispatch. This case covers
  // the use case of reseting the prefs if createBackup is called and does not fail.
  await bs.createBackup({
    profilePath: testProfilePath,
  });

  // the error states should have reset
  Assert.ok(
    !Services.prefs.getBoolPref(DISABLED_ON_IDLE_RETRY_PREF_NAME),
    "Retry on idle is enabled now"
  );

  Assert.equal(
    Services.prefs.getIntPref(BACKUP_ERROR_CODE_PREF_NAME),
    ERRORS.NONE,
    "The error code is reset to NONE"
  );

  Assert.ok(
    !Services.prefs.getStringPref(BACKUP_DEBUG_INFO_PREF_NAME, null),
    "Error debug info has been cleared"
  );

  // check if changing the time since last backup calls createBackup
  sandbox.restore();
});
