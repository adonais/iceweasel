"use strict";

/* exported TestWorkerWatcher */

ChromeUtils.defineESModuleGetters(this, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.sys.mjs",
});

// Ensure that the profile-after-change message has been notified,
// so that ServiceWokerRegistrar is going to be initialized,
// otherwise tests using a background service worker will fail.
// in debug builds because of an assertion failure triggered
// by ServiceWorkerRegistrar.cpp (due to not being initialized
// automatically on startup as in a real Firefox instance).
Services.obs.notifyObservers(
  null,
  "profile-after-change",
  "force-serviceworkerrestart-init"
);

// A test utility class used in the test case to watch for a given extension
// service worker being spawned and terminated (using the same kind of Firefox DevTools
// internals that about:debugging is using to watch the workers activity).
//
// NOTE: this helper class does also depends from the two jsm files where the
// Parent and Child TestWorkerWatcher actor is defined:
//
// - data/TestWorkerWatcherParent.sys.mjs
// - data/TestWorkerWatcherChild.sys.mjs
class TestWorkerWatcher extends ExtensionCommon.EventEmitter {
  JS_ACTOR_NAME = "TestWorkerWatcher";

  constructor(dataRelPath = "./data") {
    super();
    this.dataRelPath = dataRelPath;
    this.extensionProcess = null;
    this.extensionProcessActor = null;

    // When the parent-process remote worker debugger is enabled, the debuggers
    // for content-process workers are registered with the parent-process
    // WorkerDebuggerManager instead of the one living in the extension child
    // process. This helper already runs in the parent process, so in that case
    // we watch the parent-process manager directly and don't need the
    // content-process actor.
    if (this.useRemoteWorkerDebugger) {
      this.startWatchingWorkersInParent();
      return;
    }

    this.registerProcessActor();
    this.getAndWatchExtensionProcess();
    // Observer child process creation and shutdown if the extension
    // are meant to run in a child process.
    Services.obs.addObserver(this, "ipc:content-created");
    Services.obs.addObserver(this, "ipc:content-shutdown");
  }

  async destroy() {
    if (this.useRemoteWorkerDebugger) {
      this.stopWatchingWorkersInParent();
      return;
    }
    await this.stopWatchingWorkers();
    ChromeUtils.unregisterProcessActor(this.JS_ACTOR_NAME);
  }

  get useRemoteWorkerDebugger() {
    return Services.prefs.getBoolPref(
      "dom.worker.remoteDebugger.enabled",
      false
    );
  }

  get wdm() {
    return Cc["@mozilla.org/dom/workers/workerdebuggermanager;1"].getService(
      Ci.nsIWorkerDebuggerManager
    );
  }

  get swm() {
    return Cc["@mozilla.org/serviceworkers/manager;1"].getService(
      Ci.nsIServiceWorkerManager
    );
  }

  getRegistration(extension) {
    return this.swm.getRegistrationByPrincipal(
      extension.extension.principal,
      extension.extension.principal.spec
    );
  }

  watchExtensionServiceWorker(extension) {
    // These events are emitted by TestWatchExtensionWorkersParent.
    const promiseWorkerSpawned = this.waitForEvent("worker-spawned", extension);
    const promiseWorkerTerminated = this.waitForEvent(
      "worker-terminated",
      extension
    );

    // Terminate the worker sooner by settng the idle_timeout to 0,
    // then clear the pref as soon as the worker has been terminated.
    const terminate = () => {
      promiseWorkerTerminated.then(() => {
        Services.prefs.clearUserPref("dom.serviceWorkers.idle_timeout");
      });
      Services.prefs.setIntPref("dom.serviceWorkers.idle_timeout", 0);
      const swReg = this.getRegistration(extension);
      // If the active worker is already active, we have to make sure the new value
      // set on the idle_timeout pref is picked up by ServiceWorkerPrivate::ResetIdleTimeout.
      swReg.activeWorker?.attachDebugger();
      swReg.activeWorker?.detachDebugger();
      return promiseWorkerTerminated;
    };

    return {
      promiseWorkerSpawned,
      promiseWorkerTerminated,
      terminate,
    };
  }

  // Methods only used internally.

  waitForEvent(event, extension) {
    return new Promise(resolve => {
      const listener = (_eventName, data) => {
        if (!data.workerUrl.startsWith(extension.extension?.principal.spec)) {
          return;
        }
        this.off(event, listener);
        resolve(data);
      };

      this.on(event, listener);
    });
  }

  registerProcessActor() {
    const { JS_ACTOR_NAME } = this;
    ChromeUtils.registerProcessActor(JS_ACTOR_NAME, {
      parent: {
        esModuleURI: `resource://testing-common/${JS_ACTOR_NAME}Parent.sys.mjs`,
      },
      child: {
        esModuleURI: `resource://testing-common/${JS_ACTOR_NAME}Child.sys.mjs`,
      },
      safeForUntrustedWebProcess: true,
    });
  }

  startWatchingWorkers() {
    if (!this.extensionProcessActor) {
      return;
    }
    this.extensionProcessActor.eventEmitter = this;
    return this.extensionProcessActor.sendQuery("Test:StartWatchingWorkers");
  }

  stopWatchingWorkers() {
    if (!this.extensionProcessActor) {
      return;
    }
    this.extensionProcessActor.eventEmitter = null;
    return this.extensionProcessActor.sendQuery("Test:StopWatchingWorkers");
  }

  // Watch the parent-process WorkerDebuggerManager directly, used when the
  // remote worker debugger is enabled (see the constructor). The emitted events
  // match the ones forwarded by TestWorkerWatcherParent so that waitForEvent
  // works the same regardless of where the debugger is registered.
  startWatchingWorkersInParent() {
    if (this._parentWorkerDebuggerListener) {
      return;
    }
    const watcher = this;
    this._parentWorkerDebuggerListener = {
      onRegister(dbg) {
        watcher.emit("worker-spawned", {
          workerType: dbg.type,
          workerUrl: dbg.url,
        });
      },
      onUnregister(dbg) {
        watcher.emit("worker-terminated", {
          workerType: dbg.type,
          workerUrl: dbg.url,
        });
      },
    };
    this.wdm.addListener(this._parentWorkerDebuggerListener);
  }

  stopWatchingWorkersInParent() {
    if (this._parentWorkerDebuggerListener) {
      this.wdm.removeListener(this._parentWorkerDebuggerListener);
      this._parentWorkerDebuggerListener = null;
    }
  }

  getAndWatchExtensionProcess() {
    const extensionProcess = ChromeUtils.getAllDOMProcesses().find(p => {
      return p.remoteType === "extension";
    });
    if (extensionProcess !== this.extensionProcess) {
      this.extensionProcess = extensionProcess;
      this.extensionProcessActor = extensionProcess
        ? extensionProcess.getActor(this.JS_ACTOR_NAME)
        : null;
      this.startWatchingWorkers();
    }
  }

  observe() {
    // Keep the watched process and related test child process actor updated
    // when a process is created or destroyed.
    this.getAndWatchExtensionProcess();
  }
}
