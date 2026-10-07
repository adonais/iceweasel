/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

// MIME type that is not registered anywhere on the system.
const TEST_MIME = "application/x-unknown-test";

add_task(async function test_unknown_mimetype_dialog() {
  // Enable the setting that shows the dialog for unknown types.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.download.useDownloadDir", true],
      ["browser.download.folderList", 1],
      ["browser.download.always_ask_before_handling_new_types", true],
    ],
  });

  // HTTP server with an unknown MIME type and no extension.
  let server = new HttpServer();
  server.registerPathHandler("/unknown", (req, resp) => {
    resp.setStatusLine(null, 200, "OK");
    resp.setHeader("Content-Type", TEST_MIME);
    resp.setHeader("Content-Disposition", 'attachment; filename="noextension"');
    resp.write("Test data");
  });
  server.start(-1);
  registerCleanupFunction(() => new Promise(resolve => server.stop(resolve)));

  let port = server.identity.primaryPort;
  let url = `http://localhost:${port}/unknown`;

  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    // Wait for the dialog and close it via the Cancel button.
    let dialogPromise = BrowserTestUtils.promiseAlertDialog(
      "cancel",
      "chrome://mozapps/content/downloads/unknownContentType.xhtml"
    );

    // Load the URL.
    BrowserTestUtils.startLoadingURIString(browser, url);

    // Wait for the dialog to close.
    await dialogPromise;

    // Verify that no download was created.
    let list = await Downloads.getList(Downloads.ALL);
    let downloads = await list.getAll();
    let found = downloads.some(d => d.source.url === url && !d.canceled);
    Assert.ok(!found, "Download should not be created after cancel");
  });
});
