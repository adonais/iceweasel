/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Monitor,
  monitorAgeMs,
  trimAndFilterWatchUrls,
  urlListsEqual,
  TOTAL_NUM_MONITORS,
  MONITOR_ERROR_CODES,
  MONITOR_PROMPT_VERSION,
  MONITOR_AGENTS_CHANGED_TOPIC,
  MONITOR_CONDITION_MET_TOPIC,
} from "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs";
import { Schedule } from "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs";

export {
  Monitor,
  TOTAL_NUM_MONITORS,
  MAX_HISTORY_ENTRIES,
  MONITOR_PROMPT_VERSION,
  TOTAL_NUM_URLS_IN_MONITOR,
  MONITOR_AGENTS_CHANGED_TOPIC,
  MONITOR_CONDITION_MET_TOPIC,
} from "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  MonitorStore:
    "moz-src:///browser/components/aiwindow/models/agents/MonitorStore.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    prefix: "MonitorAgent",
    maxLogLevelPref: "browser.smartwindow.monitorAgent.logLevel",
  })
);

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(
      ["preview/aiWindow.ftl", "toolkit/branding/brandings.ftl"],
      true
    )
);

const AlertNotification = Components.Constructor(
  "@mozilla.org/alert-notification;1",
  "nsIAlertNotification",
  "initWithObject"
);

let gMonitors = null;
let gLoadPromise = null;
const gNotifiedRunIds = new Set();

export const NOTIFICATION_ACTIONS = {
  SNOOZE: "monitor-snooze",
  DISMISS: "monitor-dismiss",
};

function monitorTelemetryExtra(monitor) {
  return {
    monitors: gMonitors?.size ?? 0,
    urls: monitor.watchUrls.length,
    length: monitor.monitorPrompt.length,
    age: monitorAgeMs(monitor),
    schedule_type: monitor.schedule.type,
    prompt_version: MONITOR_PROMPT_VERSION,
    enabled: monitor.enabled,
  };
}

/**
 * Monitor Agent state and behavior.
 *
 * Monitor agent is responsible for managing the collection of monitors, including creating,
 * updating, deleting, and running them on a schedule.
 * It also handles persisting the monitor state to IndexedDB and notifying observers of changes.
 */
