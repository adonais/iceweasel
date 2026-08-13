/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  MAX_HISTORY_ENTRIES,
  trimAndFilterWatchUrls,
} from "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AsyncShutdown: "resource://gre/modules/AsyncShutdown.sys.mjs",
  IndexedDB: "resource://gre/modules/IndexedDB.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    prefix: "MonitorStore",
    maxLogLevelPref: "browser.smartwindow.monitorStore.logLevel",
  })
);

const CURRENT_SCHEMA_VERSION = 1;
const DB_NAME = "monitor-store";
const MONITOR_STORE_NAME = "monitors";
const CREATED_AT_INDEX = "createdAt";
const PREF_BRANCH = "browser.smartwindow.monitorStore";
const HISTORY_STATUSES = new Set(["error", "running", "success"]);

function invalidField(field) {
  return new Error(`Monitor ${field} is invalid.`);
}

function stringField(value, field, allowEmpty = false) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value !== value.trim()
  ) {
    throw invalidField(field);
  }
  return value;
}

function timestampField(value, field, nullable = false) {
  if (nullable && value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw invalidField(field);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw invalidField(field);
  }
  return value;
}

function scheduleRecord(schedule) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    throw invalidField("schedule");
  }

  switch (schedule.type) {
    case "interval":
      if (!Number.isFinite(schedule.hours) || schedule.hours <= 0) {
        throw invalidField("schedule");
      }
      return { type: schedule.type, hours: schedule.hours };
    case "daily":
      if (
        !Number.isInteger(schedule.hour) ||
        schedule.hour < 0 ||
        schedule.hour > 23 ||
        !Number.isInteger(schedule.minute) ||
        schedule.minute < 0 ||
        schedule.minute > 59
      ) {
        throw invalidField("schedule");
      }
      return {
        type: schedule.type,
        hour: schedule.hour,
        minute: schedule.minute,
      };
    case "weekly":
      if (
        !Number.isInteger(schedule.weekday) ||
        schedule.weekday < 0 ||
        schedule.weekday > 6 ||
        !Number.isInteger(schedule.hour) ||
        schedule.hour < 0 ||
        schedule.hour > 23 ||
        !Number.isInteger(schedule.minute) ||
        schedule.minute < 0 ||
        schedule.minute > 59
      ) {
        throw invalidField("schedule");
      }
      return {
        type: schedule.type,
        weekday: schedule.weekday,
        hour: schedule.hour,
        minute: schedule.minute,
      };
    default:
      throw invalidField("schedule");
  }
}

function watchUrlRecords(watchUrls) {
  const normalizedUrls = trimAndFilterWatchUrls(watchUrls);
  if (!normalizedUrls.length) {
    throw invalidField("watch URLs");
  }
  return normalizedUrls;
}

function historyRecord(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw invalidField("history entry");
  }
  if (!HISTORY_STATUSES.has(entry.status)) {
    throw invalidField("history status");
  }
  if (typeof entry.resultExplanation !== "string") {
    throw invalidField("history result explanation");
  }
  if (typeof entry.conditionMet !== "boolean") {
    throw invalidField("history condition result");
  }

  return {
    id: stringField(entry.id, "history ID"),
    checkedAt: timestampField(entry.checkedAt, "history timestamp"),
    status: entry.status,
    resultExplanation: entry.resultExplanation,
    conditionMet: entry.conditionMet,
  };
}

function sanitizeHistoryRecords(history, recoverInvalid) {
  if (!Array.isArray(history)) {
    if (recoverInvalid) {
      lazy.log.warn("Discarding invalid stored monitor history.");
      return [];
    }
    throw invalidField("history");
  }

  const records = [];
  for (const entry of history) {
    try {
      records.push(historyRecord(entry));
    } catch (error) {
      if (!recoverInvalid) {
        throw error;
      }
      lazy.log.warn(`Discarding invalid stored history entry: ${error}`);
    }
  }
  if (records.length > MAX_HISTORY_ENTRIES) {
    if (!recoverInvalid) {
      throw invalidField("history");
    }
    return records.slice(-MAX_HISTORY_ENTRIES);
  }
  return records;
}

