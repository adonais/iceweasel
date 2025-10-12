/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Test that the highlighter is correctly displayed over a variety of elements

const TEST_URI = URL_ROOT + "doc_inspector_highlighter.html";

add_task(async function () {
  const { inspector, highlighterTestFront } =
    await openInspectorForURL(TEST_URI);
  const { waitForHighlighterTypeShown } = getHighlighterTestHelpers(inspector);

  info("Selecting the simple, non-transformed DIV");
  await selectAndHighlightNode("#simple-div", inspector);

  let isVisible = await highlighterTestFront.isHighlighting();
  ok(isVisible, "The highlighter is shown");
  ok(
    await highlighterTestFront.assertHighlightedNode("#simple-div"),
    "The highlighter's outline corresponds to the simple div"
  );
  await isNodeCorrectlyHighlighted(highlighterTestFront, "#simple-div");

  info("Selecting the rotated DIV");
  await selectAndHighlightNode("#rotated-div", inspector);

  isVisible = await highlighterTestFront.isHighlighting();
  ok(isVisible, "The highlighter is shown");
  info(
    "Check that the highlighter is displayed at the expected position for rotated div"
  );
  await isNodeCorrectlyHighlighted(highlighterTestFront, "#rotated-div");

  info("Selecting the zero width height DIV");
  await selectAndHighlightNode("#widthHeightZero-div", inspector);

  isVisible = await highlighterTestFront.isHighlighting();
  ok(isVisible, "The highlighter is shown");
  info(
    "Check that the highlighter is displayed at the expected position for a zero width height div"
  );
  await isNodeCorrectlyHighlighted(
    highlighterTestFront,
    "#widthHeightZero-div"
  );

  const ulNodeFront = await getNodeFront("ul", inspector);
  const { nodes: ulChildren } = await inspector.walker.children(ulNodeFront);
  const ulBeforeNodeFront = ulChildren[0];
  is(
    ulBeforeNodeFront.displayName,
    "_moz_generated_content_before",
    "Got expexected ul::before pseudo element"
  );

  info("Highlighting the ul::before node");
  let onHighlighterShown = waitForHighlighterTypeShown(
    inspector.highlighters.TYPES.BOXMODEL
  );

  await selectNode(ulBeforeNodeFront, inspector, "test-highlight");
  await onHighlighterShown;
  is(
    await getHighlighterInfobarText(),
    "ul#pseudo::before100 × 50",
    `::before is properly displayed`
  );

  const { nodes: ulBeforeChildren } =
    await inspector.walker.children(ulBeforeNodeFront);
  const ulBeforeMarkerNodeFront = ulBeforeChildren[0];
  is(
    ulBeforeMarkerNodeFront.displayName,
    "_moz_generated_content_marker",
    "Got expexected ul::before::marker pseudo element"
  );

  info("Highlighting the ul::before::marker node");
  onHighlighterShown = waitForHighlighterTypeShown(
    inspector.highlighters.TYPES.BOXMODEL
  );

  await selectNode(ulBeforeMarkerNodeFront, inspector, "test-highlight");
  await onHighlighterShown;
  ok(
    // We can't set dimensions on the ::marker, and since they will vary from platform to
    // platform we can't check the content properly. Just make sure the infobar starts with
    // the expected text
    (await getHighlighterInfobarText()).startsWith("ul#pseudo::before::marker"),
    `::before::marker is properly displayed (${await getHighlighterInfobarText()})`
  );
});

async function getHighlighterInfobarText() {
  return SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
    return content.document
      .getConnectedShadowRoots()
      .find(root =>
        root.querySelector(
          ".highlighter-container.box-model .box-model-infobar-text"
        )
      )?.textContent;
  });
}
