/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL = URL_ROOT + "doc_anchor_names.html";

add_task(async function () {
  const COMMON_ITEMS = [
    "auto",
    "none",
    ...InspectorUtils.getCSSWideKeywords(),
  ].sort();

  await addTab(TEST_URL);
  const { inspector, view } = await openRuleView();

  info("Select absolutely positioned element");
  await selectNode("#abs-pos", inspector);
  await autocompletePositionAnchor({
    inspector,
    view,
    ruleIndex: 1,
    expectedItems: [
      "--anchor-alias",
      "--another-anchor",
      "--my-anchor",
      ...COMMON_ITEMS,
    ],
  });

  info("Select non absolutely positioned element");
  await selectNode("#not-abs-pos", inspector);
  await autocompletePositionAnchor({
    inspector,
    view,
    ruleIndex: 1,
    expectedItems: COMMON_ITEMS,
  });

  info("Select pseudo element");
  const nodeFrontWithPseudo = await getNodeFront("#with-pseudo", inspector);
  const nodeFrontWithPseudoChildren =
    await inspector.markup.walker.children(nodeFrontWithPseudo);
  const beforeElement = nodeFrontWithPseudoChildren.nodes[0];
  is(beforeElement.displayName, "::before", "display name is correct");
  await selectNode(beforeElement, inspector);
  await autocompletePositionAnchor({
    inspector,
    view,
    ruleIndex: 0,
    expectedItems: [
      "--anchor-alias",
      "--another-anchor",
      // we're getting the abs-pos anchor since #with-pseudo is placed after #abs-pos-anchor
      "--my-abs-pos-anchor",
      "--my-anchor",
      ...COMMON_ITEMS,
    ],
  });

  info("Select shadow dom element");
  const nodeFrontInShadowDom = await getNodeFrontInShadowDom(
    ".shadow-abs-pos",
    "#host",
    inspector
  );
  await selectNode(nodeFrontInShadowDom, inspector);
  await autocompletePositionAnchor({
    inspector,
    view,
    ruleIndex: 1,
    expectedItems: [
      "--my-shadow-anchor",
      "--shadow-anchor-alias",
      ...COMMON_ITEMS,
    ],
  });
});

async function autocompletePositionAnchor({
  inspector,
  view,
  ruleIndex,
  expectedItems,
}) {
  const positionAnchorProp = getTextProperty(view, ruleIndex, {
    "position-anchor": "initial",
  });

  info("Focusing the value of the position-anchor rule");
  const anchorNamesUpdated = inspector.once("anchor-names-updated");
  const editor = await focusEditableField(
    view,
    positionAnchorProp.editor.valueSpan
  );
  await anchorNamesUpdated;

  const onPopupOpened = once(editor.popup, "popup-opened");
  EventUtils.synthesizeKey("VK_DELETE", {}, view.styleWindow);
  await onPopupOpened;

  ok(editor.popup.isOpen, "Popup is open");
  const popupItems = editor.popup.getItems();
  Assert.deepEqual(
    popupItems.map(item => item.label),
    expectedItems,
    "Popup has expected items"
  );

  info("Close the popup");
  const onPopupClosed = editor.popup.once("popup-closed");
  EventUtils.synthesizeKey("KEY_Escape", {}, view.styleWindow);
  await onPopupClosed;

  info("Hit Escape to cancel the edit");
  const onRuleViewChanged = view.once("ruleview-changed");
  EventUtils.synthesizeKey("KEY_Escape", {}, view.styleWindow);
  await onRuleViewChanged;
}
