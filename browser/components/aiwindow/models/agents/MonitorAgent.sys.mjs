/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  Monitor,
  monitorAgeMs,
  trimAndFilterWatchUrls,
  TOTAL_NUM_MONITORS,
  MONITOR_PROMPT_VERSION,
  MONITOR_AGENTS_CHANGED_TOPIC,
} from "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs";
import { Schedule } from "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs";

export {
  Monitor,
  TOTAL_NUM_MONITORS,
  MAX_HISTORY_ENTRIES,
  MONITOR_PROMPT_VERSION,
  TOTAL_NUM_URLS_IN_MONITOR,
  MONITOR_AGENTS_CHANGED_TOPIC,
} from "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MonitorStore:
    "moz-src:///browser/components/aiwindow/models/agents/MonitorStore.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    prefix: "MonitorAgent",
    maxLogLevelPref: "browser.smartwindow.monitorAgent.logLevel",
  })
);

let gMonitors = null;
let gLoadPromise = null;

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

  async createMonitor({ prompt, watchUrls, pageTitle = "", schedule }) {
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
    Glean.smartWindow.monitorCreate.record(monitorTelemetryExtra(monitor));
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

    // save old in case the update fails, so we can restore it
    const previous = {
      enabled: monitor.enabled,
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
    try {
      await this._saveAndNotify(monitor);
    } catch (error) {
      Object.assign(monitor, previous);
      throw error;
    }
    monitor.scheduleNextRun();
    const telemetryExtra = monitorTelemetryExtra(monitor);
    Glean.smartWindow.monitorEdit.record(telemetryExtra);
    if (previous.enabled !== monitor.enabled) {
      const event = monitor.enabled
        ? Glean.smartWindow.monitorEnable
        : Glean.smartWindow.monitorDisable;
      event.record(telemetryExtra);
    }
  },

  async deleteMonitor(id) {
    await this._ensureLoaded();
    const monitor = gMonitors.get(id);
    if (!monitor) {
      return false;
    }

    try {
      monitor.dispose();
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
  },

  _unloadForTesting() {
    this.uninit();
    gMonitors = null;
    gLoadPromise = null;
  },

  async _resetForTesting() {
    this._unloadForTesting();
    await lazy.MonitorStore.destroyDatabase();
  },

  _monitorCountForTelemetry() {
    return gMonitors?.size ?? 0;
  },
};
