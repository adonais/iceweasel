/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(test_disable_javascript_toggle);
add_task(test_disable_javascript_initial_state);

async function test_disable_javascript_toggle() {
  const { toolbox, root } = await openSettings();
  const checkbox = await waitForDisableJavascriptCheckbox(root);
  ok(!checkbox.checked, "The setting starts unchecked");

  let { onDomCompleteResource } = await waitForNextTopLevelDomCompleteResource(
    toolbox.commands
  );
  checkbox.click();
  await onDomCompleteResource;
  is(
    await toolbox.commands.targetConfigurationCommand.isJavascriptEnabled(),
    false,
    "Checking the setting disables JavaScript"
  );

  ({ onDomCompleteResource } = await waitForNextTopLevelDomCompleteResource(
    toolbox.commands
  ));
  checkbox.click();
  await onDomCompleteResource;
  is(
    await toolbox.commands.targetConfigurationCommand.isJavascriptEnabled(),
    true,
    "Unchecking the setting enables JavaScript"
  );

  await toolbox.destroy();
}

async function test_disable_javascript_initial_state() {
  // Open another tool first, so JavaScript is disabled before the settings
  // panel reads it. openSettings can't be used as it opens the panel directly.
  await pushPref("devtools.settings.redesign-enabled", true);
  const tab = await addTab("about:blank");
  const toolbox = await openToolboxForTab(tab, "webconsole");
  let { onDomCompleteResource } = await waitForNextTopLevelDomCompleteResource(
    toolbox.commands
  );
  await toolbox.commands.targetConfigurationCommand.updateConfiguration({
    javascriptEnabled: false,
  });
  await onDomCompleteResource;

  await toolbox.selectTool("options");
  const root = toolbox.getCurrentPanel().element;
  await root.updateComplete;
  const checkbox = await waitForDisableJavascriptCheckbox(root);
  ok(checkbox.checked, "The setting reads that JavaScript is disabled");

  ({ onDomCompleteResource } = await waitForNextTopLevelDomCompleteResource(
    toolbox.commands
  ));
  checkbox.click();
  await onDomCompleteResource;
  is(
    await toolbox.commands.targetConfigurationCommand.isJavascriptEnabled(),
    true,
    "Unchecking the setting enables JavaScript"
  );

  await toolbox.destroy();
}

/**
 * Find the disable JavaScript checkbox once it has read the current state.
 *
 * @param {DevToolsSettings} root The settings panel's root element
 * @return {Promise<MozCheckbox>}
 */
async function waitForDisableJavascriptCheckbox(root) {
  const setting = root.shadowRoot.querySelector(
    "#settings-advanced-disable-javascript"
  );
  await setting.updateComplete;
  const checkbox = setting.shadowRoot.querySelector("moz-checkbox");
  await waitFor(
    () => !checkbox.disabled,
    "The setting has read whether JavaScript is enabled"
  );
  return checkbox;
}
