/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test for CSS explainers in the Rules View.

const TEST_URI = `data:text/html,<meta charset=utf8>
  <style>
    :root {
      font-size: 16px;
    }

    div {
      font-size: 24px;
      height: calc(2 * min(1rem, 100px));
    }

    div::after {
      line-height: calc(1em + 1px);
    }

    ol {
      font-size: 36px;
    }

    li {
      line-height: 20px;
      rotate: calc(sibling-index() * 2deg);
      translate: calc(sibling-count() * 1em + 1lh);
    }

    li::after {
      content: "-";
      outline: calc((sibling-count() + sibling-index()) * 1px) solid tomato;
    }
  </style>
  <div>CSS explainers</div>
  <ol>
    <li>First</li>
    <li>Second</li>
    <li>Third</li>
  </ol>`;

add_task(async function () {
  await pushPref("devtools.inspector.css-explainers", true);
  await pushPref("layout.css.tree-counting-functions.enabled", true);

  await addTab(TEST_URI);
  const { inspector, view } = await openRuleView();

  await selectNode("div", inspector);
  expandPseudoElementContainer(view);

  await assertCssExplainersTooltip({
    view,
    selector: "div",
    propertyName: "height",
    functionIndex: 0,
    expected: {
      functionText: "calc(2 * min(1rem, 100px))",
      tooltipText: [
        "calc(2 * min(1rem, 100px))",
        "calc(2 * min(16px, 100px))",
        "calc(2 * 16px)",
        "32px",
      ].join("\n"),
    },
  });

  await assertCssExplainersTooltip({
    view,
    selector: "div",
    propertyName: "height",
    functionIndex: 1,
    expected: {
      functionText: "min(1rem, 100px)",
      tooltipText: ["min(1rem, 100px)", "min(16px, 100px)", "16px"].join("\n"),
    },
  });

  await assertCssExplainersTooltip({
    view,
    selector: "div::after",
    propertyName: "line-height",
    functionIndex: 0,
    expected: {
      functionText: "calc(1em + 1px)",
      tooltipText: ["calc(1em + 1px)", "calc(24px + 1px)", "25px"].join("\n"),
    },
  });

  const secondLiNodeFront = await getNodeFront("li:nth-of-type(2)", inspector);
  await selectNode(secondLiNodeFront, inspector);
  await assertCssExplainersTooltip({
    view,
    selector: "li",
    propertyName: "rotate",
    functionIndex: 0,
    expected: {
      functionText: "calc(sibling-index() * 2deg)",
      tooltipText: [
        "calc(sibling-index() * 2deg)",
        "calc(2 * 2deg)",
        "4deg",
      ].join("\n"),
    },
  });

  await assertCssExplainersTooltip({
    view,
    selector: "li",
    propertyName: "rotate",
    functionIndex: 1,
    expected: {
      functionText: "sibling-index()",
      tooltipText: ["sibling-index()", "2"].join("\n"),
    },
  });

  await assertCssExplainersTooltip({
    view,
    selector: "li",
    propertyName: "translate",
    functionIndex: 0,
    expected: {
      functionText: "calc(sibling-count() * 1em + 1lh)",
      tooltipText: [
        "calc(sibling-count() * 1em + 1lh)",
        "calc((sibling-count() * 1em) + 1lh)",
        "calc((3 * 36px) + 20px)",
        "calc(108px + 20px)",
        "128px",
      ].join("\n"),
    },
  });

  await assertCssExplainersTooltip({
    view,
    selector: "li::after",
    propertyName: "outline",
    functionIndex: 0,
    expected: {
      functionText: "calc((sibling-count() + sibling-index()) * 1px)",
      tooltipText: [
        "calc((sibling-count() + sibling-index()) * 1px)",
        "calc((3 + 2) * 1px)",
        "calc(5 * 1px)",
        "5px",
      ].join("\n"),
    },
  });

  info("Select the li::after element in the markup view");
  const secondLiNodeFrontChildren =
    await inspector.markup.walker.children(secondLiNodeFront);
  const secondLiAfterElementNodeFront = secondLiNodeFrontChildren.nodes.at(-1);
  is(
    secondLiAfterElementNodeFront.displayName,
    "::after",
    "Got expected ::after pseudo element"
  );
  await selectNode(secondLiAfterElementNodeFront, inspector);
  await assertCssExplainersTooltip({
    view,
    selector: "li::after",
    propertyName: "outline",
    functionIndex: 0,
    expected: {
      functionText: "calc((sibling-count() + sibling-index()) * 1px)",
      tooltipText: [
        "calc((sibling-count() + sibling-index()) * 1px)",
        "calc((3 + 2) * 1px)",
        "calc(5 * 1px)",
        "5px",
      ].join("\n"),
    },
  });
});

async function assertCssExplainersTooltip({
  view,
  propertyName,
  selector,
  functionIndex,
  expected,
}) {
  const { valueSpan } = getRuleViewProperty(view, selector, propertyName);
  const functionNameEl =
    valueSpan.querySelectorAll(".css-explainers-function-name")[
      functionIndex
    ] || null;

  is(
    functionNameEl
      .closest("[data-function-expression]")
      .getAttribute("data-function-expression"),
    expected.functionText,
    `Got expected data-function-expression attribute for function at index ${functionIndex} in ${propertyName} declaration`
  );

  // Ensure that the element can be targetted from EventUtils.
  functionNameEl.scrollIntoView();

  const tooltip = view.tooltips.getTooltip("interactiveTooltip");
  const onTooltipReady = tooltip.once("shown");
  EventUtils.synthesizeMouseAtCenter(
    functionNameEl,
    { type: "mousemove" },
    functionNameEl.ownerDocument.defaultView
  );
  await onTooltipReady;

  is(
    tooltip.panel.innerText,
    expected.tooltipText,
    `Tooltip has expected text for function at index ${functionIndex} in ${propertyName} declaration`
  );

  info("Hide the tooltip");
  const onHidden = tooltip.once("hidden");
  // Move the mouse elsewhere to hide the tooltip
  EventUtils.synthesizeMouse(
    functionNameEl.ownerDocument.body,
    1,
    1,
    { type: "mousemove" },
    functionNameEl.ownerDocument.defaultView
  );
  await onHidden;
}
