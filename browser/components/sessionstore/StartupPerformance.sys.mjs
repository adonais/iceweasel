/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const COLLECT_RESULTS_AFTER_MS = 10000;

const OBSERVED_TOPICS = [
  "sessionstore-restoring-on-startup",
  "sessionstore-initiating-manual-restore",
];

class _StartupPerformance {
  /**
   * Once we have finished restoring initial tabs, we broadcast on this topic.
   */
  RESTORED_TOPIC = "sessionstore-finished-restoring-initial-tabs";

  // Instant at which we have started restoration (notification "sessionstore-restoring-on-startup")
  #startTimeStamp = null;

  // Latest instant at which we have finished restoring a tab (DOM event "SSTabRestored")
  #latestRestoredTimeStamp = null;

  // A promise resolved once we have finished restoring all the startup tabs.
  #promiseFinished = null;

  // Function `resolve()` for `#promiseFinished`.
  #resolveFinished = null;

  // A timer
  #deadlineTimer = null;

  // `true` once the timer has fired
  #hasFired = false;

  // `true` once we are restored
  #isRestored = false;

  // Statistics on the session we need to restore.
  #totalNumberOfEagerTabs = 0;
  #totalNumberOfTabs = 0;
  #totalNumberOfWindows = 0;

  init() {
    for (let topic of OBSERVED_TOPICS) {
      Services.obs.addObserver(this, topic);
    }
  }

  /**
   * Return the timestamp at which we finished restoring the latest tab.
   *
   * This information is not really interesting until we have finished restoring
   * tabs.
   */
  get latestRestoredTimeStamp() {
    return this.#latestRestoredTimeStamp;
  }

  /**
   * `true` once we have finished restoring startup tabs.
   */
  get isRestored() {
    return this.#isRestored;
  }

  // Called when restoration starts.
  // Record the start timestamp, setup the timer and `this.#promiseFinished`.
  // Behavior is unspecified if there was already an ongoing measure.
  #onRestorationStarts(isAutoRestore) {
    ChromeUtils.addProfilerMarker("_onRestorationStarts");
    this.#latestRestoredTimeStamp = this.#startTimeStamp = Date.now();
    this.#totalNumberOfEagerTabs = 0;
    this.#totalNumberOfTabs = 0;
    this.#totalNumberOfWindows = 0;

    // While we may restore several sessions in a single run of the browser,
    // that's a very unusual case, and not really worth measuring, so let's
    // stop listening for further restorations.

    for (let topic of OBSERVED_TOPICS) {
      Services.obs.removeObserver(this, topic);
    }

    Services.obs.addObserver(this, "sessionstore-single-window-restored");
    this.#promiseFinished = new Promise(resolve => {
      this.#resolveFinished = resolve;
    });
    this.#promiseFinished.then(() => {
      try {
        this.#isRestored = true;
        Services.obs.notifyObservers(null, this.RESTORED_TOPIC);

        if (this.#latestRestoredTimeStamp == this.#startTimeStamp) {
          // Apparently, we haven't restored any tab.
          return;
        }

        // Once we are done restoring tabs, update Telemetry.
        let delta = this.#latestRestoredTimeStamp - this.#startTimeStamp;
        if (isAutoRestore) {
          Glean.sessionRestore.autoRestoreDurationUntilEagerTabsRestored.accumulateSingleSample(
            delta
          );
        } else {
          Glean.sessionRestore.manualRestoreDurationUntilEagerTabsRestored.accumulateSingleSample(
            delta
          );
        }
        Glean.sessionRestore.numberOfEagerTabsRestored.accumulateSingleSample(
          this.#totalNumberOfEagerTabs
        );
        Glean.sessionRestore.numberOfTabsRestored.accumulateSingleSample(
          this.#totalNumberOfTabs
        );
        Glean.sessionRestore.numberOfWindowsRestored.accumulateSingleSample(
          this.#totalNumberOfWindows
        );

        // Reset
        this.#startTimeStamp = null;
      } catch (ex) {
        console.error("StartupPerformance: error after resolving promise", ex);
      }
    });
  }

  #startTimer() {
    if (this.#hasFired) {
      return;
    }
    if (this.#deadlineTimer) {
      lazy.clearTimeout(this.#deadlineTimer);
    }
    this.#deadlineTimer = lazy.setTimeout(() => {
      try {
        this.#resolveFinished();
      } catch (ex) {
        console.error("StartupPerformance: Error in timeout handler", ex);
      } finally {
        // Clean up.
        this.#deadlineTimer = null;
        this.#hasFired = true;
        this.#resolveFinished = null;
        Services.obs.removeObserver(
          this,
          "sessionstore-single-window-restored"
        );
      }
    }, COLLECT_RESULTS_AFTER_MS);
  }

  observe(subject, topic) {
    try {
      switch (topic) {
        case "sessionstore-restoring-on-startup":
          this.#onRestorationStarts(true);
          break;
        case "sessionstore-initiating-manual-restore":
          this.#onRestorationStarts(false);
          break;
        case "sessionstore-single-window-restored":
          {
            // Session Restore has just opened a window with (initially empty) tabs.
            // Some of these tabs will be restored eagerly, while others will be
            // restored on demand. The process becomes usable only when all windows
            // have finished restored their eager tabs.
            //
            // While it would be possible to track the restoration of each tab
            // from within SessionRestore to determine exactly when the process
            // becomes usable, experience shows that this is too invasive. Rather,
            // we employ the following heuristic:
            // - we maintain a timer of `COLLECT_RESULTS_AFTER_MS` that we expect
            //   will be triggered only once all tabs have been restored;
            // - whenever we restore a new window (hence a bunch of eager tabs),
            //   we postpone the timer to ensure that the new eager tabs have
            //   `COLLECT_RESULTS_AFTER_MS` to be restored;
            // - whenever a tab is restored, we update
            //   `this.#latestRestoredTimeStamp`;
            // - after `COLLECT_RESULTS_AFTER_MS`, we collect the final version
            //   of `this.#latestRestoredTimeStamp`, and use it to determine the
            //   entire duration of the collection.
            //
            // Note that this heuristic may be inaccurate if a user clicks
            // immediately on a restore-on-demand tab before the end of
            // `COLLECT_RESULTS_AFTER_MS`. We assume that this will not
            // affect too much the results.
            //
            // Reset the delay, to give the tabs a little (more) time to restore.
            this.#startTimer();

            this.#totalNumberOfWindows += 1;

            // Observe the restoration of all tabs. We assume that all tabs of this
            // window will have been restored before `COLLECT_RESULTS_AFTER_MS`.
            // The last call to `observer` will let us determine how long it took
            // to reach that point.
            let win = subject;

            let observer = () => {
              ChromeUtils.addProfilerMarker("SSTabRestored");
              this.#latestRestoredTimeStamp = Date.now();
              this.#totalNumberOfEagerTabs += 1;
            };
            win.gBrowser.tabContainer.addEventListener(
              "SSTabRestored",
              observer
            );
            this.#totalNumberOfTabs += win.gBrowser.tabContainer.itemCount;

            // Once we have finished collecting the results, clean up the observers.
            this.#promiseFinished.then(() => {
              if (!win.gBrowser.tabContainer) {
                // May be undefined during shutdown and/or some tests.
                return;
              }
              win.gBrowser.tabContainer.removeEventListener(
                "SSTabRestored",
                observer
              );
            });
          }
          break;
        default:
          throw new Error(`Unexpected topic ${topic}`);
      }
    } catch (ex) {
      console.error("StartupPerformance error", ex, ex.stack);
      throw ex;
    }
  }
}

export const StartupPerformance = new _StartupPerformance();
