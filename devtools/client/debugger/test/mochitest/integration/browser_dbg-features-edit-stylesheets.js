/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

"use strict";

// Import helpers for the inspector
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/inspector/test/shared-head.js",
  this
);

/**
 * Asserts editing of stylesheets in the debugger
 */
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
      <body>
        <script type="text/javascript">
          console.log("some random text");
        </script>
      </body>
    </html>`);
});

httpServer.registerPathHandler("/style.css", (request, response) => {
  response.setHeader("Content-Type", "text/css");
  response.write("body { background-color: powderblue; }");
});

/**
 * This tests that editing style sheets updates the current page.
 */
add_task(async function testEditingStyleSheets() {
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
    4,
    "Select the style sheet"
  );
  const color = "powderblue";
  is(getEditorContent(dbg), `body { background-color: ${color}; }`);

  info("Change the value of the background color property in the editor");
  await editSelectedSourceContent(dbg, 1, 35, color.length, "green");

  // Wait a bit for the color to change to the final green color
  const bgColorChanged = await waitFor(async () => {
    currentBgColor = await getCurrentPageStylePropertyValue("backgroundColor");
    return currentBgColor == "rgb(0, 128, 0)";
  });
  ok(bgColorChanged, "The background color is now green");
  is(getEditorContent(dbg), `body { background-color: green; }`);

  info(
    "Assert that the changes to the stylesheet content are persisted after switching sources"
  );
  info("Switch to the html file");
  await selectSource(dbg, "index.html");

  info("Switch back to the stylesheet");
  await selectSource(dbg, "style.css");

  is(getEditorContent(dbg), `body { background-color: green; }`);
  currentBgColor = await getCurrentPageStylePropertyValue("backgroundColor");
  is(currentBgColor, "rgb(0, 128, 0)", "The background color is still green");
});

/**
 * This tests that updates from the inspector are visible in the debugger and vice versa.
 */
add_task(async function testInspectorDebuggerStyleEdits() {
  await pushPref("devtools.debugger.features.stylesheets-in-debugger", true);
  const dbg = await initDebuggerWithAbsoluteURL(
    BASE_URL + "index.html",
    "style.css"
  );

  await selectSource(dbg, "style.css");

  const currentColor = "powderblue";
  info("Change the value of the backgroud color property in the editor");
  await editSelectedSourceContent(dbg, 1, 35, currentColor.length, "orange");

  // Wait for the color to change to the orange color
  await waitFor(async () => {
    const currentBgColor =
      await getCurrentPageStylePropertyValue("backgroundColor");
    return currentBgColor == "rgb(255, 165, 0)";
  });

  info("Switch to the inspector");
  const { inspector, view: ruleView } = await openRuleView();
  const { store } = await selectChangesView(inspector);

  await selectNode("body", inspector);

  info(
    "Find the property in the rule view containing changes made in the debugger"
  );
  const prop = getTextProperty(ruleView, 1, { "background-color": "orange" });

  info("Edit the property in the rule view");
  const onTrackChange = waitForDispatch(store, "TRACK_CHANGE");
  await setProperty(ruleView, prop, "red");
  await onTrackChange;

  info("Switch back to the debugger");
  await dbg.toolbox.selectTool("jsdebugger");
  await waitForSelectedSource(dbg, "style.css");

  info(
    "Check that the content of the stylesheet is updated based on the inspector changes"
  );
  is(getEditorContent(dbg), `body { background-color: red; }`);
});
