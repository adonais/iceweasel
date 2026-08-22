/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL = `data:text/html;charset=utf8,rulers highlighters restored`;

// Test that the ruler highlighters are properly restored after a reload.
add_task(async function test() {
  await pushPref("devtools.command-button-rulers.enabled", true);
  const tab = await addTab(TEST_URL);
  const toolbox = await gDevTools.showToolboxForTab(tab, {
    toolId: "inspector",
  });

  // Sanity check
  is(
    await isRulersHighlighterVisible(),
    false,
    "Rulers highlighter is not shown at first"
  );
  is(
    await isViewportSizeHighlighterVisible(),
    false,
    "ViewportSize highlighter is not shown at first"
  );

  info("Show the rulers");
  await clickRulersButton(toolbox, true);

  // ⚠️ We shouldn't use the inspectorFront to check for highlighter state, as it could
  // hinder the test. Only check for what's displayed in the content page
  await waitFor(async () => {
    if (
      (await isRulersHighlighterVisible()) &&
      (await isRulersHighlighterVisible())
    ) {
      return true;
    }
    return false;
  });

  is(await isRulersHighlighterVisible(), true, "Rulers highlighter is shown");
  is(
    await isViewportSizeHighlighterVisible(),
    true,
    "ViewportSize highlighter is shown"
  );

  info("Reload the page");
  await reloadSelectedTab();

  await waitFor(async () => {
    if (
      (await isRulersHighlighterVisible()) &&
      (await isRulersHighlighterVisible())
    ) {
      return true;
    }
    return false;
  });

  ok(true, "Rulers and ViewportSize highlighters are still shown after reload");

  info("Turn off the rulers");
  await clickRulersButton(toolbox, false);

  await waitFor(async () => {
    if (
      (await isRulersHighlighterVisible()) ||
      (await isRulersHighlighterVisible())
    ) {
      return false;
    }
    return true;
  });

  ok(
    true,
    "Rulers and ViewportSize highlighter are not shown anymore after disabling them"
  );

  await toolbox.destroy();

  // Sanity check
  is(
    await isRulersHighlighterVisible(),
    false,
    "Rulers highlighter is not shown anymore after toolbox is destroyed"
  );
  is(
    await isViewportSizeHighlighterVisible(),
    false,
    "ViewportSize highlighter is not shown anymore after toolbox is destroyed"
  );
});

add_task(async function testToolboxDestroy() {
  await pushPref("devtools.command-button-rulers.enabled", true);
  const tab = await addTab(TEST_URL);
  const toolbox = await gDevTools.showToolboxForTab(tab, {
    toolId: "inspector",
  });

  // Sanity check
  is(
    await isRulersHighlighterVisible(),
    false,
    "Rulers highlighter is not shown at first"
  );
  is(
    await isViewportSizeHighlighterVisible(),
    false,
    "ViewportSize highlighter is not shown at first"
  );

  info("Show the rulers");
  await clickRulersButton(toolbox, true);

  // ⚠️ We shouldn't use the inspectorFront to check for highlighter state, as it could
  // hinder the test. Only check for what's displayed in the content page
  await waitFor(async () => {
    if (
      (await isRulersHighlighterVisible()) &&
      (await isRulersHighlighterVisible())
    ) {
      return true;
    }
    return false;
  });

  is(await isRulersHighlighterVisible(), true, "Rulers highlighter is shown");
  is(
    await isViewportSizeHighlighterVisible(),
    true,
    "ViewportSize highlighter is shown"
  );

  await toolbox.destroy();
  is(
    await isRulersHighlighterVisible(),
    false,
    "Rulers highlighter is not shown anymore after toolbox is destroyed"
  );
  is(
    await isViewportSizeHighlighterVisible(),
    false,
    "ViewportSize highlighter is not shown anymore after toolbox is destroyed"
  );
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

async function isRulersHighlighterVisible() {
  return SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
    const elSelector = ".rulers-highlighter-elements";
    const shadowRoot = content.document
      .getConnectedShadowRoots()
      .find(root => root.querySelector(elSelector));
    if (!shadowRoot) {
      return false;
    }

    return !shadowRoot.querySelector(elSelector).hasAttribute("hidden");
  });
}

async function isViewportSizeHighlighterVisible() {
  return SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
    const elSelector =
      ".viewport-size-highlighter-viewport-infobar-container:not(.viewport-size-on-resize-highlighter)";
    const shadowRoot = content.document
      .getConnectedShadowRoots()
      .find(root => root.querySelector(elSelector));
    if (!shadowRoot) {
      return false;
    }

    return !shadowRoot.querySelector(elSelector).hasAttribute("hidden");
  });
}
