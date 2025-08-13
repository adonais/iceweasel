/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// Test that we can debug ES Modules.

"use strict";

const httpServer = createTestHTTPServer();
httpServer.registerContentType("html", "text/html");

httpServer.registerPathHandler(`/index.html`, function (request, response) {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.write(
    `<html>
          <script type="module">
            import * as mod from "./module.mjs";
            window.inline = () => {
              console.log("inline");
            };
            window.onload = async () => {
              // Force the module to be loaded a bit late
              await new Promise(r => setTimeout(r, 1000));

              import("./late-module.mjs");
            }
          </script>
      </html>`
  );
});

httpServer.registerPathHandler("/module.mjs", function (request, response) {
  response.setHeader("Content-Type", "application/javascript");
  response.write(
    `export const bar = 24;
    window.regular = () => {
      console.log("regular");
    };
  `
  );
});

httpServer.registerPathHandler(
  "/late-module.mjs",
  function (request, response) {
    response.setHeader("Content-Type", "application/javascript");
    response.write(
      `export const late = "foo";
    window.late = () => {
      console.log("late");
    };
    console.log("late module loaded");
  `
    );
  }
);
const port = httpServer.identity.primaryPort;
const TEST_URL = `http://localhost:${port}/`;

add_task(async function () {
  const dbg = await initDebuggerWithAbsoluteURL(
    TEST_URL + "index.html",
    "index.html",
    "module.mjs",
    "late-module.mjs"
  );

  {
    info("Pausing in inlined ESM");
    const source = findSource(dbg, "index.html");
    await selectSource(dbg, source);
    await addBreakpoint(dbg, source, 5);

    const onResumed = SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
      content.wrappedJSObject.inline();
    });

    await waitForPaused(dbg);
    await assertPausedAtSourceAndLine(dbg, source.id, 5);
    assertTextContentOnLine(dbg, 5, `console.log("inline");`);

    await resume(dbg);
    await onResumed;
  }

  {
    info("Pausing in regular ESM");
    const source = findSource(dbg, "module.mjs");
    await selectSource(dbg, source);
    await addBreakpoint(dbg, source, 3);

    const onResumed = SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
      content.wrappedJSObject.regular();
    });

    await waitForPaused(dbg);
    await assertPausedAtSourceAndLine(dbg, source.id, 3);
    assertTextContentOnLine(dbg, 3, `console.log("regular");`);

    await resume(dbg);
    await onResumed;
  }

  {
    info("Pausing in late ESM (loaded lazily via async import()");
    const source = findSource(dbg, "late-module.mjs");
    await selectSource(dbg, source);
    await addBreakpoint(dbg, source, 3);

    const onResumed = SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
      content.wrappedJSObject.late();
    });

    await waitForPaused(dbg);
    await assertPausedAtSourceAndLine(dbg, source.id, 3);
    assertTextContentOnLine(dbg, 3, `console.log("late");`);

    await resume(dbg);
    await onResumed;
  }
});
