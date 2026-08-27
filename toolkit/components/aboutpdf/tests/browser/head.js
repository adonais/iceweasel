/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function openAboutPDF() {
  return BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: "about:pdf",
    waitForLoad: true,
  });
}

function getAboutPDFActor(tab) {
  return tab.linkedBrowser.browsingContext.currentWindowGlobal.getActor(
    "AboutPDF"
  );
}

async function createTempFile(contents, { suffix = ".pdf" } = {}) {
  const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append(`aboutPDF-test${suffix}`);
  file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  const bytes =
    typeof contents === "string"
      ? new TextEncoder().encode(contents)
      : contents;
  await IOUtils.write(file.path, bytes);
  return file;
}

async function safeRemove(file) {
  try {
    await IOUtils.remove(file.path, { ignoreAbsent: true });
  } catch {}
}
