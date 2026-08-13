/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let mockCA = makeMockContentAnalysis();

add_setup(async function test_setup() {
  mockCA = await mockContentAnalysisService(mockCA);
});

const DOWNLOAD_URL =
  "https://example.com/browser/toolkit/components/contentanalysis/tests/browser/file_to_download.unknownextension";

async function createTargetFileAndDownload(usePartFile) {
  // Create a temporary file that will be downloaded to.
  const targetFileName = await IOUtils.createUniqueFile(
    PathUtils.tempDir,
    "target_download_for_content_analysis.txt",
    0o600
  );
  // Remove the file so tests can see whether it gets
  // successfully downloaded. Note that this theoretically introduces
  // a race condition since something else could come in and create
  // a temp file with the same name. This seems unlikely.
  await IOUtils.remove(targetFileName, { ignoreAbsent: false });

  return await Downloads.createDownload({
    source: {
      url: DOWNLOAD_URL,
    },
    target: {
      path: targetFileName,
      partFilePath: usePartFile ? targetFileName + ".part" : undefined,
    },
  });
}

/**
 * Waits for a download to finish.
 *
 * @param {DownloadList} aList
 *        The DownloadList that contains the download.
 * @param {Download} aDownload
 *        The Download object to wait upon.
 *
 * @returns {Promise}
 */
function promiseDownloadFinished(aList, aDownload) {
  let promiseAndResolvers = Promise.withResolvers();
  let view = {
    onDownloadChanged() {
      if (aDownload.succeeded || aDownload.error || aDownload.canceled) {
        aList.removeView(view);
        promiseAndResolvers.resolve();
      }
    },
  };
  aList.addView(view);
  // Register for the notification, but also call the function directly in
  // case the download already reached the expected progress.
  view.onDownloadChanged(aDownload);

  return promiseAndResolvers.promise;
}

function assertContentAnalysisDownloadRequest(request, expectedFilePath) {
  is(request.url.spec, DOWNLOAD_URL, "request has correct URL");
  is(
    request.analysisType,
    Ci.nsIContentAnalysisRequest.eFileDownloaded,
    "request has correct analysisType"
  );
  is(
    request.reason,
    Ci.nsIContentAnalysisRequest.eNormalDownload,
    "request has correct reason"
  );
  is(
    request.operationTypeForDisplay,
    Ci.nsIContentAnalysisRequest.eDownload,
    "request has correct operationTypeForDisplay"
  );
  is(request.filePath, expectedFilePath, "request filePath should match");
  ok(!request.textContent?.length, "request textContent should be empty");
  is(
    request.userActionRequestsCount,
    1,
    "request userActionRequestsCount should match"
  );
  ok(request.userActionId.length, "request userActionId should not be empty");
  is(request.getPrintData().length, 0, "request should have no print data");
  ok(!!request.requestToken.length, "request requestToken should not be empty");
}

async function check_download_content_analysis_allows(usePartFile) {
  mockCA.setupForTest(true);
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contentanalysis.interception_point.download.enabled", true],
    ],
  });

  const download = await createTargetFileAndDownload(usePartFile);
  let list = await Downloads.getList(Downloads.PUBLIC);
  await list.add(download);
  await download.start();
  await promiseDownloadFinished(list, download);
  // Make sure the download succeeded.
  ok(download.succeeded, "Download should succeed");
  is(mockCA.calls.length, 1, "Content analysis should be called once");
  assertContentAnalysisDownloadRequest(
    mockCA.calls[0],
    usePartFile ? download.target.partFilePath : download.target.path
  );
  ok(
    await IOUtils.exists(download.target.path),
    "Final target file should exist"
  );
  if (usePartFile) {
    ok(
      !(await IOUtils.exists(download.target.partFilePath)),
      "Part file should not still exist"
    );
  }
  await IOUtils.remove(download.target.path);
  await SpecialPowers.popPrefEnv();
}

add_task(async function test_download_content_analysis_allows() {
  await check_download_content_analysis_allows(false /* usePartFile */);
});

add_task(async function test_download_content_analysis_allows_partfile() {
  await check_download_content_analysis_allows(true /* usePartFile */);
});