function sanitizeMonitorRecord(monitor, recoverInvalidHistory = false) {
  if (!monitor || typeof monitor !== "object" || Array.isArray(monitor)) {
    throw invalidField("record");
  }
  const title = monitor.title ?? "";
  if (typeof monitor.enabled !== "boolean") {
    throw invalidField("enabled state");
  }

  return {
    id: stringField(monitor.id, "ID"),
    title: stringField(title, "title", true),
    monitorPrompt: stringField(monitor.monitorPrompt, "prompt"),
    watchUrls: watchUrlRecords(monitor.watchUrls),
    schedule: scheduleRecord(monitor.schedule),
    enabled: monitor.enabled,
    createdAt: timestampField(monitor.createdAt, "creation timestamp"),
    updatedAt: timestampField(monitor.updatedAt, "update timestamp"),
    lastRunTime: timestampField(monitor.lastRunTime, "last run timestamp"),
    nextRunTime: timestampField(
      monitor.nextRunTime,
      "next run timestamp",
      true
    ),
    history: sanitizeHistoryRecords(
      monitor.history ?? [],
      recoverInvalidHistory
    ),
  };
}

function wrapRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isNewerSchemaError(error) {
  return error?.name === "VersionError";
}

/**
 * Persists monitor definitions and run history.
 */
class MonitorStoreImpl {
  #asyncShutdownBlocker;
  #db = null;
  #promiseDb = null;
  #promiseWrite = Promise.resolve();
  #shutdownClient;
  #shutdownBlockerAdded = false;
  #shuttingDown = false;

