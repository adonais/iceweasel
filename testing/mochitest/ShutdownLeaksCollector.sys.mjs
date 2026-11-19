/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

// This listens for the message "browser-test:collect-request". When it gets it,
// it runs some GCs and CCs, then prints out a message indicating the collections
// are complete. Mochitest uses this information to determine when windows and
// docshells should be destroyed.

export var ContentCollector = {
  // Map<serial, {serial, address, type, outer, test, time}> of the windows created in
  // this process during a test, and not destroyed yet. Windows only send the
  // debug-domwindow-* notifications in debug builds.
  liveWindows: new Map(),
  windowsDestroyed: 0,

  init() {
    let processType = Services.appinfo.processType;
    if (processType == Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT) {
      // In the main process, we handle triggering collections in browser-test.js
      return;
    }

    Services.cpmm.addMessageListener("browser-test:collect-request", this);
    if (AppConstants.DEBUG) {
      Services.obs.addObserver(this, "debug-domwindow-created");
      Services.obs.addObserver(this, "debug-domwindow-destroyed");
      // The parent waits for the leak report of each process that has a
      // collector, see finish().
      Services.cpmm.sendAsyncMessage("browser-test:collector-ready");
    }
  },

  observe(subject, topic, data) {
    let info = {};
    for (let part of data.split(" ")) {
      let idx = part.indexOf("=");
      if (idx !== -1) {
        info[part.substring(0, idx)] = part.substring(idx + 1);
      }
    }
    if (topic === "debug-domwindow-created") {
      // The test file running in the parent, set by browser-test.js.
      info.test = Services.cpmm.sharedData.get("browser-test:current-test");
      if (!info.test) {
        return;
      }
      info.time = Date.now();
      this.liveWindows.set(info.serial, info);
    } else {
      this.windowsDestroyed++;
      this.liveWindows.delete(info.serial);
    }
  },

  receiveMessage(aMessage) {
    switch (aMessage.name) {
      case "browser-test:collect-request": {
        Cu.forceGC();
        Cu.forceCC();

        let shutdownCleanup = aCallback => {
          Cu.schedulePreciseShrinkingGC(() => {
            // Run the GC and CC a few times to make sure that as much
            // as possible is freed.
            Cu.forceGC();
            Cu.forceCC();
            aCallback();
          });
        };

        let extraRounds = 0;
        let round = () => {
          let before = this.windowsDestroyed;
          shutdownCleanup(() => {
            // Let the dispatched debug-domwindow-destroyed notifications land.
            Services.tm.dispatchToMainThread(() => {
              if (this.windowsDestroyed > before && extraRounds < 10) {
                extraRounds++;
                round();
                return;
              }
              this.finish();
            });
          });
        };

        shutdownCleanup(() => {
          setTimeout(round, 1000);
        });

        break;
      }
    }
  },

  async finish() {
    // The harness counts the windows destroyed after this line as leaked.
    let pid = Services.appinfo.processID;
    dump("Completed ShutdownLeaks collections in process " + pid + "\n");

    Services.cpmm.removeMessageListener("browser-test:collect-request", this);

    if (!AppConstants.DEBUG) {
      return;
    }

    // test_status records of the leaked windows, for the parent to log.
    let leaks = [];
    try {
      let leaked = [...this.liveWindows.values()];
      // An outer window whose inner window also leaked is the same leak.
      let innerOuterAddrs = new Set(
        leaked.filter(info => info.type === "inner").map(info => info.outer)
      );
      leaked = leaked.filter(
        info => info.type !== "outer" || !innerOuterAddrs.has(info.address)
      );
      // Capturing the CC graph runs one more CC, so only do it once the
      // harness has decided which windows leaked.
      if (leaked.length) {
        let { ShutdownLeakPathFinder } = ChromeUtils.importESModule(
          "chrome://mochikit/content/ShutdownLeakPathFinder.sys.mjs"
        );
        await new ShutdownLeakPathFinder().findAndPrintPaths(leaked, {
          info: message => dump(message + "\n"),
          logData(action, data) {
            data.stack = `[pid = ${pid}]\n${data.stack}`;
            leaks.push(data);
          },
        });
      }
    } finally {
      Services.cpmm.sendAsyncMessage("browser-test:collect-done", { leaks });
      Services.obs.removeObserver(this, "debug-domwindow-created");
      Services.obs.removeObserver(this, "debug-domwindow-destroyed");
    }
  },
};

ContentCollector.init();
