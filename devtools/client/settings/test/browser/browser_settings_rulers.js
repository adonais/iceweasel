/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SETTING_PREF = "devtools.command-button-rulers.enabled";

add_task(async function () {
  await pushPref("devtools.settings.redesign-enabled", true);
  await pushPref(SETTING_PREF, true);
  const tab = await addTab("about:blank");
  const toolbox = await openToolboxForTab(tab, "options");
  const panel = toolbox.getCurrentPanel();
  await panel.element.updateComplete;
  const checkbox = panel.element.shadowRoot.querySelector(
    "#settings-toolbox-rulers"
  );
  ok(checkbox, "The checkbox exists");
  await checkbox.updateComplete;
  is(checkbox.checked, true, "The checkbox reads the existing preference");
  ok(
    toolbox.doc.querySelector("#command-button-rulers"),
    "The rulers button starts visible"
  );

  checkbox.click();
  is(
    Services.prefs.getBoolPref(SETTING_PREF),
    false,
    "Clicking updates the preference"
  );
  await waitFor(
    () => !toolbox.doc.querySelector("#command-button-rulers"),
    "Clicking hides the rulers button"
  );

  checkbox.click();
  is(
    Services.prefs.getBoolPref(SETTING_PREF),
    true,
    "Clicking again updates the preference"
  );
  await waitFor(
    () => toolbox.doc.querySelector("#command-button-rulers"),
    "Clicking again shows the rulers button"
  );

  await toolbox.destroy();
});
