/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MonitorStore, MonitorStoreImpl } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/MonitorStore.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);
const { IndexedDB } = ChromeUtils.importESModule(
  "resource://gre/modules/IndexedDB.sys.mjs"
);
const { MAX_HISTORY_ENTRIES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs"
);

const MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF =
  "browser.smartwindow.monitorStore.removeDatabaseOnStartup";

registerCleanupFunction(async () => {
  await resetMonitorStore();
});

async function resetMonitorStore() {
  await MonitorStore.destroyDatabase();
  if (
    Services.prefs.prefHasUserValue(
      MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF
    )
  ) {
    Services.prefs.clearUserPref(MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF);
  }
}

async function writeRawMonitorRecords(records) {
  await MonitorStore.close();
  const db = await IndexedDB.open(
    MonitorStore.databaseName,
    MonitorStore.databaseVersion,
    database => {
      if (!database.objectStoreNames.contains(MonitorStore.objectStoreName)) {
        database.createObjectStore(MonitorStore.objectStoreName, {
          keyPath: "id",
        });
      }
    }
  );
  const transaction = db.transaction(MonitorStore.objectStoreName, "readwrite");
  const transactionComplete = transaction.promiseComplete();
  try {
    const store = transaction.objectStore(MonitorStore.objectStoreName);
    for (const record of records) {
      await store.put(record);
    }
    await transactionComplete;
  } catch (error) {
    transactionComplete.catch(() => {});
    throw error;
  } finally {
    db.close();
  }
}

function makeMonitor(options = {}) {
  const id = options.id ?? "monitor-1";
  return {
    id,
    title: options.title ?? "Price check",
    monitorPrompt: options.monitorPrompt ?? "Tell me when the price drops",
    watchUrls: options.watchUrls ?? [`https://example.com/${id}`],
    schedule: options.schedule ?? { type: "interval", hours: 6 },
    enabled: options.enabled ?? true,
    createdAt: options.createdAt ?? "2026-06-23T12:00:00.000Z",
    updatedAt: options.updatedAt ?? "2026-06-23T12:00:00.000Z",
    lastRunTime: options.lastRunTime ?? "2026-06-23T12:00:00.000Z",
    nextRunTime: options.nextRunTime ?? "2026-06-23T18:00:00.000Z",
    history: options.history ?? [],
  };
}

add_task(async function test_saveMonitor_persists_monitor_and_history() {
  await resetMonitorStore();

  const monitor = makeMonitor({
    id: "monitor-persisted",
    title: "Laptop sale",
    monitorPrompt: "Tell me when the laptop is below $900",
    watchUrls: [
      "https://example.com/laptop",
      "https://example.com/backup-laptop",
    ],
    schedule: { type: "weekly", weekday: 3, hour: 9, minute: 30 },
    enabled: false,
    history: [
      {
        id: "history-1",
        checkedAt: "2026-06-23T13:00:00.000Z",
        status: "success",
        resultExplanation: "The laptop is still $999.",
        conditionMet: false,
      },
      {
        id: "history-2",
        checkedAt: "2026-06-24T13:00:00.000Z",
        status: "success",
        resultExplanation: "The laptop is $899.",
        conditionMet: true,
      },
    ],
  });

  await MonitorStore.saveMonitor(monitor);
  await MonitorStore.close();

  Assert.deepEqual(
    await MonitorStore.listMonitors(),
    [monitor],
    "The monitor and run history persist through a real IndexedDB reopen."
  );
});

add_task(async function test_saveMonitor_normalizes_watch_urls() {
  await resetMonitorStore();

  const monitor = makeMonitor({
    id: "normalized-watch-urls",
    watchUrls: [" https://example.com/valid ", "about:config", "not a URL"],
  });
  await MonitorStore.saveMonitor(monitor);

  Assert.deepEqual(
    (await MonitorStore.listMonitors())[0].watchUrls,
    ["https://example.com/valid"],
    "Stored watch URLs use the monitor's shared normalization."
  );
});

