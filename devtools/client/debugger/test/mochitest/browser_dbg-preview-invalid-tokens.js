/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// Test hovering on an object, which will show a popup and on a
// simple value, which will show a tooltip.

"use strict";

add_task(async function () {
  const dbg = await initDebugger("doc-preview.html", "preview.js");

  await selectSource(dbg, "preview.js");

  // Test hovering tokens for which we shouldn't have a preview popup displayed
  invokeInTab("invalidTargets");
  await waitForPaused(dbg);
  // CodeMirror refreshes after inline previews are displayed, so wait until they're rendered.
  await waitForInlinePreviews(dbg);

  await assertNoPreviews(dbg, `"a"`, 69, 4);
  await assertNoPreviews(dbg, `false`, 70, 4);
  await assertNoPreviews(dbg, `undefined`, 71, 4);
  await assertNoPreviews(dbg, `null`, 72, 4);
  await assertNoPreviews(dbg, `42`, 73, 4);
  await assertNoPreviews(dbg, `const`, 74, 4);

  // checking inline preview widget
  // Move the cursor to the top left corner to have a clean state
  resetCursorPositionToTopLeftCorner(dbg);

  // Wait for all the updates to the document to complete to make all
  // token elements have been rendered
  await waitForDocumentLoadComplete(dbg);
  const inlinePreviewEl = findElement(dbg, "inlinePreviewsOnLine", 74);
  is(inlinePreviewEl.innerText, `myVar:"foo"`, "got expected inline preview");

  // Hover over the inline preview element
  hoverToken(inlinePreviewEl);
  await assertNoPreviewPopup(
    dbg,
    "No popup was displayed over the inline preview"
  );

  await resume(dbg);

  info("Test hovering element not in a line");
  await getDebuggerSplitConsole(dbg);
  const { hud } = dbg.toolbox.getPanel("webconsole");
  evaluateExpressionInConsole(
    hud,
    `
      a = 1;
      debugger;
      b = 2;`
  );
  await waitForPaused(dbg);
  await dbg.toolbox.toggleSplitConsole();

  resetCursorPositionToTopLeftCorner(dbg);

  // We don't want to use hoverToken, as it synthesize the event at the center of the element,
  // which wouldn't reproduce the original issue we want to check
  EventUtils.synthesizeMouse(
    findElement(dbg, "CodeMirrorLines"),
    0,
    0,
    {
      type: "mousemove",
    },
    dbg.win
  );
  await assertNoPreviewPopup(
    dbg,
    "No popup was displayed over the content container element"
  );

  // Resume
  await resume(dbg);
  await selectSource(dbg, "preview.js");
});

async function assertNoPreviews(dbg, expression, line, column) {
  // Move the cursor to the top left corner to have a clean state
  resetCursorPositionToTopLeftCorner(dbg);

  // Wait for all the updates to the document to complete to make all
  // token elements have been rendered
  await waitForDocumentLoadComplete(dbg);

  const tokenElement = await getTokenFromPosition(dbg, { line, column });
  is(
    tokenElement.textContent,
    expression,
    `The token at ${line} and ${column} has the expected content`
  );

  hoverToken(tokenElement);

  await assertNoPreviewPopup(
    dbg,
    `No popup was displayed when hovering "${expression}"`
  );
}

/**
 * Give the debugger a chance to display a preview popup, then assert that none
 * was displayed.
 *
 * @param {DebuggerPanel} dbg
 * @param {string} message: The assertion message
 */
async function assertNoPreviewPopup(dbg, message) {
  await wait(500);
  is(findElement(dbg, "previewPopup"), null, message);
}

function resetCursorPositionToTopLeftCorner(dbg) {
  EventUtils.synthesizeMouse(
    findElement(dbg, "codeMirror"),
    0,
    0,
    {
      type: "mousemove",
    },
    dbg.win
  );
}
