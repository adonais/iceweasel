/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ArchiveUtils } = ChromeUtils.importESModule(
  "resource:///modules/backup/ArchiveUtils.sys.mjs"
);
const { JsonSchema } = ChromeUtils.importESModule(
  "resource://gre/modules/JsonSchema.sys.mjs"
);

let currentProfile;
add_setup(() => {
  currentProfile = setupProfile();
});

/**
 * Tests that if the backup-manifest.json provides an appName different from
 * AppConstants.MOZ_APP_NAME of the currently running application, then
 * recoverFromSnapshotFolder should throw an exception.
 */
add_task(async function test_different_appName() {
  let testRecoveryPath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testDifferentAppName"
  );

  let meta = Object.assign({}, FAKE_METADATA);
  meta.appName = "Some other application";
  Assert.notEqual(
    meta.appName,
    AppConstants.MOZ_APP_NAME,
    "Set up a different appName in the manifest correctly."
  );

  let manifest = {
    version: ArchiveUtils.SCHEMA_VERSION,
    meta,
    resources: {},
  };
  let schema = await BackupService.MANIFEST_SCHEMA;
  let validationResult = JsonSchema.validate(manifest, schema);
  Assert.ok(validationResult.valid, "Schema matches manifest");

  await IOUtils.writeJSON(
    PathUtils.join(testRecoveryPath, BackupService.MANIFEST_FILE_NAME),
    manifest
  );

  let bs = new BackupService();
  // This should reject and mention the invalid appName from the manifest.
  await Assert.rejects(
    bs.recoverFromSnapshotFolder(testRecoveryPath),
    new RegExp(`${meta.appName}`)
  );

  await IOUtils.remove(testRecoveryPath, { recursive: true });
});

/**
 * Tests that if the backup-manifest.json provides an appVersion greater than
 * AppConstants.MOZ_APP_VERSION of the currently running application, then
 * recoverFromSnapshotFolder should throw an exception.
 */
add_task(async function test_newer_appVersion() {
  let testRecoveryPath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testNewerAppVersion"
  );

  let meta = Object.assign({}, FAKE_METADATA);
  // Hopefully this static version number will do for now.
  meta.appVersion = "999.0.0";
  Assert.equal(
    Services.vc.compare(AppConstants.MOZ_APP_VERSION, meta.appVersion),
    -1,
    "The current application version is less than 999.0.0."
  );

  let manifest = {
    version: ArchiveUtils.SCHEMA_VERSION,
    meta,
    resources: {},
  };
  let schema = await BackupService.MANIFEST_SCHEMA;
  let validationResult = JsonSchema.validate(manifest, schema);
  Assert.ok(validationResult.valid, "Schema matches manifest");

  await IOUtils.writeJSON(
    PathUtils.join(testRecoveryPath, BackupService.MANIFEST_FILE_NAME),
    manifest
  );

  let bs = new BackupService();
  // This should reject and mention the invalid appVersion from the manifest.
  await Assert.rejects(
    bs.recoverFromSnapshotFolder(testRecoveryPath),
    new RegExp(`${meta.appVersion}`)
  );

  await IOUtils.remove(testRecoveryPath, { recursive: true });
});

add_task(async function test_profile_naming() {
  let testRecoveryPath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testProfileNaming"
  );

  let meta = Object.assign({}, FAKE_METADATA);
  let manifest = {
    version: ArchiveUtils.SCHEMA_VERSION,
    meta,
    resources: {},
  };
  let schema = await BackupService.MANIFEST_SCHEMA;
  let validationResult = JsonSchema.validate(manifest, schema);
  Assert.ok(validationResult.valid, "Schema matches manifest");

  await IOUtils.writeJSON(
    PathUtils.join(testRecoveryPath, BackupService.MANIFEST_FILE_NAME),
    manifest
  );

  let currentName = `original-profile-that-was-backed-up`;
  currentProfile.name = currentName;

  let bs = new BackupService();

  await bs.recoverFromSnapshotFolder(testRecoveryPath, false);

  Assert.equal(
    currentProfile.name,
    `old-${currentName}`,
    "The old profile prefix was added"
  );
  currentName = currentProfile.name;

  // Let's make sure that we don't end up chaining the prefix
  await bs.recoverFromSnapshotFolder(testRecoveryPath, false);
  Assert.notEqual(
    currentProfile.name,
    `old-${currentName}`,
    "The old profile prefix was not added again"
  );
  Assert.equal(
    currentProfile.name,
    currentName,
    "The name of the profile did not change"
  );

  await IOUtils.remove(testRecoveryPath, { recursive: true });
});

/**
 * Tests that resources whose requiresEncryption is true are skipped when
 * recovering from an unencrypted archive, and recovered when the archive was
 * encrypted.
 */
add_task(async function test_skip_encrypted_resource_when_unencrypted() {
  let sandbox = sinon.createSandbox();

  sandbox.stub(FakeBackupResource1, "requiresEncryption").get(() => true);
  sandbox.stub(FakeBackupResource2, "requiresEncryption").get(() => false);
  sandbox.stub(FakeBackupResource3, "requiresEncryption").get(() => false);

  let recover1 = sandbox
    .stub(FakeBackupResource1.prototype, "recover")
    .resolves();
  let recover2 = sandbox
    .stub(FakeBackupResource2.prototype, "recover")
    .resolves();
  let recover3 = sandbox
    .stub(FakeBackupResource3.prototype, "recover")
    .resolves();

  let bs = new BackupService({
    FakeBackupResource1,
    FakeBackupResource2,
    FakeBackupResource3,
  });

  let testRecoveryPath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testSkipEncrypted"
  );
  let profileRootPath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "testSkipEncryptedProfiles"
  );

  let manifest = {
    version: ArchiveUtils.SCHEMA_VERSION,
    meta: Object.assign({}, FAKE_METADATA),
    resources: { fake1: {}, fake2: {}, fake3: {} },
  };

  // Unencrypted archive: the encryption-requiring resource must be skipped.
  await bs.recoverFromSnapshotFolder(
    testRecoveryPath,
    false,
    profileRootPath,
    manifest,
    false
  );

  Assert.ok(
    recover1.notCalled,
    "Resource requiring encryption is skipped for an unencrypted archive."
  );
  Assert.ok(
    recover2.calledOnce,
    "Resource not requiring encryption is recovered."
  );
  Assert.ok(
    recover3.calledOnce,
    "Resource not requiring encryption is recovered."
  );

  recover1.resetHistory();
  recover2.resetHistory();
  recover3.resetHistory();

  // Encrypted archive: every resource is recovered.
  await bs.recoverFromSnapshotFolder(
    testRecoveryPath,
    false,
    profileRootPath,
    manifest,
    true
  );

  Assert.ok(
    recover1.calledOnce,
    "Resource requiring encryption is recovered for an encrypted archive."
  );
  Assert.ok(recover2.calledOnce, "Non-encryption resource recovered again.");
  Assert.ok(recover3.calledOnce, "Non-encryption resource recovered again.");

  sandbox.restore();
  await IOUtils.remove(testRecoveryPath, { recursive: true });
  await IOUtils.remove(profileRootPath, { recursive: true });
});
