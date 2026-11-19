/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

/* Complete MAR file apply failure test during the Draft phase with a stale
 * backup file */

/**
 * A backup that a previous updater instance would have left behind if it had
 * died before discarding it, for a file that the precomplete removes.
 */
const STALE_BACKUP_REL_PATH =
  DIR_RESOURCES + "searchplugins/searchpluginspng0.png.moz-backup";
const STALE_BACKUP_CONTENTS = "LeftBehindByAPreviousUpdaterRun\n";

async function run_test() {
  if (!setupTestCommon()) {
    return;
  }
  gTestFiles = gTestFilesCompleteSuccess;
  gTestDirs = gTestDirsCompleteSuccess;
  setTestFilesAndDirsForFailure();
  await setupUpdaterTest(FILE_COMPLETE_MAR, false);
  let staleBackup = getApplyDirFile(STALE_BACKUP_REL_PATH);
  writeFile(staleBackup, STALE_BACKUP_CONTENTS);

  Services.env.set("MOZ_TEST_DRAFT_WRITE_FAIL", "00png0.png");
  try {
    // If execv is used the updater process will turn into the callback process
    // and the updater's return code will be that of the callback process.
    runUpdate(STATE_FAILED_WRITE_ERROR, false, USE_EXECV ? 0 : 1, true);
  } finally {
    Services.env.set("MOZ_TEST_DRAFT_WRITE_FAIL", "");
  }
  checkAppBundleModTime();
  await testPostUpdateProcessing();
  checkPostUpdateRunningFile(false);

  checkUpdateLogContains(
    [
      "AddFile::Draft: TEST fault injection, pretending the draft write " +
        "failed: " +
        DIR_RESOURCES +
        "0/00/00png0.png",
      "### draft failed",
    ].join("\n")
  );
  Assert.ok(
    staleBackup.exists(),
    MSG_SHOULD_EXIST + getMsgPath(staleBackup.path)
  );
  Assert.equal(
    readFileBytes(staleBackup),
    STALE_BACKUP_CONTENTS,
    "the stale backup contents" + MSG_SHOULD_EQUAL
  );
  checkUpdateLogContains(
    "backup_restore: not restoring a backup that this action did not create: " +
      STALE_BACKUP_REL_PATH
  );
  // The check for temporary files that checkFilesAfterUpdateFailure performs
  // would find the stale backup, which the updater leaves in place on purpose.
  staleBackup.remove(false);
  checkFilesAfterUpdateFailure(getApplyDirFile);

  await waitForUpdateXMLFiles(true, false);
  await checkUpdateManager(STATE_PENDING, true, STATE_PENDING, WRITE_ERROR, 0);
  checkCallbackLog();
}
