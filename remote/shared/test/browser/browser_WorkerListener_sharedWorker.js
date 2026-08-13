/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/remote/shared/test/browser/workers/helper-workerlistener.js",
  this
);

const {
  registerWebDriverWorkerListenerActor,
  unregisterWebDriverWorkerListenerActor,
  workerListenerRegistry,
} = ChromeUtils.importESModule(
  "chrome://remote/content/shared/js-process-actors/WebDriverWorkerListenerActor.sys.mjs"
);

// Run once per dom.worker.remoteDebugger.enabled value so the worker listener
// is exercised against both the local WorkerDebugger and the parent-process
// RemoteWorkerDebugger (bug 1944240).
for (const remoteDebuggerEnabled of [false, true]) {
  describe(`WorkerListener for shared worker (remoteDebugger=${remoteDebuggerEnabled})`, function () {
    let registeredWorkers;
    let unregisteredWorkers;
    let onWorkerRegistered;
    let onWorkerUnregistered;

    beforeEach(async () => {
      await SpecialPowers.pushPrefEnv({
        set: [["dom.worker.remoteDebugger.enabled", remoteDebuggerEnabled]],
      });

      registeredWorkers = [];
      onWorkerRegistered = (name, worker) => registeredWorkers.push(worker);
      workerListenerRegistry.on("worker-registered", onWorkerRegistered);

      unregisteredWorkers = [];
      onWorkerUnregistered = (name, worker) => unregisteredWorkers.push(worker);
      workerListenerRegistry.on("worker-unregistered", onWorkerUnregistered);
    });

    afterEach(() => {
      workerListenerRegistry.off("worker-registered", onWorkerRegistered);
      workerListenerRegistry.off("worker-unregistered", onWorkerUnregistered);
      unregisterWebDriverWorkerListenerActor();

      gBrowser.removeAllTabsBut(gBrowser.tabs[0]);
    });

    it("Emits expected events for a single shared worker", async function test_sharedWorker() {
      info("Register the worker listener actors");
      registerWebDriverWorkerListenerActor();

      info("Create and select a new tab");
      const tab = BrowserTestUtils.addTab(gBrowser, SHARED_WORKER_TEST_PAGE);
      gBrowser.selectedTab = tab;
      const browser = tab.linkedBrowser;
      await BrowserTestUtils.browserLoaded(browser);

      info("Register the shared worker in the test page");
      await SpecialPowers.spawn(browser, [], () =>
        content.wrappedJSObject.registerSharedWorker()
      );

      const [worker] = await waitForWorkersByURL(
        registeredWorkers,
        SHARED_WORKER_URL,
        1
      );

      assertWorkerData(worker, {
        type: Ci.nsIWorkerDebugger.TYPE_SHARED,
        url: SHARED_WORKER_URL,
      });

      info("Reload the selected tab to unregister the worker");
      BrowserCommands.reload();
      await waitForWorkersByIds(unregisteredWorkers, [worker.id], 1);
    });
  });
}
