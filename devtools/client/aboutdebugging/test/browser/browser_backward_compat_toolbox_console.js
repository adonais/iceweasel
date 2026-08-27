/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from helper-backward-compat.js */
Services.scriptloader.loadSubScript(
  CHROME_URL_ROOT + "helper-backward-compat.js",
  this
);

// Check the Console against a remote target: messages logged before the toolbox
// was opened are displayed, and an expression typed in the input is evaluated.
// This mirrors the Console part of the "Inspect a remote target" step of the
// manual smoke test, see devtools/docs/contributor/release.md.
addCompatTask(async function (config) {
  // Evaluating with Enter only works when the input is not in editor mode.
  await pushPref("devtools.webconsole.input.editor", false);

  const setup = await openCompatToolbox(config, "debugger.html");
  const { toolbox, devtoolsWindow } = setup;

  info("Select the console");
  const { hud } = await toolbox.selectTool("webconsole");

  info("Check that the message logged by the remote page is displayed");
  await waitFor(() => findConsoleAPIMessage(hud, "script loaded"));
  ok(true, "The 'script loaded' message logged on the server is displayed");

  info("Type globalThis in the console input and evaluate it");
  hud.jsterm.focus();
  EventUtils.sendString("globalThis", devtoolsWindow);
  EventUtils.synthesizeKey("VK_RETURN", {}, devtoolsWindow);

  info("Wait for a message containing 'Window' to appear");
  await waitFor(
    () => findEvaluationResultMessage(hud, "Window"),
    "Evaluating globalThis on the remote target should return a Window object"
  );

  await closeCompatToolbox(config, setup);
});
