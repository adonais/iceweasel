/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

"use strict";

requestLongerTimeout(2);

// Import helpers for the inspector
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/inspector/test/shared-head.js",
  this
);

// Specifc tests for the telemetry probes added to track stylesheet usage in the debugger

const httpServer = createTestHTTPServer();
const BASE_URL = `http://localhost:${httpServer.identity.primaryPort}/`;

httpServer.registerContentType("html", "text/html");
httpServer.registerContentType("js", "application/javascript");

httpServer.registerPathHandler("/index.html", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.write(`<html>
      <head>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body></body>
    </html>`);
});

httpServer.registerPathHandler("/style.css", (request, response) => {
  response.setHeader("Content-Type", "text/css");
  response.write("body { background-color: powderblue; }");
});

/**
 * This tests that the telemetry for stylesheet usage in the debugger is recorded.
 */
add_task(async function testStylesheetOpenAndEditTelemetry() {
  Services.fog.testResetFOG();
  await pushPref("devtools.debugger.features.stylesheets-in-debugger", true);
  const dbg = await initDebuggerWithAbsoluteURL(
    BASE_URL + "index.html",
    "style.css"
  );

  let currentBgColor =
    await getCurrentPageStylePropertyValue("backgroundColor");
  is(
    currentBgColor,
    "rgb(176, 224, 230)",
    "The background color is powder blue"
  );

  await selectSourceFromSourceTreeWithIndex(
    dbg,
    "style.css",
    3,
    "Select the style sheet"
  );

  is(
    Glean.devtoolsDebuggerStylesheets.stylesheetsOpenedCount.testGetValue(),
    1,
    "The stylesheet opened count is 1"
  );

  const color = "powderblue";
  is(getEditorContent(dbg), `body { background-color: ${color}; }`);

  info("Change the value of the backgroud color property in the editor");
  await editSelectedSourceContent(dbg, 1, 35, color.length, "green");

  // Wait a bit for the color to change to the final green color
  const bgColorChanged = await waitFor(async () => {
    currentBgColor = await getCurrentPageStylePropertyValue("backgroundColor");
    return currentBgColor == "rgb(0, 128, 0)";
  });
  ok(bgColorChanged, "The background color is now green");
  is(getEditorContent(dbg), `body { background-color: green; }`);

  is(
    Glean.devtoolsDebuggerStylesheets.stylesheetsEditedCount.testGetValue(),
    1,
    "The stylesheet edited count is 1"
  );
});

/**
 * This tests that the telemetry for stylesheet links which open in the debugger is recorded.
 */
add_task(async function testStylesheetLinksToDebuggerTelemetry() {
  Services.fog.testResetFOG();
  await pushPref("devtools.debugger.features.stylesheets-in-debugger", true);
  const dbg = await initDebuggerWithAbsoluteURL(
    BASE_URL + "index.html",
    "style.css"
  );

  info("Switch to the inspector");
  const { inspector, view: ruleView } = await openRuleView();

  await selectNode("body", inspector);

  info(
    "Find the style link in the rule view and click it to open the debugger"
  );
  const link = getRuleViewLinkByIndex(ruleView, 1);
  is(
    link.querySelector(".ruleview-rule-source-label").textContent,
    "style.css:1",
    "The link text is correct"
  );

  link.scrollIntoView();
  link.click();

  await waitForSelectedSource(dbg, "style.css");
  is(
    Glean.devtoolsDebuggerStylesheets.linksOpenedInDebuggerCount.testGetValue(),
    1,
    "The links opened in debugger count is 1"
  );
});