add_task(async function test_saveMonitor_rejects_invalid_record_shapes() {
  await resetMonitorStore();

  await Assert.rejects(
    MonitorStore.saveMonitor(
      makeMonitor({ id: "invalid-enabled", enabled: "false" })
    ),
    /Monitor enabled state is invalid/,
    "Unexpected boolean values are not coerced."
  );
  await Assert.rejects(
    MonitorStore.saveMonitor(
      makeMonitor({ id: "invalid-date", updatedAt: "not-a-date" })
    ),
    /Monitor update timestamp is invalid/,
    "Invalid timestamps are rejected."
  );
  await Assert.rejects(
    MonitorStore.saveMonitor(
      makeMonitor({
        id: "invalid-schedule",
        schedule: { type: "interval", hours: "6" },
      })
    ),
    /Monitor schedule is invalid/,
    "Unexpected schedule value types are not coerced."
  );

  Assert.deepEqual(
    await MonitorStore.listMonitors(),
    [],
    "Invalid records are not written to the database."
  );

  const existing = makeMonitor({ id: "existing-monitor" });
  await MonitorStore.saveMonitor(existing);
  await Assert.rejects(
    MonitorStore.saveMonitors([
      makeMonitor({ id: "replacement-monitor" }),
      makeMonitor({ id: "invalid-replacement", enabled: "false" }),
    ]),
    /Monitor enabled state is invalid/,
    "A malformed bulk replacement is rejected before writing."
  );
  Assert.deepEqual(
    await MonitorStore.listMonitors(),
    [existing],
    "Rejected bulk validation does not clear existing data."
  );
});

add_task(async function test_listMonitors_isolates_corrupt_records() {
  await resetMonitorStore();

  const validMonitor = makeMonitor({
    id: "valid-monitor",
    createdAt: "2026-06-20T12:00:00.000Z",
  });
  await MonitorStore.saveMonitor(validMonitor);

  const history = Array.from(
    { length: MAX_HISTORY_ENTRIES + 2 },
    (_, index) => ({
      id: `history-${index}`,
      checkedAt: new Date(Date.UTC(2026, 5, 21, index)).toISOString(),
      status: "success",
      resultExplanation: `Result ${index}`,
      conditionMet: false,
    })
  );
  const recoverableMonitor = makeMonitor({
    id: "recoverable-monitor",
    createdAt: "2026-06-21T12:00:00.000Z",
    history: [null, ...history, { id: "invalid-history", status: "unknown" }],
  });
  const invalidEnabled = makeMonitor({
    id: "invalid-enabled",
    createdAt: "2026-06-22T12:00:00.000Z",
    enabled: "false",
  });
  const invalidTimestamp = makeMonitor({
    id: "invalid-timestamp",
    createdAt: "2026-06-23T12:00:00.000Z",
    updatedAt: "not-a-date",
  });
  await writeRawMonitorRecords([
    recoverableMonitor,
    invalidEnabled,
    invalidTimestamp,
  ]);

  const monitors = await MonitorStore.listMonitors();
  Assert.deepEqual(
    monitors.map(monitor => monitor.id),
    ["valid-monitor", "recoverable-monitor"],
    "Malformed records do not prevent valid records from loading."
  );
  Assert.equal(
    monitors[1].history.length,
    MAX_HISTORY_ENTRIES,
    "Oversized stored history is capped."
  );
  Assert.equal(
    monitors[1].history[0].id,
    "history-2",
    "Invalid entries are discarded and the newest history is retained."
  );
});

add_task(async function test_listMonitors_does_not_require_created_at_index() {
  await resetMonitorStore();

  const newer = makeMonitor({
    id: "newer-without-index",
    createdAt: "2026-06-23T12:00:00.000Z",
  });
  const older = makeMonitor({
    id: "older-without-index",
    createdAt: "2026-06-22T12:00:00.000Z",
  });
  await writeRawMonitorRecords([newer, older]);

  Assert.deepEqual(
    (await MonitorStore.listMonitors()).map(monitor => monitor.id),
    ["older-without-index", "newer-without-index"],
    "Records load and sort even when the current-version database lacks the index."
  );
});

