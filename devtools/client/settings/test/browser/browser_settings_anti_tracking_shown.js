/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const ANTI_TRACKING_PREF = "devtools.anti-tracking.enabled";

add_task(test_anti_tracking_listed_when_enabled_at_startup);

async function test_anti_tracking_listed_when_enabled_at_startup() {
  await pushPref(ANTI_TRACKING_PREF, true);
  let { toolbox, root } = await openSettings();
  let checkbox = root.shadowRoot.querySelector("#settings-tool-antitracking");
  ok(checkbox, "Enabling Anti Tracking at startup lists its setting");
  await checkbox.closest("devtools-settings-pref").updateComplete;
  await checkbox.updateComplete;
  is(checkbox.checked, true, "The Anti Tracking setting reads its pref");

  checkbox.click();
  is(
    Services.prefs.getBoolPref(ANTI_TRACKING_PREF),
    false,
    "Clicking disables Anti Tracking"
  );
  await toolbox.destroy();

  ({ toolbox, root } = await openSettings());
  checkbox = root.shadowRoot.querySelector("#settings-tool-antitracking");
  ok(checkbox, "Disabling Anti Tracking keeps its setting listed");
  await checkbox.closest("devtools-settings-pref").updateComplete;
  await checkbox.updateComplete;
  is(checkbox.checked, false, "The Anti Tracking setting stays unticked");

  await toolbox.destroy();
}
