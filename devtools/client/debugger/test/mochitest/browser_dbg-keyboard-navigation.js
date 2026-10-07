/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// Tests that keyboard navigation into and out of debugger code editor

"use strict";

add_task(async function () {
  const dbg = await initDebugger("doc-scripts.html", "simple2.js");
  const doc = dbg.win.document;

  const focusableEditorElementSelector = ".cm-content";
  await selectSource(dbg, "simple2.js");

  const focusableEditorElement = await waitForElementWithSelector(
    dbg,
    focusableEditorElementSelector
  );

  // The code folding buttons are rendered from the syntax tree, which is parsed
  // incrementally, so until the document is fully loaded the gutter holds no
  // focusable button and shift+tab reaches the source header instead.
  await waitForDocumentLoadComplete(dbg);

  info("Focus on the editor");
  focusableEditorElement.focus();

  is(doc.activeElement, focusableEditorElement, "Editor is focused");

  info(
    "Press shift + tab to navigate out of the editor to the previous tab element"
  );
  pressKey(dbg, "ShiftTab");

  // A selector lookup would match the gutter's hidden spacer button.
  is(
    doc.activeElement.className,
    "cm6-dt-foldgutter__toggle-button",
    "The code folding toggle button in the gutter is focused"
  );

  info("Press tab to navigate back to the editor");
  pressKey(dbg, "Tab");

  is(
    findElementWithSelector(dbg, focusableEditorElementSelector),
    doc.activeElement,
    "Editor is focused again"
  );

  info("Press tab again to navigate out of the editor to the next tab element");
  pressKey(dbg, "Tab");

  is(
    findElementWithSelector(dbg, ".action.black-box"),
    doc.activeElement,
    "The ignore source button is focused"
  );
});