add_task(async function test_shutdown_waits_for_pending_real_database_write() {
  await resetMonitorStore();

  const barrier = new AsyncShutdown.Barrier("MonitorStore test shutdown");
  let removeBlockerCalls = 0;
  const shutdownClient = {
    addBlocker: (...args) => barrier.client.addBlocker(...args),
    removeBlocker: (...args) => {
      removeBlockerCalls++;
      return barrier.client.removeBlocker(...args);
    },
  };
  const store = new MonitorStoreImpl(shutdownClient);
  const monitor = makeMonitor({ id: "saved-during-shutdown" });
  let writeFinished = false;
  const savePromise = store.saveMonitor(monitor).then(() => {
    writeFinished = true;
  });

  const shutdownPromise = barrier.wait().then(() => {
    Assert.ok(
      writeFinished,
      "Shutdown waits for the real database write to finish."
    );
  });

  await Assert.rejects(
    store.saveMonitor(makeMonitor({ id: "rejected-during-shutdown" })),
    /Monitor store is shutting down/,
    "Writes requested after shutdown begins are rejected."
  );
  await Assert.rejects(
    store.listMonitors(),
    /Monitor store is shutting down/,
    "Reads requested after shutdown begins are rejected."
  );
  await Promise.all([savePromise, shutdownPromise]);

  Assert.equal(
    removeBlockerCalls,
    0,
    "The running shutdown blocker is not explicitly removed."
  );

  const verificationBarrier = new AsyncShutdown.Barrier(
    "MonitorStore shutdown verification"
  );
  const verificationStore = new MonitorStoreImpl(verificationBarrier.client);
  try {
    Assert.deepEqual(
      await verificationStore.listMonitors(),
      [monitor],
      "The write protected by the shutdown blocker was persisted."
    );
  } finally {
    await verificationStore.close();
  }
});

add_task(async function test_late_shutdown_blocker_does_not_delete_database() {
  await resetMonitorStore();

  const monitor = makeMonitor({ id: "preserved-after-late-blocker" });
  await MonitorStore.saveMonitor(monitor);
  await MonitorStore.close();

  const closedBarrier = new AsyncShutdown.Barrier(
    "MonitorStore closed shutdown phase"
  );
  await closedBarrier.wait();
  const lateStore = new MonitorStoreImpl(closedBarrier.client);

  await Assert.rejects(
    lateStore.listMonitors(),
    /too late to register completion condition/,
    "Opening the store after its shutdown phase rejects."
  );
  Assert.deepEqual(
    await MonitorStore.listMonitors(),
    [monitor],
    "Failed blocker registration does not recreate the real database."
  );
});

add_task(async function test_listMonitors_orders_by_created_at() {
  await resetMonitorStore();

  const newer = makeMonitor({
    id: "newer",
    createdAt: "2026-06-23T12:00:00.000Z",
  });
  const older = makeMonitor({
    id: "older",
    createdAt: "2026-06-22T12:00:00.000Z",
  });

  await MonitorStore.saveMonitors([newer, older]);

  Assert.deepEqual(
    (await MonitorStore.listMonitors()).map(monitor => monitor.id),
    ["older", "newer"],
    "Monitors are listed oldest first."
  );
});

add_task(async function test_saveMonitor_updates_existing_monitor() {
  await resetMonitorStore();

  await MonitorStore.saveMonitor(
    makeMonitor({
      id: "monitor-updated",
      title: "Original title",
      history: [
        {
          id: "history-original",
          checkedAt: "2026-06-23T13:00:00.000Z",
          status: "success",
          resultExplanation: "Original run.",
          conditionMet: false,
        },
      ],
    })
  );

  const updated = makeMonitor({
    id: "monitor-updated",
    title: "Updated title",
    updatedAt: "2026-06-24T12:00:00.000Z",
    history: [
      {
        id: "history-updated",
        checkedAt: "2026-06-24T13:00:00.000Z",
        status: "error",
        resultExplanation: "Fetch failed.",
        conditionMet: false,
      },
    ],
  });

  await MonitorStore.saveMonitor(updated);

  Assert.deepEqual(
    await MonitorStore.listMonitors(),
    [updated],
    "Saving an existing monitor replaces its stored fields and history."
  );
});

add_task(async function test_deleteMonitor_removes_only_matching_monitor() {
  await resetMonitorStore();

  const remaining = makeMonitor({ id: "remaining" });
  await MonitorStore.saveMonitors([makeMonitor({ id: "deleted" }), remaining]);

  await MonitorStore.deleteMonitor("deleted");

  Assert.deepEqual(
    await MonitorStore.listMonitors(),
    [remaining],
    "Deleting a monitor leaves unrelated monitor records intact."
  );
});
