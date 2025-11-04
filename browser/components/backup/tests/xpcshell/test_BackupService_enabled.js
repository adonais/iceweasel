/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ExperimentAPI } = ChromeUtils.importESModule(
  "resource://nimbus/ExperimentAPI.sys.mjs"
);
const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

add_setup(async () => {
  setupProfile();

  NimbusTestUtils.init(this);

  const { cleanup: nimbusCleanup } = await NimbusTestUtils.setupTest();

  await ExperimentAPI.ready();

  let backupDir = await IOUtils.createUniqueDirectory(
    PathUtils.profileDir,
    "backup"
  );

  // Use temporary directory for backups.
  Services.prefs.setStringPref("browser.backup.location", backupDir);

  registerCleanupFunction(async () => {
    const nimbusCleanupPromise = nimbusCleanup();
    const backupDirCleanupPromise = IOUtils.remove(backupDir, {
      recursive: true,
    });

    await Promise.all([nimbusCleanupPromise, backupDirCleanupPromise]);

    Services.prefs.clearUserPref("browser.backup.location");
  });

  BackupService.init();
});

add_task(async function test_archive_killswitch_enrollment() {
  const bs = BackupService.get();

  const cleanupExperiment = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "backupService",
    value: { archiveKillswitch: true },
  });

  Assert.ok(
    !bs.archiveEnabledStatus.enabled,
    "The backup service should report that archiving is disabled when the archive killswitch is active."
  );

  Assert.equal(
    bs.archiveEnabledStatus.reason,
    "Archiving a profile disabled remotely.",
    "`archiveEnabledStatus` should report that it is disabled by the archive killswitch."
  );

  Services.fog.testResetFOG();
  let backup = await bs.createBackup();
  Assert.ok(
    !backup,
    "Creating a backup should fail when the archive killswitch is active."
  );
  let telemetry = Glean.browserBackup.backupDisabledReason.testGetValue();
  Assert.equal(
    telemetry,
    "nimbus",
    "Telemetry identifies the backup is disabled by Nimbus."
  );

  // End the experiment.
  await cleanupExperiment();

  Assert.ok(
    bs.archiveEnabledStatus.enabled,
    "The backup service should report that archiving is enabled once the archive killswitch experiment ends."
  );

  backup = await bs.createBackup();
  ok(
    backup,
    "Creating a backup should succeed once the archive killswitch experiment ends."
  );
  ok(
    await IOUtils.exists(backup.archivePath),
    "Archive file should exist on disk."
  );

  telemetry = Glean.browserBackup.backupDisabledReason.testGetValue();
  Assert.equal(
    telemetry,
    "reenabled",
    "Telemetry identifies the backup was re-enabled."
  );
});

add_task(async function test_restore_killswitch_enrollment() {
  const bs = BackupService.get();
  const backup = await bs.createBackup();

  Assert.ok(
    backup && backup.archivePath,
    "Archive should have been created on disk."
  );

  let cleanupExperiment = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "backupService",
    value: { restoreKillswitch: true },
  });

  const recoveryDir = await IOUtils.createUniqueDirectory(
    PathUtils.profileDir,
    "recovered-profiles"
  );

  Assert.ok(
    !bs.restoreEnabledStatus.enabled,
    "The backup service should report that restoring is disabled when the restore killswitch is active."
  );

  Assert.equal(
    bs.restoreEnabledStatus.reason,
    "Restore from backup disabled remotely.",
    "`restoreEnabledStatus` should report that it is disabled by the restore killswitch."
  );

  await Assert.rejects(
    bs.recoverFromBackupArchive(
      backup.archivePath,
      null,
      false,
      PathUtils.profileDir,
      recoveryDir
    ),
    /Restore from backup disabled remotely\./,
    "Recovery should throw when the restore killswitch is active."
  );

  // End the experiment.
  await cleanupExperiment();

  Assert.ok(
    bs.restoreEnabledStatus.enabled,
    "The backup service should report that restoring is enabled once the restore killswitch experiment ends."
  );

  let recoveredProfile = await bs.recoverFromBackupArchive(
    backup.archivePath,
    null,
    false,
    PathUtils.profileDir,
    recoveryDir
  );
  Assert.ok(
    recoveredProfile,
    "Recovery should succeed once the restore killswitch experiment ends."
  );
  Assert.ok(
    await IOUtils.exists(recoveredProfile.rootDir.path),
    "Recovered profile directory should exist on disk."
  );
});
