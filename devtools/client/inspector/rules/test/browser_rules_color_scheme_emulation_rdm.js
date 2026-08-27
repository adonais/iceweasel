/* Any copyright is dedicated to the Public Domain.
 http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test color scheme emulation when RDM is toggled
const TEST_URI = URL_ROOT + "doc_media_queries.html";

add_task(async function () {
  await pushPref("layout.css.custom-media.enabled", true);

  const tab = await addTab(TEST_URI);
  const defaultPrefersDark = await getCurrentPrefersDark();
  const { inspector, view } = await openRuleView();

  info(
    "Open emulation panel and check that the color scheme emulation radio buttons exist"
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
  ok(lightRadioButton, "The light color-scheme emulation radio button exists");
  ok(darkRadioButton, "The dark color-scheme emulation radio button exists");
  ok(noEmulationRadioButton, "The no emulation radio button exists");

  // Define functions checking if the rule view displays the expected property.
  const divHasCurrentSchemeStyling = async () =>
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

  info(
    "Select the div that will change according to conditions in preferred color scheme"
  );
  await selectNode("div", inspector);
  ok(
    await divHasCurrentSchemeStyling(),
    "The rule view shows the expected initial rule"
  );

  const buttonToEnable = defaultPrefersDark
    ? lightRadioButton
    : darkRadioButton;
  const buttonToReset = defaultPrefersDark ? darkRadioButton : lightRadioButton;

  info(
    `Click the ${defaultPrefersDark ? "light" : "dark"} radio button to emulate the opposite color scheme`
  );
  buttonToEnable.click();
  await waitFor(() => isRadioButtonChecked(buttonToEnable));
  ok(
    true,
    `The ${defaultPrefersDark ? "light" : "dark"} radio button is checked`
  );

  await waitFor(() => divHasOppositeSchemeStyling());

  info("Open responsive design mode");
  await openRDM(tab);

  await waitFor(() => divHasOppositeSchemeStyling());
  ok(
    true,
    "The rules view was updated with the rule view from the emulated color scheme media query"
  );

  info(
    `Click the ${defaultPrefersDark ? "dark" : "light"} radio button to restore the OS color scheme`
  );
  buttonToReset.click();
  await waitFor(() => isRadioButtonChecked(buttonToReset));
  ok(
    true,
    `The ${defaultPrefersDark ? "dark" : "light"} radio button is checked`
  );

  await waitFor(() => divHasCurrentSchemeStyling());

  info("Close responsive design mode");
  await closeRDM(tab);

  info(
    "Wait for a bit before checking the current color scheme is still enabled"
  );
  await wait(1000);
  ok(isRadioButtonChecked(buttonToReset), "Radio button is still checked");
  ok(
    await divHasCurrentSchemeStyling(),
    "Color-scheme emulation is still enabled"
  );

  info("Click the no emulation radio button to disable emulation");
  noEmulationRadioButton.click();
  await waitFor(() => isRadioButtonChecked(noEmulationRadioButton));
  ok(true, "The no emulation radio button is checked");
  await waitFor(() => divHasCurrentSchemeStyling());
  ok(true, "We're not emulating color-scheme anymore");

  info(
    "Check that enabling color-scheme emulation before RDM does work as well"
  );
  buttonToEnable.click();
  await waitFor(() => isRadioButtonChecked(buttonToEnable));
  await waitFor(() => divHasOppositeSchemeStyling());
  ok(
    true,
    "The rules view was updated with the rule view from the emulated color scheme media query"
  );

  info("Open responsive design mode again");
  await openRDM(tab);

  info(
    "Click the no emulation radio button to disable emulation while RDM is still opened"
  );
  noEmulationRadioButton.click();
  await waitFor(() => isRadioButtonChecked(noEmulationRadioButton));
  ok(true, "The no emulation radio button is checked");
  await waitFor(() => divHasCurrentSchemeStyling());
  ok(true, "We're not emulating color-scheme anymore");

  info("Close responsive design mode");
  await closeRDM(tab);
});

function isRadioButtonChecked(el) {
  return (
    (el.checked !== undefined && el.checked) ||
    el.getAttribute("aria-pressed") === "true"
  );
}
