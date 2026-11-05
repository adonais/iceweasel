/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that attributes can be deleted from the markup-view with the delete key
// when they are focused.

const HTML =
  '<body data-only="1"><div id="id" class="class" data-id="id"></div></body>';
const TEST_URL = "data:text/html;charset=utf-8," + encodeURIComponent(HTML);

// List of all the test cases. Each item is an object with the following props:
// - selector: the css selector of the node that should be selected
// - attribute: the name of the attribute that should be focused. Do not
//   specify an attribute that would make it impossible to find the node using
//   selector.
// Note that after each test case, undo is called.
const TEST_DATA = [
  {
    selector: "#id",
    attribute: "class",
    expectedFocus: "data-id",
  },
  {
    selector: "#id",
    attribute: "data-id",
    expectedFocus: "class",
  },
  {
    selector: "body",
    attribute: "data-only",
    expectedFocus: "tag",
  },
];

add_task(async function () {
  const { inspector } = await openInspectorForURL(TEST_URL);
  const { walker } = inspector;

  for (const { selector, attribute, expectedFocus } of TEST_DATA) {
    info("Get the container for node " + selector);
    const { editor } = await getContainerForSelector(selector, inspector);

    info("Focus attribute " + attribute);
    const attr = editor.attrElements.get(attribute).querySelector(".editable");
    attr.focus();

    info("Delete the attribute by pressing delete");
    const mutated = inspector.once("markupmutation");
    EventUtils.sendKey("delete", inspector.panelWin);
    await mutated;

    info("Check that the node is still here");
    let node = await walker.querySelector(walker.rootNode, selector);
    ok(node, "The node hasn't been deleted");

    info("Check that the attribute has been deleted");
    node = await walker.querySelector(
      walker.rootNode,
      selector + "[" + attribute + "]"
    );
    ok(!node, "The attribute does not exist anymore in the DOM");
    ok(
      !editor.attrElements.get(attribute),
      "The attribute has been removed from the container"
    );

    const expectedFocusedElement =
      expectedFocus === "tag"
        ? editor.tag
        : editor.attrElements.get(expectedFocus).querySelector(".editable");
    is(
      inspector.markup.doc.activeElement,
      expectedFocusedElement,
      "Focus moves to the expected element after attribute deletion"
    );

    info("Undo the change");
    await undoChange(inspector);
    node = await walker.querySelector(
      walker.rootNode,
      selector + "[" + attribute + "]"
    );
    ok(node, "The attribute is back in the DOM");
    ok(
      editor.attrElements.get(attribute),
      "The attribute is back on the container"
    );
  }
});
