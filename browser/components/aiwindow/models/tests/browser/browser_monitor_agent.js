/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * @type {import("../../../../../../toolkit/components/ml/tests/MLTestUtils.sys.mjs")}
 */
const { MLTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLTestUtils.sys.mjs"
);

/**
 * @type {import("../AIWindowTestUtils.sys.mjs")}
 */
const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { MonitorAgent, NOTIFICATION_ACTIONS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/MonitorAgent.sys.mjs"
);

const { PURPOSES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const {
  Monitor,
  TOTAL_NUM_MONITORS,
  TOTAL_NUM_URLS_IN_MONITOR,
  trimAndFilterWatchUrls,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs"
);

const { IntervalSchedule } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs"
);

const { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

/**
 * Replaces the platform alerts service with a mock that records shown alerts
 * and their observers, so tests can simulate action-button clicks.
 *
 * @returns {{ alerts: object[], observers: object[], cleanup: () => void }}
 */
function mockAlertsService() {
  const alerts = [];
  const observers = [];
  const service = {
    QueryInterface: ChromeUtils.generateQI(["nsIAlertsService"]),
    showAlert(alert, observer) {
      alerts.push(alert);
      observers.push(observer);
    },
    closeAlert() {},
  };
  const cid = MockRegistrar.register("@mozilla.org/alerts-service;1", service);
  return {
    alerts,
    observers,
    cleanup: () => MockRegistrar.unregister(cid),
  };
}

/**
 * Builds a fake nsIAlertAction that the notification observer can query, used
 * to simulate the user clicking one of the notification's action buttons.
 *
 * @param {string} action
 * @returns {object}
 */
function fakeAlertAction(action) {
  return {
    action,
    QueryInterface: ChromeUtils.generateQI(["nsIAlertAction"]),
  };
}

const MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF =
  "browser.smartwindow.monitorStore.removeDatabaseOnStartup";

/**
 * Reset the MonitorAgent to a clean state for testing.
 * This clears all monitors and history, and resets the MonitorStore database.
 */
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

/**
 * Create a monitor watching a single URL and return its serializable snapshot.
 *
 * @param {string[]} urls
 * @param {string} prompt
 * @returns {Promise<object>}
 */
async function createMonitorWatching(urls, prompt) {
  await MonitorAgent.createMonitor({
    prompt,
    watchUrls: urls,
    schedule: { type: "interval", hours: 1 },
    source: "test",
  });
  const monitors = await MonitorAgent.listMonitors();
  return monitors.at(-1);
}

add_task(async function test_run_single_url_monitor() {
  // create mock LLM endpoint
  const mockEngineManager = new MockEngineManager();

  // serve a simple HTML page with a price in the body
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
    // create a monitor that watches the page and runs every hour
    await resetMonitorAgentForTesting();
    const monitor = await createMonitorWatching(
      [url],
      "Check if the product price is below $300."
    );
    Assert.equal(
      (await MonitorAgent.listMonitors()).length,
      1,
      "The monitor was created"
    );

    // run the monitor now and check that the extracted page content is included in the prompt sent to the mock LLM
    const runPromise = MonitorAgent.runNow(monitor.id);

    // intercept the request to the mock LLM and check that it includes the extracted page content
    const { request, respond } = await mockEngineManager.captureRequest({
      purpose: PURPOSES.MONITOR,
    });

    // make sure there are no tools in the request, since the monitor agent does not use any tools
    Assert.deepEqual(
      request.tools,
      [],
      "The monitor model request does not include any tools"
    );

    const serializedRequest = JSON.stringify(request.args);
    Assert.ok(
      serializedRequest.includes("The price is $299"),
      "The monitor model request includes the extracted page content"
    );
    Assert.ok(
      serializedRequest.includes(url),
      "The monitor model request includes the watched URL"
    );
    Assert.ok(
      serializedRequest.includes("Check if the product price is below $300."),
      "The monitor model request includes the user prompt"
    );

    // respond to the mock LLM with a conditionMet result
    respond(
      JSON.stringify({
        explanation: "The product was below $300, so the condition was met.",
        conditionMet: true,
      })
    );

    // wait for the runNow promise to resolve
    await runPromise;

    // check that the monitor history was updated with the run result
    const savedMonitor = (await MonitorAgent.listMonitors()).at(-1);
    Assert.equal(savedMonitor.history.length, 1, "The run is stored");
    Assert.equal(savedMonitor.history[0].status, "success");
    Assert.equal(savedMonitor.history[0].conditionMet, true);
    Assert.equal(
      savedMonitor.history[0].resultExplanation,
      "The product was below $300, so the condition was met."
    );
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_run_multiple_urls_monitor() {
  // create mock LLM endpoint
  const mockEngineManager = new MockEngineManager();

  // serve two simple HTML pages with prices in the body
  const { url: url1, server: server1 } = serveHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Page 1</title>
      </head>
      <body>
        <div>The price is $299</div>
      </body>
    </html>
  `);
  const { url: url2, server: server2 } = serveHTML(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Page 2</title>
      </head>
      <body>
        <div>The price is $399</div>
      </body>
    </html>
  `);

  try {
    // create a monitor that watches both pages and runs every hour
    await resetMonitorAgentForTesting();
    const monitor = await createMonitorWatching(
      [url1, url2],
      "Check if any product price is below $300."
    );
    Assert.equal(
      (await MonitorAgent.listMonitors()).length,
      1,
      "The monitor was created"
    );

    // run the monitor now and check that the extracted page content is included in the prompt sent to the mock LLM
    const runPromise = MonitorAgent.runNow(monitor.id);

    // intercept the request to the mock LLM and check that it includes the extracted page content
    const { request, respond } = await mockEngineManager.captureRequest({
      purpose: PURPOSES.MONITOR,
    });

    // make sure there are no tools in the request, since the monitor agent does not use any tools
    Assert.deepEqual(
      request.tools,
      [],
      "The monitor model request does not include any tools"
    );

    const serializedRequest = JSON.stringify(request.args);
    Assert.ok(
      serializedRequest.includes("The price is $299"),
      "The monitor model request includes the extracted page content from the first URL"
    );
    Assert.ok(
      serializedRequest.includes("The price is $399"),
      "The monitor model request includes the extracted page content from the second URL"
    );
    Assert.ok(
      serializedRequest.includes(url1),
      "The monitor model request includes the first watched URL"
    );
    Assert.ok(
      serializedRequest.includes(url2),
      "The monitor model request includes the second watched URL"
    );
    Assert.ok(
      serializedRequest.includes("Check if any product price is below $300."),
      "The monitor model request includes the user prompt"
    );

    // respond to the mock LLM with a conditionMet result
    respond(
      JSON.stringify({
        explanation:
          "The first product was below $300, so the condition was met.",
        conditionMet: true,
      })
    );

    // wait for the runNow promise to resolve
    await runPromise;

    // check that the monitor history was updated with the run result
    const savedMonitor = (await MonitorAgent.listMonitors()).at(-1);
    Assert.equal(savedMonitor.history.length, 1, "The run is stored");
    Assert.equal(savedMonitor.history[0].status, "success");
    Assert.equal(savedMonitor.history[0].conditionMet, true);
    Assert.equal(
      savedMonitor.history[0].resultExplanation,
      "The first product was below $300, so the condition was met."
    );
  } finally {
    await new Promise(resolve => server1.stop(resolve));
    await new Promise(resolve => server2.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(
  async function test_monitor_run_parses_fenced_json_and_records_not_met() {
    const mockEngineManager = new MockEngineManager();
    const { url, server } = serveHTML(`
      <article>
        <h1>Widget Store</h1>
        <p>
          The featured widget remains at its regular price for now, with no
          promotions currently scheduled for the coming days.
        </p>
        <p>
          The current price is still twelve dollars, unchanged since last week,
          and there is no indication of an upcoming discount.
        </p>
      </article>
    `);
    try {
      const monitor = await createMonitorWatching(
        [url],
        "Tell me when the widget price drops below 10 dollars."
      );
      const runPromise = MonitorAgent.runNow(monitor.id);
      const { respond } = await mockEngineManager.captureRequest({
        purpose: PURPOSES.MONITOR,
      });
      // A real model commonly wraps JSON in a Markdown code fence. Exercising
      // the fence-stripping through the real run (rather than calling
      // parseMonitorResult directly) proves it is wired into runMonitorCheck.
      respond(
        "```json\n" +
          JSON.stringify({
            explanation: "The price is still 12 dollars, above the threshold.",
            conditionMet: false,
          }) +
          "\n```"
      );
      await runPromise;
      const [updated] = await MonitorAgent.listMonitors();
      const lastRun = updated.history.at(-1);
      Assert.equal(lastRun.status, "success", "The run succeeded.");
      Assert.equal(
        lastRun.conditionMet,
        false,
        "The fenced JSON result was parsed and recorded the unmet condition."
      );
      Assert.equal(
        lastRun.resultExplanation,
        "The price is still 12 dollars, above the threshold.",
        "The explanation was extracted from the fenced JSON."
      );
    } finally {
      await new Promise(resolve => server.stop(resolve));
      mockEngineManager.cleanupMocks();
      await resetMonitorAgentForTesting();
    }
  }
);

add_task(function test_Monitor_parseMonitorResult() {
  const monitor = new Monitor({
    monitorPrompt: "Watch for a price drop.",
    watchUrls: ["https://example.com/product"],
    schedule: new IntervalSchedule(10),
  });

  const validUntrimmed = JSON.stringify({
    explanation: "  The price dropped.  ",
    conditionMet: true,
  });
  Assert.deepEqual(
    monitor.parseMonitorResult({ finalOutput: validUntrimmed }),
    {
      explanation: "The price dropped.",
      conditionMet: true,
    },
    "Raw JSON is parsed and its explanation is trimmed."
  );

  const fence =
    "```json\n" +
    JSON.stringify({
      explanation: "The price is unchanged.",
      conditionMet: false,
    }) +
    "\n```";
  Assert.deepEqual(
    monitor.parseMonitorResult({ finalOutput: fence }),
    {
      explanation: "The price is unchanged.",
      conditionMet: false,
    },
    "JSON in a Markdown code fence is parsed."
  );

  const noFence = JSON.stringify({
    explanation: "The price dropped.",
    conditionMet: true,
  });
  Assert.deepEqual(
    monitor.parseMonitorResult({ finalOutput: noFence }),
    {
      explanation: "The price dropped.",
      conditionMet: true,
    },
    "A result with an invalid shape falls back to the raw response."
  );

  const invalidShape =
    '{"explanation":"The price dropped.","conditionMet":"yes"}';
  Assert.deepEqual(
    monitor.parseMonitorResult({ finalOutput: invalidShape }),
    {
      explanation: invalidShape,
      conditionMet: false,
    },
    "A result with an invalid shape falls back to the raw response."
  );

  const malformedOutput = "The model returned plain text.";
  Assert.deepEqual(
    monitor.parseMonitorResult({ finalOutput: malformedOutput }),
    {
      explanation: malformedOutput,
      conditionMet: false,
    },
    "Malformed output falls back to a not-met result."
  );

  Assert.deepEqual(
    monitor.parseMonitorResult({}),
    {
      explanation:
        "The monitor check completed, but no model response was returned.",
      conditionMet: false,
    },
    "A missing model response uses the default explanation."
  );
});

add_task(function test_Monitor_constructor_normalizes_and_validates_input() {
  const monitor = new Monitor({
    id: "monitor-id",
    title: "  Sale watcher  ",
    monitorPrompt: "  tell me when it ships  ",
    watchUrls: [
      " https://example.com/a ",
      "about:config",
      "",
      "http://example.com/insecure",
      "https://example.com/b",
    ],
    schedule: new IntervalSchedule(10),
    enabled: false,
    createdAt: "2026-06-23T12:00:00.000Z",
  });

  Assert.equal(monitor.id, "monitor-id");
  Assert.equal(monitor.title, "Sale watcher");
  Assert.equal(monitor.monitorPrompt, "tell me when it ships");
  Assert.deepEqual(monitor.watchUrls, [
    "https://example.com/a",
    "http://example.com/insecure",
    "https://example.com/b",
  ]);
  Assert.equal(monitor.enabled, false);
  Assert.equal(monitor.updatedAt, monitor.createdAt);
  Assert.equal(monitor.lastRunTime, monitor.createdAt);
  Assert.equal(typeof monitor.nextRunTime, "string");

  Assert.throws(
    () =>
      new Monitor({
        monitorPrompt: "prompt",
        watchUrls: ["https://example.com"],
        schedule: {},
      }),
    /Monitor schedule is invalid/
  );
  Assert.throws(
    () =>
      new Monitor({
        monitorPrompt: "prompt",
        watchUrls: [],
        schedule: new IntervalSchedule(10),
      }),
    /Monitor is invalid/
  );
  Assert.throws(
    () =>
      new Monitor({
        monitorPrompt: "prompt",
        watchUrls: ["about:config"],
        schedule: new IntervalSchedule(10),
      }),
    /Monitor is invalid/
  );
});

add_task(function test_trimAndFilterWatchUrls() {
  Assert.deepEqual(
    trimAndFilterWatchUrls([
      " https://example.com/secure ",
      "http://example.com/insecure",
      "HTTPS://example.com/uppercase",
      "ftp://example.com/file",
      "about:config",
    ]),
    [
      "https://example.com/secure",
      "http://example.com/insecure",
      "HTTPS://example.com/uppercase",
    ],
    "Watch URLs are trimmed and limited to valid HTTP(S) URLs."
  );
  Assert.deepEqual(
    trimAndFilterWatchUrls([
      "file:///tmp/file",
      "javascript:alert(1)",
      "not a URL",
      "",
      null,
    ]),
    [],
    "Invalid and disallowed watch URLs are filtered out."
  );

  for (const urls of [null, undefined, "https://example.com"]) {
    Assert.deepEqual(
      trimAndFilterWatchUrls(urls),
      [],
      "A non-array watch URL value is normalized to an empty array."
    );
  }

  const tooManyUrls = Array.from(
    { length: TOTAL_NUM_URLS_IN_MONITOR + 1 },
    (_, index) => `https://example.com/${index}`
  );
  Assert.throws(
    () => trimAndFilterWatchUrls(tooManyUrls),
    new RegExp(
      `Cannot watch more than ${TOTAL_NUM_URLS_IN_MONITOR} URLs in a monitor\\.`
    ),
    "More than the maximum number of watch URLs is rejected."
  );
});

add_task(function test_Monitor_fromJSON_supports_proper_fields() {
  const monitor = Monitor.fromJSON({
    id: "stored-id",
    title: "Stored title",
    monitorPrompt: "Stored prompt",
    watchUrls: ["https://example.com/stored"],
    schedule: { type: "interval", hours: 20 },
    lastRunTime: "2026-06-23T10:00:00.000Z",
  });

  Assert.equal(monitor.id, "stored-id");
  Assert.equal(monitor.title, "Stored title");
  Assert.equal(monitor.monitorPrompt, "Stored prompt");
  Assert.deepEqual(monitor.watchUrls, ["https://example.com/stored"]);
  Assert.equal(monitor.schedule.hours, 20);
  Assert.equal(monitor.lastRunTime, "2026-06-23T10:00:00.000Z");

  Assert.throws(() => Monitor.fromJSON({}), /Monitor is invalid/);
});

add_task(function test_Monitor_fromJSON_normalizes_loaded_history() {
  const savedMonitor = {
    id: "stored-id",
    monitorPrompt: "Stored prompt",
    watchUrls: ["https://example.com/stored"],
    schedule: { type: "interval", hours: 20 },
    history: [
      {
        id: "completed-run",
        checkedAt: "2026-06-23T10:00:00.000Z",
        status: "success",
        resultExplanation: "The condition was met.",
        conditionMet: true,
      },
      {
        id: "interrupted-run",
        checkedAt: "2026-06-23T11:00:00.000Z",
        status: "running",
        resultExplanation: "",
        conditionMet: true,
      },
    ],
  };

  const monitor = Monitor.fromJSON(savedMonitor);

  Assert.deepEqual(
    monitor.history,
    [
      savedMonitor.history[0],
      {
        ...savedMonitor.history[1],
        status: "error",
        resultExplanation: "Monitor check was interrupted before it finished.",
        conditionMet: false,
        errorCode: "interrupted",
      },
    ],
    "A running history entry is converted to an interrupted error."
  );
  Assert.deepEqual(
    savedMonitor.history[1],
    {
      id: "interrupted-run",
      checkedAt: "2026-06-23T11:00:00.000Z",
      status: "running",
      resultExplanation: "",
      conditionMet: true,
    },
    "Normalizing history does not modify the saved entry."
  );

  const monitorWithInvalidHistory = Monitor.fromJSON({
    ...savedMonitor,
    id: "stored-id-with-invalid-history",
    history: null,
  });
  Assert.deepEqual(
    monitorWithInvalidHistory.history,
    [],
    "Invalid saved history is normalized to an empty array."
  );
});

add_task(function test_categorizeError() {
  const { categorizeError } = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs"
  );

  // Test network errors
  Assert.equal(
    categorizeError(new Error("Network request failed")),
    "network_error",
    "Network errors are categorized correctly"
  );
  Assert.equal(
    categorizeError("Fetch failed: connection refused"),
    "network_error",
    "Fetch failed errors are categorized as network errors"
  );

  // Test timeout errors
  Assert.equal(
    categorizeError(new Error("Request timeout after 30 seconds")),
    "timeout",
    "Timeout errors are categorized correctly"
  );

  // Test rate limit errors
  Assert.equal(
    categorizeError("Rate limit exceeded, please try again later"),
    "rate_limit",
    "Rate limit errors are categorized correctly"
  );
  Assert.equal(
    categorizeError(new Error("Quota exceeded for API calls")),
    "rate_limit",
    "Quota errors are categorized as rate limit"
  );

  // Test auth errors
  Assert.equal(
    categorizeError(new Error("Authentication failed")),
    "auth_error",
    "Authentication errors are categorized correctly"
  );
  Assert.equal(
    categorizeError("Unauthorized: Invalid API key"),
    "auth_error",
    "Unauthorized errors are categorized as auth errors"
  );

  // Test content extraction errors
  Assert.equal(
    categorizeError(new Error("Failed to extract page content")),
    "content_extraction_error",
    "Content extraction errors are categorized correctly"
  );
  Assert.equal(
    categorizeError("Unable to parse HTML response"),
    "content_extraction_error",
    "Parse errors are categorized as content extraction errors"
  );

  // Test interrupted errors
  Assert.equal(
    categorizeError(new Error("Monitor check was interrupted")),
    "interrupted",
    "Interrupted errors are categorized correctly"
  );
  Assert.equal(
    categorizeError("Request aborted by user"),
    "interrupted",
    "Abort errors are categorized as interrupted"
  );

  // Test model/API errors
  Assert.equal(
    categorizeError(new Error("Model API returned error 500")),
    "model_error",
    "Model API errors are categorized correctly"
  );
  Assert.equal(
    categorizeError("API endpoint not found"),
    "model_error",
    "API errors are categorized as model errors"
  );

  // Test status-based categorization (MLPA errors carry a status or encode
  // it in the message instead of descriptive text)
  const withStatus = (msg, status) => Object.assign(new Error(msg), { status });
  Assert.equal(
    categorizeError(withStatus("MLPA request failed", 429)),
    "rate_limit",
    "429 status is categorized as rate limit regardless of message"
  );
  Assert.equal(
    categorizeError(new Error("Request failed: 429 status code")),
    "rate_limit",
    "A 429 encoded in the message text is categorized as rate limit"
  );
  Assert.equal(
    categorizeError(withStatus("MLPA request failed", 401)),
    "auth_error",
    "401 status is categorized as an auth error"
  );
  Assert.equal(
    categorizeError(withStatus("MLPA request failed", 403)),
    "auth_error",
    "403 status is categorized as an auth error"
  );
  Assert.equal(
    categorizeError(withStatus("MLPA request failed", 408)),
    "timeout",
    "408 status is categorized as a timeout"
  );
  Assert.equal(
    categorizeError(new Error("Request failed: 503 status code")),
    "model_error",
    "A server error encoded in the message is categorized as a model error"
  );
  Assert.equal(
    categorizeError(withStatus("Internal server error", 500)),
    "model_error",
    "5xx status is categorized as a model error"
  );

  // Test unknown errors
  Assert.equal(
    categorizeError(new Error("Something unexpected happened")),
    "unknown_error",
    "Unrecognized errors are categorized as unknown"
  );
  Assert.equal(
    categorizeError("Random error message"),
    "unknown_error",
    "Generic errors are categorized as unknown"
  );

  // Test that sensitive info would be categorized, not returned
  const sensitiveError =
    "Failed to connect to https://internal.api.com/v1/secret-key-12345";
  Assert.equal(
    categorizeError(sensitiveError),
    "network_error",
    "Sensitive URL info is not returned, just the category"
  );

  // Verify the result is always one of the predefined codes
  const validCodes = [
    "network_error",
    "timeout",
    "rate_limit",
    "auth_error",
    "content_extraction_error",
    "interrupted",
    "model_error",
    "unknown_error",
  ];
  const result = categorizeError("any random error");
  Assert.ok(
    validCodes.includes(result),
    "Result is always one of the predefined safe codes"
  );
});

add_task(async function test_monitor_limits_watch_urls() {
  try {
    // create a monitor that watches more than the allowed number of URLs
    const watchUrls = Array.from(
      { length: 20 },
      (_, i) => `https://example.com/page${i}`
    );
    await resetMonitorAgentForTesting();
    await Assert.rejects(
      MonitorAgent.createMonitor({
        prompt: "Check if any product price is below $300.",
        watchUrls,
        schedule: { type: "interval", hours: 1 },
        source: "test",
      }),
      /Cannot watch more than \d+ URLs in a monitor\./,
      `The monitor should limit the number of watch URLs to ${TOTAL_NUM_URLS_IN_MONITOR}`
    );
    Assert.deepEqual(await MonitorAgent.listMonitors(), []);
  } finally {
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_createMonitor_returns_id() {
  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG(); // Reset telemetry for testing

    const id = await MonitorAgent.createMonitor({
      prompt: "Check if any product price is below $300.",
      watchUrls: ["https://example.com/product"],
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    Assert.equal(typeof id, "string", "createMonitor resolves to a string id");
    const monitors = await MonitorAgent.listMonitors();
    Assert.equal(
      monitors.at(-1).id,
      id,
      "returned id matches the created monitor"
    );

    // Test telemetry was recorded
    const events = Glean.smartWindow.monitorCreate.testGetValue();
    Assert.ok(events, "monitor_create event was recorded");
    Assert.equal(events.length, 1, "One monitor_create event was recorded");
    Assert.equal(
      events[0].extra.source,
      "test",
      "monitor_create event has correct source"
    );
    Assert.equal(
      events[0].extra.urls,
      "1",
      "monitor_create event has correct url count"
    );
  } finally {
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_limit_number_of_monitors() {
  try {
    // create more monitors than the allowed number
    const watchUrls = Array.from(
      { length: 2 },
      (_, i) => `https://example.com/page${i}`
    );
    await resetMonitorAgentForTesting();
    for (let i = 0; i < TOTAL_NUM_MONITORS; i++) {
      await MonitorAgent.createMonitor({
        prompt: "Check if any product price is below $300.",
        watchUrls,
        schedule: { type: "interval", hours: 1 },
        source: "test",
      });
    }
    await Assert.rejects(
      MonitorAgent.createMonitor({
        prompt: "Check if any product price is below $300.",
        watchUrls,
        schedule: { type: "interval", hours: 1 },
        source: "test",
      }),
      /Cannot create more than \d+ monitors\./,
      `The monitor should limit the number of monitors to ${TOTAL_NUM_MONITORS}`
    );
    Assert.equal(
      (await MonitorAgent.listMonitors()).length,
      TOTAL_NUM_MONITORS
    );
  } finally {
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_monitor_only_watches_http_urls() {
  const mockEngineManager = new MockEngineManager();
  const { url, server } = serveHTML(`
    <article>
      <h1>Store</h1>
      <p>
        The item is currently listed for five dollars, which is well below the
        watched threshold and should trigger a notification.
      </p>
    </article>
  `);

  try {
    // Mix a valid http URL with disallowed schemes that could reach local or
    // privileged resources.
    await MonitorAgent.createMonitor({
      prompt: "Watch the price.",
      watchUrls: [
        "about:config",
        url,
        "file:///etc/passwd",
        "javascript:alert(1)",
      ],
      schedule: { type: "interval", hours: 10 },
      source: "test",
    });
    const [monitor] = await MonitorAgent.listMonitors();

    Assert.deepEqual(
      monitor.watchUrls,
      [url],
      "Only http(s) URLs are persisted; about:, file:, and javascript: are dropped."
    );

    const runPromise = MonitorAgent.runNow(monitor.id);
    const { request, respond } = await mockEngineManager.captureRequest({
      purpose: PURPOSES.MONITOR,
    });

    const serialized = JSON.stringify(request.args);
    Assert.ok(
      !serialized.includes("etc/passwd"),
      "The file: URL is never fetched or shown to the model."
    );
    Assert.ok(
      !serialized.includes("about:config"),
      "The about: URL is never shown to the model."
    );
    Assert.ok(
      !serialized.includes("javascript:"),
      "The javascript: URL is never shown to the model."
    );
    Assert.ok(
      serialized.includes(url),
      "Only the allowed http URL is watched."
    );

    respond(JSON.stringify({ explanation: "5 dollars.", conditionMet: false }));
    await runPromise;
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_pauseMonitor() {
  try {
    await resetMonitorAgentForTesting();

    // Create a monitor that starts enabled by default
    const id = await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });

    let monitors = await MonitorAgent.listMonitors();
    Assert.equal(
      monitors[0].enabled,
      true,
      "Monitor starts enabled by default"
    );

    // Test pausing the monitor (pause=true should set enabled=false)
    await MonitorAgent.pauseMonitor(id, true);
    monitors = await MonitorAgent.listMonitors();
    Assert.equal(
      monitors[0].enabled,
      false,
      "Monitor is paused when pause=true"
    );

    // Test resuming the monitor (pause=false should set enabled=true)
    await MonitorAgent.pauseMonitor(id, false);
    monitors = await MonitorAgent.listMonitors();
    Assert.equal(
      monitors[0].enabled,
      true,
      "Monitor is resumed when pause=false"
    );

    // Test toggling without explicit pause parameter
    await MonitorAgent.pauseMonitor(id);
    monitors = await MonitorAgent.listMonitors();
    Assert.equal(
      monitors[0].enabled,
      false,
      "Monitor toggles to paused when no pause parameter"
    );

    await MonitorAgent.pauseMonitor(id);
    monitors = await MonitorAgent.listMonitors();
    Assert.equal(
      monitors[0].enabled,
      true,
      "Monitor toggles back to enabled when no pause parameter"
    );

    // Test that pausing with the same state doesn't break
    await MonitorAgent.pauseMonitor(id, false);
    monitors = await MonitorAgent.listMonitors();
    Assert.equal(
      monitors[0].enabled,
      true,
      "Setting enabled when already enabled works"
    );

    await MonitorAgent.pauseMonitor(id, true);
    await MonitorAgent.pauseMonitor(id, true);
    monitors = await MonitorAgent.listMonitors();
    Assert.equal(
      monitors[0].enabled,
      false,
      "Setting paused when already paused works"
    );

    // Test error handling for non-existent monitor
    await Assert.rejects(
      MonitorAgent.pauseMonitor("non-existent-id", true),
      /Monitor with id non-existent-id not found/,
      "pauseMonitor rejects with error for non-existent monitor"
    );
  } finally {
    await resetMonitorAgentForTesting();
  }
});

/**
 * @param {string} id - The monitor id
 * @param {object} [options]
 * @param {boolean} [options.conditionMet]
 * @param {string} [options.resultExplanation]
 */
async function notifyMonitor(
  id,
  { conditionMet = true, resultExplanation = "Matched" } = {}
) {
  const monitor = (await MonitorAgent.listMonitors()).find(m => m.id === id);
  MonitorAgent._notifyIfConditionMet({
    ...monitor,
    history: [
      ...monitor.history,
      {
        id: crypto.randomUUID(),
        checkedAt: new Date().toISOString(),
        status: "success",
        resultExplanation,
        conditionMet,
      },
    ],
  });
}

add_task(async function test_notification_shown_when_condition_met() {
  const alertsMock = mockAlertsService();

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG(); // Reset telemetry for testing

    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      pageTitle: "Sneaker deal",
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, {
      conditionMet: true,
      resultExplanation: "The price dropped to $250.",
    });

    Assert.equal(
      alertsMock.alerts.length,
      1,
      "A desktop notification is shown when the condition is met"
    );

    // Test notification send telemetry was recorded
    const notificationEvents =
      Glean.smartWindow.monitorNotificationSend.testGetValue();
    Assert.ok(
      notificationEvents,
      "monitor_notification_send event was recorded"
    );
    Assert.equal(
      notificationEvents.length,
      1,
      "One notification send event was recorded"
    );
    const alert = alertsMock.alerts[0];
    Assert.equal(
      alert.title,
      "Sneaker deal",
      "Alert title is the monitor name"
    );
    Assert.equal(
      alert.text,
      "The price dropped to $250.",
      "Alert text is the run's result explanation"
    );
  } finally {
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_no_notification_when_condition_not_met() {
  const alertsMock = mockAlertsService();

  try {
    await resetMonitorAgentForTesting();
    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      pageTitle: "Sneaker deal",
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, { conditionMet: false });

    Assert.equal(
      alertsMock.alerts.length,
      0,
      "No notification is shown when the condition is not met"
    );
  } finally {
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_notification_shown_every_matching_run() {
  const alertsMock = mockAlertsService();

  try {
    await resetMonitorAgentForTesting();
    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      pageTitle: "Sneaker deal",
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, { conditionMet: true });
    Assert.equal(alertsMock.alerts.length, 1, "First matching run notifies");

    await notifyMonitor(id, { conditionMet: true });
    Assert.equal(
      alertsMock.alerts.length,
      2,
      "A still-matching condition notifies again on the next run"
    );

    await notifyMonitor(id, { conditionMet: false });
    Assert.equal(
      alertsMock.alerts.length,
      2,
      "A non-matching run does not notify"
    );

    await notifyMonitor(id, { conditionMet: true });
    Assert.equal(
      alertsMock.alerts.length,
      3,
      "Re-matching after the condition lapsed notifies again"
    );
  } finally {
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_notification_has_snooze_and_dismiss_actions() {
  const alertsMock = mockAlertsService();

  try {
    await resetMonitorAgentForTesting();
    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      pageTitle: "Sneaker deal",
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, { conditionMet: true });

    const alert = alertsMock.alerts[0];
    Assert.deepEqual(
      alert.actions.map(a => a.action),
      [NOTIFICATION_ACTIONS.SNOOZE, NOTIFICATION_ACTIONS.DISMISS],
      "Notification carries snooze and dismiss actions"
    );
    Assert.ok(
      alert.actions.every(a => a.title),
      "Action titles are populated from localized strings"
    );
  } finally {
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_notification_uses_localized_fallbacks() {
  const alertsMock = mockAlertsService();

  try {
    await resetMonitorAgentForTesting();
    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, { conditionMet: true, resultExplanation: "" });

    const alert = alertsMock.alerts[0];
    Assert.ok(
      alert.title,
      "Notification title falls back to a resolved localized string"
    );
    Assert.ok(
      alert.text,
      "Notification body falls back to a resolved localized string"
    );
  } finally {
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_notification_body_click_opens_watched_url() {
  Services.fog.testResetFOG();
  const alertsMock = mockAlertsService();

  // Capture where a body click would navigate
  const openedUrls = [];
  const originalOpen = MonitorAgent._openWatchedUrl;
  MonitorAgent._openWatchedUrl = u => openedUrls.push(u);

  try {
    await resetMonitorAgentForTesting();
    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      pageTitle: "Sneaker deal",
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, { conditionMet: true });

    // A body click is delivered with a null action subject
    const observer = alertsMock.observers[0];
    observer.observe(null, "alertclickcallback", "");

    Assert.deepEqual(
      openedUrls,
      ["https://example.com/product"],
      "Clicking the notification body opens the watched URL"
    );

    // Test notification click telemetry was recorded
    const clickEvents =
      Glean.smartWindow.monitorNotificationClick.testGetValue();
    Assert.ok(clickEvents, "Notification click events were recorded");
    Assert.equal(clickEvents.length, 1, "One click event was recorded");
    Assert.equal(
      clickEvents[0].extra.click_type,
      "open_url",
      "Click type is open_url"
    );
  } finally {
    MonitorAgent._openWatchedUrl = originalOpen;
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_notification_snooze_action_defers_next_run() {
  Services.fog.testResetFOG();
  const alertsMock = mockAlertsService();

  try {
    await resetMonitorAgentForTesting();
    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      pageTitle: "Sneaker deal",
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, { conditionMet: true });

    const observer = alertsMock.observers[0];
    observer.observe(
      fakeAlertAction(NOTIFICATION_ACTIONS.SNOOZE),
      "alertclickcallback",
      ""
    );
    await TestUtils.waitForCondition(async () => {
      const monitor = (await MonitorAgent.listMonitors()).find(
        m => m.id === id
      );
      return (
        new Date(monitor.nextRunTime).getTime() - Date.now() > 12 * 3600000
      );
    }, "Snoozing pushes the next run roughly a day out");

    const monitor = (await MonitorAgent.listMonitors()).find(m => m.id === id);
    Assert.ok(monitor.enabled, "Snoozed monitor stays enabled");

    // Test notification click telemetry was recorded for snooze
    const clickEvents =
      Glean.smartWindow.monitorNotificationClick.testGetValue();
    Assert.ok(clickEvents, "Notification click events were recorded");
    Assert.equal(clickEvents.length, 1, "One click event was recorded");
    Assert.equal(
      clickEvents[0].extra.click_type,
      "snooze",
      "Click type is snooze"
    );
  } finally {
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_notification_snooze_resumes_on_schedule() {
  const alertsMock = mockAlertsService();

  try {
    await resetMonitorAgentForTesting();
    // A daily schedule so snoozing must resume at the scheduled clock
    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      pageTitle: "Sneaker deal",
      schedule: { type: "daily", hour: 9, minute: 30 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, { conditionMet: true });

    const observer = alertsMock.observers[0];
    observer.observe(
      fakeAlertAction(NOTIFICATION_ACTIONS.SNOOZE),
      "alertclickcallback",
      ""
    );

    await TestUtils.waitForCondition(async () => {
      const m = (await MonitorAgent.listMonitors()).find(x => x.id === id);
      return new Date(m.nextRunTime).getTime() - Date.now() > 12 * 3600000;
    }, "Snoozing pushes the next run past the blackout window");

    const m = (await MonitorAgent.listMonitors()).find(x => x.id === id);
    const nextRun = new Date(m.nextRunTime);
    Assert.equal(
      nextRun.getHours(),
      9,
      "Snoozed run resumes at the scheduled hour"
    );
    Assert.equal(
      nextRun.getMinutes(),
      30,
      "Snoozed run resumes at the scheduled minute"
    );
  } finally {
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(async function test_notification_dismiss_action_mutes_notifications() {
  Services.fog.testResetFOG();
  const alertsMock = mockAlertsService();

  try {
    await resetMonitorAgentForTesting();
    await MonitorAgent.createMonitor({
      prompt: "Check if the product price is below $300.",
      watchUrls: ["https://example.com/product"],
      pageTitle: "Sneaker deal",
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
    const { id } = (await MonitorAgent.listMonitors()).at(-1);

    await notifyMonitor(id, { conditionMet: true });
    Assert.equal(alertsMock.alerts.length, 1, "First matching run notifies");

    const observer = alertsMock.observers[0];
    observer.observe(
      fakeAlertAction(NOTIFICATION_ACTIONS.DISMISS),
      "alertclickcallback",
      ""
    );
    await TestUtils.waitForCondition(async () => {
      const monitor = (await MonitorAgent.listMonitors()).find(
        m => m.id === id
      );
      return monitor.notificationsMuted;
    }, "Dismissing mutes the monitor's notifications");

    const monitor = (await MonitorAgent.listMonitors()).find(m => m.id === id);
    Assert.ok(monitor.enabled, "Dismissed monitor keeps running");

    // Test notification click telemetry was recorded for dismiss
    const clickEvents =
      Glean.smartWindow.monitorNotificationClick.testGetValue();
    Assert.ok(clickEvents, "Notification click events were recorded");
    Assert.equal(clickEvents.length, 1, "One click event was recorded");
    Assert.equal(
      clickEvents[0].extra.click_type,
      "dismiss",
      "Click type is dismiss"
    );

    await notifyMonitor(id, { conditionMet: true });
    Assert.equal(
      alertsMock.alerts.length,
      1,
      "A matching run after dismiss does not notify again"
    );
  } finally {
    alertsMock.cleanup();
    await MonitorAgent._resetForTesting();
  }
});

add_task(
  async function test_initial_snapshot_captured_and_persisted_on_create() {
    const mockEngineManager = new MockEngineManager();
    const { MonitorStore } = ChromeUtils.importESModule(
      "moz-src:///browser/components/aiwindow/models/agents/MonitorStore.sys.mjs"
    );

    const { html } = MLTestUtils.serveHTML();
    const { url, cleanup: stopServing } = html`
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
    `;

    try {
      await resetMonitorAgentForTesting();
      await createMonitorWatching([url], "Tell me when the price drops.");

      // the capture runs in the background after creation, poll the store so
      // both the capture and its persistence are covered
      const stored = await TestUtils.waitForCondition(async () => {
        const [record] = await MonitorStore.listMonitors();
        return record?.initialSnapshot ?? null;
      }, "The initial snapshot is captured and persisted after creation");

      Assert.ok(
        stored.pageContent.includes("The price is $299"),
        "The persisted snapshot contains the extracted page content"
      );
      Assert.ok(
        !Number.isNaN(Date.parse(stored.capturedAt)),
        "The persisted snapshot has a valid capture timestamp"
      );

      const [monitor] = await MonitorAgent.listMonitors();
      Assert.deepEqual(
        monitor.initialSnapshot,
        stored,
        "The in-memory monitor exposes the same snapshot as the store"
      );
    } finally {
      await stopServing();
      mockEngineManager.cleanupMocks();
      await resetMonitorAgentForTesting();
    }
  }
);

add_task(async function test_initial_snapshot_refresh_on_definition_edit() {
  const mockEngineManager = new MockEngineManager();
  const { MonitorStore } = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/agents/MonitorStore.sys.mjs"
  );

  // the first page is captured more than once (creation + same-URL edit),
  // so serve it from head.js's persistent server instead of the one-shot
  // MLTestUtils one
  const { url: url1, server: server1 } = serveHTML(
    `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Product Page 1</title>
        </head>
        <body>
          <div>The price is $299</div>
        </body>
      </html>`
  );
  const { html } = MLTestUtils.serveHTML();
  const { url: url2, cleanup: stopServing2 } = html`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Page 2</title>
      </head>
      <body>
        <div>The price is $399</div>
      </body>
    </html>
  `;

  try {
    await resetMonitorAgentForTesting();
    const { id } = await createMonitorWatching(
      [url1],
      "Tell me when the price drops."
    );

    const firstSnapshot = await TestUtils.waitForCondition(async () => {
      const [record] = await MonitorStore.listMonitors();
      return record?.initialSnapshot ?? null;
    }, "The initial snapshot is captured after creation");
    Assert.ok(
      firstSnapshot.pageContent.includes("The price is $299"),
      "The initial snapshot is the first page's content"
    );

    // pause/resume is not an edit and must keep the baseline snapshot
    await MonitorAgent.updateMonitor(id, { enabled: false });
    await MonitorAgent.updateMonitor(id, { enabled: true });
    let [monitor] = await MonitorAgent.listMonitors();
    Assert.deepEqual(
      monitor.initialSnapshot,
      firstSnapshot,
      "Pause and resume keep the existing snapshot"
    );

    // any definition edit replaces the baseline with one captured at edit
    // time, even when the watch URLs are unchanged
    await MonitorAgent.updateMonitor(id, {
      title: "New title",
      monitorPrompt: "Tell me when the price drops below $200.",
    });
    const editSnapshot = await TestUtils.waitForCondition(async () => {
      const [record] = await MonitorStore.listMonitors();
      return record?.initialSnapshot &&
        record.initialSnapshot.capturedAt !== firstSnapshot.capturedAt
        ? record.initialSnapshot
        : null;
    }, "A title/prompt edit re-captures the snapshot");
    Assert.ok(
      editSnapshot.pageContent.includes("The price is $299"),
      "The edit-time snapshot is of the same, unchanged watch URL"
    );

    // changing the watch URLs invalidates and re-captures the snapshot
    await MonitorAgent.updateMonitor(id, { watchUrls: [url2] });
    const secondSnapshot = await TestUtils.waitForCondition(async () => {
      const [record] = await MonitorStore.listMonitors();
      return record?.initialSnapshot?.pageContent.includes("The price is $399")
        ? record.initialSnapshot
        : null;
    }, "The snapshot is re-captured for the new watch URL");
    Assert.ok(
      !secondSnapshot.pageContent.includes("The price is $299"),
      "The re-captured snapshot no longer contains the old page's content"
    );
  } finally {
    await new Promise(resolve => server1.stop(resolve));
    await stopServing2();
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_mid_capture_url_edit_cancels_stale_snapshot() {
  const mockEngineManager = new MockEngineManager();
  const { MonitorStore } = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/agents/MonitorStore.sys.mjs"
  );

  // a page that accepts the request and never answers, so the creation-time
  // capture is reliably still in flight when the edit lands
  const { url: stalledUrl, cleanup: releaseStalled } =
    MLTestUtils.serveStalledPage();
  const { html } = MLTestUtils.serveHTML();
  const { url: editedUrl, cleanup: stopServing } = html`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Product Page</title>
      </head>
      <body>
        <div>The price is $399</div>
      </body>
    </html>
  `;

  try {
    await resetMonitorAgentForTesting();
    const { id } = await createMonitorWatching(
      [stalledUrl],
      "Tell me when the price drops."
    );

    // edit the watch URLs while the first capture is still hanging
    await MonitorAgent.updateMonitor(id, { watchUrls: [editedUrl] });

    const snapshot = await TestUtils.waitForCondition(async () => {
      const [record] = await MonitorStore.listMonitors();
      return record?.initialSnapshot?.pageContent.includes("The price is $399")
        ? record.initialSnapshot
        : null;
    }, "The snapshot captured after the edit is of the new watch URL");

    // release the stalled request; the canceled first capture must not
    // replace the baseline that belongs to the edited URLs
    await releaseStalled();
    await TestUtils.waitForTick();
    const [monitor] = await MonitorAgent.listMonitors();
    Assert.deepEqual(
      monitor.initialSnapshot,
      snapshot,
      "The pre-edit capture does not overwrite the edited monitor's baseline"
    );
  } finally {
    await stopServing();
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_run_backfills_missing_snapshot_into_prompt() {
  const mockEngineManager = new MockEngineManager();
  const { MonitorStore } = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/agents/MonitorStore.sys.mjs"
  );

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

    // a monitor stored before snapshots existed
    await MonitorStore.saveMonitor({
      id: "legacy-monitor",
      title: "Legacy monitor",
      monitorPrompt: "Tell me when the price drops.",
      watchUrls: [url],
      schedule: { type: "interval", hours: 1 },
      enabled: true,
      createdAt: "2026-06-23T12:00:00.000Z",
      updatedAt: "2026-06-23T12:00:00.000Z",
      lastRunTime: "2026-06-23T12:00:00.000Z",
      nextRunTime: "2026-06-23T13:00:00.000Z",
      history: [],
      initialSnapshot: null,
    });
    MonitorAgent._unloadForTesting();

    const [loaded] = await MonitorAgent.listMonitors();
    Assert.equal(
      loaded.initialSnapshot,
      null,
      "The legacy monitor loads without a snapshot"
    );

    const runPromise = MonitorAgent.runNow("legacy-monitor");
    const { request, respond } = await mockEngineManager.captureRequest({
      purpose: PURPOSES.MONITOR,
    });

    const serializedRequest = JSON.stringify(request.args);
    Assert.ok(
      serializedRequest.includes("<initial_page_snapshot>"),
      "The monitor model request includes the snapshot section"
    );
    Assert.ok(
      !serializedRequest.includes("No initial snapshot is available"),
      "The backfilled snapshot replaces the missing-snapshot fallback"
    );
    Assert.ok(
      !serializedRequest.includes("{snapshotContent}"),
      "The snapshot placeholders are rendered"
    );

    respond(
      JSON.stringify({
        explanation: "The price did not drop.",
        conditionMet: false,
      })
    );
    await runPromise;

    const [record] = await MonitorStore.listMonitors();
    Assert.ok(
      record.initialSnapshot,
      "The backfilled snapshot is persisted after the run"
    );
    Assert.ok(
      record.initialSnapshot.pageContent.includes("The price is $299"),
      "The backfilled snapshot holds the extracted page content"
    );
    Assert.ok(
      serializedRequest.includes(record.initialSnapshot.capturedAt),
      "The prompt carried the captured snapshot timestamp"
    );
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});
