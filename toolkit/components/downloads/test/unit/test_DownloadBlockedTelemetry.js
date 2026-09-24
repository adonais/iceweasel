/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Asserts that a single sample of `expectedSample` was recorded under the
// `verdict` label of the downloads.user_action_on_blocked_download labeled
// custom distribution.
function assertUserAction(verdict, expectedSample) {
  let distribution =
    Glean.downloads.userActionOnBlockedDownload[verdict].testGetValue();

  Assert.ok(distribution, `${verdict} should have been recorded`);
  Assert.equal(distribution?.count, 1, `${verdict} should have one sample`);
  Assert.equal(
    distribution?.sum,
    expectedSample,
    `${verdict} sample should be ${expectedSample}`
  );
}

add_setup(function () {
  // head.js calls do_get_profile() in run_test(), so FOG can only be
  // initialized once the tasks start running.
  Services.fog.initializeFOG();
});

const verdictToErrorsMap = new Map([
  [
    Ci.nsIApplicationReputationService.VERDICT_DANGEROUS,
    Downloads.Error.BLOCK_VERDICT_MALWARE,
  ],
  [
    Ci.nsIApplicationReputationService.VERDICT_POTENTIALLY_UNWANTED,
    Downloads.Error.BLOCK_VERDICT_POTENTIALLY_UNWANTED,
  ],
  [
    Ci.nsIApplicationReputationService.VERDICT_UNCOMMON,
    Downloads.Error.BLOCK_VERDICT_UNCOMMON,
  ],
  // BLOCK_VERDICT_INSECURE does not have a corresponding verdict,
  // but we use a different code path that doesn't use the verdict
  // in the test.
  ["Unused verdict", Downloads.Error.BLOCK_VERDICT_INSECURE],
]);

add_task(async function test_confirm_block_download() {
  for (const verdict of verdictToErrorsMap.keys()) {
    const error = verdictToErrorsMap.get(verdict);
    info(`Testing block ${error} download`);
    Services.fog.testResetFOG();

    let download;
    try {
      info(`Create ${error} download`);
      if (error == Downloads.Error.BLOCK_VERDICT_INSECURE) {
        download = await promiseStartLegacyDownload(null, {
          downloadClassification: Ci.nsITransfer.DOWNLOAD_POTENTIALLY_UNSAFE,
        });
      } else {
        download = await promiseBlockedDownload({
          keepPartialData: true,
          keepBlockedData: true,
          useLegacySaver: false,
          verdict,
          expectedError: error,
        });
      }
      await download.start();
      do_throw("The download should have failed.");
    } catch (ex) {
      if (!(ex instanceof Downloads.Error)) {
        throw ex;
      }
    }

    // Test blocked download is recorded
    assertUserAction(error, 0);

    // Test confirm block
    Services.fog.testResetFOG();
    info(`Block ${error} download`);
    await download.confirmBlock();
    assertUserAction(error, 1);
  }
});

add_task(async function test_confirm_unblock_download() {
  for (const verdict of verdictToErrorsMap.keys()) {
    const error = verdictToErrorsMap.get(verdict);
    info(`Testing unblock ${error} download`);
    Services.fog.testResetFOG();

    let download;
    try {
      info(`Create ${error} download`);
      if (error == Downloads.Error.BLOCK_VERDICT_INSECURE) {
        download = await promiseStartLegacyDownload(null, {
          downloadClassification: Ci.nsITransfer.DOWNLOAD_POTENTIALLY_UNSAFE,
        });
      } else {
        download = await promiseBlockedDownload({
          keepPartialData: true,
          keepBlockedData: true,
          useLegacySaver: false,
          verdict,
          expectedError: error,
        });
      }
      await download.start();
      do_throw("The download should have failed.");
    } catch (ex) {
      if (!(ex instanceof Downloads.Error)) {
        throw ex;
      }
    }

    // Test blocked download is recorded
    assertUserAction(error, 0);

    // Test unblock
    Services.fog.testResetFOG();
    info(`Unblock ${error} download`);
    let promise = new Promise(r => (download.onchange = r));
    await download.unblock();
    // The environment is not set up properly for performing a real download, cancel
    // the unblocked download so it doesn't affect the next testcase.
    await download.cancel();
    await promise;
    if (error == Downloads.Error.BLOCK_VERDICT_INSECURE) {
      Assert.ok(!download.error, "Ensure we didn't set download.error");
    }

    assertUserAction(error, 2);
  }
});
