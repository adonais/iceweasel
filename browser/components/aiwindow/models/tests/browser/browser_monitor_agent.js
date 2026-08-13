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

const { MonitorAgent } = ChromeUtils.importESModule(
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
  });
  const monitors = await MonitorAgent.listMonitors();
  return monitors.at(-1);
}

add_task(async function test_run_single_url_monitor() {
  // create mock LLM endpoint
  const mockEngineManager = new MockEngineManager();

  // serve a simple HTML page with a price in the body
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
    await stopServing();
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_run_multiple_urls_monitor() {
  // create mock LLM endpoint
  const mockEngineManager = new MockEngineManager();

  // serve two simple HTML pages with prices in the body
  const { html } = MLTestUtils.serveHTML();
  const { url: url1, cleanup: stopServing1 } = html`
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
  `;
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
    await stopServing1();
    await stopServing2();
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(
  async function test_monitor_run_parses_fenced_json_and_records_not_met() {
    const mockEngineManager = new MockEngineManager();
    const { html } = MLTestUtils.serveHTML();
    const { url, cleanup: stopServing } = html`
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
    `;
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
      await stopServing();
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
      }),
      /Cannot watch more than \d+ URLs in a monitor\./,
      `The monitor should limit the number of watch URLs to ${TOTAL_NUM_URLS_IN_MONITOR}`
    );
    Assert.deepEqual(await MonitorAgent.listMonitors(), []);
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
      });
    }
    await Assert.rejects(
      MonitorAgent.createMonitor({
        prompt: "Check if any product price is below $300.",
        watchUrls,
        schedule: { type: "interval", hours: 1 },
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
  const { html } = MLTestUtils.serveHTML();
  const { url, cleanup: stopServing } = html`
    <article>
      <h1>Store</h1>
      <p>
        The item is currently listed for five dollars, which is well below the
        watched threshold and should trigger a notification.
      </p>
    </article>
  `;

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
    await stopServing();
    mockEngineManager.cleanupMocks();
    await MonitorAgent._resetForTesting();
  }
});
