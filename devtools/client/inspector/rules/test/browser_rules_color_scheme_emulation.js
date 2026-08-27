/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test color scheme emulation.
const TEST_URI = URL_ROOT_SSL + "doc_media_queries.html";

add_task(async function () {
  await pushPref("layout.css.custom-media.enabled", true);
  await addTab(TEST_URI);
  const defaultPrefersDark = await getCurrentPrefersDark();
  const { inspector, view, toolbox } = await openRuleView();

  info("Check that the color scheme emulation buttons exist");
  const lightButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-light-toggle"
  );
  const darkButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-dark-toggle"
  );
  ok(lightButton, "The light color scheme emulation button exists");
  ok(darkButton, "The dark color scheme emulation button exists");

  info(
    "Open emulation panel and check that the color scheme emulation buttons exist"
  );
  await openEmulationPanel(view);
  const lightRadioButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-light"
  );
  const darkRadioButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-dark"
  );
  const noEmulationRadioButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-none"
  );
  ok(lightRadioButton, "The light color scheme emulation radio button exists");
  ok(darkRadioButton, "The dark color scheme emulation radio button exists");
  ok(noEmulationRadioButton, "The no emulation radio button exists");

  // Initially, the emulation should be disabled
  checkEmulationButtonsStatus(inspector, "none");

  // Define functions checking the rule view against the current OS preference,
  // and the opposite emulated scheme.
  const divHasDefaultSchemeStyling = async () =>
    (await getPropertiesForRuleIndex(view, 2)).has(
      defaultPrefersDark
        ? "background-color:darkblue"
        : "background-color:skyblue"
    );
  const divHasOppositeSchemeStyling = async () =>
    (await getPropertiesForRuleIndex(view, 2)).has(
      defaultPrefersDark
        ? "background-color:skyblue"
        : "background-color:darkblue"
    );
  const iframeElHasCurrentSchemeStyling = async () =>
    (await getPropertiesForRuleIndex(view, 1)).has(
      defaultPrefersDark ? "background:darkred" : "background:tomato"
    );
  const iframeHasOppositeSchemeStyling = async () =>
    (await getPropertiesForRuleIndex(view, 1)).has(
      defaultPrefersDark ? "background:tomato" : "background:darkred"
    );

  info(
    "Select the div that will change according to conditions in preferred color scheme"
  );
  await selectNode("div", inspector);
  ok(
    await divHasDefaultSchemeStyling(),
    "The rule view shows the expected initial rule"
  );

  info("Check the toolbar buttons functionality");

  const buttonToEnable = defaultPrefersDark ? lightButton : darkButton;
  const defaultScheme = defaultPrefersDark ? "dark" : "light";
  const oppositeScheme = defaultPrefersDark ? "light" : "dark";
  info(
    `Click the ${oppositeScheme} button to emulate the opposite color scheme`
  );
  buttonToEnable.click();
  await waitFor(() => isButtonChecked(buttonToEnable));

  checkEmulationButtonsStatus(inspector, oppositeScheme);

  await waitFor(() => divHasOppositeSchemeStyling());
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 2),
    `@media (prefers-color-scheme: ${oppositeScheme}) {`,
    `The rules view was updated with the rule from the ${oppositeScheme} scheme media query`
  );

  info("Select the node from the remote iframe");
  await selectNodeInFrames(["iframe", "html"], inspector);

  ok(
    await iframeHasOppositeSchemeStyling(),
    "The emulation is also applied on the remote iframe"
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    `@media (prefers-color-scheme: ${oppositeScheme}) {`,
    `The prefers-color-scheme media query is displayed for the ${oppositeScheme} scheme`
  );

  info("Select the top level div again");
  await selectNode("div", inspector);

  const buttonToReset = defaultPrefersDark ? darkButton : lightButton;
  info(`Click the ${defaultScheme} button to restore the OS color scheme`);
  buttonToReset.click();
  await waitFor(() => isButtonChecked(buttonToReset));

  checkEmulationButtonsStatus(inspector, defaultScheme);

  await waitFor(() => divHasDefaultSchemeStyling());

  info(`Click the ${defaultScheme} button again to disable emulation`);
  buttonToReset.click();
  await waitFor(() => !isButtonChecked(buttonToReset));

  checkEmulationButtonsStatus(inspector, "none");

  await waitFor(() => divHasDefaultSchemeStyling());
  ok(true, "We're not emulating color-scheme anymore");

  info("Select the node from the remote iframe again");
  await selectNodeInFrames(["iframe", "html"], inspector);
  await waitFor(() => iframeElHasCurrentSchemeStyling());
  ok(true, "The emulation stopped on the remote iframe as well");

  info("Check that reloading keeps the selected emulation");
  await selectNode("div", inspector);
  buttonToEnable.click();
  await waitFor(() => divHasOppositeSchemeStyling());

  await navigateTo(TEST_URI);
  await selectNode("div", inspector);

  checkEmulationButtonsStatus(inspector, oppositeScheme);

  await waitFor(() => getRuleViewRuleEditorAt(view, 1));
  ok(
    await divHasOppositeSchemeStyling(),
    "The selected opposite color scheme is still emulated after reloading the page"
  );
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 2),
    `@media (prefers-color-scheme: ${oppositeScheme}) {`,
    `The prefers-color-scheme media query is displayed for the ${oppositeScheme} scheme after reloading`
  );

  await selectNodeInFrames(["iframe", "html"], inspector);
  await waitFor(() => iframeHasOppositeSchemeStyling());
  ok(true, "Emulation is still applied to the iframe after reloading");
  is(
    getRuleViewAncestorRulesDataTextByIndex(view, 1),
    `@media (prefers-color-scheme: ${oppositeScheme}) {`,
    `The prefers-color-scheme media query is still displayed for the ${oppositeScheme} scheme on the rule for the element in iframe after reloading`
  );

  info(
    "Select the div again that will change according to conditions in preferred color scheme"
  );
  await selectNode("div", inspector);

  info("Check the emulation panel radio buttons functionality");

  const radioButtonToEnable = defaultPrefersDark
    ? lightRadioButton
    : darkRadioButton;
  info(
    `Click the ${oppositeScheme} radio button to emulate the opposite color scheme`
  );
  radioButtonToEnable.click();
  await waitFor(() => isButtonChecked(radioButtonToEnable));

  checkEmulationButtonsStatus(inspector, oppositeScheme);

  await waitFor(() => divHasOppositeSchemeStyling());

  const radioButtonToReset = defaultPrefersDark
    ? darkRadioButton
    : lightRadioButton;
  info(
    `Click the ${defaultScheme} radio button to restore the OS color scheme`
  );
  radioButtonToReset.click();
  await waitFor(() => isButtonChecked(radioButtonToReset));

  checkEmulationButtonsStatus(inspector, defaultScheme);

  await waitFor(() => divHasDefaultSchemeStyling());

  info(
    `Click the no emulation radio button to emulate the opposite color scheme`
  );
  noEmulationRadioButton.click();
  await waitFor(() => isButtonChecked(noEmulationRadioButton));

  checkEmulationButtonsStatus(inspector, "none");

  await waitFor(() => divHasDefaultSchemeStyling());
  ok(true, "We're not emulating color-scheme anymore");

  info(
    `Click the ${oppositeScheme} radio button again, so it can be checked whether closing DevTools resets the emulation`
  );
  radioButtonToEnable.click();
  await waitFor(() => divHasOppositeSchemeStyling());

  info("Check that closing DevTools resets the emulation");
  await toolbox.destroy();
  const matchesPrefersDarkColorSchemeMedia = await SpecialPowers.spawn(
    gBrowser.selectedBrowser,
    [],
    () => {
      const { matches } = content.matchMedia("(prefers-color-scheme: dark)");
      return matches;
    }
  );
  is(
    matchesPrefersDarkColorSchemeMedia,
    defaultPrefersDark,
    "Color scheme emulation is disabled after closing DevTools"
  );
});

