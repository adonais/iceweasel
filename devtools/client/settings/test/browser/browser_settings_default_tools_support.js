/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(test_unsupported_tool);

async function test_unsupported_tool() {
  await pushPref("devtools.settings.redesign-enabled", true);
  const tab = await addTab("about:blank");
  const commands = await CommandsFactory.forRemoteTab(
    tab.linkedBrowser.browserId
  );
  const toolbox = await gDevTools.showToolbox(commands, {
    toolId: "options",
    hostType: "window",
  });
  const root = toolbox.getCurrentPanel().element;
  await root.updateComplete;
  const checkbox = root.shadowRoot.querySelector("#settings-tool-performance");
  ok(checkbox.disabled, "An unsupported tool's setting is disabled");
  const supportedCheckbox = root.shadowRoot.querySelector(
    "#settings-tool-styleeditor"
  );
  ok(!supportedCheckbox.disabled, "A supported tool's setting is enabled");

  await toolbox.destroy();
}
