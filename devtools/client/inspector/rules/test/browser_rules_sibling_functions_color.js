/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test that the rule view properly handles sibling-count() and sibling-index() functions
// in colors.

const TEST_URI = `
  <style>
    .fruits li {
      --r: 200;
      color: rgb(var(--r) calc(sibling-count() * 30) calc((sibling-index() / sibling-count()) * 255));

      &:first-of-type {
        --r: 0;
      }
      &:last-of-type {
        --r: 50;
      }

      &::after {
        content: "-";
        background-color: rgb(var(--r) calc(sibling-count() * 30) calc((sibling-index() / sibling-count()) * 255));
      }
    }
  </style>
  <h1><code>sibling-count()</code> & <code>sibling-index()</code></h1>
  <ol class=fruits>
    <li>Apricot</li>
    <li>Banana</li>
    <li>Cantaloupe</li>
    <li>Dragon Fruit</li>
  </ol>`;

add_task(async function () {
  await pushPref("layout.css.tree-counting-functions.enabled", true);
  await addTab(
    "https://example.com/document-builder.sjs?html=" +
      encodeURIComponent(TEST_URI)
  );
  const { inspector, view } = await openRuleView();

  await checkSwatchColor({
    inspector,
    view,
    selector: ".fruits li:nth-of-type(1)",
    expectedColor: "rgb(0, 120, 64)",
  });
  await checkSwatchColor({
    inspector,
    view,
    selector: ".fruits li:nth-of-type(2)",
    expectedColor: "rgb(200, 120, 128)",
  });
  await checkSwatchColor({
    inspector,
    view,
    selector: ".fruits li:nth-of-type(3)",
    expectedColor: "rgb(200, 120, 191)",
  });
  await checkSwatchColor({
    inspector,
    view,
    selector: ".fruits li:nth-of-type(4)",
    expectedColor: "rgb(50, 120, 255)",
  });
});

async function checkSwatchColor({ inspector, view, selector, expectedColor }) {
  const elementNodeFront = await getNodeFront(selector, inspector);
  await selectNode(elementNodeFront, inspector);

  is(
    getSwatchColorForRuleAndProperty(view, ".fruits li", "color"),
    expectedColor,
    `Expected color in swatch for color declaration of ".fruits li" rule for "${selector}" element`
  );

  const computedContentColor = await SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [selector],
    slctr => {
      return content.getComputedStyle(content.document.querySelector(slctr))
        .color;
    }
  );
  is(
    computedContentColor,
    expectedColor,
    `Swatch color does match "${selector}" element color`
  );

  info(
    "Check that we get the expected color for rules in pseudo elements section"
  );
  is(
    getSwatchColorForRuleAndProperty(view, "&::after", "background-color"),
    expectedColor,
    `Expected color in swatch for color declaration of "&::after" rule for "${selector}" element`
  );

  info(
    "Check that we get the expected color when selecting pseudo element in the markup view"
  );
  is(
    getSwatchColorForRuleAndProperty(view, "&::after", "background-color"),
    expectedColor,
    `Expected color in swatch for color declaration of "&::after" rule for "${selector}" element`
  );
  const elementChildren = await inspector.walker.children(elementNodeFront);
  const afterPseudoElementNodeFront = elementChildren.nodes.at(-1);
  await selectNode(afterPseudoElementNodeFront, inspector);
  // sanity check
  is(
    inspector.selection.nodeFront.displayName,
    "::after",
    "We selected the ::after pseudo element"
  );
  is(
    getSwatchColorForRuleAndProperty(view, "&::after", "background-color"),
    expectedColor,
    `Expected color in swatch for color declaration of "&::after" rule for after pseudo element`
  );
}

function getSwatchColorForRuleAndProperty(view, ruleSelector, property) {
  const { valueSpan } = getRuleViewProperty(view, ruleSelector, property);
  const colorSwatchEl = valueSpan.querySelector(".inspector-colorswatch");
  return colorSwatchEl.documentGlobal.getComputedStyle(colorSwatchEl)
    .backgroundColor;
}
