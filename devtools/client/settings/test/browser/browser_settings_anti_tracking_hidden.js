/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(test_anti_tracking_hidden_when_enabled_after_startup);

async function test_anti_tracking_hidden_when_enabled_after_startup() {
  await pushPref("devtools.anti-tracking.enabled", true);
  const { toolbox, root } = await openSettings();
  ok(
    root.shadowRoot.querySelector("#settings-tool-dom"),
    "The other tool settings are listed"
  );
  ok(
    !root.shadowRoot.querySelector("#settings-tool-antitracking"),
    "Enabling Anti Tracking after startup doesn't list its setting"
  );

  await toolbox.destroy();
}
