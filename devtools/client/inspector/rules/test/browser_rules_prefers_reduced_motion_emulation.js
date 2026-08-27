/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test prefers-reduced-motion emulation.

// Load the test page under .com TLD, to make the inner .org iframe remote with
// Fission.
const TEST_URI = URL_ROOT_COM_SSL + "doc_prefers_reduced_motion_emulation.html";

add_task(async function () {
  await addTab(TEST_URI);
  const defaultPrefersReduced = await getCurrentPrefersReducedMotionReduce();
  const { inspector, view, toolbox } = await openRuleView();

  info("Check that the prefers-reduced-motion emulation radio buttons exist");
  info(
    "Open emulation panel and check that the color scheme simulation buttons exist"
  );
  await openEmulationPanel(view);
  const reduceRadioButton = inspector.panelDoc.querySelector(
    "#reduced-motion-emulation-reduce"
  );
  const noPreferenceRadioButton = inspector.panelDoc.querySelector(
    "#reduced-motion-emulation-no-preference"
  );
  const noEmulationRadioButton = inspector.panelDoc.querySelector(
    "#reduced-motion-emulation-none"
  );
  ok(
    reduceRadioButton,
    "The reduce motion preference emulation radio button exists"
  );
  ok(
    noPreferenceRadioButton,
    "The no motion preference emulation radio button exists"
  );
  ok(noEmulationRadioButton, "The no emulation radio button exists");

  // Initially, the emulation should be disabled
  checkEmulationButtonsStatus(inspector, "none");

  // Define functions checking the rule view against the current OS preference,
  // and the opposite emulated preference.
  const divHasDefaultPreferenceStyling = async () =>
    (await getPropertiesForRuleIndex(view, 1)).has(
      defaultPrefersReduced ? "animation-name:none" : "animation-name:--pulse"
    );
  const divHasOppositeToDefaultStyling = async () =>
    (await getPropertiesForRuleIndex(view, 1)).has(
      defaultPrefersReduced ? "animation-name:--pulse" : "animation-name:none"
    );

  info(
    "Select a div that will change according to prefers-reduced-motion preference emulation"
  );
  await selectNode("div", inspector);
  ok(
    await divHasDefaultPreferenceStyling(),
    "The div has the expected animation-name for the current OS preference"
  );

  info("Select the node from the remote iframe");
  await selectNodeInFrames(["iframe", "div"], inspector);

  ok(
    await divHasDefaultPreferenceStyling(),
    "The iframe element has the expected animation-name for the current OS preference"
  );

  const radioButtonToEnable = defaultPrefersReduced
    ? noPreferenceRadioButton
    : reduceRadioButton;
  const radioButtonToReset = defaultPrefersReduced
    ? reduceRadioButton
    : noPreferenceRadioButton;
  const defaultPreference = defaultPrefersReduced ? "reduce" : "no-preference";
  const oppositePreference = defaultPrefersReduced ? "no-preference" : "reduce";
  info(`Click the ${oppositePreference} motion preference emulation button`);
  radioButtonToEnable.click();
  await waitFor(() => radioButtonToEnable.checked);

  checkEmulationButtonsStatus(inspector, oppositePreference);

  await waitFor(() => divHasOppositeToDefaultStyling());
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    `@media (prefers-reduced-motion: ${oppositePreference}) {`,
    `The rules view was updated with the rule from the prefers-reduced-motion: ${oppositePreference} media query`
  );

  info("Select the node from the remote iframe");
  await selectNodeInFrames(["iframe", "div"], inspector);

  ok(
    await divHasOppositeToDefaultStyling(),
    "The opposite motion preference emulation is also applied on the remote iframe"
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    `@media (prefers-reduced-motion: ${oppositePreference}) {`,
    `Media queries information are displayed for ${oppositePreference}`
  );

  info("Select the top-level div again");
  await selectNode("div", inspector);

  info(`Click the ${defaultPreference} motion preference emulation button`);
  radioButtonToReset.click();
  await waitFor(() => radioButtonToReset.checked);

  checkEmulationButtonsStatus(inspector, defaultPreference);

  info("Check that reloading keeps the selected emulation");
  await selectNode("div", inspector);
  radioButtonToEnable.click();
  await waitFor(() => divHasOppositeToDefaultStyling());

  await navigateTo(TEST_URI);
  await selectNode("div", inspector);

  checkEmulationButtonsStatus(inspector, oppositePreference);

  await waitFor(() => getRuleViewRuleEditorAt(view, 1));
  ok(
    await divHasOppositeToDefaultStyling(),
    `The ${oppositePreference} motion preference emulation is still active after reloading the page`
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    `@media (prefers-reduced-motion: ${oppositePreference}) {`,
    `The ${oppositePreference} media query is displayed on the rule after reloading`
  );

  await selectNodeInFrames(["iframe", "div"], inspector);
  await waitFor(() => divHasOppositeToDefaultStyling());
  ok(
    true,
    `The ${oppositePreference} motion preference emulation is still applied to the iframe after reloading`
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    `@media (prefers-reduced-motion: ${oppositePreference}) {`,
    `The ${oppositePreference} media query is still displayed on the rule for the element in iframe after reloading`
  );

  info("Click the no emulation button to disable motion preference emulation");
  noEmulationRadioButton.click();
  await waitFor(() => noEmulationRadioButton.checked);

  checkEmulationButtonsStatus(inspector, "none");

  await waitFor(() => divHasDefaultPreferenceStyling());
  ok(
    true,
    "The rules view was updated with the rule from the prefers-reduced-motion media query for the current OS preference"
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    `@media (prefers-reduced-motion: ${defaultPreference}) {`,
    `Media queries information are displayed for ${defaultPreference}`
  );

  info("Select the node from the remote iframe");
  await selectNodeInFrames(["iframe", "div"], inspector);

  ok(
    await divHasDefaultPreferenceStyling(),
    "The current motion preference emulation is also applied on the remote iframe"
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    `@media (prefers-reduced-motion: ${defaultPreference}) {`,
    `Media queries information are displayed for ${defaultPreference} on the remote iframe`
  );

  info(
    `Click the ${oppositePreference} motion preference emulation button again, so it can be checked that closing DevTools resets the emulation`
  );
  radioButtonToEnable.click();
  await waitFor(() => divHasOppositeToDefaultStyling());

  info("Check that closing DevTools resets the motion preference emulation");
  await toolbox.destroy();
  const matchesPrefersReducedMotion = await SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [],
    () => content.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  is(
    matchesPrefersReducedMotion,
    defaultPrefersReduced,
    "Prefers-reduced-motion emulation is disabled after closing DevTools"
  );
});

function checkEmulationButtonsStatus(inspector, expectedEmulation) {
  const reduceRadioButton = inspector.panelDoc.querySelector(
    "#reduced-motion-emulation-reduce"
  );
  const noPreferenceRadioButton = inspector.panelDoc.querySelector(
    "#reduced-motion-emulation-no-preference"
  );
  const noEmulationButton = inspector.panelDoc.querySelector(
    "#reduced-motion-emulation-none"
  );

  const isReduceEmulationExpected = expectedEmulation === "reduce";
  const isNoPreferenceEmulationExpected = expectedEmulation === "no-preference";
  const isNoEmulationExpected = expectedEmulation === "none";

  is(
    reduceRadioButton.checked,
    isReduceEmulationExpected,
    `The reduce button ${isReduceEmulationExpected ? "is" : "isn't"} pressed`
  );

  is(
    noPreferenceRadioButton.checked,
    isNoPreferenceEmulationExpected,
    `The no preference button ${isNoPreferenceEmulationExpected ? "is" : "isn't"} pressed`
  );

  is(
    noEmulationButton.checked,
    isNoEmulationExpected,
    `The no emulation button ${isNoEmulationExpected ? "is" : "isn't"} pressed`
  );
}
