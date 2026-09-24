/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let MockFilePicker = SpecialPowers.MockFilePicker;
let mockCA;

const TEST_URL =
  "https://example.com/browser/toolkit/components/contentanalysis/tests/browser/save_page_complete.html";

let tempDir;

add_setup(async function test_setup() {
  mockCA = await mockContentAnalysisService(makeMockContentAnalysis());

  tempDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tempDir.append("test-save-page-complete-dir");
  tempDir.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

  MockFilePicker.init();
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  MockFilePicker.displayDirectory = tempDir;

  registerCleanupFunction(async function () {
    MockFilePicker.cleanup();
    let list = await Downloads.getList(Downloads.ALL);
    await list.removeFinished();
    tempDir.remove(true);
  });
});

function createPromiseForFilePicker() {
  return new Promise(resolve => {
    MockFilePicker.showCallback = fp => {
      let destFile = tempDir.clone();
      destFile.append(fp.defaultString);
      let filesFolder = tempDir.clone();
      filesFolder.append(fp.defaultString.replace(/\.[^.]*$/, "") + "_files");
      MockFilePicker.setFiles([destFile]);
      MockFilePicker.filterIndex = 0; // kSaveAsType_Complete
      resolve({ destFile, filesFolder });
    };
  });
}

function promiseDownloadFinished(list) {
  return new Promise(resolve => {
    list.addView({
      onDownloadChanged(download) {
        download.launchWhenSucceeded = false;
        if (download.succeeded || download.error) {
          list.removeView(this);
          resolve(download);
        }
      },
    });
  });
}

async function testSavePageComplete(allow) {
  mockCA.setupForTest(allow);
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.contentanalysis.interception_point.download.enabled", true],
    ],
  });

  await BrowserTestUtils.withNewTab({ gBrowser, url: TEST_URL }, async () => {
    let downloadList = await Downloads.getList(Downloads.ALL);
    let filePickerShown = createPromiseForFilePicker();
    let downloadFinishedPromise = promiseDownloadFinished(downloadList);

    saveBrowser(gBrowser.selectedBrowser);

    info("Waiting for a filename to be picked from the file picker");
    let { destFile, filesFolder } = await filePickerShown;
    let download = await downloadFinishedPromise;

    is(mockCA.calls.length, 1, "Content Analysis called once");
    is(download.target.path, destFile.path, "Download saved to picked file");
    is(
      download.target.filesFolderPath,
      filesFolder.path,
      "Download knows about its files folder"
    );
    is(
      await IOUtils.exists(download.target.path),
      allow,
      "Target file existence"
    );
    is(await IOUtils.exists(filesFolder.path), allow, "Files folder existence");

    if (allow) {
      ok(!download.error, "Download should not have an error");
      await IOUtils.remove(download.target.path);
      await IOUtils.remove(filesFolder.path, { recursive: true });
    } else {
      ok(
        download.error.becauseBlockedByContentAnalysis,
        "Download blocked by content analysis"
      );
    }

    await downloadList.removeFinished();
  });

  await SpecialPowers.popPrefEnv();
}

add_task(async function testSavePageCompleteAllow() {
  await testSavePageComplete(true);
});

add_task(async function testSavePageCompleteBlock() {
  await testSavePageComplete(false);
});
