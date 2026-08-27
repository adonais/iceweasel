/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

/* import-globals-from helper-serviceworker.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-serviceworker.js",
  this
);

// Check that a service worker registered on the server appears in the runtime
// page, and that unregistering it from the client removes it.
addCompatTask(async function (config) {
  const swUrl = getCompatFixtureUrl("sw.js");

  const { document, tab } = await openAboutDebuggingWithCompatServer(config, {
    enableWorkerUpdates: true,
  });
  await connectToRuntime(config.host, document);
  await waitForRuntimePage(config.runtime.brandName, document);

  const handle = await openDevToolsServerTab(config, "sw.html");

  info("Wait until the service worker appears and is running");
  const targetElement = await waitForServiceWorkerRunning(swUrl, document);
  ok(targetElement, "The service worker registered on the server is displayed");

  const unregisterButton = targetElement.querySelector(".qa-unregister-button");
  ok(unregisterButton, "Found the unregister button for the service worker");

  info("Click on the unregister button");
  unregisterButton.click();

  info("Wait until the service worker is removed from the debug targets");
  await waitFor(
    () => !findDebugTargetByText(swUrl, document),
    "The service worker should be unregistered"
  );

  await closeDevToolsServerTab(config, handle);
  await removeTab(tab);
});
