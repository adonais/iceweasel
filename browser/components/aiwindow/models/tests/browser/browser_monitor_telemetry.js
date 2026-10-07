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

const {
  Monitor,
  MONITOR_ERROR_CODES,
  TOTAL_NUM_MONITORS,
  TOTAL_NUM_URLS_IN_MONITOR,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs"
);

const { IntervalSchedule } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Schedule.sys.mjs"
);

const { PURPOSES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF =
  "browser.smartwindow.monitorStore.removeDatabaseOnStartup";

const MONITOR_PROMPT = "Check if the product price is below $300.";

const PRODUCT_PAGE_HTML = `
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

const EMPTY_PAGE_HTML = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Empty Page</title>
    </head>
    <body></body>
  </html>
`;

const events = Glean.smartWindow;

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

function createMonitorWatching(url, options = {}) {
  return MonitorAgent.createMonitor({
    prompt: MONITOR_PROMPT,
    watchUrls: [url],
    schedule: { type: "interval", hours: 1 },
    source: "test",
    ...options,
  });
}

function makeStandaloneMonitor(watchUrls) {
  return new Monitor({
    title: "Telemetry test",
    monitorPrompt: MONITOR_PROMPT,
    watchUrls,
    schedule: new IntervalSchedule(1),
  });
}

async function respondToMonitorCheck(mockEngineManager, conditionMet) {
  const { respond } = await mockEngineManager.captureRequest({
    purpose: PURPOSES.MONITOR,
  });
  respond(
    JSON.stringify({
      explanation: conditionMet ? "The price dropped to $250." : "No change.",
      conditionMet,
    })
  );
}

function singleEventExtra(metric, name) {
  const recorded = metric.testGetValue();
  Assert.equal(recorded?.length, 1, `Exactly one ${name} event was recorded`);
  return recorded[0].extra;
}

function assertNotRecorded(metric, message) {
  Assert.equal(metric.testGetValue(), undefined, message);
}

function assertIntegerMs(value, message) {
  Assert.ok(/^\d+$/.test(value), message);
}

add_task(async function test_manual_run_records_request_start_and_complete() {
  const mockEngineManager = new MockEngineManager();
  const { url, server } = serveHTML(PRODUCT_PAGE_HTML);

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();
    const id = await createMonitorWatching(url);

    const runPromise = MonitorAgent.runNow(id);
    await respondToMonitorCheck(mockEngineManager, true);
    await runPromise;

    const request = singleEventExtra(
      events.agenticActionExecuteRequest,
      "execute_request"
    );
    Assert.equal(request.agent, "monitor", "The request names the agent");
    Assert.equal(request.action_id, id, "The request carries the monitor id");
    Assert.equal(request.reason, "manual", "A runNow run is manual");
    Assert.equal(request.execution_seq, "1", "The first run is number 1");
    Assert.equal(request.delay, undefined, "Manual runs record no delay");
    Assert.equal(request.schedule_type, "interval");
    Assert.equal(
      request.check_time,
      undefined,
      "Interval schedules have no check time"
    );

    const start = singleEventExtra(
      events.agenticActionExecuteStart,
      "execute_start"
    );
    Assert.equal(start.action_id, id, "The start carries the monitor id");
    Assert.equal(start.reason, "manual", "The start repeats the reason");
    Assert.equal(start.execution_seq, "1", "The start repeats the run number");
    Assert.ok(
      typeof start.model === "string" && !!start.model.length,
      "The start records the model id"
    );

    const complete = singleEventExtra(
      events.agenticActionExecuteComplete,
      "execute_complete"
    );
    Assert.equal(complete.success, "true", "The run completed successfully");
    Assert.equal(complete.outcome, "true", "The condition was met");
    Assert.equal(complete.action_id, id, "The complete carries the monitor id");
    Assert.equal(complete.reason, "manual", "The complete repeats the reason");
    Assert.equal(complete.execution_seq, "1", "The complete repeats the run");
    Assert.equal(complete.error_code, undefined, "No error code on success");
    assertIntegerMs(complete.duration, "The duration is integer ms");
    assertIntegerMs(complete.latency, "The latency is integer ms");
    Assert.equal(complete.model, start.model, "The complete repeats the model");
    Assert.equal(complete.delay, undefined, "Manual runs record no delay");
    assertNotRecorded(
      events.agenticActionExecuteCancel,
      "A run that finished on its own is not a cancel"
    );

    Services.fog.testResetFOG();
    const secondRun = MonitorAgent.runNow(id);
    await respondToMonitorCheck(mockEngineManager, false);
    await secondRun;

    Assert.equal(
      singleEventExtra(events.agenticActionExecuteRequest, "execute_request")
        .execution_seq,
      "2",
      "The second request is run number 2"
    );
    Assert.equal(
      singleEventExtra(events.agenticActionExecuteStart, "execute_start")
        .execution_seq,
      "2",
      "The second start is run number 2"
    );
    const secondComplete = singleEventExtra(
      events.agenticActionExecuteComplete,
      "execute_complete"
    );
    Assert.equal(secondComplete.execution_seq, "2", "Run number 2 completed");
    Assert.equal(secondComplete.outcome, "false", "The condition was not met");

    MonitorAgent._unloadForTesting();
    const [reloaded] = await MonitorAgent.listMonitors();
    Assert.equal(
      reloaded.runCount,
      2,
      "The run count survives a reload from the store"
    );
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_scheduled_run_reason_and_delay() {
  const mockEngineManager = new MockEngineManager();
  const { url, server } = serveHTML(PRODUCT_PAGE_HTML);
  const monitor = makeStandaloneMonitor([url]);

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();
    monitor.nextRunTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    monitor.enabled = true;

    let runPromise = monitor.run();
    await respondToMonitorCheck(mockEngineManager, true);
    await runPromise;

    Assert.equal(
      monitor.history.at(-1).status,
      "success",
      "The scheduled run completed"
    );
    const request = singleEventExtra(
      events.agenticActionExecuteRequest,
      "execute_request"
    );
    Assert.equal(request.action_id, monitor.id, "The request has the id");
    Assert.equal(
      request.reason,
      "trigger_time",
      "A run two minutes late fired on time"
    );
    Assert.greaterOrEqual(
      Number(request.delay),
      100000,
      "The request reports how late the run started"
    );
    const complete = singleEventExtra(
      events.agenticActionExecuteComplete,
      "execute_complete"
    );
    Assert.equal(complete.reason, "trigger_time", "The complete repeats it");
    Assert.equal(
      complete.delay,
      request.delay,
      "The complete reports the same delay"
    );
    Assert.equal(complete.success, "true", "The run completed successfully");

    Services.fog.testResetFOG();
    monitor.nextRunTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    runPromise = monitor.run();
    await respondToMonitorCheck(mockEngineManager, true);
    await runPromise;

    const delayed = singleEventExtra(
      events.agenticActionExecuteRequest,
      "execute_request"
    );
    Assert.equal(
      delayed.reason,
      "delayed",
      "A run ten minutes late is delayed"
    );
    Assert.greaterOrEqual(Number(delayed.delay), 10 * 60 * 1000 - 1000);
    Assert.equal(delayed.execution_seq, "2", "The second run is number 2");
    Assert.equal(
      singleEventExtra(events.agenticActionExecuteComplete, "execute_complete")
        .reason,
      "delayed",
      "The complete repeats the delayed reason"
    );
  } finally {
    monitor.dispose();
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_failed_run_has_no_outcome_and_no_start() {
  const { url, server } = serveHTML(EMPTY_PAGE_HTML);
  const monitor = makeStandaloneMonitor([url]);

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();

    await monitor.run({ manual: true });

    Assert.equal(
      monitor.history.at(-1).status,
      "error",
      "The empty extraction run is an error"
    );

    singleEventExtra(events.agenticActionExecuteRequest, "execute_request");
    assertNotRecorded(
      events.agenticActionExecuteStart,
      "A run that never reached the model records no start"
    );
    const complete = singleEventExtra(
      events.agenticActionExecuteComplete,
      "execute_complete"
    );
    Assert.equal(complete.success, "false", "The run failed");
    Assert.equal(
      complete.error_code,
      MONITOR_ERROR_CODES.CONTENT_EXTRACTION,
      "An empty extraction records the content extraction error code"
    );
    Assert.equal(complete.outcome, undefined, "Failed runs record no outcome");
    Assert.equal(
      complete.latency,
      undefined,
      "A run that never reached the model records no latency"
    );
    assertIntegerMs(complete.duration, "Failed runs still record a duration");
    Assert.equal(complete.action_id, monitor.id, "The complete has the id");
    assertNotRecorded(
      events.agenticActionExecuteCancel,
      "A failed run is not a cancel"
    );
  } finally {
    monitor.dispose();
    await new Promise(resolve => server.stop(resolve));
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_deleted_mid_run_records_cancel() {
  const mockEngineManager = new MockEngineManager();
  const { url, server } = serveHTML(PRODUCT_PAGE_HTML);

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();
    const id = await createMonitorWatching(url);

    const runPromise = MonitorAgent.runNow(id);
    await mockEngineManager.captureRequest({ purpose: PURPOSES.MONITOR });
    await MonitorAgent.deleteMonitor(id);
    await runPromise;

    singleEventExtra(events.agenticActionExecuteStart, "execute_start");
    const cancel = singleEventExtra(
      events.agenticActionExecuteCancel,
      "execute_cancel"
    );
    Assert.equal(cancel.action_id, id, "The cancel carries the monitor id");
    Assert.equal(cancel.reason, "manual", "The cancel repeats the run reason");
    Assert.equal(
      cancel.execution_seq,
      "1",
      "The cancel repeats the run number"
    );
    Assert.equal(
      cancel.error_code,
      MONITOR_ERROR_CODES.CANCELED,
      "Deleting the monitor mid-run cancels the run"
    );
    assertIntegerMs(cancel.duration, "The cancel records a duration");
    Assert.ok(
      typeof cancel.model === "string" && !!cancel.model.length,
      "The cancel records the model the check had reached"
    );
    Assert.equal(cancel.success, undefined, "Cancels carry no success flag");
    Assert.equal(cancel.outcome, undefined, "Cancels carry no outcome");
    assertNotRecorded(
      events.agenticActionExecuteComplete,
      "A canceled run records no complete"
    );
    Assert.equal(
      singleEventExtra(events.agenticActionDelete, "delete").action_id,
      id,
      "The delete event carries the monitor id"
    );
  } finally {
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_disposed_mid_run_records_interrupted_cancel() {
  const mockEngineManager = new MockEngineManager();
  const { url, server } = serveHTML(PRODUCT_PAGE_HTML);
  const monitor = makeStandaloneMonitor([url]);

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();

    const runPromise = monitor.run({ manual: true });
    await mockEngineManager.captureRequest({ purpose: PURPOSES.MONITOR });
    monitor.dispose();
    await runPromise;

    const cancel = singleEventExtra(
      events.agenticActionExecuteCancel,
      "execute_cancel"
    );
    Assert.equal(
      cancel.error_code,
      MONITOR_ERROR_CODES.INTERRUPTED,
      "Tearing the monitor down mid-run interrupts the run"
    );
    Assert.equal(cancel.action_id, monitor.id, "The cancel has the id");
    assertNotRecorded(
      events.agenticActionExecuteComplete,
      "An interrupted run records no complete"
    );
  } finally {
    monitor.dispose();
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_deleted_during_final_save_still_completes() {
  const mockEngineManager = new MockEngineManager();
  const { url, server } = serveHTML(PRODUCT_PAGE_HTML);
  const originalSaveAndNotify = MonitorAgent._saveAndNotify;

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();
    const id = await createMonitorWatching(url);

    let releaseFinalSave = null;
    MonitorAgent._saveAndNotify = async function (monitor) {
      if (monitor?.history.at(-1)?.status === "success" && !releaseFinalSave) {
        await new Promise(resolve => {
          releaseFinalSave = resolve;
        });
      }
      return originalSaveAndNotify.call(this, monitor);
    };

    const runPromise = MonitorAgent.runNow(id);
    await respondToMonitorCheck(mockEngineManager, true);
    await TestUtils.waitForCondition(
      () => !!releaseFinalSave,
      "The run reached the save of its result"
    );
    await MonitorAgent.deleteMonitor(id);
    releaseFinalSave();
    await runPromise;

    const complete = singleEventExtra(
      events.agenticActionExecuteComplete,
      "execute_complete"
    );
    Assert.equal(complete.success, "true", "The run had already finished");
    Assert.equal(complete.outcome, "true", "The complete keeps the outcome");
    Assert.equal(complete.error_code, undefined, "No error code on success");
    assertNotRecorded(
      events.agenticActionExecuteCancel,
      "A delete after the check finished is not a cancel"
    );
    singleEventExtra(events.agenticActionDelete, "delete");
  } finally {
    MonitorAgent._saveAndNotify = originalSaveAndNotify;
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_timed_out_run_completes_without_start() {
  const mockEngineManager = new MockEngineManager();
  const { url, cleanup: releaseStalled } = MLTestUtils.serveStalledPage();
  const monitor = makeStandaloneMonitor([url]);
  let released = false;

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();

    await monitor.run({ manual: true, timeoutMs: 500 });

    const complete = singleEventExtra(
      events.agenticActionExecuteComplete,
      "execute_complete"
    );
    Assert.equal(complete.success, "false", "The timed out run failed");
    Assert.equal(
      complete.error_code,
      MONITOR_ERROR_CODES.TIMEOUT,
      "A timeout is a completed run with the timeout error code"
    );
    assertNotRecorded(
      events.agenticActionExecuteCancel,
      "A timeout is not a cancel"
    );

    await releaseStalled();
    released = true;
    await TestUtils.waitForTick();
    assertNotRecorded(
      events.agenticActionExecuteStart,
      "No start is recorded after the run already ended"
    );
  } finally {
    monitor.dispose();
    if (!released) {
      await releaseStalled();
    }
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_create_records_submit_and_complete() {
  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();

    const id = await MonitorAgent.createMonitor({
      prompt: MONITOR_PROMPT,
      watchUrls: ["https://example.com/product", "about:config"],
      schedule: { type: "weekly", weekday: 3, hour: 9, minute: 5 },
      source: "in_line_chat",
      chatId: "chat-abc",
      messageSeq: 3,
    });

    const submit = singleEventExtra(
      events.agenticActionCreateSubmit,
      "create_submit"
    );
    Assert.equal(submit.agent, "monitor", "The submit names the agent");
    Assert.equal(submit.source, "in_line_chat", "The submit has the source");
    Assert.equal(submit.chat_id, "chat-abc", "The submit has the chat id");
    Assert.equal(submit.message_seq, "3", "The submit has the message number");
    Assert.equal(submit.urls, "2", "The submit counts the URLs as submitted");
    Assert.equal(
      submit.length,
      String(MONITOR_PROMPT.length),
      "The submit has the prompt length"
    );
    Assert.equal(submit.monitors, "0", "No monitor existed before the submit");
    Assert.equal(submit.schedule_type, "weekly", "The submit has the schedule");
    Assert.equal(submit.check_time, "09:05", "The check time is zero padded");
    Assert.equal(submit.check_weekday, "3", "The submit has the weekday");
    Assert.equal(submit.action_id, undefined, "No id exists at submit time");
    Assert.equal(submit.enabled, undefined, "No state exists at submit time");
    Assert.equal(submit.age, undefined, "No age exists at submit time");

    const complete = singleEventExtra(
      events.agenticActionCreateComplete,
      "create_complete"
    );
    Assert.equal(complete.success, "true", "The creation succeeded");
    Assert.equal(complete.error_code, undefined, "No error code on success");
    Assert.equal(complete.action_id, id, "The complete has the new id");
    Assert.equal(complete.agent, "monitor", "The complete names the agent");
    Assert.equal(
      complete.source,
      "in_line_chat",
      "The complete has the source"
    );
    Assert.equal(complete.chat_id, "chat-abc", "The complete has the chat id");
    Assert.equal(complete.message_seq, "3", "The complete has the message");
    Assert.equal(complete.urls, "1", "The complete counts the URLs kept");
    Assert.equal(complete.monitors, "1", "The new monitor is counted");
    Assert.equal(complete.enabled, "true", "The new monitor is enabled");
    Assert.equal(complete.check_time, "09:05", "The complete has the time");
    Assert.equal(complete.check_weekday, "3", "The complete has the weekday");
    Assert.equal(complete.execution_seq, undefined, "Create has no run");
  } finally {
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_create_failure_records_error_code() {
  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();

    await Assert.rejects(
      createMonitorWatching("https://example.com/product", { prompt: "" }),
      /Monitor is invalid/,
      "An empty prompt is rejected"
    );
    singleEventExtra(events.agenticActionCreateSubmit, "create_submit");
    let complete = singleEventExtra(
      events.agenticActionCreateComplete,
      "create_complete"
    );
    Assert.equal(complete.success, "false", "The creation failed");
    Assert.equal(complete.error_code, "invalid_input", "Invalid input code");
    Assert.equal(complete.action_id, undefined, "No id for a failed create");

    Services.fog.testResetFOG();
    await Assert.rejects(
      createMonitorWatching("https://example.com/product", {
        watchUrls: Array.from(
          { length: TOTAL_NUM_URLS_IN_MONITOR + 1 },
          (_, i) => `https://example.com/page${i}`
        ),
      }),
      /Cannot watch more than/,
      "Too many URLs are rejected"
    );
    complete = singleEventExtra(
      events.agenticActionCreateComplete,
      "create_complete"
    );
    Assert.equal(complete.success, "false", "The creation failed");
    Assert.equal(
      complete.error_code,
      "invalid_input",
      "Too many URLs is invalid input"
    );

    for (let i = 0; i < TOTAL_NUM_MONITORS; i++) {
      await createMonitorWatching(`https://example.com/page${i}`);
    }
    MonitorAgent._unloadForTesting();
    Services.fog.testResetFOG();

    await Assert.rejects(
      createMonitorWatching("https://example.com/extra"),
      /Cannot have more than/,
      "The active monitor cap is enforced"
    );
    const submit = singleEventExtra(
      events.agenticActionCreateSubmit,
      "create_submit"
    );
    Assert.equal(
      submit.monitors,
      String(TOTAL_NUM_MONITORS),
      "The submit counts the stored monitors even before the store is loaded"
    );
    complete = singleEventExtra(
      events.agenticActionCreateComplete,
      "create_complete"
    );
    Assert.equal(complete.success, "false", "The creation failed");
    Assert.equal(complete.error_code, "limit_reached", "Limit reached code");
    Assert.equal(complete.source, "test", "The failure repeats the source");
    Assert.equal(complete.urls, "1", "The failure repeats the submitted URLs");
    Assert.equal(complete.action_id, undefined, "No id for a failed create");
  } finally {
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_create_context_is_validated() {
  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();

    await createMonitorWatching("https://example.com/product", {
      source: "javascript:evil",
      chatId: 12345,
      messageSeq: -1,
    });

    for (const [metric, name] of [
      [events.agenticActionCreateSubmit, "create_submit"],
      [events.agenticActionCreateComplete, "create_complete"],
    ]) {
      const extra = singleEventExtra(metric, name);
      Assert.equal(
        extra.source,
        "unknown",
        `${name}: an unrecognized source is recorded as unknown`
      );
      Assert.equal(
        extra.chat_id,
        undefined,
        `${name}: a non-string chat id is dropped`
      );
      Assert.equal(
        extra.message_seq,
        undefined,
        `${name}: a negative message number is dropped`
      );
    }
  } finally {
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_pause_resume_edit_and_delete_events() {
  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();
    const id = await createMonitorWatching("https://example.com/product");
    Services.fog.testResetFOG();

    await MonitorAgent.pauseMonitor(id, true);
    const pause = singleEventExtra(events.agenticActionPause, "pause");
    Assert.equal(pause.action_id, id, "The pause carries the monitor id");
    Assert.equal(pause.enabled, "false", "The pause reports the new state");
    Assert.equal(pause.source, undefined, "No source without FE context");
    assertNotRecorded(
      events.agenticActionEditComplete,
      "A plain pause is not an edit"
    );
    assertNotRecorded(events.agenticActionResume, "A pause is not a resume");

    Services.fog.testResetFOG();
    await MonitorAgent.pauseMonitor(id, false, { source: "about_page" });
    const resume = singleEventExtra(events.agenticActionResume, "resume");
    Assert.equal(resume.enabled, "true", "The resume reports the new state");
    Assert.equal(resume.source, "about_page", "The resume has the FE source");
    assertNotRecorded(
      events.agenticActionEditComplete,
      "A plain resume is not an edit"
    );
    assertNotRecorded(events.agenticActionPause, "A resume is not a pause");

    Services.fog.testResetFOG();
    await MonitorAgent.pauseMonitor(id, false);
    assertNotRecorded(
      events.agenticActionResume,
      "Resuming an enabled monitor records nothing"
    );
    assertNotRecorded(
      events.agenticActionEditComplete,
      "A no-op toggle is not an edit"
    );

    Services.fog.testResetFOG();
    await MonitorAgent.updateMonitor(id, { title: "Renamed" });
    const edit = singleEventExtra(events.agenticActionEditComplete, "edit");
    Assert.equal(edit.action_id, id, "The edit carries the monitor id");
    Assert.equal(edit.agent, "monitor", "The edit names the agent");
    assertNotRecorded(events.agenticActionPause, "An edit is not a pause");
    assertNotRecorded(events.agenticActionResume, "An edit is not a resume");

    Services.fog.testResetFOG();
    await MonitorAgent.updateMonitor(id, { title: "Paused", enabled: false });
    singleEventExtra(events.agenticActionEditComplete, "edit");
    singleEventExtra(events.agenticActionPause, "pause");

    Services.fog.testResetFOG();
    await MonitorAgent.deleteMonitor(id, {
      source: "toolbar_panel",
      chatId: "chat-1",
      messageSeq: 2,
    });
    const deleted = singleEventExtra(events.agenticActionDelete, "delete");
    Assert.equal(deleted.action_id, id, "The delete carries the monitor id");
    Assert.equal(deleted.enabled, "false", "The delete reports the state");
    Assert.equal(deleted.source, "toolbar_panel", "The delete has the source");
    Assert.equal(deleted.chat_id, "chat-1", "The delete has the chat id");
    Assert.equal(deleted.message_seq, "2", "The delete has the message");
    assertNotRecorded(
      events.agenticActionEditComplete,
      "A delete is not an edit"
    );
  } finally {
    await resetMonitorAgentForTesting();
  }
});

add_task(async function test_notification_close_keeps_display_execution_seq() {
  const alertsMock = mockAlertsService();
  const mockEngineManager = new MockEngineManager();
  const { url, server } = serveHTML(PRODUCT_PAGE_HTML);
  const originalOpen = MonitorAgent._openWatchedUrl;
  MonitorAgent._openWatchedUrl = () => {};

  async function runMonitor(id, conditionMet) {
    const runPromise = MonitorAgent.runNow(id);
    await respondToMonitorCheck(mockEngineManager, conditionMet);
    await runPromise;
  }

  try {
    await resetMonitorAgentForTesting();
    Services.fog.testResetFOG();
    const id = await createMonitorWatching(url, { pageTitle: "Sneaker deal" });
    await runMonitor(id, true);
    Assert.equal(
      alertsMock.alerts.length,
      2,
      "The creation and the met condition each notified"
    );

    // Another run happens before the user gets to either notification
    await runMonitor(id, false);

    const displayEvents =
      events.agenticActionNotificationDisplay.testGetValue();
    Assert.deepEqual(
      displayEvents.map(event => [
        event.extra.notification_type,
        event.extra.execution_seq,
      ]),
      [
        ["created", "0"],
        ["condition_met", "1"],
      ],
      "Each display records the run number at the time it was shown"
    );

    alertsMock.observers[0].observe(null, "alertclickcallback", "");
    alertsMock.observers[1].observe(null, "alertclickcallback", "");
    const closeEvents = events.agenticActionNotificationClose.testGetValue();
    Assert.deepEqual(
      closeEvents.map(event => [
        event.extra.notification_type,
        event.extra.execution_seq,
      ]),
      [
        ["created", "0"],
        ["condition_met", "1"],
      ],
      "Each close repeats the run number its notification was shown with"
    );
  } finally {
    MonitorAgent._openWatchedUrl = originalOpen;
    alertsMock.cleanup();
    await new Promise(resolve => server.stop(resolve));
    mockEngineManager.cleanupMocks();
    await resetMonitorAgentForTesting();
  }
});
