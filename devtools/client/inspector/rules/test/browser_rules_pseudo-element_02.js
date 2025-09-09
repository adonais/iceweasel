/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that pseudoelements are displayed correctly in the markup view.

const TEST_URI = URL_ROOT + "doc_pseudoelement.html";

add_task(async function () {
  await addTab(TEST_URI);
  const { inspector, view } = await openRuleView();

  const node = await getNodeFront("#topleft", inspector);
  const children = await inspector.markup.walker.children(node);

  is(children.nodes.length, 3, "Element has correct number of children");

  info("Check rules on #topleft::before node");
  const beforeElement = children.nodes[0];
  is(
    beforeElement.tagName,
    "_moz_generated_content_before",
    "tag name is correct"
  );
  await selectNode(beforeElement, inspector);
  checkRuleViewContent(view, [
    {
      selector: `.topleft::before`,
      ancestorRulesData: null,
      declarations: [
        { name: "top", value: "0" },
        { name: "left", value: "0" },
      ],
    },
    {
      selector: `.box::before`,
      ancestorRulesData: null,
      declarations: [
        { name: "background", value: "green" },
        { name: "content", value: `" "` },
        { name: "position", value: `absolute` },
        { name: "height", value: `32px` },
        { name: "width", value: `32px` },
      ],
    },
    {
      header: "Inherited from div#topleft",
    },
    {
      selector: `*`,
      ancestorRulesData: null,
      declarations: [{ name: "cursor", value: "default" }],
    },
    {
      header: "Inherited from body",
    },
    {
      selector: `body`,
      ancestorRulesData: null,
      declarations: [{ name: "color", value: "#333" }],
    },
  ]);

  info("Check rules on #topleft::after node");
  const afterElement = children.nodes[children.nodes.length - 1];
  is(
    afterElement.tagName,
    "_moz_generated_content_after",
    "tag name is correct"
  );
  await selectNode(afterElement, inspector);
  checkRuleViewContent(view, [
    {
      selector: `.box::after`,
      ancestorRulesData: null,
      declarations: [
        { name: "background", value: `red` },
        { name: "content", value: `" "` },
        { name: "position", value: `absolute` },
        { name: "border-radius", value: `50%` },
        { name: "height", value: `32px` },
        { name: "width", value: `32px` },
        { name: "top", value: `50%` },
        { name: "left", value: `50%` },
        { name: "margin-top", value: `-16px` },
        { name: "margin-left", value: `-16px` },
      ],
    },
    {
      header: "Inherited from div#topleft",
    },
    {
      selector: `*`,
      ancestorRulesData: null,
      declarations: [{ name: "cursor", value: "default" }],
    },
    {
      header: "Inherited from body",
    },
    {
      selector: `body`,
      ancestorRulesData: null,
      declarations: [{ name: "color", value: "#333" }],
    },
  ]);

  info("Check #list children");
  const listNode = await getNodeFront("#list", inspector);
  const listChildren = await inspector.markup.walker.children(listNode);
  const listAfterNode = listChildren.nodes.at(-1);
  is(
    listAfterNode.tagName,
    "_moz_generated_content_after",
    "tag name is correct for #list::after"
  );
  const listAfterChildren =
    await inspector.markup.walker.children(listAfterNode);
  is(
    listAfterChildren.nodes.length,
    1,
    "ol::after has the expected number of children"
  );
  const listAfterMarkerNode = listAfterChildren.nodes[0];
  is(
    listAfterMarkerNode.tagName,
    "_moz_generated_content_marker",
    "tag name is correct for #list::after::marker"
  );
  info("Check rules on #list-item::marker node");
  await selectNode(listAfterMarkerNode, inspector);
  checkRuleViewContent(view, [
    {
      selector: `#list::after::marker`,
      ancestorRulesData: null,
      declarations: [
        { name: "content", value: `"+"` },
        { name: "color", value: `tomato` },
      ],
    },
    {
      header: "Inherited from ol#list",
    },
    {
      selector: `*`,
      ancestorRulesData: null,
      declarations: [{ name: "cursor", value: "default" }],
    },
    {
      header: "Inherited from body",
    },
    {
      selector: `body`,
      ancestorRulesData: null,
      declarations: [{ name: "color", value: "#333", overridden: true }],
    },
  ]);

  info("Check #list-item children");
  const listItemNode = await getNodeFront("#list-item", inspector);
  const listItemChildren = await inspector.markup.walker.children(listItemNode);

  is(listItemChildren.nodes.length, 4, "<li> has correct number of children");

  info("Check rules on #list-item::marker node");
  const markerElement = listItemChildren.nodes[0];
  is(
    markerElement.tagName,
    "_moz_generated_content_marker",
    "tag name is correct"
  );
  await selectNode(markerElement, inspector);
  checkRuleViewContent(view, [
    {
      selector: `#list-item::marker`,
      ancestorRulesData: null,
      declarations: [{ name: "color", value: `purple` }],
    },
    {
      header: "Inherited from li#list-item",
    },
    {
      selector: `*`,
      ancestorRulesData: null,
      declarations: [{ name: "cursor", value: "default" }],
    },
    {
      header: "Inherited from body",
    },
    {
      selector: `body`,
      ancestorRulesData: null,
      declarations: [{ name: "color", value: "#333", overridden: true }],
    },
  ]);

  info("Check rules on #list-item::before node");
  const listBeforeElement = listItemChildren.nodes[1];
  is(
    listBeforeElement.tagName,
    "_moz_generated_content_before",
    "tag name is correct"
  );
  await selectNode(listBeforeElement, inspector);
  checkRuleViewContent(view, [
    {
      selector: `.box::before`,
      ancestorRulesData: null,
      declarations: [
        { name: "background", value: "green" },
        { name: "content", value: `" "` },
        { name: "position", value: `absolute` },
        { name: "height", value: `32px` },
        { name: "width", value: `32px` },
      ],
    },
    {
      header: "Inherited from li#list-item",
    },
    {
      selector: `*`,
      ancestorRulesData: null,
      declarations: [{ name: "cursor", value: "default" }],
    },
    {
      header: "Inherited from body",
    },
    {
      selector: `body`,
      ancestorRulesData: null,
      declarations: [{ name: "color", value: "#333" }],
    },
  ]);
});
