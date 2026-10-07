/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

"use strict";

// Assert debugger's behavior when a given source has many related actors:
//  * Two <script> tag loading the same URL in the same document (same target).
//  * Another <script> tag loading the same URL, but from an iframe (distinct target).
//  * A worker loading the same URL (another distinct target).
// These script will have share the same "source object" as they have the same URL.

const httpServer = createTestHTTPServer();
httpServer.registerContentType("html", "text/html");
httpServer.registerContentType("js", "application/javascript");

httpServer.registerPathHandler(
  "/doc-sources-with-many-actors.html",
  (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.write(`<!DOCTYPE html><html><body>Test page</body></html>
  `);
  }
);

httpServer.registerPathHandler("/iframe.html", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.write(`<!DOCTYPE html><html><script src="script.js"></script><body>iframe</body></html>
  `);
});

let views = 1;
httpServer.registerPathHandler("/script.js", (request, response) => {
  response.setHeader("Content-Type", "application/javascript");

  // Avoid the request from being cached and should force a new request on each usage of it
  response.setHeader("Cache-Control", "no-store");

  // Each request made for this URL will provide a new content
  const content = "\n".repeat(views) + `console.log("#${views} script");`;
  response.write(content);
  views++;
});

const BASE_URL = `http://localhost:${httpServer.identity.primaryPort}/`;

add_task(async function () {
  info("Start test for relocation of breakpoint set in a function");
  const dbg = await initDebuggerWithAbsoluteURL(
    `${BASE_URL}doc-sources-with-many-actors.html`
  );

  info("Create the first script.js instance as a <script> tag");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const script = content.document.createElement("script");
    script.src = "script.js";
    content.document.body.append(script);
  });

  const source = await waitForSource(dbg, "script.js");
  let actors = dbg.selectors.getSourceActorsForSource(source.id);
  is(actors.length, 1, "There is only one source actor");

  await selectSource(dbg, source);
  is(
    getEditorContent(dbg),
    `\nconsole.log("#1 script");`,
    "The first script source content is correct"
  );

  await assertBreakableLines(dbg, 2, [2]);

  await addBreakpointViaGutter(dbg, 2);
  is(
    (await waitForAllElements(dbg, "columnBreakpoints")).length,
    3,
    "We have the one expected column breakpoint"
  );

  info("Create the second script.js instance as another <script> tag");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const script = content.document.createElement("script");
    script.src = "script.js";
    content.document.body.append(script);
  });
  await waitFor(
    () => dbg.selectors.getSourceActorsForSource(source.id).length == 2,
    "There is now two source actors"
  );
  actors = dbg.selectors.getSourceActorsForSource(source.id);

  // `selectSource` doesn't allow passing a precise source actor (nor any UI action),
  // so call the action manually
  await dbg.actions.selectLocation(
    createLocation({ source, sourceActor: actors[1] })
  );

  is(
    getEditorContent(dbg),
    `\n\nconsole.log("#2 script");`,
    "The first script source content is correct"
  );
  await assertBreakableLines(dbg, 3, [3]);

  await addBreakpointViaGutter(dbg, 3);
  is(
    (await waitForAllElements(dbg, "columnBreakpoints")).length,
    3,
    "We have the one expected column breakpoint"
  );

  info("Create a third script.js instance as a worker");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    content.worker1 = new content.Worker("script.js");
  });
  await waitFor(
    () => dbg.selectors.getSourceActorsForSource(source.id).length == 3,
    "There is now three source actors"
  );
  actors = dbg.selectors.getSourceActorsForSource(source.id);

  // `selectSource` doesn't allow passing a precise source actor (nor any UI action),
  // so call the action manually
  await dbg.actions.selectLocation(
    createLocation({ source, sourceActor: actors[2] })
  );

  is(
    getEditorContent(dbg),
    `\n\n\nconsole.log("#3 script");`,
    "The first script source content is correct"
  );

  await assertBreakableLines(dbg, 4, [4]);

  await addBreakpointViaGutter(dbg, 4);
  is(
    (await waitForAllElements(dbg, "columnBreakpoints")).length,
    3,
    "We have the one expected column breakpoint"
  );

  info("Create a last script.js instance via an <iframe>");
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], function () {
    const iframe = content.document.createElement("iframe");
    iframe.src = "iframe.html";
    content.document.body.append(iframe);
  });
  await waitFor(
    () => dbg.selectors.getSourceActorsForSource(source.id).length == 4,
    "There is now four source actors"
  );
  actors = dbg.selectors.getSourceActorsForSource(source.id);

  // `selectSource` doesn't allow passing a precise source actor (nor any UI action),
  // so call the action manually
  await dbg.actions.selectLocation(
    createLocation({ source, sourceActor: actors[3] })
  );

  is(
    getEditorContent(dbg),
    `\n\n\n\nconsole.log("#4 script");`,
    "The first script source content is correct"
  );

  await assertBreakableLines(dbg, 5, [5]);

  await addBreakpointViaGutter(dbg, 5);
  is(
    (await waitForAllElements(dbg, "columnBreakpoints")).length,
    3,
    "We have the one expected column breakpoint"
  );

  is(
    dbg.selectors.getSourceCount(),
    1,
    "Only one source object was created for all these duplicated instances"
  );
});
