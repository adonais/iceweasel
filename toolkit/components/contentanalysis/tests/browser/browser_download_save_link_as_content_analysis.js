/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let mockCA = makeMockContentAnalysis();

const DOWNLOAD_URL =
  "https://example.com/browser/toolkit/components/contentanalysis/tests/browser/file_to_download.unknownextension";
const TEST_URL =
  "https://example.com/browser/toolkit/components/contentanalysis/tests/browser/download.html";

async function triggerSaveAs({ selector }) {
  const contextMenu = window.document.getElementById("contentAreaContextMenu");
  const popupshown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "contextmenu", button: 2 },
    gBrowser.selectedBrowser
  );
  await popupshown;
  let saveLinkCommand = window.document.getElementById("context-savelink");
  contextMenu.activateItem(saveLinkCommand);
}

let tempDir;

// Final file path for download.
let destFilePath;

// path to file that is a copy of the file sent to CA, so we can (async) check
// that it is the same file.
let copiedScannedFilePath;

add_setup(async () => {
  tempDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tempDir.append("test-download-dir");
  if (!tempDir.exists()) {
    tempDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  }
  registerCleanupFunction(function () {
    if (tempDir.exists()) {
      tempDir.remove(true);
    }
  });

  let oldAnalyzeContentRequestPrivate = mockCA.analyzeContentRequestPrivate;
  mockCA.analyzeContentRequestPrivate = function (
    request,
    autoAcknowledge,
    callback
  ) {
    // Copy the file being scanned now because the original (a .part file) is
    // renamed or removed once the download completes.
    let requestFile = new FileUtils.File(request.filePath);
    requestFile.copyTo(tempDir, "file.copy");
    let tempDirClone = tempDir.clone();
    tempDirClone.append("file.copy");
    copiedScannedFilePath = tempDirClone.path;
    oldAnalyzeContentRequestPrivate.call(
      this,
      request,
      autoAcknowledge,
      callback
    );
  };
  mockCA = await mockContentAnalysisService(mockCA);
});

function setupMockFilePicker() {
  let MockFilePicker = SpecialPowers.MockFilePicker;
  MockFilePicker.init();
  registerCleanupFunction(function () {
    MockFilePicker.cleanup();
  });

  MockFilePicker.displayDirectory = tempDir;
  MockFilePicker.showCallback = function (fp) {
    info("MockFilePicker: shown");
    const filename = fp.defaultString;
    info("MockFilePicker: save as " + filename);
    let destFile = tempDir.clone();
    destFile.append(filename);
    MockFilePicker.setFiles([destFile]);
    destFilePath = destFile.path;
    info("MockFilePicker: showCallback done");
  };
}

async function assertContentAnalysisDownloadRequest(request) {
  is(request.url.spec, DOWNLOAD_URL, "request has correct URL");
  is(
    request.analysisType,
    Ci.nsIContentAnalysisRequest.eFileDownloaded,
    "request has correct analysisType"
  );
  is(
    request.reason,
    Ci.nsIContentAnalysisRequest.eSaveAsDownload,
    "request has correct reason"
  );
  is(
    request.operationTypeForDisplay,
    Ci.nsIContentAnalysisRequest.eDownload,
    "request has correct operationTypeForDisplay"
  );
  // Compare file contents, not file names, as the download name will be the
  // temporary name assigned before content analysis approval.
  let scannedBytes = await IOUtils.read(copiedScannedFilePath);
  let expectedBytes = new Uint8Array(
    await (await fetch(DOWNLOAD_URL)).arrayBuffer()
  );
  Assert.deepEqual(
    scannedBytes,
    expectedBytes,
    "scanned file is download file"
  );
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

add_task(async function test_download_content_analysis_download_save_as() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contentanalysis.interception_point.download.enabled", true],
    ],
  });
  mockCA.setupForTest(true);

  await BrowserTestUtils.withNewTab({ gBrowser, url: TEST_URL }, async () => {
    setupMockFilePicker();
    await triggerSaveAs({ selector: "a.test-link" });
  });

  await TestUtils.waitForCondition(async () => {
    return (
      destFilePath &&
      (await IOUtils.exists(destFilePath)) &&
      (await IOUtils.stat(destFilePath)).size > 0
    );
  }, "Wait for the file to be downloaded");
  is(mockCA.calls.length, 1, "Content analysis should be called once");
  await assertContentAnalysisDownloadRequest(mockCA.calls[0]);
  await IOUtils.remove(destFilePath);
  await IOUtils.remove(copiedScannedFilePath);

  await SpecialPowers.popPrefEnv();
});
