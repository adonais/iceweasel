/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

Services.prefs.setBoolPref("security.allow_eval_with_system_principal", true);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("security.allow_eval_with_system_principal");
});

var TAB_URL = EXAMPLE_URL + "doc_listworkers-tab.html";
var WORKER1_URL = "code_listworkers-worker1.js";
var WORKER2_URL = "code_listworkers-worker2.js";

add_task(async function test() {
  // This test enumerates a tab's workers through the content-process
  // nsIWorkerDebuggerManager (the legacy WindowGlobalTargetActor.listWorkers
  // path), which only lists workers whose debugger lives in the content
  // process. Force the local WorkerDebugger instead of the parent-process
  // RemoteWorkerDebugger (bug 1944240). Remove this pin (or the test) once the
  // local WorkerDebugger mechanism is removed; this legacy worker-introspection
  // path still needs to be modernized to the RemoteWorkerDebugger model.
  await pushPref("dom.worker.remoteDebugger.enabled", false);

  const tab = await addTab(TAB_URL);
  const target = await createAndAttachTargetForTab(tab);

  let { workers } = await listWorkers(target);
  is(workers.length, 0);

  let onWorkerListChanged = waitForWorkerListChanged(target);
  await SpecialPowers.spawn(tab.linkedBrowser, [WORKER1_URL], workerUrl => {
    content.worker1 = new content.Worker(workerUrl);
  });
  await onWorkerListChanged;

  ({ workers } = await listWorkers(target));
  is(workers.length, 1);
  is(workers[0].url, WORKER1_URL);

  onWorkerListChanged = waitForWorkerListChanged(target);
  await SpecialPowers.spawn(tab.linkedBrowser, [WORKER2_URL], workerUrl => {
    content.worker2 = new content.Worker(workerUrl);
  });
  await onWorkerListChanged;

  ({ workers } = await listWorkers(target));
  is(workers.length, 2);
  is(workers[0].url, WORKER1_URL);
  is(workers[1].url, WORKER2_URL);

  onWorkerListChanged = waitForWorkerListChanged(target);
  await SpecialPowers.spawn(tab.linkedBrowser, [WORKER2_URL], () => {
    content.worker1.terminate();
  });
  await onWorkerListChanged;

  ({ workers } = await listWorkers(target));
  is(workers.length, 1);
  is(workers[0].url, WORKER2_URL);

  onWorkerListChanged = waitForWorkerListChanged(target);
  await SpecialPowers.spawn(tab.linkedBrowser, [WORKER2_URL], () => {
    content.worker2.terminate();
  });
  await onWorkerListChanged;

  ({ workers } = await listWorkers(target));
  is(workers.length, 0);

  await target.destroy();
  finish();
});

function listWorkers(targetFront) {
  info("Listing workers.");
  return targetFront.listWorkers();
}

function waitForWorkerListChanged(targetFront) {
  info("Waiting for worker list to change.");
  return targetFront.once("workerListChanged");
}
