/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

"use strict";

const httpServer = createTestHTTPServer();
const BASE_URL = `http://localhost:${httpServer.identity.primaryPort}/`;

httpServer.registerContentType("html", "text/html");

// Test that stylesheets with the same URL are displayed in the source tree
// and that the correct one is selected when clicking on a source tree item.
httpServer.registerPathHandler(
  "/duplicate-stylesheets.html",
  (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.write(`<!DOCTYPE html>
    <html>
      <head>
        <link rel="stylesheet" href="/bg.css">
        <link rel="stylesheet" href="/bg.css">
      </head>
      <body>
      </body>
    </html>
  `);
  }
);

httpServer.registerPathHandler("/bg.css", (request, response) => {
  response.setHeader("Content-Type", "text/css");
  response.write(`body{ background: green; }`);
});

add_task(async function () {
  await pushPref("devtools.debugger.features.stylesheets-in-debugger", true);
  const dbg = await initDebuggerWithAbsoluteURL(
    BASE_URL + "duplicate-stylesheets.html",
    "bg.css"
  );

  await waitForSourcesInSourceTree(dbg, ["bg.css", "bg.css"]);

  checkSourceTree(dbg, [
    ["Main Thread", 1],
    [`localhost:${httpServer.identity.primaryPort}`, 2],
    ["bg.css", 3],
    ["bg.css", 3],
  ]);

  await selectSourceFromSourceTreeWithIndex(
    dbg,
    "bg.css",
    3,
    "Select the first instance of bg.css in the source tree"
  );

  findElement(dbg, "sourceNode", 3).innerText.includes("bg.css");
  ok(
    findElement(dbg, "sourceNode", 3).classList.contains("focused"),
    "The first instance of bg.css is focused in the source tree"
  );

  findElement(dbg, "sourceNode", 4).innerText.includes("bg.css");
  ok(
    !findElement(dbg, "sourceNode", 4).classList.contains("focused"),
    "The second instance of bg.css is not focused in the source tree"
  );

  const firstSelectedStyleSourceId = dbg.selectors.getSelectedSource().id;

  await selectSourceFromSourceTreeWithIndex(
    dbg,
    "bg.css",
    4,
    "Select the second instance of bg.css in the source tree"
  );

  findElement(dbg, "sourceNode", 3).innerText.includes("bg.css");
  ok(
    !findElement(dbg, "sourceNode", 3).classList.contains("focused"),
    "The first instance of bg.css is not focused in the source tree"
  );

  findElement(dbg, "sourceNode", 4).innerText.includes("bg.css");
  ok(
    findElement(dbg, "sourceNode", 4).classList.contains("focused"),
    "The second instance of bg.css is focused in the source tree"
  );
  const secondSelectedStyleSourceId = dbg.selectors.getSelectedSource().id;

  isnot(
    secondSelectedStyleSourceId,
    firstSelectedStyleSourceId,
    "The second source instance of bg.css is different from the first instance of bg.css in the source tree"
  );

  info("Assert that selected stylesheet is still selected after reload");
  await reload(dbg);
  await waitForSelectedSource(dbg, "bg.css");
  ok(
    dbg.selectors.getSelectedSource().url.includes("bg.css"),
    "bg.css is still selected after reload"
  );
});

// Tests basic pretty-printing stylesheets.

httpServer.registerPathHandler("/index.html", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.write(`<!DOCTYPE html>
    <html>
      <head>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
      </body>
    </html>
  `);
});

httpServer.registerPathHandler("/style.css", (request, response) => {
  response.setHeader("Content-Type", "text/css");
  response.write(
    `body{background:white;}div{font-size:4em;color:red}span{color:green;@media screen { background: blue; &>.myClass {padding: 1em} }}`
  );
});

("use strict");

add_task(async function () {
  await pushPref("devtools.debugger.features.stylesheets-in-debugger", true);
  const dbg = await initDebuggerWithAbsoluteURL(
    BASE_URL + "index.html",
    "style.css"
  );

  const MINIFIED_CSS_TEXT =
    "body{background:white;}div{font-size:4em;color:red}span{color:green;@media screen { background: blue; &>.myClass {padding: 1em} }}";
  const PRETTIFIED_CSS_TEXT = `
body {
  background:white;
}
div {
  font-size:4em;
  color:red
}
span {
  color:green;
  @media screen {
    background: blue;
    &>.myClass {
      padding: 1em
    }
  }
}
`.trimStart();

  await selectSource(dbg, "style.css", 2);

  is(
    getLineCount(dbg),
    1,
    `The minified style sheet should have a single line`
  );

  is(getEditorContent(dbg), MINIFIED_CSS_TEXT, "minified source is correct");

  let prettyPrintButton = findElement(dbg, "prettyPrintButton");
  ok(!prettyPrintButton.disabled, "The pretty print button should be enabled");

  ok(
    !prettyPrintButton.classList.contains("pretty"),
    "The pretty print button should not be enabled"
  );

  await togglePrettyPrint(dbg);

  is(
    getLineCount(dbg),
    17,
    `The pretty printed style sheet should the expected nunber of lines`
  );

  is(
    getEditorContent(dbg),
    PRETTIFIED_CSS_TEXT,
    "minified source has been prettified automatically"
  );

  ok(
    prettyPrintButton.classList.contains("pretty"),
    "The pretty print button should be enabled"
  );

  await togglePrettyPrint(dbg);

  prettyPrintButton = findElement(dbg, "prettyPrintButton");
  is(
    getLineCount(dbg),
    1,
    "The minified style sheet should have a single line"
  );

  is(
    getEditorContent(dbg),
    MINIFIED_CSS_TEXT,
    "minified source is still correct"
  );

  ok(
    !prettyPrintButton.classList.contains("pretty"),
    "The pretty print button should not be enabled"
  );
});
