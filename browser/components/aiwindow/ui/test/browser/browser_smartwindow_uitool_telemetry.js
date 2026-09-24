/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ToolUITelemetry } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ToolUITelemetry.sys.mjs"
);

function assertGleanEvent(metric, expected, message) {
  const events = metric.testGetValue();
  const expectedString = Object.fromEntries(
    Object.entries(expected).map(([key, value]) => [key, String(value)])
  );
  Assert.deepEqual(events[0].extra, expectedString, `${message}: extras match`);
}

add_task(async function test_recordBrowserActionPrompt() {
  Services.fog.testResetFOG();

  const testData = {
    location: "sidebar",
    chat_id: "test-chat-123",
    message_seq: 5,
    action: "close_tabs",
    prompt_type: "safety_confirmation",
    reason: "pinned_tab",
    candidates: 3,
    preselected: 0,
  };

  ToolUITelemetry.recordBrowserActionPrompt(testData);

  assertGleanEvent(Glean.smartWindow.browserActionPrompt, testData, "prompt");
});

const PROMPT_RESPONSE_CASES = [
  {
    name: "confirm",
    location: "fullpage",
    chat_id: "test-chat-456",
    message_seq: 2,
    action: "close_tabs",
    prompt_type: "safety_confirmation",
    response: "confirm",
    selected: 2,
    reason: "user_action",
  },
  {
    name: "cancel",
    location: "sidebar",
    chat_id: "test-chat-789",
    message_seq: 1,
    action: "close_tabs",
    prompt_type: "safety_confirmation",
    response: "cancel",
    selected: 0,
    reason: "user_action",
  },
];

add_task(async function test_recordBrowserActionPromptResponse() {
  for (const { name, ...testData } of PROMPT_RESPONSE_CASES) {
    Services.fog.testResetFOG();
    ToolUITelemetry.recordBrowserActionPromptResponse(testData);
    assertGleanEvent(
      Glean.smartWindow.browserActionPromptResponse,
      testData,
      `prompt response ${name}`
    );
  }
});

const UNDO_CASES = [
  {
    name: "success",
    location: "fullpage",
    chat_id: "test-chat-undo-123",
    message_seq: 3,
    action: "close_tabs",
    tabs_restored: 2,
    time_delta: 5000,
    result: "success",
    error: "",
  },
  {
    name: "error",
    location: "sidebar",
    chat_id: "test-chat-undo-error",
    message_seq: 4,
    action: "close_tabs",
    tabs_restored: 0,
    time_delta: 2000,
    result: "error",
    error: "invalid_window",
  },
  {
    name: "partial success",
    location: "fullpage",
    chat_id: "test-chat-partial",
    message_seq: 6,
    action: "close_tabs",
    tabs_restored: 1,
    time_delta: 3500,
    result: "partial_success",
    error: "one_or_more_tabs_failed_to_restore",
  },
];

add_task(async function test_recordBrowserActionUndo() {
  for (const { name, ...testData } of UNDO_CASES) {
    Services.fog.testResetFOG();
    ToolUITelemetry.recordBrowserActionUndo(testData);
    assertGleanEvent(
      Glean.smartWindow.browserActionUndo,
      testData,
      `undo ${name}`
    );
  }
});

add_task(async function test_recordBrowserActionSubmit() {
  Services.fog.testResetFOG();

  const testData = {
    location: "sidebar",
    chat_id: "test-chat-submit",
    message_seq: 2,
    model: "test-model",
    prompt_version: "6",
    submit_type: "enter",
    action: "close_tabs",
    trigger: "tab_mention",
    tabs_open: 5,
    mentions: 2,
  };

  ToolUITelemetry.recordBrowserActionSubmit(testData);

  assertGleanEvent(Glean.smartWindow.browserActionSubmit, testData, "submit");
});

const COMPLETE_CASES = [
  {
    name: "success",
    location: "fullpage",
    chat_id: "test-chat-complete",
    message_seq: 3,
    model: "test-model",
    prompt_version: "6",
    action: "close_tabs",
    trigger: "description",
    result: "success",
    tabs_affected: 2,
    undo_available: true,
    error: "",
  },
  {
    name: "cancelled",
    location: "sidebar",
    chat_id: "test-chat-cancelled",
    message_seq: 1,
    model: "test-model",
    prompt_version: "6",
    action: "close_tabs",
    trigger: "tab_mention",
    result: "cancelled",
    tabs_affected: 0,
    undo_available: false,
    error: "",
  },
  {
    name: "no match",
    location: "fullpage",
    chat_id: "test-chat-nomatch",
    message_seq: 4,
    model: "test-model",
    prompt_version: "6",
    action: "close_tabs",
    trigger: "description",
    result: "no_match",
    tabs_affected: 0,
    undo_available: false,
    error: "no_open_tab_match",
  },
];