async function check_download_content_analysis_blocks(usePartFile) {
  mockCA.setupForTest(false);
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contentanalysis.interception_point.download.enabled", true],
    ],
  });

  const download = await createTargetFileAndDownload(usePartFile);
  if (usePartFile) {
    info(`part file path is ${download.target.partFilePath}`);
  }
  info(`final path is ${download.target.path}`);
  await Assert.rejects(
    download.start(),
    ex => ex instanceof Downloads.Error && ex.becauseBlockedByContentAnalysis,
    "Download should have been rejected"
  );
  ok(!download.succeeded, "Download should not succeed");
  is(mockCA.calls.length, 1, "Content analysis should be called once");
  assertContentAnalysisDownloadRequest(
    mockCA.calls[0],
    usePartFile ? download.target.partFilePath : download.target.path
  );

  ok(
    !(await IOUtils.exists(download.target.path)),
    "Final target file should not exist"
  );
  if (usePartFile) {
    ok(
      !(await IOUtils.exists(download.target.partFilePath)),
      "Part file should not still exist"
    );
  }
  await SpecialPowers.popPrefEnv();
}

add_task(async function test_download_content_analysis_blocks() {
  await check_download_content_analysis_blocks(false /* usePartFile */);
});

add_task(async function test_download_content_analysis_blocks_partfile() {
  await check_download_content_analysis_blocks(true /* usePartFile */);
});

async function check_download_content_analysis_user_cancels(usePartFile) {
  // Make the mock CA service wait for event so the test can
  // cancel the download before the scan finishes.
  mockCA.setupForTest(true, /* waitForEvent */ true);
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contentanalysis.interception_point.download.enabled", true],
    ],
  });

  let scanStartedPromise = new Promise(res => {
    mockCA.eventTarget.addEventListener("inAnalyzeContentRequest", res, {
      once: true,
    });
  });
  const download = await createTargetFileAndDownload(usePartFile);

  if (usePartFile) {
    info(`part file path is ${download.target.partFilePath}`);
  }
  info(`final path is ${download.target.path}`);

  let list = await Downloads.getList(Downloads.PUBLIC);
  await list.add(download);
  download.start();
  // Make sure the scan has started before cancelling.
  await scanStartedPromise;
  download.cancel();
  await promiseDownloadFinished(list, download);
  // Wait for the scan to be cancelled to avoid a race between cancelling
  // and the scan finishing.
  await TestUtils.waitForCondition(() => {
    return mockCA.cancelledUserActions.length == 1;
  }, "Wait for the scan to be cancelled");

  // Tell the scan to finish, but this should be ignored since the user
  // already cancelled.
  mockCA.eventTarget.dispatchEvent(
    new CustomEvent("returnContentAnalysisResponse")
  );
  // Make sure the download finished.
  ok(download.canceled, "Download should be cancelled");
  is(mockCA.calls.length, 1, "Content analysis should be called once");
  is(mockCA.cancelledUserActions.length, 1, "One user action cancelled");

  try {
    await IOUtils.remove(download.target.path);
  } catch (ex) {
    // OK if this fails; we don't have everything set up so the file
    // may or may not exist on disk.
  }
  await SpecialPowers.popPrefEnv();
}

add_task(async function test_download_content_analysis_user_cancels() {
  await check_download_content_analysis_user_cancels(false /* usePartFile */);
});

add_task(async function test_download_content_analysis_user_cancels_partfile() {
  await check_download_content_analysis_user_cancels(true /* usePartFile */);
});

add_task(async function test_download_content_analysis_pref_defaults_to_off() {
  // do not set pref, so content analysis should not be consulted
  mockCA.setupForTest(false);
  const download = await createTargetFileAndDownload(false);
  let list = await Downloads.getList(Downloads.PUBLIC);
  await list.add(download);
  await download.start();
  await promiseDownloadFinished(list, download);
  // Make sure the download succeeded.
  ok(download.succeeded, "Download should succeed");
  is(mockCA.calls.length, 0, "Content analysis should not be called");
  ok(
    await IOUtils.exists(download.target.path),
    "Final target file should exist"
  );
  await IOUtils.remove(download.target.path);
});
