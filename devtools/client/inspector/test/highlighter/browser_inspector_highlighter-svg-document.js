/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Test that the highlighter is correctly displayed in SVG documents

const TEST_URI = `data:image/svg+xml,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <circle cx="50" cy="50" r="50"/>
  </svg>`;

add_task(async function () {
  // This is needed to reproduce the issue without the patch that fixed it.
  await pushPref("layout.accessiblecaret.enabled", false);
  await pushPref("layout.accessiblecaret.enabled_on_touch", false);

  const { inspector } = await openInspectorForURL(TEST_URI);

  const { waitForHighlighterTypeShown } = getHighlighterTestHelpers(inspector);

  info("Highlighting the <circle> node");
  const onHighlighterShown = waitForHighlighterTypeShown(
    inspector.highlighters.TYPES.BOXMODEL
  );

  await selectNode("circle", inspector, "test-highlight");
  await onHighlighterShown;

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
    const getInfoBarEl = r =>
      r.querySelector(
        ".highlighter-container.box-model .box-model-infobar-text"
      );
    const root = content.document
      .getConnectedShadowRoots()
      .find(r => getInfoBarEl(r));

    const inforBarEl = getInfoBarEl(root);
    const rect = inforBarEl.getBoundingClientRect();

    Assert.greater(rect.width, 0, "Highlighter should have a non-zero width");
    Assert.greater(rect.height, 0, "Highlighter should have a non-zero height");

    is(inforBarEl.checkVisibility(), true, "Highlighter element is visible");

    is(
      inforBarEl?.textContent,
      "circle100 × 100",
      `circle is properly displayed`
    );
  });
});
