// Verify that THREAD_STATE resources let DevTools interactively pause and resume
// a parent-process (chrome) worker via main-process (Browser Toolbox) commands,
// through the parent-process RemoteWorkerDebugger (bug 1944240).

"use strict";

const CHROME_WORKER_URL =
  "chrome://mochitests/content/browser/devtools/shared/commands/resource/tests/parent_worker_debugger_statement.js";

add_task(async function test_parent_worker_interactive_pause() {
  // We use a commands object for the main process
  await pushPref("devtools.chrome.enabled", true);
  await pushPref("dom.worker.remoteDebugger.enabled", true);
  await pushPref("devtools.debugger.threads-visible", true);

  // Browser Toolbox style: connect to the main process and watch workers.
  const commands = await CommandsFactory.forMainProcess();
  const { resourceCommand, targetCommand } =
    await _initResourceCommandFromCommands(commands, {
      listenForWorkers: true,
    });

  await commands.threadConfigurationCommand.updateConfiguration({
    skipBreakpoints: false,
  });

  const availableResources = [];
  await resourceCommand.watchResources([resourceCommand.TYPES.THREAD_STATE], {
    onAvailable: resources => availableResources.push(...resources),
  });

  info("Create a parent-process chrome worker");
  const chromeWorker = new ChromeWorker(CHROME_WORKER_URL);
  await new Promise(resolve => {
    chromeWorker.onmessage = e => {
      if (e.data === "ready") {
        resolve();
      }
    };
  });

  info("Wait for the worker target (so its thread actor is attached)");
  let workerTarget;
  await waitFor(() => {
    workerTarget = targetCommand
      .getAllTargets([targetCommand.TYPES.WORKER])
      .find(t => t.url === CHROME_WORKER_URL);
    return !!workerTarget;
  }, "the chrome worker target is available");

  // Ensure the thread front is attached/initialized before triggering.
  const threadFront = await workerTarget.getFront("thread");
  ok(threadFront, "Got the chrome worker's thread front.");

  info("Trigger the debugger statement in the worker");
  chromeWorker.postMessage("pause");

  await waitFor(
    () => availableResources.some(r => r.state === "paused"),
    "the parent-process worker paused on the debugger statement"
  );
  const paused = availableResources.find(r => r.state === "paused");
  ok(paused, "The parent-process worker paused interactively.");
  is(
    paused.why.type,
    "debuggerStatement",
    "Paused because of the debugger statement."
  );

  info("Resume the worker");
  await threadFront.resume();
  await waitFor(
    () => availableResources.some(r => r.state === "resumed"),
    "the worker resumed"
  );
  ok(true, "Parent-process worker resumed.");

  targetCommand.destroy();
  await commands.destroy();
});