function isButtonChecked(el) {
  return (
    (el.checked !== undefined && el.checked) ||
    el.getAttribute("aria-pressed") === "true"
  );
}

function checkEmulationButtonsStatus(inspector, expectedEmulation) {
  const lightButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-light-toggle"
  );
  const darkButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-dark-toggle"
  );
  const lightRadioButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-light"
  );
  const darkRadioButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-dark"
  );
  const noEmulationButton = inspector.panelDoc.querySelector(
    "#color-scheme-emulation-none"
  );

  const isLightThemeEmulationExpected = expectedEmulation === "light";
  const isDarkThemeEmulationExpected = expectedEmulation === "dark";
  const isNoEmulationExpected = expectedEmulation === "none";

  is(
    isButtonChecked(lightButton),
    isLightThemeEmulationExpected,
    `The light button ${isLightThemeEmulationExpected ? "is" : "isn't"} pressed`
  );

  is(
    isButtonChecked(darkButton),
    isDarkThemeEmulationExpected,
    `The dark button ${isDarkThemeEmulationExpected ? "is" : "isn't"} pressed`
  );

  is(
    isButtonChecked(lightRadioButton),
    isLightThemeEmulationExpected,
    `The light radio button in the emulation panel ${isLightThemeEmulationExpected ? "is" : "isn't"} checked`
  );

  is(
    isButtonChecked(darkRadioButton),
    isDarkThemeEmulationExpected,
    `The dark radio button in the emulation panel ${isDarkThemeEmulationExpected ? "is" : "isn't"} checked`
  );

  is(
    isButtonChecked(noEmulationButton),
    isNoEmulationExpected,
    `The no emulation radio button in the emulation panel ${isNoEmulationExpected ? "is" : "isn't"} checked`
  );
}
