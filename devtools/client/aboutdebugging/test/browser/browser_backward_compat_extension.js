/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

const EXTENSION_NAME = "DevTools compat test extension";

const TOOL_IDS = ["inspector", "webconsole", "jsdebugger", "netmonitor"];

// Check that an extension installed on the server can be inspected from the
// client.
addCompatTask(async function (config) {
  const { addonId } = await runDevToolsServerCommand(
    config,
    "install-extension"
  );
  ok(addonId, `Installed the test extension on the server (${addonId})`);

  const { document, tab, window } =
    await openAboutDebuggingWithCompatServer(config);
  await connectToRuntime(config.host, document);
  await waitForRuntimePage(config.runtime.brandName, document);

  info("Wait until the extension is listed as a debug target");
  await waitFor(
    () => findDebugTargetByText(EXTENSION_NAME, document),
    "The extension should be listed in the debug targets"
  );

  const extensionPane = getDebugTargetPane("Temporary Extensions", document);
  ok(
    extensionPane.textContent.includes(EXTENSION_NAME),
    "The extension is displayed in the Temporary Extensions pane"
  );

  const { devtoolsTab, devtoolsWindow } = await openAboutDevtoolsToolbox(
    document,
    tab,
    window,
    EXTENSION_NAME
  );
  const toolbox = getToolbox(devtoolsWindow);

  for (const toolId of TOOL_IDS) {
    info(`Select the ${toolId} panel`);
    await toolbox.selectTool(toolId);

    const iframe = toolbox.doc.getElementById(`toolbox-panel-iframe-${toolId}`);
    ok(iframe, `The ${toolId} panel iframe exists`);

    info("Wait for the panel to be displayed / non-empty");
    await waitFor(
      () => iframe.contentDocument.body?.textContent.trim(),
      `The ${toolId} panel is not blank`
    );

    ok(
      !iframe.contentDocument.querySelector(".app-error-panel"),
      "AppErrorBoundary is not rendered in this panel"
    );
  }

  ok(
    !toolbox.doc.querySelector(".app-error-panel"),
    "AppErrorBoundary is not rendered in the toolbox"
  );

  await closeAboutDevtoolsToolbox(document, devtoolsTab, window);
  await runDevToolsServerCommand(config, "uninstall-extension", { addonId });
  await removeTab(tab);
});
