/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* Verify that app post update process is launched with either
 * '/PostUpdateTarget:installation' or '/PostUpdateTarget:currentuser'
 * depending on which execution it is. */

async function run_test() {
  if (!setupTestCommon()) {
    return;
  }
  gTestFiles = gTestFilesCompleteSuccess;
  gTestDirs = gTestDirsCompleteSuccess;
  preventDistributionFiles();

  // Even if the test is running on an enterprise machine, we want to pretend
  // it isn't to make the the command-line argument is present.
  Services.env.set("MOZ_TEST_FORCE_ENTERPRISE", "0");

  // The post update process invocation is `TestAUSHelper post-update-args`.
  await setupUpdaterTest(FILE_COMPLETE_MAR, true, "", true, {
    asyncExeArg: "post-update-args",
  });

  runUpdate(STATE_SUCCEEDED, false, 0, true);

  await checkPostUpdateAppLog({
    expectedContents: gIsServiceTest
      ? "2: /DesktopLauncher\n3: /PostUpdateTarget:Installation\n2: /DesktopLauncher\n3: /PostUpdateTarget:CurrentUser\n"
      : "2: /DesktopLauncher\n3: /PostUpdateTarget:Installation\n",
  });

  checkAppBundleModTime();
  await testPostUpdateProcessing();
  checkPostUpdateRunningFile(true);
  checkFilesAfterUpdateSuccess(getApplyDirFile);
  checkUpdateLogContents(LOG_COMPLETE_SUCCESS, false, false, true);
  await waitForUpdateXMLFiles();
  await checkUpdateManager(STATE_NONE, false, STATE_SUCCEEDED, 0, 1);
  checkCallbackLog();
}
