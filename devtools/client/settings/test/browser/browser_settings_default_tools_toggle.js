/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(test_tool_setting_toggles_registration);

async function test_tool_setting_toggles_registration() {
  Services.fog.testResetFOG();
  await pushPref("devtools.styleeditor.enabled", true);
  const { toolbox, root } = await openSettings();
  const checkbox = root.shadowRoot.querySelector("#settings-tool-styleeditor");
  await checkbox.closest("devtools-settings-pref").updateComplete;
  await checkbox.updateComplete;
  ok(
    toolbox.doc.querySelector("#toolbox-tab-styleeditor"),
    "The Style Editor tab starts visible"
  );

  checkbox.click();
  await waitFor(
    () => !toolbox.doc.querySelector("#toolbox-tab-styleeditor"),
    "Clicking removes the Style Editor tab"
  );
  is(
    Glean.devtoolsTool.registered.styleeditor.testGetValue(),
    false,
    "Clicking records the tool as unregistered"
  );

  checkbox.click();
  await waitFor(
    () => toolbox.doc.querySelector("#toolbox-tab-styleeditor"),
    "Clicking again restores the Style Editor tab"
  );
  is(
    Glean.devtoolsTool.registered.styleeditor.testGetValue(),
    true,
    "Clicking again records the tool as registered"
  );

  await toolbox.destroy();
}
