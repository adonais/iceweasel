/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

// Check the Netmonitor against a remote target: reloading the page on the
// server populates the request list.
addCompatTask(async function (config) {
  const setup = await openCompatToolbox(config, "debugger.html");
  const { toolbox, serverHandle } = setup;

  info("Select the netmonitor");
  const netmonitor = await toolbox.selectTool("netmonitor");
  const netmonitorDoc = netmonitor.panelWin.document;

  info("Reload the page on the server");
  await runDevToolsServerCommand(config, "reload", { handle: serverHandle });

  const getRequests = () =>
    Array.from(
      netmonitorDoc.querySelectorAll(".request-list-item"),
      row => row.textContent
    );

  info("Wait until the requests of the remote page are displayed");
  await waitFor(
    () => getRequests().some(text => text.includes("debugger.html")),
    "The debugger.html request should be displayed appear"
  );
  await waitFor(
    () => getRequests().some(text => text.includes("debugger.js")),
    "The debugger.js request should be displayed appear"
  );

  await closeCompatToolbox(config, setup);
});
