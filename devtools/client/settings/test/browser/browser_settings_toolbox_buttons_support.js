/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(test_unsupported_button);

async function test_unsupported_button() {
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
  ok(
    !root.shadowRoot.querySelector("#settings-toolbox-responsive"),
    "An unsupported button's setting is hidden"
  );
  ok(
    root.shadowRoot.querySelector("#settings-toolbox-rulers"),
    "A supported button's setting is shown"
  );

  await toolbox.destroy();
}