export const MonitorAgent = {
  async init() {
    await this._ensureLoaded();
    for (const monitor of gMonitors.values()) {
      monitor.restore();
      monitor.scheduleNextRun();
    }
  },

  uninit() {
    if (!gMonitors) {
      return;
    }

    for (const monitor of gMonitors.values()) {
      monitor.dispose();
    }
  },

  async listMonitors() {
    await this._ensureLoaded();
    return Array.from(gMonitors.values(), monitor => monitor.toSerializable());
  },

  /**
   * Creates a new monitor to watch specified URLs for condition changes.
   *
   * @param {object} options - Configuration for the new monitor
   * @param {string} options.prompt - The condition to monitor for
   * @param {string[]} options.watchUrls - Array of URLs to watch
   * @param {string} [options.pageTitle=""] - Optional title for the monitor
   * @param {object} options.schedule - Schedule configuration (type, hours, etc.)
   * @param {string} [options.source="unknown"] - Source of monitor creation for telemetry (e.g., "in_line_chat", "about_page", "test")
   * @returns {Promise<string>} The ID of the created monitor
   * @throws {Error} If the maximum number of monitors has been reached
   */
  async createMonitor({
    prompt,
    watchUrls,
    pageTitle = "",
    schedule,
    source = "unknown",
  }) {
    await this._ensureLoaded();
    if (gMonitors.size >= TOTAL_NUM_MONITORS) {
      throw new Error(
        `Cannot create more than ${TOTAL_NUM_MONITORS} monitors.`
      );
    }

    const monitor = new Monitor({
      title: pageTitle,
      monitorPrompt: prompt,
      watchUrls: trimAndFilterWatchUrls(watchUrls),
      schedule: Schedule.fromJSON(schedule),
    });
    try {
      gMonitors.set(monitor.id, monitor);
      await this._saveAndNotify(monitor);
    } catch (error) {
      gMonitors.delete(monitor.id);
      throw error;
    }
    monitor.scheduleNextRun();
    this._refreshInitialSnapshot(monitor);
    const telemetryData = monitorTelemetryExtra(monitor);
    telemetryData.source = source;
    Glean.smartWindow.monitorCreate.record(telemetryData);
    return monitor.id;
  },

  async updateMonitor(id, updates) {
    await this._ensureLoaded();
    const monitor = gMonitors.get(id);
    if (!monitor) {
      return;
    }

    const next = {
      enabled: monitor.enabled,
      monitorPrompt: monitor.monitorPrompt,
      nextRunTime: monitor.nextRunTime,
      schedule: monitor.schedule,
      title: monitor.title,
      watchUrls: monitor.watchUrls.slice(),
    };

    // clean up and validate updates
    if ("monitorPrompt" in updates) {
      next.monitorPrompt = String(updates.monitorPrompt ?? "").trim();
    }
    if ("watchUrls" in updates) {
      next.watchUrls = trimAndFilterWatchUrls(updates.watchUrls);
    }
    if ("title" in updates) {
      next.title = String(updates.title ?? "").trim();
    }
    if ("enabled" in updates) {
      next.enabled = !!updates.enabled;
    }
    if ("schedule" in updates) {
      next.schedule = Schedule.fromJSON(updates.schedule);
      // Base the next run on now rather than a possibly-stale lastRunTime so a
      // schedule edit can't resolve to a time in the past and fire immediately.
      next.nextRunTime = next.schedule
        .getNextRunTime(new Date().toISOString())
        .toISOString();
    } else if (!monitor.enabled && next.enabled) {
      // else if so we don't compute nextRunTime twice
      // Re-enabling: schedule the next run a full interval from now rather than
      // reusing a stale nextRunTime that may already be in the past.
      next.nextRunTime = next.schedule
        .getNextRunTime(new Date().toISOString())
        .toISOString();
    }

    if (!next.monitorPrompt || !next.watchUrls.length) {
      throw new Error("Monitor is invalid.");
    }

    // The stored snapshot is the baseline from when the user last committed
    // the monitor's definition, so any definition edit (title, prompt,
    // schedule, or watch URLs) replaces it with one captured at edit time.
    // Pause/resume toggles are not edits and keep the baseline.
    const scheduleChanged =
      "schedule" in updates &&
      JSON.stringify({ ...next.schedule }) !==
        JSON.stringify({ ...monitor.schedule });
    const definitionChanged =
      scheduleChanged ||
      next.monitorPrompt !== monitor.monitorPrompt ||
      next.title !== monitor.title ||
      !urlListsEqual(next.watchUrls, monitor.watchUrls);

    // save old in case the update fails, so we can restore it
    const previous = {
      enabled: monitor.enabled,
      initialSnapshot: monitor.initialSnapshot,
      monitorPrompt: monitor.monitorPrompt,
      nextRunTime: monitor.nextRunTime,
      schedule: monitor.schedule,
      title: monitor.title,
      updatedAt: monitor.updatedAt,
      watchUrls: monitor.watchUrls,
    };

    monitor.enabled = next.enabled;
    monitor.monitorPrompt = next.monitorPrompt;
    monitor.nextRunTime = next.nextRunTime;
    monitor.schedule = next.schedule;
    monitor.title = next.title;
    monitor.watchUrls = next.watchUrls;
    monitor.updatedAt = new Date().toISOString();
    if (definitionChanged) {
      // stop any in-flight capture so a stale baseline can't land post-edit
      monitor.cancelSnapshotCapture();
      monitor.initialSnapshot = null;
    }
    try {
      await this._saveAndNotify(monitor);
    } catch (error) {
      Object.assign(monitor, previous);
      throw error;
    }
    monitor.scheduleNextRun();
    if (definitionChanged) {
      this._refreshInitialSnapshot(monitor);
    }
    const telemetryExtra = monitorTelemetryExtra(monitor);
    Glean.smartWindow.monitorEdit.record(telemetryExtra);
    if (previous.enabled !== monitor.enabled) {
      const event = monitor.enabled
        ? Glean.smartWindow.monitorEnable
        : Glean.smartWindow.monitorDisable;
      event.record(telemetryExtra);
    }
  },

  /**
   * Pauses or unpauses a monitor by toggling its enabled state.
   *
   * @param {string} id - The monitor ID
   * @param {boolean} [pause] - Optional. If provided, sets enabled to !pause.
   *                            If not provided, toggles the current enabled state.
   * @returns {Promise<void>}
   */
  async pauseMonitor(id, pause) {
    await this._ensureLoaded();
    const monitor = gMonitors.get(id);
    if (!monitor) {
      throw new Error(`Monitor with id ${id} not found`);
    }

    // Determine the new enabled state
    let newEnabledState;
    if (pause === undefined) {
      // Toggle current state
      newEnabledState = !monitor.enabled;
    } else {
      // Set to opposite of pause (pause=true means enabled=false)
      newEnabledState = !pause;
    }

    // Use updateMonitor to handle the state change
    await this.updateMonitor(id, { enabled: newEnabledState });
  },

  async deleteMonitor(id) {
    await this._ensureLoaded();
    const monitor = gMonitors.get(id);
    if (!monitor) {
      return false;
    }

    try {
      monitor.dispose(MONITOR_ERROR_CODES.CANCELED);
      gMonitors.delete(id);
      await lazy.MonitorStore.deleteMonitor(id);
    } catch (error) {
      monitor.restore();
      gMonitors.set(id, monitor);
      monitor.scheduleNextRun();
      throw error;
    } finally {
      Services.obs.notifyObservers(null, MONITOR_AGENTS_CHANGED_TOPIC);
    }
    Glean.smartWindow.monitorDelete.record(monitorTelemetryExtra(monitor));
    return true;
  },

  async runNow(id) {
    await this._ensureLoaded();
    const monitor = gMonitors.get(id);
    if (!monitor) {
      return;
    }
    await monitor.run({ manual: true });
  },

  async _ensureLoaded() {
    if (gMonitors) {
      return;
    }
    if (gLoadPromise) {
      await gLoadPromise;
      return;
    }

    gLoadPromise = this._loadMonitors();
    try {
      await gLoadPromise;
    } finally {
      gLoadPromise = null;
    }
  },

  async _loadMonitors() {
    const monitors = new Map();
    for (const savedMonitor of await lazy.MonitorStore.listMonitors()) {
      if (monitors.size >= TOTAL_NUM_MONITORS) {
        break;
      }
      try {
        const monitor = Monitor.fromJSON(savedMonitor);
        monitors.set(monitor.id, monitor);
      } catch (error) {
        lazy.log.warn(`Skipping invalid stored monitor: ${error.message}`);
      }
    }

    gMonitors = monitors;

    // Treat history that already exists at load time as "seen" so restoring
    // monitors on startup doesn't replay old alerts as fresh notifications
    for (const monitor of monitors.values()) {
      for (const entry of monitor.history) {
        if (entry.conditionMet) {
          gNotifiedRunIds.add(entry.id);
        }
      }
    }
  },

  /**
   * Captures the monitor's initial snapshot in the background and persists it
   * once done. Never blocks creation or editing; failures are logged and the
   * monitor keeps working without a snapshot.
   *
   * @param {Monitor} monitor
   */
  _refreshInitialSnapshot(monitor) {
    monitor
      .ensureInitialSnapshot()
      .then(() => {
        // the monitor may have been deleted or replaced while capturing
        if (gMonitors?.get(monitor.id) === monitor) {
          return this._saveAndNotify(monitor);
        }
        return null;
      })
      .catch(error => {
        lazy.log.warn(
          `Failed to capture initial snapshot for monitor ${monitor.id}: ${
            error.message ?? error
          }`
        );
      });
  },

  async _saveAndNotify(monitor = null) {
    await this._ensureLoaded();
    // persisting a single known monitor avoids rewriting every monitor
    if (monitor && gMonitors.has(monitor.id)) {
      await lazy.MonitorStore.saveMonitor(monitor);
      // bulk path is only needed for migration and unscoped saves
    } else {
      await lazy.MonitorStore.saveMonitors(Array.from(gMonitors.values()));
    }
    Services.obs.notifyObservers(null, MONITOR_AGENTS_CHANGED_TOPIC);

    if (monitor) {
      this._notifyIfConditionMet(monitor);
    }
  },

  /**
   * Shows a desktop notification every time a monitor run meets its condition.
   * The notification carries two actions:
   *  - "snooze": hold off checks until the next day.
   *  - "dismiss": stop notifying while the monitor keeps running.
   * Clicking the body opens the watched page.
   *
   * Muting only silences the desktop notification: the condition-met topic is
   * still fired so the passive dot on the toolbar button stays accurate.
   *
   * @param {Monitor} monitor - The monitor whose latest run just saved
   */
  _notifyIfConditionMet(monitor) {
    const entry = monitor.history.at(-1);
    if (!entry || entry.status !== "success" || !entry.conditionMet) {
      return;
    }

    if (gNotifiedRunIds.has(entry.id)) {
      return;
    }
    gNotifiedRunIds.add(entry.id);

    Services.obs.notifyObservers(null, MONITOR_CONDITION_MET_TOPIC, monitor.id);

    if (monitor.notificationsMuted) {
      return;
    }

    const [titleFallback, bodyFallback, snoozeTitle, dismissTitle] =
      lazy.l10n.formatValuesSync([
        "ai-tasks-monitor-notification-title",
        "ai-tasks-monitor-notification-body",
        "ai-tasks-monitor-notification-snooze",
        "ai-tasks-monitor-notification-dismiss",
      ]);
    const title = monitor.title || titleFallback;
    const text = entry.resultExplanation || bodyFallback;
    const url = monitor.watchUrls[0];
    const id = monitor.id;

    try {
      const alertsService = Cc["@mozilla.org/alerts-service;1"].getService(
        Ci.nsIAlertsService
      );
      const observer = {
        observe: (subject, topic) => {
          if (topic !== "alertclickcallback") {
            return;
          }

          // Notification body clicked.
          if (!subject) {
            if (url) {
              // Record telemetry for opening URL
              const telemetryData = {
                ...monitorTelemetryExtra(monitor),
                click_type: "open_url",
              };
              Glean.smartWindow.monitorNotificationClick.record(telemetryData);

              this._openWatchedUrl(url);
            }
            return;
          }

          const action = subject.QueryInterface(Ci.nsIAlertAction).action;

          if (action === NOTIFICATION_ACTIONS.SNOOZE) {
            // Record telemetry for snooze action
            const telemetryData = {
              ...monitorTelemetryExtra(monitor),
              click_type: "snooze",
            };
            Glean.smartWindow.monitorNotificationClick.record(telemetryData);

            this.snoozeMonitor(id).catch(error =>
              lazy.log.error("Failed to snooze monitor", error)
            );
            return;
          }

          if (action === NOTIFICATION_ACTIONS.DISMISS) {
            // Record telemetry for dismiss action
            const telemetryData = {
              ...monitorTelemetryExtra(monitor),
              click_type: "dismiss",
            };
            Glean.smartWindow.monitorNotificationClick.record(telemetryData);

            this.muteMonitorNotifications(id).catch(error =>
              lazy.log.error("Failed to mute monitor notifications", error)
            );
          }
        },
      };

      const alert = new AlertNotification({
        title,
        text,
        textClickable: true,
        actions: [
          { action: NOTIFICATION_ACTIONS.SNOOZE, title: snoozeTitle },
          { action: NOTIFICATION_ACTIONS.DISMISS, title: dismissTitle },
        ],
      });

      alertsService.showAlert(alert, observer);

      // Record telemetry for notification being sent (after successful showAlert)
      Glean.smartWindow.monitorNotificationSend.record(
        monitorTelemetryExtra(monitor)
      );
    } catch (error) {
      lazy.log.error("Failed to show monitor notification", error);
    }
  },

  /**
   * Opens a watched url from a notification click in a browser window.
   * If the only window open is private or none is open at all
   * a fresh window is open with the watched url.
   *
   * @param {string} url - The URL to open
   */
  _openWatchedUrl(url) {
    const win = lazy.BrowserWindowTracker.getTopWindow({ private: false });
    if (win) {
      win.openTrustedLinkIn(url, "tab");
      return;
    }
    const args = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    args.data = url;
    lazy.BrowserWindowTracker.openWindow({ args });
  },

  /**
   * Snoozes a monitor for roughly a day. Blacks out the next 24h and then
   * resumes at the next time that matches the monitor's schedule
   *
   * @param {string} id - The monitor id
   */
  async snoozeMonitor(id) {
    await this._ensureLoaded();
    const monitor = gMonitors.get(id);
    if (!monitor) {
      return;
    }
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const blackoutEnd = Date.now() + ONE_DAY_MS;
    let next = monitor.schedule.getNextRunTime(monitor.lastRunTime);
    for (let i = 0; next.getTime() < blackoutEnd && i < 400; i++) {
      next = monitor.schedule.getNextRunTime(next.toISOString());
    }
    monitor.nextRunTime = next.toISOString();
    monitor.scheduleNextRun();
    await this._saveAndNotify(monitor);
  },

  /**
   * Stops desktop notifications for a monitor
   *
   * @param {string} id - The monitor id
   */
  async muteMonitorNotifications(id) {
    await this._ensureLoaded();
    const monitor = gMonitors.get(id);
    if (!monitor) {
      return;
    }
    monitor.notificationsMuted = true;
    await this._saveAndNotify(monitor);
  },

  _unloadForTesting() {
    this.uninit();
    gMonitors = null;
    gLoadPromise = null;
    gNotifiedRunIds.clear();
  },

  async _resetForTesting() {
    this._unloadForTesting();
    await lazy.MonitorStore.destroyDatabase();
  },

  _monitorCountForTelemetry() {
    return gMonitors?.size ?? 0;
  },
};
