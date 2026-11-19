/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(test_debugger_stylesheets_telemetry);

async function test_debugger_stylesheets_telemetry() {
  Services.fog.testResetFOG();
  await pushPref("devtools.debugger.features.stylesheets-in-debugger", false);
  const { toolbox, root } = await openSettings();
  const checkbox = root.shadowRoot.querySelector(
    "#settings-debugger-stylesheets"
  );
  await checkbox.closest("devtools-settings-pref").updateComplete;
  await checkbox.updateComplete;

  checkbox.click();
  is(
    Glean.devtoolsDebuggerStylesheets.stylesheetPrefEnabledCount.testGetValue(),
    1,
    "Enabling the setting is counted"
  );

  checkbox.click();
  is(
    Glean.devtoolsDebuggerStylesheets.stylesheetPrefDisabledCount.testGetValue(),
    1,
    "Disabling the setting is counted"
  );

  await toolbox.destroy();
}
