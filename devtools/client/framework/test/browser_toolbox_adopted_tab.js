/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/webconsole/test/browser/shared-head.js",
  this
);
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/debugger/test/mochitest/shared-head.js",
  this
);

const URL =
  "data:text/html;charset=utf8,test for opening toolbox and moving it to another top level window <script>var foo = 1;</script>";

add_task(async function adoptTabToExistingWindow() {
  const tab = await addTab(URL);
  const toolbox = await gDevTools.showToolboxForTab(tab, {
    toolId: "webconsole",
  });

  const { hud } = toolbox.getCurrentPanel();
  hud.ui.wrapper.dispatchEvaluateExpression("++foo");
  info("Wait for a first evaluation in the console");
  await waitFor(() => findMessageByType(hud, "2", ".result"));

  const win = await BrowserTestUtils.openNewBrowserWindow();

  const onHostChanged = toolbox.once("host-changed");
  const adoptedTab = win.gBrowser.adoptTab(tab);
  info("Wait for DevTools to be moved to the new tab");
  await onHostChanged;
  const newTab = win.gBrowser.selectedTab;
  is(
    newTab,
    adoptedTab,
    "The adopted tab is the newly selected tab in the new top level window"
  );
  is(
    newTab,
    toolbox.commands.descriptorFront.localTab,
    "The toolbox's tab refers to the new window's selected tab"
  );

  hud.ui.wrapper.dispatchEvaluateExpression("++foo");
  info("Wait for a second evaluation in the console, in the new window");
  await waitFor(() => findMessageByType(hud, "3", ".result"));

  info("Try opening RDM from the new adopted tab");
  await openRDM(newTab);
  await closeRDM(newTab);

  info("Try opening the debugger");
  await toolbox.selectTool("jsdebugger");
  const dbg = createDebuggerContext(toolbox);
  await waitForSource(dbg, URL);
  await selectSource(dbg, URL);

  info("Close the toolbox via a key shortcut");
  const onToolboxClosed = toolbox.once("destroyed");
  const isMac = Services.appinfo.OS == "Darwin";
  EventUtils.synthesizeKey(
    "i",
    { accelKey: true, altKey: isMac, shiftKey: !isMac },
    win
  );
  await onToolboxClosed;

  info("Re-open the toolbox via the same key shortcut");
  const onToolboxReady = gDevTools.once("toolbox-ready");
  EventUtils.synthesizeKey(
    "i",
    { accelKey: true, altKey: isMac, shiftKey: !isMac },
    win
  );
  const newToolbox = await onToolboxReady;

  info("Close the new window and wait for the new toolbox to be closed");
  const onNewToolboxClosed = newToolbox.once("destroyed");
  await BrowserTestUtils.closeWindow(win);
  await onNewToolboxClosed;
});

add_task(async function adoptTabToNewWindow() {
  const tab = await addTab(URL);

  const toolbox = await gDevTools.showToolboxForTab(tab, {
    toolId: "webconsole",
  });

  const { hud } = toolbox.getCurrentPanel();
  hud.ui.wrapper.dispatchEvaluateExpression("++foo");
  info("Wait for a first evaluation in the console");
  await waitFor(() => findMessageByType(hud, "2", ".result"));

  const onHostChanged = toolbox.once("host-changed");
  // Passing the tab as new top window's arguments should adopt the tab
  const win = await BrowserTestUtils.openNewBrowserWindow({ args: tab });
  info("Wait for DevTools to be moved to the new tab");
  await onHostChanged;
  is(
    win.gBrowser.selectedTab,
    toolbox.commands.descriptorFront.localTab,
    "The toolbox's tab refers to the new window's selected tab"
  );

  hud.ui.wrapper.dispatchEvaluateExpression("++foo");
  info("Wait for a second evaluation in the console, in the new window");
  await waitFor(() => findMessageByType(hud, "3", ".result"));

  const onToolboxClosed = toolbox.once("destroyed");
  await BrowserTestUtils.closeWindow(win);
  await onToolboxClosed;
});

add_task(async function adoptTabUsingWindowHost() {
  const tab = await addTab(URL);
  const toolbox = await gDevTools.showToolboxForTab(tab, {
    toolId: "webconsole",
    hostType: Toolbox.HostType.WINDOW,
  });

  const { hud } = toolbox.getCurrentPanel();
  hud.ui.wrapper.dispatchEvaluateExpression("++foo");
  info("Wait for a first evaluation in the console");
  await waitFor(() => findMessageByType(hud, "2", ".result"));

  const win = await BrowserTestUtils.openNewBrowserWindow();

  info("Move the tab to the new window");
  const tabOpenPromise = BrowserTestUtils.waitForEvent(
    win.gBrowser.tabContainer,
    "TabOpen"
  );
  const adoptedTab = win.gBrowser.adoptTab(tab);
  await tabOpenPromise;
  win.gBrowser.selectedTab = adoptedTab;
  info("Wait for the descriptor front's localTab to be updated");
  await waitFor(
    () => toolbox.commands.descriptorFront.localTab == adoptedTab,
    "The toolbox's tab refers to the new window's selected tab"
  );

  hud.ui.wrapper.dispatchEvaluateExpression("++foo");
  info("Wait for a second evaluation in the console, in the new window");
  await waitFor(() => findMessageByType(hud, "3", ".result"));

  info("The toolbox toggle key shortcut should raise the toolbox");
  const isMac = Services.appinfo.OS == "Darwin";
  EventUtils.synthesizeKey(
    "i",
    { accelKey: true, altKey: isMac, shiftKey: !isMac },
    win
  );
  await waitFor(() => {
    return Services.focus.activeWindow == toolbox.topWindow;
  });

  info("Close the new window and wait for the new toolbox to be closed");
  const onNewToolboxClosed = toolbox.once("destroyed");
  await BrowserTestUtils.closeWindow(win);
  await onNewToolboxClosed;
});
