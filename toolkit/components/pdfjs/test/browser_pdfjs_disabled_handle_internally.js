/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const RELATIVE_DIR = "toolkit/components/pdfjs/test/";
const TESTROOT = "https://example.com/browser/" + RELATIVE_DIR;
const PDF_URL = TESTROOT + "file_pdfjs_test.pdf";

add_setup(async function () {
  const saveDir = createTemporarySaveDirectory("handleinternally");
  // Opening in Firefox is the default action for PDFs, and the built-in viewer
  // restores it whenever it runs, so it is still the stored action once the
  // viewer has been disabled.
  const oldAction = changeMimeHandler(
    Ci.nsIHandlerInfo.handleInternally,
    false
  );

  await SpecialPowers.pushPrefEnv({
    set: [
      ["pdfjs.disabled", true],
      ["browser.download.always_ask_before_handling_new_types", false],
      ["browser.download.folderList", 2],
      ["browser.download.dir", saveDir.path],
    ],
  });

  registerCleanupFunction(async function () {
    changeMimeHandler(oldAction[0], oldAction[1]);
    await cleanupDownloads();
    saveDir.remove(true);
  });
});

async function checkPdfIsNotHandledInternally(url) {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const dialogPromise = BrowserTestUtils.domWindowOpenedAndLoaded();

  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url);

  const dialogWindow = await dialogPromise;
  is(
    dialogWindow.location.href,
    "chrome://mozapps/content/downloads/unknownContentType.xhtml",
    "The dialog to open or save the PDF must be displayed"
  );

  const dialogClosed = BrowserTestUtils.domWindowClosed(dialogWindow);
  dialogWindow.document.querySelector("#unknownContentType").cancelDialog();
  await dialogClosed;

  BrowserTestUtils.removeTab(tab);
}

add_task(async function test_remote_pdf() {
  await checkPdfIsNotHandledInternally(PDF_URL);
});

add_task(async function test_local_pdf() {
  // A local file is launched from where it is instead of being downloaded, and
  // launching it fails when the stored action has no application to launch.
  const pdf = getChromeDir(getResolvedURI(gTestPath));
  pdf.append("file_pdfjs_test.pdf");
  await checkPdfIsNotHandledInternally(Services.io.newFileURI(pdf).spec);
});
