/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

"use strict";

/**
 * Asserts sourcemapped stylesheets in the debugger
 */
const httpServer = createTestHTTPServer();
const BASE_URL = `http://localhost:${httpServer.identity.primaryPort}/`;

httpServer.registerContentType("html", "text/html");
httpServer.registerContentType("js", "application/javascript");

httpServer.registerPathHandler("/sourcemap-css.html", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.write(`<!doctype html>
  <html>
    <head>
      <title>testcase for testing CSS source maps</title>
      <link rel="stylesheet" type="text/css" href="/sourcemaps.css"/>
    </head>
    <body>
      <div>source maps <span>testcase</span></div>
    </body>
  </html>
  `);
});

const GENERATED_FILE_CONTENT = `div {
    color: #ff0066; }

  span {
    background-color: #EEE; }

  /*# sourceMappingURL=sourcemaps.css.map */
`;

httpServer.registerPathHandler("/sourcemaps.css", (request, response) => {
  response.setHeader("Content-Type", "text/css");
  response.write(GENERATED_FILE_CONTENT);
});

httpServer.registerPathHandler("/sourcemaps.css.map", (request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.write(`{
  "version": 3,
  "mappings": "AAGA,GAAI;EACF,KAAK,EAHU,OAAI;;AAMrB,IAAK;EACH,gBAAgB,EAAE,IAAI",
  "sources": ["sourcemaps.scss"],
  "file": "sourcemaps.css"
}
`);
});

const ORIGINAL_FILE_CONTENT = `
  $paulrougetpink: #f06;

  div {
    color: $paulrougetpink;
  }

  span {
    background-color: #EEE;
  }
`;
httpServer.registerPathHandler("/sourcemaps.scss", (request, response) => {
  response.setHeader("Content-Type", "text/css");
  response.write(ORIGINAL_FILE_CONTENT);
});

add_task(async function testSourcemappedStyleSheets() {
  await pushPref("devtools.debugger.features.stylesheets-in-debugger", true);
  const dbg = await initDebuggerWithAbsoluteURL(
    BASE_URL + "sourcemap-css.html",
    "sourcemaps.css",
    "sourcemaps.scss"
  );

  await selectSourceFromSourceTreeWithIndex(
    dbg,
    "sourcemaps.scss",
    4,
    "Select the scss file"
  );

  is(
    getEditorContent(dbg),
    ORIGINAL_FILE_CONTENT,
    "The content of the sourcemaps.scss (original file) is correct"
  );

  const footerButton = findElement(dbg, "sourceMapFooterButton");
  is(
    footerButton.textContent,
    "original file",
    "The source map button's label mention an original file"
  );
  ok(
    footerButton.classList.contains("original"),
    "The source map icon is original"
  );
  ok(
    !footerButton.classList.contains("not-mapped"),
    "The source map button isn't gray out"
  );

  info("Check that the original file is readonly");
  ok(getCMEditor(dbg).isReadOnly(), "The original file is readonly");

  info(
    "Click on jump to generated source link from editor's footer to go to the sourcemaps.css (bundle)"
  );
  const mappedSourceLink = findElement(dbg, "mappedSourceLink");
  is(
    mappedSourceLink.textContent,
    "To sourcemaps.css",
    "The link to mapped source mentions the bundle style sheet"
  );

  mappedSourceLink.click();

  await waitForSelectedSource(dbg, "sourcemaps.css");

  is(
    getEditorContent(dbg),
    GENERATED_FILE_CONTENT,
    "The content of the sourcemaps.css (bundle file) is correct"
  );

  info("Check that the bundle file is not readonly");
  const isNotReadOnly = await waitFor(
    async () => !getCMEditor(dbg).isReadOnly()
  );
  ok(isNotReadOnly, "The bundle file is readonly");

  info("Change the background color of the span on line 5");
  await editSelectedSourceContent(dbg, 5, 26, 3, "000");

  // Wait a bit for the span bg color to change to the black color
  const spanBGColorChanged = await waitFor(async () => {
    const spanBGColor = await SpecialPowers.spawn(
      gBrowser.selectedBrowser,
      [],
      function () {
        const spanStyles = content.getComputedStyle(
          content.document.querySelector("span")
        );
        return spanStyles.backgroundColor;
      }
    );
    return spanBGColor == "rgb(0, 0, 0)";
  });

  ok(spanBGColorChanged, "The sapn background color is now black");
  is(
    getEditorContent(dbg),
    `div {
    color: #ff0066; }

  span {
    background-color: #000; }

  /*# sourceMappingURL=sourcemaps.css.map */
`
  );
});
