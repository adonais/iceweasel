/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

// Check that we can connect to the provisioned server and that its runtime page
// reports the expected application. This mirrors the "Basic connection" step of
// the manual smoke test, see devtools/docs/contributor/release.md.
addCompatTask(async function (config) {
  const { document, tab } = await openAboutDebuggingWithCompatServer(config);

  await connectToRuntime(config.host, document);
  await waitForRuntimePage(config.runtime.brandName, document);

  const runtimeInfo = document.querySelector(".qa-runtime-name");
  ok(runtimeInfo, "Runtime info is displayed");

  const runtimeInfoText = runtimeInfo.textContent;
  ok(
    runtimeInfoText.includes(config.runtime.brandName),
    `Runtime info shows the expected name: ${runtimeInfoText}`
  );
  ok(
    runtimeInfoText.includes(config.runtime.version),
    `Runtime info shows the expected version: ${runtimeInfoText}`
  );

  // We only ever test against servers which are supposed to be supported, so a
  // compatibility warning means the version range regressed.
  ok(
    !document.querySelector(".qa-compatibility-warning"),
    "No compatibility warning is displayed for this server"
  );

  await removeTab(tab);
});
