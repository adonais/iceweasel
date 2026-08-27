/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test print media emulation.

// Load the test page under .com TLD, to make the inner .org iframe remote with
// Fission.
const TEST_URI = URL_ROOT_COM_SSL + "doc_print_media_emulation.html";

add_task(async function () {
  await addTab(TEST_URI);
  const { inspector, view } = await openRuleView();

  info("Open emulation panel and check that the print emulation switch exists");
  await openEmulationPanel(view);
  const printEmulationSwitch = inspector.panelDoc.querySelector(
    "#print-emulation-enabled"
  );
  ok(printEmulationSwitch, "The print emulation switch exists");

  is(printEmulationSwitch.checked, false, "The print switch is not enabled");

  // Helper to retrieve the background-color property of the selected element
  // All the test elements are expected to have a single background-color rule
  // for this test.
  const ruleViewHasColor = async color =>
    (await getPropertiesForRuleIndex(view, 1)).has("background-color:" + color);

  info("Select a div that will change according to print emulation");
  await selectNode("div", inspector);
  ok(
    await ruleViewHasColor("#f00"),
    "The rule view shows the expected initial rule"
  );
  is(
    getRuleViewAncestorRulesDataElementByIndex(view, 1),
    null,
    "No media query information are displayed initially"
  );

  info("Click on the switch and wait for print media to be applied");
  printEmulationSwitch.click();

  await waitFor(() => printEmulationSwitch.checked === true);
  ok(true, "The switch is now enabled");

  await waitFor(() => ruleViewHasColor("#00f"));
  ok(
    true,
    "The rules view was updated with the rule view from the print media query"
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    "@media print {",
    "Media queries information is displayed"
  );

  info("Select the node from the remote iframe");
  await selectNodeInFrames(["iframe", "html"], inspector);

  ok(
    await ruleViewHasColor("#0ff"),
    "The emulation is also applied on the remote iframe"
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    "@media print {",
    "Media queries information are displayed for the node on the remote iframe as well"
  );

  info("Select the top level div again");
  await selectNode("div", inspector);

  info("Click the switch again to disable print emulation");
  printEmulationSwitch.click();

  await waitFor(() => printEmulationSwitch.checked === false);
  ok(true, "The switch is no longer enabledF");

  await waitFor(() => ruleViewHasColor("#f00"));
  is(
    getRuleViewAncestorRulesDataElementByIndex(view, 1),
    null,
    "The media query is no longer displayed"
  );

  info("Select the node from the remote iframe again");
  await selectNodeInFrames(["iframe", "html"], inspector);

  await waitFor(() => ruleViewHasColor("#ff0"));
  ok(true, "The emulation stopped on the remote iframe as well");
  is(
    getRuleViewAncestorRulesDataElementByIndex(view, 1),
    null,
    "The media query is no longer displayed on the remote iframe as well"
  );
});
