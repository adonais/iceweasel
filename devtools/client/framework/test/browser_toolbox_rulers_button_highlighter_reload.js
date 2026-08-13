/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { TYPES: HIGHLIGHTER_TYPES } = ChromeUtils.importESModule(
  "resource://devtools/shared/highlighters.mjs"
);

const TEST_URL = `data:text/html;charset=utf8,rulers highlighters restored`;

// Test that the ruler highlighters are properly restored after a reload.
add_task(async function test() {
  await pushPref("devtools.command-button-rulers.enabled", true);
  const tab = await addTab(TEST_URL);
  const toolbox = await gDevTools.showToolboxForTab(tab, {
    toolId: "inspector",
  });

  let inspectorFront = await toolbox.target.getFront("inspector");

  info("Show the rulers");
  await clickRulersButton(toolbox, true);
  await waitForHighlighterState(inspectorFront, true);
  ok(
    (
      await inspectorFront.getHighlighterByType(HIGHLIGHTER_TYPES.RULERS)
    ).isShown(),
    "Rulers highlighter is shown"
  );
  ok(
    (
      await inspectorFront.getHighlighterByType(HIGHLIGHTER_TYPES.VIEWPORT_SIZE)
    ).isShown(),
    "Viewport Size highlighter is shown"
  );

  info("Reload the page");
  await reloadSelectedTab();
  inspectorFront = await toolbox.target.getFront("inspector");
  await waitForHighlighterState(inspectorFront, true);

  ok(
    (
      await inspectorFront.getHighlighterByType(HIGHLIGHTER_TYPES.RULERS)
    ).isShown(),
    "Rulers highlighter is shown"
  );
  ok(
    (
      await inspectorFront.getHighlighterByType(HIGHLIGHTER_TYPES.VIEWPORT_SIZE)
    ).isShown(),
    "Viewport Size highlighter is shown"
  );

  info("Turn off the rulers");
  await clickRulersButton(toolbox, false);
  await waitForHighlighterState(inspectorFront, false);

  ok(
    !(
      await inspectorFront.getHighlighterByType(HIGHLIGHTER_TYPES.RULERS)
    ).isShown(),
    "Rulers highlighter is not shown anymore"
  );
  ok(
    !(
      await inspectorFront.getHighlighterByType(HIGHLIGHTER_TYPES.VIEWPORT_SIZE)
    ).isShown(),
    "Viewport Size highlighter is not shown anymore"
  );

  await toolbox.destroy();
});

function getRulersButton(toolbox) {
  return toolbox.doc.querySelector("#command-button-rulers");
}

async function clickRulersButton(toolbox, expectedState) {
  const button = getRulersButton(toolbox);
  button.click();
  await waitFor(() => {
    // The button DOM element is re-created by React on updates
    // and needs to be updated on each check
    const btn = getRulersButton(toolbox);
    return btn && isButtonActive(btn) === expectedState;
  });
}

function isButtonActive(button) {
  return button.classList.contains("checked");
}

async function waitForHighlighterState(inspectorFront, shouldBeShown) {
  await waitFor(async () => {
    const rulersHighlighter = await inspectorFront.getHighlighterByType(
      HIGHLIGHTER_TYPES.RULERS
    );
    const viewportSizeHighlighter = await inspectorFront.getHighlighterByType(
      HIGHLIGHTER_TYPES.VIEWPORT_SIZE
    );

    const rulersHighlighterVisible = rulersHighlighter?.isShown();
    const viewportSizeHighlighterVisible = viewportSizeHighlighter?.isShown();

    return shouldBeShown
      ? rulersHighlighterVisible && viewportSizeHighlighterVisible
      : !rulersHighlighterVisible && !viewportSizeHighlighterVisible;
  });
}
