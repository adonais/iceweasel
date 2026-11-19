/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const RULERS_PREF = "devtools.command-button-rulers.enabled";
const SCREENSHOT_PREF = "devtools.command-button-screenshot.enabled";
const COLOR_UNIT_PREF = "devtools.defaultColorUnit";

add_task(test_independent_preference_bindings);
add_task(test_preference_binding_without_callback);
add_task(test_select_preference_binding);
add_task(test_select_unknown_value);

async function test_independent_preference_bindings() {
  await pushPref(RULERS_PREF, true);
  await pushPref(SCREENSHOT_PREF, false);
  const { toolbox, root } = await openSettings();
  const rulers = root.shadowRoot.querySelector("#settings-toolbox-rulers");
  const screenshot = root.shadowRoot.querySelector(
    "#settings-toolbox-screenshot"
  );
  await Promise.all([
    rulers.closest("devtools-settings-pref").updateComplete,
    screenshot.closest("devtools-settings-pref").updateComplete,
  ]);
  await Promise.all([rulers.updateComplete, screenshot.updateComplete]);
  is(rulers.checked, true, "The rulers setting reads its own pref");
  is(screenshot.checked, false, "The screenshot setting reads its own pref");
  ok(
    !toolbox.doc.querySelector("#command-button-screenshot"),
    "The screenshot button starts hidden"
  );

  screenshot.click();
  await screenshot.updateComplete;
  is(
    Services.prefs.getBoolPref(SCREENSHOT_PREF),
    true,
    "Enabling the screenshot setting writes its pref"
  );
  is(
    Services.prefs.getBoolPref(RULERS_PREF),
    true,
    "Enabling the screenshot setting leaves the rulers pref unchanged"
  );
  await waitFor(
    () => toolbox.doc.querySelector("#command-button-screenshot"),
    "Enabling the screenshot setting shows the screenshot button"
  );

  screenshot.click();
  await screenshot.updateComplete;
  is(
    Services.prefs.getBoolPref(SCREENSHOT_PREF),
    false,
    "Disabling the screenshot setting writes its pref"
  );
  is(
    Services.prefs.getBoolPref(RULERS_PREF),
    true,
    "Disabling the screenshot setting leaves the rulers pref unchanged"
  );
  await waitFor(
    () => !toolbox.doc.querySelector("#command-button-screenshot"),
    "Disabling the screenshot setting hides the screenshot button"
  );

  await toolbox.destroy();
}

async function test_preference_binding_without_callback() {
  await pushPref(SCREENSHOT_PREF, true);
  const { toolbox, root } = await openSettings();
  const doc = root.ownerDocument;
  const binding = doc.createElement("devtools-settings-pref");
  binding.setAttribute("pref", SCREENSHOT_PREF);
  const checkbox = doc.createElement("moz-checkbox");
  checkbox.setAttribute("label", "Test setting");
  binding.append(checkbox);
  doc.body.append(binding);
  let changes = 0;
  binding.addEventListener("devtools-setting-changed", () => changes++);

  await binding.updateComplete;
  await checkbox.updateComplete;
  await waitFor(
    () => checkbox.getBoundingClientRect().height > 0,
    "The standalone checkbox has been laid out before clicking"
  );
  is(checkbox.checked, true, "A binding without a callback reads its pref");
  checkbox.click();
  is(
    Services.prefs.getBoolPref(SCREENSHOT_PREF),
    false,
    "A binding without a callback still writes its pref"
  );
  is(changes, 0, "A binding without a callback emits no event");

  await toolbox.destroy();
}

async function test_select_preference_binding() {
  await pushPref(COLOR_UNIT_PREF, "hex");
  const { toolbox, root } = await openSettings();
  const select = await getSelect(root, "#settings-inspector-color-unit");
  is(select.value, "hex", "The select reads its pref");

  await chooseOption(select, "rgb");
  is(
    Services.prefs.getStringPref(COLOR_UNIT_PREF),
    "rgb",
    "Changing the select writes its pref"
  );

  await toolbox.destroy();
}

async function test_select_unknown_value() {
  await pushPref(COLOR_UNIT_PREF, "unknown");
  const { toolbox, root } = await openSettings();
  await getSelect(root, "#settings-inspector-color-unit");
  is(
    Services.prefs.getStringPref(COLOR_UNIT_PREF),
    "unknown",
    "Rendering an unknown value leaves the pref unchanged"
  );

  await toolbox.destroy();
}
