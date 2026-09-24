/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that the class panel can be toggled.

add_task(async function () {
  await addTab("data:text/html;charset=utf-8,<body class='class1 class2'>");
  const { inspector, view } = await openRuleView();

  info("Check that the toggle button exists");
  const button = inspector.panelDoc.querySelector("#class-panel-toggle");
  ok(button, "The class panel toggle button exists");
  is(view.classToggle, button, "The rule-view refers to the right element");

  info("Check that the panel exists and is hidden by default");
  const panel = inspector.panelDoc.querySelector("#ruleview-class-panel");
  ok(panel, "The class panel exists");
  is(view.classPanel, panel, "The rule-view refers to the right element");
  ok(panel.hasAttribute("hidden"), "The panel is hidden");
  is(
    button.getAttribute("aria-pressed"),
    "false",
    "The button is not pressed by default"
  );
  is(
    inspector.panelDoc.getElementById(button.getAttribute("aria-controls")),
    panel,
    "The class panel toggle button has valid aria-controls attribute"
  );

  info("Click on the button to show the panel");
  button.click();
  ok(!panel.hasAttribute("hidden"), "The panel is shown");
  is(button.getAttribute("aria-pressed"), "true", "The button is pressed");

  info("Click again to hide the panel");
  button.click();
  ok(panel.hasAttribute("hidden"), "The panel is hidden");
  is(button.getAttribute("aria-pressed"), "false", "The button is not pressed");

  info("Open the pseudo-class panel first, then the class panel");
  view.pseudoClassToggle.click();
  ok(
    !view.pseudoClassPanel.hasAttribute("hidden"),
    "The pseudo-class panel is shown"
  );
  button.click();
  ok(!panel.hasAttribute("hidden"), "The panel is shown");
  ok(
    view.pseudoClassPanel.hasAttribute("hidden"),
    "The pseudo-class panel is hidden"
  );

  info("Click again on the pseudo-class button");
  view.pseudoClassToggle.click();
  ok(panel.hasAttribute("hidden"), "The panel is hidden");
  ok(
    !view.pseudoClassPanel.hasAttribute("hidden"),
    "The pseudo-class panel is shown"
  );
});

add_task(async function () {
  await addTab(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html>
    <body>
    <style>div::after {content: "test";}</style>
    <!-- comment -->
    Some text
    <div></div>
    </body>
    </html>`);

  const { inspector, view } = await openRuleView();

  info("Open the class panel");
  view.classToggle.click();
  ok(!view.classPanel.hasAttribute("hidden"), "The class panel is shown");

  const panel = inspector.panelDoc.querySelector("#ruleview-class-panel");
  let addEl = panel.querySelector("input.add-class");
  ok(!!addEl, "The class add input exists");

  info("Selecting the DOCTYPE node");
  const { nodes } = await inspector.walker.children(inspector.walker.rootNode);
  const docTypeNode = nodes[0];
  await selectNode(docTypeNode, inspector);
  ok(addEl.disabled, "The class panel inputs are disabled for DOCTYPE");

  info("Select an element node so the inputs become enabled");
  await selectNode("div", inspector);
  ok(!addEl.disabled, "Inputs are enabled for div");

  info("Close the class panel");
  view.classToggle.click();
  ok(view.classPanel.hasAttribute("hidden"), "The class panel is closed");

  info("Select a non-element node while the panel is closed");
  await selectNode(docTypeNode, inspector);

  info("Reopen the class panel");
  view.classToggle.click();
  ok(!view.classPanel.hasAttribute("hidden"), "The class panel is shown");

  addEl = panel.querySelector("input.add-class");
  ok(addEl.disabled, "Inputs are disabled when the panel is opened on DOCTYPE");

  info("Selecting the document node");
  await selectNode(inspector.walker.rootNode, inspector);
  ok(addEl.disabled, "The class panel inputs are disabled the document node");

  info("Selecting the root node");
  await selectNode("html", inspector);
  ok(!addEl.disabled, "The class panel inputs are enabled for html");

  info("Selecting the comment node");
  const styleNode = await getNodeFront("style", inspector);
  const commentNode = await inspector.walker.nextSibling(styleNode);
  await selectNode(commentNode, inspector);
  ok(
    addEl.disabled,
    "The class panel inputs are disabled for the comment node"
  );

  info("Selecting the text node");
  const textNode = await inspector.walker.nextSibling(commentNode);
  await selectNode(textNode, inspector);
  ok(addEl.disabled, "The class panel inputs are disabled for the text node");

  info("Selecting the body node");
  await selectNode("body", inspector);
  ok(!addEl.disabled, "The class panel inputs are enabled for body");

  info("Selecting the ::after pseudo-element");
  const divNode = await getNodeFront("div", inspector);
  const pseudoElement = (await inspector.walker.children(divNode)).nodes[0];
  await selectNode(pseudoElement, inspector);
  ok(
    addEl.disabled,
    "The class panel inputs are disabled for the ::after pseudo-element"
  );

  info("Selecting the div node");
  await selectNode("div", inspector);
  ok(!addEl.disabled, "The class panel inputs are enabled for div");
});
