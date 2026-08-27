/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Test that 'Save' function ignores original sources.

const originalFileUrl = "file:///proc/self/cwd/foo.js";

const sourceMap = {
  version: 3,
  sources: [originalFileUrl],
  sourcesContent: ["bar"],
  names: [],
  mappings: "AAAA",
};

const html = `<style>
  body {
    color: red;
  }
  /*# sourceMappingURL=source.map */
  </style>
  <body>
    test css source map
  </body>`;

const httpServer = createTestHTTPServer();
httpServer.registerContentType("html", "text/html");

httpServer.registerPathHandler("/", function (request, response) {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html; charset=utf-8");

  response.write(html);
});
httpServer.registerPathHandler("/source.map", function (request, response) {
  response.setHeader("Content-Type", "application/json");

  response.write(JSON.stringify(sourceMap));
});

const port = httpServer.identity.primaryPort;
const TEST_URL = `http://localhost:${port}/`;

add_task(async function testSavingOriginalSources() {
  const { MockFilePicker } = SpecialPowers;
  MockFilePicker.init();
  registerCleanupFunction(() => MockFilePicker.cleanup());

  const { ui } = await openStyleEditorForURL(TEST_URL);

  is(ui.editors.length, 1, "There should be only one stylesheet");

  const editor = ui.editors[0];
  // Wait for the source editor to be available
  await editor.getSourceEditor();

  const tooltip = editor.summary
    .querySelector(".stylesheet-name > label")
    .getAttribute("tooltiptext");
  is(
    tooltip,
    originalFileUrl,
    "The css tooltip refers to the URL specified in the source map"
  );
  // But the file:// URL is ignored for original sources
  is(
    editor.savedFile,
    undefined,
    "The original stylesheet should not have a pre-populated source file"
  );

  const destDir = FileUtils.getDir("TmpD", []);
  MockFilePicker.displayDirectory = destDir;

  let pickerWasShown = false;
  let destFile;
  MockFilePicker.showCallback = function (fp) {
    pickerWasShown = true;
    destFile = destDir.clone();
    destFile.append(fp.defaultString || "saved.css");
    MockFilePicker.setFiles([destFile]);
  };

  const savePromise = new Promise(resolve => {
    editor.saveToFile(null, resolve);
  });
  await savePromise;

  ok(
    pickerWasShown,
    "File picker was shown for first save on a file:// stylesheet"
  );
  is(
    editor.savedFile?.path,
    destFile.path,
    "savedFile is set to the picker result"
  );
});
