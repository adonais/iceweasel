/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

const TAB_TITLE = "DevTools compat test tab";

// Check that tabs opened on the server appear in and disappear from the runtime
// page.
addCompatTask(async function (config) {
  const { document, tab } = await openAboutDebuggingWithCompatServer(config);
  await connectToRuntime(config.host, document);
  await waitForRuntimePage(config.runtime.brandName, document);

  const handle = await openDevToolsServerTab(config, "tab.html");

  info("Wait until the new tab is listed as a debug target");
  await waitFor(
    () => findDebugTargetByText(TAB_TITLE, document),
    "The tab opened on the server is displayed in the runtime page"
  );

  const tabsPane = getDebugTargetPane("Tabs", document);
  ok(
    tabsPane.textContent.includes(TAB_TITLE),
    "The tab is displayed in the Tabs pane"
  );

  const tabsCount = tabsPane.querySelectorAll(".qa-debug-target-item").length;

  await closeDevToolsServerTab(config, handle);

  info("Wait until the tab is removed from the debug targets");
  await waitFor(
    () => !findDebugTargetByText(TAB_TITLE, document),
    "The tab closed on the server is removed from the runtime page"
  );

  is(
    tabsPane.querySelectorAll(".qa-debug-target-item").length,
    tabsCount - 1,
    "Exactly one tab was removed from the list of tabs"
  );

  await removeTab(tab);
});
