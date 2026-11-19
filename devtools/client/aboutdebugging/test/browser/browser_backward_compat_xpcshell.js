/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/debugger/test/mochitest/shared-head.js",
  this
);

// The client waits for the xpcshell harness to start, and may wait for it to
// exit when something fails.
requestLongerTimeout(2);

const MULTIPROCESS_TOOLBOX_NAME = "Multiprocess Toolbox";
// See backward_compat_test_server/fixtures/xpcshell/test_debug_me.js.
const TEST_FILE = "test_debug_me.js";

// Check that an xpcshell test run with --jsdebugger can be debugged. This
// mirrors the "Check xpcshell debugging" step of the manual smoke test, see
// devtools/docs/contributor/release.md.
addCompatTask(async function (config) {
  if (!config.xpcshell) {
    ok(
      true,
      `xpcshell debugging is not tested with the ${config.server} server`
    );
    return;
  }

  const { host } = await runDevToolsServerCommand(config, "start-xpcshell");

  await pushPref(
    "devtools.aboutdebugging.network-locations",
    JSON.stringify([host])
  );
  const { document, tab, window } = await openAboutDebugging();
  const isConnected = await connectToXpcshell(host, document);
  if (!isConnected) {
    const { exitCode } = await runDevToolsServerCommand(
      config,
      "wait-xpcshell"
    );
    ok(false, `Failed to connect to ${host}, xpcshell exited with ${exitCode}`);
    await removeTab(tab);
    return;
  }

  const { devtoolsTab, devtoolsWindow } = await openAboutDevtoolsToolbox(
    document,
    tab,
    window,
    MULTIPROCESS_TOOLBOX_NAME
  );
  const toolbox = getToolbox(devtoolsWindow);

  info("Select the debugger");
  await toolbox.selectTool("jsdebugger");
  const dbg = createDebuggerContext(toolbox);

  info("Wait for the test to pause on its first line");
  await waitForPaused(dbg);
  await waitForLoadedSource(dbg, TEST_FILE);
  const source = findSource(dbg, TEST_FILE);
  await assertPausedAtSourceAndLine(
    dbg,
    source.id,
    getMarkedLine(dbg, `"use strict"`)
  );

  const breakpointLine = getMarkedLine(dbg, "// BREAKPOINT");
  info(`Add a breakpoint on line ${breakpointLine} and resume`);
  await addBreakpoint(dbg, TEST_FILE, breakpointLine);
  await resume(dbg);
  await waitForPaused(dbg);
  await assertPausedAtSourceAndLine(dbg, source.id, breakpointLine);

  info("Step over");
  await stepOver(dbg);
  await assertPausedAtSourceAndLine(
    dbg,
    source.id,
    getMarkedLine(dbg, "// STEP")
  );

  info("Resume and wait for the xpcshell test to finish");
  await resume(dbg);
  const { exitCode } = await runDevToolsServerCommand(config, "wait-xpcshell");
  is(exitCode, 0, "The xpcshell test passed");

  await removeTab(devtoolsTab);
  await removeTab(tab);
});

/**
 * Retrieve the 1-based line number of the first line of the test file which
 * contains the provided text.
 */
function getMarkedLine(dbg, text) {
  const content = findSourceContent(dbg, TEST_FILE);
  const index = content.value
    .split("\n")
    .findIndex(line => line.includes(text));
  isnot(index, -1, `Found "${text}" in ${TEST_FILE}`);
  return index + 1;
}

/**
 * Same as connectToRuntime, but retries while the connection is refused.
 * "start-xpcshell" returns as soon as the xpcshell harness starts, before it
 * opens the DevTools server socket.
 *
 * @returns {boolean} Whether the connection succeeded.
 */
async function connectToXpcshell(host, document) {
  // Connection can take some time to setup, use 40 attempts, 0.5s apart.
  const MAX_ATTEMPTS = 40;
  const ATTEMPT_INTERVAL_MS = 500;
  const store = document.defaultView.AboutDebugging.store;

  const sidebarItem = await waitFor(
    () => findSidebarItemByText(host, document),
    `Wait until the sidebar item for ${host} appears`,
    // Use 100ms interval x 100 times for a total of 10 seconds
    100,
    100
  );

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    info(`Connect to ${host}, attempt ${attempt}`);
    const onConnected = waitForDispatch(store, "CONNECT_RUNTIME_SUCCESS");
    const onFailed = waitForDispatch(store, "CONNECT_RUNTIME_FAILURE");
    sidebarItem.querySelector(".qa-connect-button").click();

    const { type } = await Promise.race([onConnected, onFailed]);
    if (type == "CONNECT_RUNTIME_SUCCESS") {
      await waitFor(
        () => !sidebarItem.querySelector(".qa-connect-button"),
        "Wait for the connect button to disappear"
      );
      return true;
    }

    await wait(ATTEMPT_INTERVAL_MS);
  }

  return false;
}