add_task(async function test_recordBrowserActionComplete() {
  for (const { name, ...testData } of COMPLETE_CASES) {
    Services.fog.testResetFOG();
    ToolUITelemetry.recordBrowserActionComplete(testData);
    assertGleanEvent(
      Glean.smartWindow.browserActionComplete,
      testData,
      `complete ${name}`
    );
  }
});

add_task(async function test_multiple_events_recorded_separately() {
  Services.fog.testResetFOG();

  // Record multiple events to ensure they're tracked separately
  ToolUITelemetry.recordBrowserActionPrompt({
    location: "sidebar",
    chat_id: "multi-test-1",
    message_seq: 1,
    action: "close_tabs",
    prompt_type: "safety_confirmation",
    reason: "user_action",
    candidates: 1,
    preselected: 0,
  });

  ToolUITelemetry.recordBrowserActionPrompt({
    location: "fullpage",
    chat_id: "multi-test-2",
    message_seq: 2,
    action: "close_tabs",
    prompt_type: "safety_confirmation",
    reason: "pinned_tab",
    candidates: 3,
    preselected: 0,
  });

  const promptEvents = Glean.smartWindow.browserActionPrompt.testGetValue();
  Assert.equal(
    promptEvents?.length,
    2,
    "Two separate browser action prompt events were recorded"
  );

  Assert.equal(
    promptEvents[0].extra.chat_id,
    "multi-test-1",
    "First event has correct chat_id"
  );
  Assert.equal(
    promptEvents[1].extra.chat_id,
    "multi-test-2",
    "Second event has correct chat_id"
  );
  Assert.equal(
    promptEvents[0].extra.reason,
    "user_action",
    "First event has correct reason"
  );
  Assert.equal(
    promptEvents[1].extra.reason,
    "pinned_tab",
    "Second event has correct reason"
  );
});

// Tab Group Tests

// group_tabs reuses the same record functions as close_tabs, so these only
// pin the per-action payload rather than re-testing each function's wiring.
const GROUP_TABS_CASES = [
  {
    name: "prompt",
    record: d => ToolUITelemetry.recordBrowserActionPrompt(d),
    metric: () => Glean.smartWindow.browserActionPrompt,
    data: {
      location: "sidebar",
      chat_id: "test-chat-group-123",
      message_seq: 5,
      action: "group_tabs",
      prompt_type: "safety_confirmation",
      reason: "user_action",
      candidates: 5,
      preselected: 0,
    },
  },
  {
    name: "prompt response confirm",
    record: d => ToolUITelemetry.recordBrowserActionPromptResponse(d),
    metric: () => Glean.smartWindow.browserActionPromptResponse,
    data: {
      location: "sidebar",
      chat_id: "test-chat-group-confirm",
      message_seq: 10,
      action: "group_tabs",
      prompt_type: "safety_confirmation",
      response: "confirm",
      selected: 4,
      reason: "user_action",
    },
  },
  {
    name: "prompt response cancel",
    record: d => ToolUITelemetry.recordBrowserActionPromptResponse(d),
    metric: () => Glean.smartWindow.browserActionPromptResponse,
    data: {
      location: "fullpage",
      chat_id: "test-chat-group-cancel",
      message_seq: 7,
      action: "group_tabs",
      prompt_type: "safety_confirmation",
      response: "cancel",
      selected: 0,
      reason: "user_action",
    },
  },
  {
    name: "undo success",
    record: d => ToolUITelemetry.recordBrowserActionUndo(d),
    metric: () => Glean.smartWindow.browserActionUndo,
    data: {
      location: "sidebar",
      chat_id: "test-chat-undo-group-success",
      message_seq: 3,
      action: "group_tabs",
      tabs_restored: 5,
      time_delta: 3000,
      result: "success",
      error: "",
    },
  },
  {
    name: "undo error",
    record: d => ToolUITelemetry.recordBrowserActionUndo(d),
    metric: () => Glean.smartWindow.browserActionUndo,
    data: {
      location: "fullpage",
      chat_id: "test-chat-undo-group-error",
      message_seq: 4,
      action: "group_tabs",
      tabs_restored: 0,
      time_delta: 2000,
      result: "error",
      error: "ungroup_failed",
    },
  },
];

add_task(async function test_group_tabs_events() {
  for (const testCase of GROUP_TABS_CASES) {
    Services.fog.testResetFOG();
    testCase.record(testCase.data);
    assertGleanEvent(
      testCase.metric(),
      testCase.data,
      `group_tabs ${testCase.name}`
    );
  }
});
