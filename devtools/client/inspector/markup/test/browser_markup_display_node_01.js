/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that markup display node shows for grid, flex, and lanes containers.

const TEST_URI = `
  <style type="text/css">
    #grid {
      display: grid;
    }
    #subgrid {
      display: grid;
      grid: subgrid / subgrid;
    }
    #inline-grid {
      display: inline-grid;
    }
    #grid-lanes {
      display: grid-lanes; 
    }
    #inline-grid-lanes {
      display: inline-grid-lanes;
    }
    #flex {
      display: flex;
    }
    #block {
      display: block;
    }
  </style>
  <div id="grid">
    <div id="subgrid"></div>
  </div>
  <div id="inline-grid">Inline Grid</div>
  <div id="grid-lanes">Grid Lanes</div>
  <div id="inline-grid-lanes">Inline Grid Lanes</div>
  <div id="flex">Flex</div>
  <div id="block">Block</div>
  <span>HELLO WORLD</span>
`;

add_task(async function () {
  await pushPref("layout.css.display-grid-lanes.enabled", true);
  const { inspector } = await openInspectorForURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(TEST_URI)
  );

  info("Check the display node is shown and the value of #grid.");
  await selectNode("#grid", inspector);
  const gridContainer = await getContainerForSelector("#grid", inspector);
  const gridDisplayNode = gridContainer.elt.querySelector(
    ".inspector-badge.interactive[data-display]"
  );
  ok(gridDisplayNode, "#grid display node is shown.");
  is(
    gridDisplayNode.textContent,
    "grid",
    "Got the correct display type for #grid."
  );

  info("Check the display node is shown and the value of #subgrid.");
  await selectNode("#subgrid", inspector);
  const subgridContainer = await getContainerForSelector("#subgrid", inspector);
  const subgridDisplayNode = subgridContainer.elt.querySelector(
    ".inspector-badge[data-display]"
  );
  ok(subgridDisplayNode, "#subgrid display node is shown");
  is(
    subgridDisplayNode.textContent,
    "subgrid",
    "Got the correct display type for #subgrid"
  );

  info("Check the display node is shown and the value of #inline-grid.");
  await selectNode("#inline-grid", inspector);
  const inlineGridContainer = await getContainerForSelector(
    "#inline-grid",
    inspector
  );
  const inlineGridDisplayNode = inlineGridContainer.elt.querySelector(
    ".inspector-badge.interactive[data-display]"
  );
  ok(inlineGridDisplayNode, "#inline-grid display node is shown.");
  is(
    inlineGridDisplayNode.textContent,
    "inline-grid",
    "Got the correct display type for #inline-grid."
  );

  info("Check the display node is shown and the value of #grid-lanes.");
  await selectNode("#grid-lanes", inspector);
  const gridLanesContainer = await getContainerForSelector(
    "#grid-lanes",
    inspector
  );
  const gridLanesDisplayNode = gridLanesContainer.elt.querySelector(
    ".inspector-badge.interactive[data-display]"
  );
  ok(gridLanesDisplayNode, "#grid-lanes display node is shown.");
  is(
    gridLanesDisplayNode.textContent,
    "grid-lanes",
    "Got the correct display type for #grid-lanes."
  );

  info("Check the display node is shown and the value of #inline-grid-lanes.");
  await selectNode("#inline-grid-lanes", inspector);
  const inlineGridLanesContainer = await getContainerForSelector(
    "#inline-grid-lanes",
    inspector
  );
  const inlineGridLanesDisplayNode = inlineGridLanesContainer.elt.querySelector(
    ".inspector-badge.interactive[data-display]"
  );
  ok(inlineGridLanesDisplayNode, "#inline-grid-lanes display node is shown.");
  is(
    inlineGridLanesDisplayNode.textContent,
    "inline-grid-lanes",
    "Got the correct display type for #inline-grid-lanes."
  );

  info("Check the display node is shown and the value of #flex.");
  await selectNode("#flex", inspector);
  const flexContainer = await getContainerForSelector("#flex", inspector);
  const flexDisplayNode = flexContainer.elt.querySelector(
    ".inspector-badge.interactive[data-display]"
  );
  ok(flexDisplayNode, "#flex display node is shown.");
  is(
    flexDisplayNode.textContent,
    "flex",
    "Got the correct display type for #flex"
  );

  info("Check the display node is hidden for #block.");
  await selectNode("#block", inspector);
  const blockContainer = await getContainerForSelector("#block", inspector);
  const blockDisplayNode = blockContainer.elt.querySelector(
    ".inspector-badge.interactive[data-display]"
  );
  ok(!blockDisplayNode, "#block display node is hidden.");

  info("Check the display node is hidden for span.");
  await selectNode("span", inspector);
  const spanContainer = await getContainerForSelector("span", inspector);
  const spanDisplayNode = spanContainer.elt.querySelector(
    ".inspector-badge.interactive[data-display]"
  );
  ok(!spanDisplayNode, "span display node is hidden.");
});
