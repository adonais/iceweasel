// Verify that a parent-process (chrome) worker and the nested worker it spawns
// both register through the parent-process RemoteWorkerDebugger (bug 1944240),
// and that the nested worker's debugger URL is resolved to an absolute URL.

"use strict";

const BASE = "chrome://mochitests/content/browser/dom/workers/test/";
const CHROME_WORKER_URL = BASE + "nested_chrome_worker.js";
const NESTED_WORKER_URL = BASE + "nested_worker.js";

add_task(async function test_nested_parent_worker_is_remote() {
  await SpecialPowers.pushPrefEnv({
    set: [["dom.worker.remoteDebugger.enabled", true]],
  });

  const wdm = Cc["@mozilla.org/dom/workers/workerdebuggermanager;1"].getService(
    Ci.nsIWorkerDebuggerManager
  );

  info("Create a top-level chrome worker that spawns a nested worker");
  const chromeWorker = new ChromeWorker(CHROME_WORKER_URL);

  info("Wait for the nested worker to load");
  await new Promise(resolve => {
    chromeWorker.onmessage = e => {
      if (e.data === "nested:nested worker loaded") {
        resolve();
      }
    };
  });
  ok(true, "Nested parent worker loaded without deadlock or crash.");

  const debuggers = Array.from(wdm.getWorkerDebuggerEnumerator());
  const parentDbg = debuggers.find(d => d.url === CHROME_WORKER_URL);
  const nestedDbg = debuggers.find(d => d.url.endsWith("nested_worker.js"));

  ok(parentDbg, "Top-level chrome worker registered its debugger.");
  ok(nestedDbg, "Nested parent worker registered its debugger.");
  is(
    parentDbg?.isRemote,
    true,
    "Top-level chrome worker uses the RemoteWorkerDebugger."
  );
  is(
    nestedDbg?.isRemote,
    true,
    "Nested parent worker uses the RemoteWorkerDebugger."
  );
  // The nested worker registers off the main thread, so its URL is resolved
  // against the parent's resolved script URI; it must end up absolute.
  is(nestedDbg?.url, NESTED_WORKER_URL, "Nested worker URL is absolute.");

  chromeWorker.terminate();
});
