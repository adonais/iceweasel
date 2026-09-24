/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test the Inspector toolbar menu controlling the orientation of the splitter
// between the Inspector panels.

const SPLIT_ORIENTATION_PREF = "devtools.inspector.split-orientation";
const TEST_URI = "data:text/html;charset=utf-8,<h1>split orientation</h1>";

add_task(async function () {
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref(SPLIT_ORIENTATION_PREF);
  });

  const { inspector, toolbox } = await openInspectorForURL(TEST_URI);

  const button = await waitFor(() =>
    inspector.panelDoc.getElementById("inspector-split-orientation-button")
  );
  ok(button, "The split orientation menu button is rendered");

  is(
    Services.prefs.getCharPref(SPLIT_ORIENTATION_PREF),
    "auto",
    "The split orientation pref defaults to auto"
  );

  info("Open the menu and check the default state");
  let items = await openSplitOrientationMenu(inspector, toolbox);
  is(
    items.auto.getAttribute("aria-checked"),
    "true",
    "The automatic item is checked by default"
  );
  ok(
    !items.side.hasAttribute("aria-checked"),
    "The side-by-side item is not checked"
  );
  ok(
    !items.stacked.hasAttribute("aria-checked"),
    "The stacked item is not checked"
  );

  info("Lock the layout to side by side");
  EventUtils.synthesizeMouseAtCenter(items.side, {}, toolbox.win);
  await waitFor(
    () => Services.prefs.getCharPref(SPLIT_ORIENTATION_PREF) === "side"
  );
  await waitFor(() => inspector.splitBox.state.vert === true);
  ok(true, "The pref was set and the layout switched to side by side");
  await waitForSplitOrientationMenuToClose(toolbox);

  info("Reopen the menu and lock the layout to stacked");
  items = await openSplitOrientationMenu(inspector, toolbox);
  is(
    items.side.getAttribute("aria-checked"),
    "true",
    "The side-by-side item is now checked"
  );
  EventUtils.synthesizeMouseAtCenter(items.stacked, {}, toolbox.win);
  await waitFor(
    () => Services.prefs.getCharPref(SPLIT_ORIENTATION_PREF) === "stacked"
  );
  await waitFor(() => inspector.splitBox.state.vert === false);
  ok(true, "The pref was set and the layout switched to stacked");
  await waitForSplitOrientationMenuToClose(toolbox);

  info("Change the pref externally while the inspector is open");
  Services.prefs.setCharPref(SPLIT_ORIENTATION_PREF, "side");
  await waitFor(() => inspector.splitBox.state.vert === true);
  ok(true, "The layout updated after an external pref change");

  items = await openSplitOrientationMenu(inspector, toolbox);
  is(
    items.side.getAttribute("aria-checked"),
    "true",
    "The menu reflects the external pref change"
  );

  info("Close the menu with the escape key");
  EventUtils.synthesizeKey("VK_ESCAPE", {}, toolbox.win);
  await waitForSplitOrientationMenuToClose(toolbox);
});

async function openSplitOrientationMenu(inspector, toolbox) {
  const button = inspector.panelDoc.getElementById(
    "inspector-split-orientation-button"
  );
  EventUtils.synthesizeMouseAtCenter(button, {}, inspector.panelWin);

  info("Waiting for the split orientation menu to be displayed");
  await waitFor(() => {
    const panel = toolbox.doc.getElementById(
      "inspector-split-orientation-menu-panel"
    );
    return panel?.classList.contains("tooltip-visible");
  });

  return {
    auto: toolbox.doc.getElementById("inspector-split-orientation-auto"),
    side: toolbox.doc.getElementById("inspector-split-orientation-side"),
    stacked: toolbox.doc.getElementById("inspector-split-orientation-stacked"),
  };
}

function waitForSplitOrientationMenuToClose(toolbox) {
  info("Waiting for the split orientation menu to be hidden");
  return waitFor(() => {
    const panel = toolbox.doc.getElementById(
      "inspector-split-orientation-menu-panel"
    );
    return !panel || !panel.classList.contains("tooltip-visible");
  });
}
