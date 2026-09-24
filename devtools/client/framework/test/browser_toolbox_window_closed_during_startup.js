/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Check that closing the DevTools window while the toolbox is still initializing
// does not prevent from reopening DevTools. See Bug 2044027.

const {
  LocalTabCommandsFactory,
} = require("resource://devtools/client/framework/local-tab-commands-factory.js");
const { Toolbox } = require("resource://devtools/client/framework/toolbox.js");

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
// Destroying the toolbox in the middle of its startup rejects the pending
// initialization requests.
PromiseTestUtils.allowMatchingRejectionsGlobally(/is already destroyed/);

const URL =
  "data:text/html;charset=utf8,test closing the toolbox window during startup";

add_task(async function () {
  const tab = await addTab(URL);
  const commands = await LocalTabCommandsFactory.createCommandsForTab(tab);

  let windowWasClosed = false;
  const { targetCommand } = commands;
  const startListening = targetCommand.startListening.bind(targetCommand);

  // Override startListening to be able to close the window while the toolbox
  // is initializing. Note: this assumes startListening is an early stop for
  // toolbox.open.
  targetCommand.startListening = async (...args) => {
    targetCommand.startListening = startListening;
    const res = await startListening(...args);

    const toolbox = gDevTools.getToolboxForCommands(commands);
    // Wait for React, which should mean the toolbox startup is already in progress.
    await toolbox.onReactLoaded;
    info("Close the DevTools window while the toolbox is initializing");
    await BrowserTestUtils.closeWindow(toolbox.topWindow);
    windowWasClosed = true;

    return res;
  };

  info("Open the toolbox in a separate window");
  const toolbox = await gDevTools.showToolbox(commands, {
    hostType: Toolbox.HostType.WINDOW,
  });

  // Check if the test actually exercised the expected scenario. If this fails,
  // the toolbox.open sequence probably changed.
  ok(windowWasClosed, "The DevTools window was closed during the startup");
  is(toolbox, null, "showToolbox did not return a toolbox");

  ok(
    !gDevTools.getToolboxForTab(tab),
    "The toolbox was destroyed after its window was closed"
  );

  info("Check that a new toolbox can be opened for the same tab");
  const newToolbox = await gDevTools.showToolboxForTab(tab, {
    hostType: Toolbox.HostType.BOTTOM,
  });
  ok(newToolbox, "A new toolbox was created for the tab");
  await newToolbox.destroy();

  gBrowser.removeCurrentTab();
});
