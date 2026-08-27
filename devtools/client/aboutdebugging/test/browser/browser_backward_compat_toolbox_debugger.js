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

const SCRIPT_FILE = "debugger.js";
// Marker on the line where the breakpoint should be set, in
// backward_compat_test_server/fixtures/debugger.js.
const BREAKPOINT_MARKER = "// BREAKPOINT";

// Check the Debugger against a remote target: the source of the remote page is
// listed, and a breakpoint is hit when the page is interacted with on the
// server. This mirrors the Debugger part of the "Inspect a remote target" step
// of the manual smoke test, see devtools/docs/contributor/release.md.
addCompatTask(async function (config) {
  const setup = await openCompatToolbox(config, "debugger.html");
  const { toolbox, serverHandle } = setup;

  info("Select the debugger");
  await toolbox.selectTool("jsdebugger");
  const dbg = createDebuggerContext(toolbox);

  info(`Wait for ${SCRIPT_FILE} to be listed`);
  await waitForSource(dbg, SCRIPT_FILE);

  info(`Select ${SCRIPT_FILE}`);
  await selectSource(dbg, SCRIPT_FILE);
  // selectSource only waits for the source to be selected, the breakpoint
  // cannot be set until its content has been fetched from the server.
  await waitForLoadedSource(dbg, SCRIPT_FILE);

  const breakpointLine = getMarkedLine(dbg);
  ok(breakpointLine, `Found the breakpoint marker on line ${breakpointLine}`);

  info(`Add a breakpoint on line ${breakpointLine}`);
  await addBreakpoint(dbg, SCRIPT_FILE, breakpointLine);

  info("Click on the button in the page on the server");
  const onClickDone = runDevToolsServerCommand(config, "click", {
    selector: "#click-me",
    handle: serverHandle,
  });

  info("Wait for the debugger to pause");
  await waitForPaused(dbg);
  const source = findSource(dbg, SCRIPT_FILE);
  await assertPausedAtSourceAndLine(dbg, source.id, breakpointLine);

  info("Resume");
  await resume(dbg);

  info("Wait for the click command to resolve");
  await onClickDone;

  await removeBreakpoint(dbg, source.id, breakpointLine);

  await closeCompatToolbox(config, setup);
});

/**
 * Retrieve the line number for the `// BREAKPOINT` comment in the source.
 *
 * @param {Debugger} dbg
 *        The debugger frontend instance.
 * @returns {number|null} Returns the 1-based line number of BREAKPOINT_MARKER
 *          in the selected source, or null if the marker was not found.
 */
function getMarkedLine(dbg) {
  const content = findSourceContent(dbg, SCRIPT_FILE);
  const lines = content.value.split("\n");
  const markerIndex = lines.findIndex(line => line.includes(BREAKPOINT_MARKER));
  if (markerIndex === -1) {
    return null;
  }

  return markerIndex + 1;
}
