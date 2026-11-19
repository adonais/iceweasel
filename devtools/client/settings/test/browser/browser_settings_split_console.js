/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(test_split_console_setting);

async function test_split_console_setting() {
  await pushPref("devtools.toolbox.splitconsole.enabled", true);
  await pushPref("devtools.toolbox.splitconsole.open", false);
  const { toolbox, root } = await openSettings();
  const checkbox = root.shadowRoot.querySelector(
    "#settings-webconsole-split-console"
  );
  await checkbox.closest("devtools-settings-pref").updateComplete;
  await checkbox.updateComplete;
  await toolbox.openSplitConsole();
  ok(
    toolbox.splitConsole,
    "The split console is open before disabling the setting"
  );

  checkbox.click();
  ok(
    !toolbox.isSplitConsoleEnabled(),
    "Disabling the setting disables the split console"
  );
  await waitFor(
    () => !toolbox.splitConsole,
    "Disabling the setting closes the split console"
  );
  await toolbox.openSplitConsole();
  ok(
    !toolbox.splitConsole,
    "The split console can't be opened while the setting is disabled"
  );
  is(toolbox.currentToolId, "webconsole", "The Web Console opens instead");
  await toolbox.selectTool("options");

  checkbox.click();
  ok(
    toolbox.isSplitConsoleEnabled(),
    "Enabling the setting enables the split console"
  );
  ok(
    !toolbox.splitConsole,
    "Enabling the setting leaves the split console closed"
  );
  await toolbox.openSplitConsole();
  ok(toolbox.splitConsole, "The split console can be opened again");

  await toolbox.destroy();
}
