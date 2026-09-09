/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * @type {import("../AIWindowTestUtils.sys.mjs")}
 */
const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { MonitorAgent } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/MonitorAgent.sys.mjs"
);

const { Monitor, MONITOR_ERROR_CODES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs"
);

const { IntervalSchedule } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs"
);

const { MonitorStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/MonitorStore.sys.mjs"
);

const { PURPOSES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF =
  "browser.smartwindow.monitorStore.removeDatabaseOnStartup";

async function resetMonitorAgentForTesting() {
  await MonitorAgent._resetForTesting();
  if (
    Services.prefs.prefHasUserValue(
      MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF
    )
  ) {
    Services.prefs.clearUserPref(MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF);
  }
}

function makeStandaloneMonitor(watchUrls) {
  return new Monitor({
    title: "Error handling test",
    monitorPrompt: "Tell me when the price drops below $300.",
    watchUrls,
    schedule: new IntervalSchedule(1),
  });
}

add_task(async function test_timed_out_run_records_timeout_code() {
  const mockEngineManager = new MockEngineManager();

  const { url, server } = serveHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Page</title>
      </head>
      <body>
        <div>The price is $299</div>
      </body>
    </html>
  `);

  try {
    await resetMonitorAgentForTesting();
    const monitor = makeStandaloneMonitor([url]);

    // The mock engine never responds on its own, so the run times out. Don't
    // wait for the model request here: on slow platforms the 500ms budget can
    // expire during page extraction, before any model request exists, and the
    // run still has to record a timeout.
    await monitor.run({ manual: true, timeoutMs: 500 });

    const entry = monitor.history.at(-1);
    Assert.equal(entry.status, "error", "The timed out run is an error");
    Assert.equal(
      entry.errorCode,
      MONITOR_ERROR_CODES.TIMEOUT,
      "The timed out run records the timeout error code"
    );
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_canceled_run_records_canceled_code() {
  const mockEngineManager = new MockEngineManager();

  const { url, server } = serveHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Page</title>
      </head>
      <body>
        <div>The price is $299</div>
      </body>
    </html>
  `);

  try {
    await resetMonitorAgentForTesting();
    const monitor = makeStandaloneMonitor([url]);

    const runPromise = monitor.run({ manual: true });
    await mockEngineManager.captureRequest({ purpose: PURPOSES.MONITOR });
    monitor.dispose(MONITOR_ERROR_CODES.CANCELED);
    await runPromise;

    const entry = monitor.history.at(-1);
    Assert.equal(entry.status, "error", "The canceled run is an error");
    Assert.equal(
      entry.errorCode,
      MONITOR_ERROR_CODES.CANCELED,
      "A user-canceled run records the canceled error code"
    );
    Assert.ok(
      entry.resultExplanation.includes("canceled"),
      "The explanation says the check was canceled"
    );
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_disposed_run_records_interrupted_code() {
  const mockEngineManager = new MockEngineManager();

  const { url, server } = serveHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Page</title>
      </head>
      <body>
        <div>The price is $299</div>
      </body>
    </html>
  `);

  try {
    await resetMonitorAgentForTesting();
    const monitor = makeStandaloneMonitor([url]);

    const runPromise = monitor.run({ manual: true });
    await mockEngineManager.captureRequest({ purpose: PURPOSES.MONITOR });
    monitor.dispose();
    await runPromise;

    const entry = monitor.history.at(-1);
    Assert.equal(entry.status, "error", "The disposed run is an error");
    Assert.equal(
      entry.errorCode,
      MONITOR_ERROR_CODES.INTERRUPTED,
      "A run torn down without a cancel records the interrupted error code"
    );
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_empty_extraction_records_content_error() {
  const mockEngineManager = new MockEngineManager();

  const { url, server } = serveHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Empty Page</title>
      </head>
      <body></body>
    </html>
  `);

  try {
    await resetMonitorAgentForTesting();
    const monitor = makeStandaloneMonitor([url]);

    await monitor.run({ manual: true });

    const entry = monitor.history.at(-1);
    Assert.equal(entry.status, "error", "The empty extraction run is an error");
    Assert.equal(
      entry.errorCode,
      MONITOR_ERROR_CODES.CONTENT_EXTRACTION,
      "A page that extracts to no content records the extraction error code"
    );
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_partial_extraction_failure_still_runs() {
  const mockEngineManager = new MockEngineManager();

  const { url: emptyUrl, server: emptyServer } = serveHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Empty Page</title>
      </head>
      <body></body>
    </html>
  `);
  const { url: aliveUrl, server: aliveServer } = serveHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Page</title>
      </head>
      <body>
        <div>The price is $299</div>
      </body>
    </html>
  `);

  try {
    await resetMonitorAgentForTesting();
    const monitor = makeStandaloneMonitor([emptyUrl, aliveUrl]);

    const runPromise = monitor.run({ manual: true });
    const { respond } = await mockEngineManager.captureRequest({
      purpose: PURPOSES.MONITOR,
    });
    respond(
      JSON.stringify({
        explanation: "The price is still $299.",
        conditionMet: false,
      })
    );
    await runPromise;

    const entry = monitor.history.at(-1);
    Assert.equal(
      entry.status,
      "success",
      "A run with at least one readable page completes"
    );
    Assert.equal(
      entry.errorCode,
      undefined,
      "Successful runs carry no error code"
    );
  } finally {
    await new Promise(resolve => emptyServer.stop(resolve));
    await new Promise(resolve => aliveServer.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_error_code_persists_and_validates() {
  await resetMonitorAgentForTesting();

  const monitor = {
    id: "monitor-error-code",
    title: "Price check",
    monitorPrompt: "Tell me when the price drops",
    watchUrls: ["https://example.com/product"],
    schedule: { type: "interval", hours: 6 },
    enabled: true,
    createdAt: "2026-06-23T12:00:00.000Z",
    updatedAt: "2026-06-23T12:00:00.000Z",
    lastRunTime: "2026-06-23T12:00:00.000Z",
    nextRunTime: "2026-06-23T18:00:00.000Z",
    history: [
      {
        id: "history-error",
        checkedAt: "2026-06-23T13:00:00.000Z",
        status: "error",
        resultExplanation: "The page did not load in time.",
        conditionMet: false,
        errorCode: "timeout",
      },
    ],
    initialSnapshot: null,
  };
  await MonitorStore.saveMonitor(monitor);

  Assert.deepEqual(
    await MonitorStore.listMonitors(),
    [monitor],
    "The history error code round-trips through the store"
  );

  await Assert.rejects(
    MonitorStore.saveMonitor({
      ...monitor,
      id: "monitor-bogus-code",
      history: [{ ...monitor.history[0], errorCode: "made_up_code" }],
    }),
    /Monitor history error code is invalid/,
    "Unknown error codes are rejected on save"
  );

  await resetMonitorAgentForTesting();
});

add_task(async function test_interrupted_run_normalized_with_code_on_load() {
  await resetMonitorAgentForTesting();

  await MonitorStore.saveMonitor({
    id: "monitor-interrupted",
    title: "Price check",
    monitorPrompt: "Tell me when the price drops",
    watchUrls: ["https://example.com/product"],
    schedule: { type: "interval", hours: 6 },
    enabled: true,
    createdAt: "2026-06-23T12:00:00.000Z",
    updatedAt: "2026-06-23T12:00:00.000Z",
    lastRunTime: "2026-06-23T12:00:00.000Z",
    nextRunTime: "2026-06-23T18:00:00.000Z",
    history: [
      {
        id: "history-running",
        checkedAt: "2026-06-23T13:00:00.000Z",
        status: "running",
        resultExplanation: "",
        conditionMet: false,
      },
    ],
  });
  MonitorAgent._unloadForTesting();

  const [loaded] = await MonitorAgent.listMonitors();
  Assert.equal(
    loaded.history[0].status,
    "error",
    "A stale running entry is reconciled to an error on load"
  );
  Assert.equal(
    loaded.history[0].errorCode,
    MONITOR_ERROR_CODES.INTERRUPTED,
    "The reconciled entry records the interrupted error code"
  );

  await resetMonitorAgentForTesting();
});
