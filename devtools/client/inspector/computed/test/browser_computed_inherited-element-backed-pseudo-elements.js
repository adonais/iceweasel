/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Check that inherited element backed pseudo element declarations (e.g. ::details-content)
// are properly displayed

const TEST_URI = `
  <style>
    details {
      color: gold;
    }
    details::details-content {
      color: dodgerblue;
    }
    details summary {
      color: violet;
    }

    details#nested {
      color: cyan;
    }
    details#nested summary {
      color: hotpink;
    }
    details#nested::details-content {
      color: rgb(10, 20, 30);
    }

    select {
      appearance: base-select;
      color: teal;
    }

    ::picker(select) {
      color: tomato;
    }

    option {
      color: rgb(255, 215, 0);
    }
  </style>
  <details open>
    <summary>
      Top-level summary
      <details id=nested open>
        <summary>nested summary</summary>
        <p id=matches>in nested details</p>
      </details>
    </summary>
  </details>
  <select>
    <option>Option</option>
  </select>`;

add_task(async function () {
  await pushPref("dom.select.customizable_select.enabled", true);
  await addTab("data:text/html;charset=utf-8," + encodeURIComponent(TEST_URI));
  const { inspector, view } = await openComputedView();

  info("Checking inherited declaration from ::details-content");
  await selectNode("p#matches", inspector);

  info(`Checking the "color" property for "p#matches"`);
  is(
    getComputedViewPropertyView(view, "color").valueNode.textContent,
    "rgb(10, 20, 30)",
    `Got expected computed value for color on "p#matches"`
  );

  info(`Checking matched selectors for the "color" property for "p#matches"`);
  let container = await getComputedViewMatchedRules(view, "color");
  Assert.deepEqual(
    getMatchedSelectors(container),
    [
      ["details#nested::details-content", "rgb(10, 20, 30)"],
      ["details::details-content", "dodgerblue"],
      ["details#nested", "cyan"],
      ["details", "gold"],
      ["details summary", "violet"],
      [":root", "canvastext"],
    ],
    "Got the expected matched selectors, including ::details-content ones"
  );

  info("Checking inherited declaration from ::picker");
  // The `color` property was already expanded, so the computed view will automatically
  // fetch the matched selectors for the new selected element. Wait for those to be
  // retrieved before we assert the content.
  const onMatchedRulesRefreshed = view.inspector.once(
    "computed-view-property-expanded"
  );
  await selectNode("option", inspector);
  await onMatchedRulesRefreshed;
  info(`Checking the "color" property for "option"`);
  is(
    getComputedViewPropertyView(view, "color").valueNode.textContent,
    "rgb(255, 215, 0)",
    `Got expected computed value for color on "option"`
  );

  info(`Checking matched selectors for the "color" property for "option"`);
  container = await getComputedViewMatchedRules(view, "color");
  Assert.deepEqual(
    getMatchedSelectors(container),
    [
      ["option", "rgb(255, 215, 0)"],
      ["::picker(select)", "tomato"],
      ["select:not(:-moz-select-list-box)::picker(select)", "inherit"],
      ["select", "teal"],
      ["select", "-moz-comboboxtext"],
      [":root", "canvastext"],
    ],
    "Got the expected matched selectors, including ::picker ones"
  );
});

function getMatchedSelectors(container) {
  return [...container.querySelectorAll("p")].map(matchEl =>
    [...matchEl.querySelectorAll("div")].map(el => el.textContent)
  );
}
