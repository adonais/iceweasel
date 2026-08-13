/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const wdm = Cc["@mozilla.org/dom/workers/workerdebuggermanager;1"].getService(
  Ci.nsIWorkerDebuggerManager
);

const BASE_URL = "chrome://mochitests/content/browser/dom/workers/test/";
const WORKER_URL = BASE_URL + "WorkerDebugger.initialize_es_worker.js";
const DEBUGGER_URL =
  BASE_URL + "WorkerDebugger.initialize_debugger_es_worker.js";

async function doTest() {
  const onDbg = waitForRegister(WORKER_URL);
  const worker = new Worker(WORKER_URL, { type: "module" });

  info("Wait for worker message");
  await new Promise(resolve => (worker.onmessage = resolve));

  const dbg = await onDbg;

  info("Calling WorkerDebugger::Initialize");
  const onDebuggerScriptEvaluated = new Promise(resolve => {
    const listener = {
      onMessage(msg) {
        is(msg, "debugger script ran");
        dbg.removeListener(listener);
        resolve();
      },
    };
    dbg.addListener(listener);
  });
  dbg.initialize(DEBUGGER_URL);
  ok(true, "dbg.initialize didn't throw");

  info("Waiting for debugger script to be evaluated and dispatching a message");
  await onDebuggerScriptEvaluated;
}

// Run once per dom.worker.remoteDebugger.enabled value so the worker debugger
// is exercised against both the local WorkerDebugger and the parent-process
// RemoteWorkerDebugger (bug 1944240).
for (const remoteDebuggerEnabled of [false, true]) {
  add_task(async function test() {
    await SpecialPowers.pushPrefEnv({
      set: [["dom.worker.remoteDebugger.enabled", remoteDebuggerEnabled]],
    });
    info(
      "Running with dom.worker.remoteDebugger.enabled=" + remoteDebuggerEnabled
    );
    await doTest();
  });
}

function waitForRegister(url, dbgUrl) {
  return new Promise(function (resolve) {
    wdm.addListener({
      onRegister(dbg) {
        if (dbg.url !== url) {
          return;
        }
        ok(true, "Debugger with url " + url + " should be registered.");
        wdm.removeListener(this);
        resolve(dbg);
      },
    });
  });
}