  constructor(shutdownClient = lazy.AsyncShutdown.profileBeforeChange) {
    this.#shutdownClient = shutdownClient;
    this.#asyncShutdownBlocker = async () => {
      this.#shuttingDown = true;
      try {
        await this.#promiseWrite;
        await this.#closeDatabaseConnection();
      } finally {
        this.#shutdownBlockerAdded = false;
      }
    };
  }

  async listMonitors() {
    this.#prepareForOperation();
    const db = await this.#ensureDatabase();
    const transaction = db.transaction(MONITOR_STORE_NAME, "readonly");
    const transactionComplete = transaction.promiseComplete();
    let records;
    try {
      records = await transaction.objectStore(MONITOR_STORE_NAME).getAll();
      await transactionComplete;
    } catch (error) {
      transactionComplete.catch(() => {});
      throw error;
    }

    const monitors = [];
    for (const record of records) {
      try {
        monitors.push(sanitizeMonitorRecord(record, true));
      } catch (error) {
        lazy.log.warn(`Skipping invalid stored monitor: ${error}`);
      }
    }
    return monitors.sort(
      (first, second) =>
        Date.parse(first.createdAt) - Date.parse(second.createdAt) ||
        first.id.localeCompare(second.id)
    );
  }

  async saveMonitor(monitor) {
    const record = sanitizeMonitorRecord(monitor);
    return this.#queueWrite(() =>
      this.#withWriteStore(store => store.put(record))
    );
  }

  async saveMonitors(monitors) {
    if (!Array.isArray(monitors)) {
      throw invalidField("collection");
    }
    const records = monitors.map(sanitizeMonitorRecord);
    return this.#queueWrite(() =>
      this.#withWriteStore(async store => {
        await store.clear();
        for (const record of records) {
          await store.put(record);
        }
      })
    );
  }

  async deleteMonitor(id) {
    const monitorId = stringField(id, "ID");
    return this.#queueWrite(() =>
      this.#withWriteStore(store => store.delete(monitorId))
    );
  }

  async destroyDatabase() {
    return this.#queueWrite(async () => {
      await this.#closeDatabaseConnection();
      await this.#deleteDatabase();
      this.#promiseDb = null;
    });
  }

  async close() {
    await this.#closeDatabaseConnection();
    if (!this.#shuttingDown) {
      this.#removeShutdownBlocker();
    }
  }

  async #closeDatabaseConnection() {
    if (!this.#db && this.#promiseDb) {
      await this.#promiseDb.catch(() => {});
    }

    this.#closeDatabase();
    this.#promiseDb = null;
  }

  async #withWriteStore(callback) {
    const db = await this.#ensureDatabase();
    const transaction = db.transaction(MONITOR_STORE_NAME, "readwrite");
    const transactionComplete = transaction.promiseComplete();
    try {
      await callback(transaction.objectStore(MONITOR_STORE_NAME));
      await transactionComplete;
    } catch (error) {
      transactionComplete.catch(() => {});
      try {
        transaction.abort();
      } catch (_) {}
      throw error;
    }
  }

  #queueWrite(task) {
    this.#prepareForOperation();
    const promise = this.#promiseWrite.then(task, task);
    this.#promiseWrite = promise.catch(() => {});
    return promise;
  }

  #prepareForOperation() {
    if (this.#shuttingDown) {
      throw new Error("Monitor store is shutting down.");
    }
    this.#addShutdownBlocker();
  }

  async #openDatabase() {
    this.#db = await lazy.IndexedDB.open(
      DB_NAME,
      CURRENT_SCHEMA_VERSION,
      (db, event) => {
        if (!db.objectStoreNames.contains(MONITOR_STORE_NAME)) {
          const store = db.createObjectStore(MONITOR_STORE_NAME, {
            keyPath: "id",
          });
          store.createIndex(CREATED_AT_INDEX, "createdAt");
          return;
        }

        const store = event.target.transaction.objectStore(MONITOR_STORE_NAME);
        if (!store.indexNames.contains(CREATED_AT_INDEX)) {
          store.createIndex(CREATED_AT_INDEX, "createdAt");
        }
      }
    );

    this.#db.onversionchange = () => {
      this.#closeDatabase();
      this.#promiseDb = null;
    };
    this.#db.onclose = () => {
      this.#db = null;
      this.#promiseDb = null;
    };
    return this.#db;
  }

  async #ensureDatabase() {
    if (this.#promiseDb) {
      return this.#promiseDb;
    }

    this.#promiseDb = (async () => {
      if (this.#removeDatabaseOnStartup) {
        this.#closeDatabase();
        await this.#deleteDatabase();
      }

      try {
        return await this.#openDatabase();
      } catch (error) {
        if (isNewerSchemaError(error)) {
          throw new Error(
            `Monitor store schema version is newer than supported version ${CURRENT_SCHEMA_VERSION}.`
          );
        }
        lazy.log.warn(`Error opening database: ${error}`);
        throw error;
      }
    })().catch(error => {
      this.#closeDatabase();
      this.#promiseDb = null;
      throw error;
    });

    return this.#promiseDb;
  }

  async #deleteDatabase() {
    try {
      await wrapRequest(lazy.IndexedDB.deleteDatabase(DB_NAME));
      this.#removeDatabaseOnStartup = false;
    } catch (error) {
      this.#removeDatabaseOnStartup = true;
      throw error;
    }
  }

  #closeDatabase() {
    if (!this.#db) {
      return;
    }

    const db = this.#db;
    db.onversionchange = null;
    db.onclose = null;
    try {
      db.close();
    } catch (error) {
      lazy.log.warn(`Error closing database: ${error.message}`);
    }
    this.#db = null;
  }

  #addShutdownBlocker() {
    if (this.#shutdownBlockerAdded) {
      return;
    }

    this.#shutdownClient.addBlocker(
      "MonitorStore: Shutdown",
      this.#asyncShutdownBlocker,
      {
        fetchState: () => ({
          databaseOpen: !!this.#db,
          shuttingDown: this.#shuttingDown,
        }),
      }
    );
    this.#shutdownBlockerAdded = true;
  }

  #removeShutdownBlocker() {
    if (!this.#shutdownBlockerAdded) {
      return;
    }

    this.#shutdownClient.removeBlocker(this.#asyncShutdownBlocker);
    this.#shutdownBlockerAdded = false;
  }

  get #removeDatabaseOnStartup() {
    return Services.prefs.getBoolPref(
      `${PREF_BRANCH}.removeDatabaseOnStartup`,
      false
    );
  }

  set #removeDatabaseOnStartup(value) {
    Services.prefs.setBoolPref(`${PREF_BRANCH}.removeDatabaseOnStartup`, value);
  }

  get databaseName() {
    return DB_NAME;
  }

  get databaseVersion() {
    return CURRENT_SCHEMA_VERSION;
  }

  get objectStoreName() {
    return MONITOR_STORE_NAME;
  }
}

const MonitorStore = new MonitorStoreImpl();
export { MonitorStore, MonitorStoreImpl };
