/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function testJavascriptProtocolUrlInTrace() {
  const tab = await addTab(`data:text/html,Test :javascript in frame`);
  const hud = await openConsole(tab);

  const onPopupTabSelected = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "TabSelect"
  );
  const tracedMsg = await executeAndWaitForMessageByType(
    hud,
    `open("javascript:opener.console.trace('traced')")`,
    "traced",
    ".console-api"
  );
  await onPopupTabSelected;
  gBrowser.selectedTab = tab;

  const framesNode = await waitFor(() =>
    tracedMsg.node.querySelector(".frames")
  );
  const locationNode = framesNode
    .querySelector(".frame")
    .querySelector(".location");
  is(
    locationNode.textContent,
    `javascript:opener.console.trace('traced'):1`,
    "Got expected location node"
  );

  const tabCount = gBrowser.tabs.length;
  EventUtils.sendMouseEvent({ type: "click" }, locationNode);
  // Wait for a bit to make sure this would have the time to be consumed
  await wait(1000);
  is(
    gBrowser.tabs.length,
    tabCount,
    "Clicking on the link did not open a new tab"
  );
});
