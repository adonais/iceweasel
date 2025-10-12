/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test that message source links for js errors and console API calls open in
// the jsdebugger when clicked.

"use strict";

// There are shutdown issues for which multiple rejections are left uncaught.
// See bug 1018184 for resolving these issues.
PromiseTestUtils.allowMatchingRejectionsGlobally(/Component not initialized/);
PromiseTestUtils.allowMatchingRejectionsGlobally(/this\.worker is null/);

const TEST_URI =
  "http://example.com/browser/devtools/client/webconsole/" +
  "test/browser/" +
  "test-stacktrace-location-debugger-link.html";

add_task(async function () {
  const hud = await openNewTabAndConsole(TEST_URI);
  const toolbox = gDevTools.getToolboxForTab(gBrowser.selectedTab);

  await testOpenFrameInDebugger(hud, toolbox, "console.trace()", 3);
  await testOpenFrameInDebugger(hud, toolbox, "myErrorObject", 3);
  await testOpenFrameInDebugger(hud, toolbox, "customSourceURL", 4);
});

async function testOpenFrameInDebugger(hud, toolbox, text, frameCount) {
  info(`Testing message with text "${text}"`);
  const messageNode = await waitFor(() => findConsoleAPIMessage(hud, text));
  const framesNode = await waitFor(() => messageNode.querySelector(".frames"));

  const frameNodes = framesNode.querySelectorAll(".frame");
  is(
    frameNodes.length,
    frameCount,
    "The message does have the expected number of frames in the stacktrace"
  );

  for (const frameNode of frameNodes) {
    await checkMousedownOnNode(hud, toolbox, frameNode);

    info("Selecting the console again");
    await toolbox.selectTool("webconsole");
  }
}

async function checkMousedownOnNode(hud, toolbox, frameNode) {
  info("checking click on node location");
  const onSourceInDebuggerOpened = once(hud, "source-in-debugger-opened");
  EventUtils.sendMouseEvent(
    { type: "click" },
    frameNode.querySelector(".location")
  );
  await onSourceInDebuggerOpened;

  const url = frameNode.querySelector(".filename").textContent;
  const dbg = toolbox.getPanel("jsdebugger");
  is(
    dbg._selectors.getSelectedSource(dbg._getState()).url,
    // The customSourceURL isn't resolved whereas it will be in the debugger
    URL.parse(url).href,
    `Debugger is opened at expected source url (${url})`
  );
}
