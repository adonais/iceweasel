/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

do_get_profile();

const { ChatStore, ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);

/**
 * Runs a test atomically so that the clean up code
 * runs after each test intead of after the entire
 * list of tasks in the file are done.
 *
 * @todo Bug 2005408
 * Replace add_atomic_task usage when this Bug 1656557 lands
 *
 * @param {Function} func - The test function to run
 */
function add_atomic_task(func) {
  return add_task(async function () {
    await test_ChatStorage_setup();

    try {
      await func();
    } finally {
      await test_cleanUp();
    }
  });
}

let gChatStore;

async function cleanUpDatabase() {
  if (gChatStore) {
    await gChatStore.destroyDatabase();
    gChatStore = null;
  }
}

async function test_ChatStorage_setup() {
  Services.prefs.setBoolPref(
    "browser.smartwindow.removeDatabaseOnStartup",
    true
  );

  gChatStore = ChatStore;
  await gChatStore.destroyDatabase();
}

async function test_cleanUp() {
  Services.prefs.clearUserPref("browser.smartwindow.removeDatabaseOnStartup");

  await cleanUpDatabase();
}

function makeToolUIData({
  toolCallId = "tool-call-1",
  uiType = "website-confirmation",
  tabs = [{ tabId: "tab-1", label: "Example", href: "https://example.com/" }],
} = {}) {
  return {
    toolCallId,
    timestamp: "2026-05-13T00:00:00.000Z",
    updateCount: 0,
    uiType,
    title: "Close these tabs?",
    description: "Select tabs to close",
    properties: { tabs },
  };
}

add_atomic_task(async function test_toolUIData_insert_round_trip() {
  const conversation = new ChatConversation({});
  conversation.title = "toolUIData INSERT";
  conversation.addUserMessage("Close my tabs", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Here are the tabs I can close:");

  const assistant = conversation.messages.at(-1);
  const original = makeToolUIData({
    tabs: [
      { tabId: "tab-1", label: "Page 1", href: "https://example.com/1" },
      { tabId: "tab-2", label: "Page 2", href: "https://example.com/2" },
    ],
  });
  assistant.toolUIData = original;

  await gChatStore.updateConversation(conversation);
  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.ok(
    reloadedAssistant,
    "Reloaded conversation contains the assistant message"
  );
  Assert.deepEqual(
    reloadedAssistant.toolUIData,
    original,
    "toolUIData roundTrips through the INSERT path"
  );
});

add_atomic_task(async function test_toolUIData_update_roundTrip() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Close my tabs", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Pending confirmation");

  const assistant = conversation.messages.at(-1);
  assistant.toolUIData = makeToolUIData({ uiType: "website-confirmation" });
  await gChatStore.updateConversation(conversation);

  // Simulate ToolUI.handleUpdate mutating the in-memory object after a click
  assistant.toolUIData = {
    ...assistant.toolUIData,
    uiType: "ai-action-result",
    updateCount: 1,
    properties: {
      ...assistant.toolUIData.properties,
      confirmedData: ["tab-1"],
    },
  };
  await gChatStore.updateConversation(conversation);

  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.withSoftAssertions(soft => {
    soft.equal(
      reloadedAssistant.toolUIData.uiType,
      "ai-action-result",
      "uiType reflects the post-confirm mutation"
    );
    soft.equal(
      reloadedAssistant.toolUIData.updateCount,
      1,
      "updateCount reflects the post-confirm mutation"
    );
    soft.deepEqual(
      reloadedAssistant.toolUIData.properties.confirmedData,
      ["tab-1"],
      "confirmedData persisted through the ON CONFLICT UPDATE branch"
    );
  });
});

add_atomic_task(async function test_toolUIData_null_roundTrip() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Just a message", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Just a reply");

  const assistant = conversation.messages.at(-1);
  // toolUIData intentionally not set
  await gChatStore.updateConversation(conversation);
  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.strictEqual(
    reloadedAssistant.toolUIData,
    null,
    "Messages without toolUIData reload as null"
  );
});

add_atomic_task(async function test_toolUIData_undoDismissed_roundTrip() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Close my tabs", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Closed");

  const assistant = conversation.messages.at(-1);
  const base = makeToolUIData({ uiType: "ai-action-result" });
  assistant.toolUIData = {
    ...base,
    properties: { ...base.properties, undoDismissed: true },
  };

  await gChatStore.updateConversation(conversation);
  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.strictEqual(
    reloadedAssistant.toolUIData.properties.undoDismissed,
    true,
    "undoDismissed:true survives the ChatStore roundTrip"
  );
});

function makeHistoryResults() {
  return [
    {
      url: "https://example.com/1",
      title: "Page 1",
      visitDate: 1700000000000000,
      visitCount: 3,
      timestamp: "Yesterday",
    },
    {
      url: "https://example.com/2",
      title: "Page 2",
      visitDate: 1700000100000000,
      visitCount: 1,
      timestamp: "Yesterday",
    },
  ];
}

add_atomic_task(async function test_historyResults_insert_round_trip() {
  const conversation = new ChatConversation({});
  conversation.title = "historyResults INSERT";
  conversation.addUserMessage("Show my history", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Here is what I found:");

  const assistant = conversation.messages.at(-1);
  const original = makeHistoryResults();
  assistant.historyResults = original;

  await gChatStore.updateConversation(conversation);
  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.ok(
    reloadedAssistant,
    "Reloaded conversation contains the assistant message"
  );
  Assert.deepEqual(
    reloadedAssistant.historyResults,
    original,
    "historyResults roundTrips through the INSERT path"
  );
});

add_atomic_task(async function test_historyResults_update_roundTrip() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Show my history", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Searching...");

  // The message row first persists while still streaming, with no snapshot yet.
  const assistant = conversation.messages.at(-1);
  await gChatStore.updateConversation(conversation);

  // When that same message completes, receiveResponse writes its snapshot,
  // re-persisting the existing row through the ON CONFLICT UPDATE branch.
  const snapshot = makeHistoryResults();
  assistant.historyResults = snapshot;
  await gChatStore.updateConversation(conversation);

  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.deepEqual(
    reloadedAssistant.historyResults,
    snapshot,
    "historyResults snapshot persisted through the ON CONFLICT UPDATE branch"
  );
});

add_atomic_task(async function test_historyResults_empty_roundTrip() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Just a message", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Just a reply");

  const assistant = conversation.messages.at(-1);
  // historyResults intentionally left at its default empty array
  await gChatStore.updateConversation(conversation);
  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.deepEqual(
    reloadedAssistant.historyResults,
    [],
    "Messages without historyResults reload as an empty array"
  );
});

add_atomic_task(async function test_historyResults_rehydrates_pool() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Show my history", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Here is what I found:");

  const assistant = conversation.messages.at(-1);
  const original = makeHistoryResults();
  assistant.historyResults = original;
  await gChatStore.updateConversation(conversation);

  const reloaded = await gChatStore.findConversationById(conversation.id);

  Assert.deepEqual(
    reloaded.getHistoryResultsSnapshot(),
    original,
    "Reloaded conversation rehydrates its history results pool from messages"
  );
});

function makeCitations() {
  return [
    { url: "https://example.com/1", title: "Source 1", hasFavicon: true },
    { url: "https://example.com/2", title: "Source 2" },
  ];
}

function makeStrippedCitations() {
  return [
    { url: "https://example.com/1", title: "Source 1" },
    { url: "https://example.com/2", title: "Source 2" },
  ];
}

add_atomic_task(async function test_citations_insert_roundTrip() {
  const conversation = new ChatConversation({});
  conversation.title = "citations INSERT";
  conversation.addUserMessage("Search the web", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Here is what I found:");

  const assistant = conversation.messages.at(-1);
  assistant.citations = makeCitations();

  await gChatStore.updateConversation(conversation);
  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.ok(
    reloadedAssistant,
    "Reloaded conversation contains the assistant message"
  );
  Assert.deepEqual(
    reloadedAssistant.citations,
    makeStrippedCitations(),
    "citations roundTrip through the INSERT path without resolved assets"
  );
});

add_atomic_task(async function test_citations_update_roundTrip() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Search the web", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Searching...");

  const assistant = conversation.messages.at(-1);
  await gChatStore.updateConversation(conversation);

  assistant.citations = makeCitations();
  await gChatStore.updateConversation(conversation);

  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  Assert.deepEqual(
    reloadedAssistant.citations,
    makeStrippedCitations(),
    "citations snapshot persisted through the ON CONFLICT UPDATE branch"
  );
});

add_atomic_task(async function test_citations_empty_roundTrip() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Just a message", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Just a reply");

  const assistantId = conversation.messages.at(-1).id;
  await gChatStore.updateConversation(conversation);
  const reloaded = await gChatStore.findConversationById(conversation.id);

  Assert.deepEqual(
    reloaded.messages.find(m => m.id === assistantId).citations,
    [],
    "Messages without citations reload as an empty array"
  );
});

add_atomic_task(async function test_citations_rehydrates_pool() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Search the web", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Here is what I found:");

  const assistant = conversation.messages.at(-1);
  assistant.citations = makeCitations();
  await gChatStore.updateConversation(conversation);

  const reloaded = await gChatStore.findConversationById(conversation.id);

  // The snapshot only covers URLs read this turn
  Assert.deepEqual(
    reloaded.getCitationsSnapshot(),
    [],
    "A reloaded conversation has no pending citations of its own"
  );

  reloaded.addCitations([{ url: "https://example.com/1" }]);
  Assert.deepEqual(
    reloaded.getCitationsSnapshot(),
    [{ url: "https://example.com/1", title: "Source 1" }],
    "The pool rehydrated from message snapshots, so the title carries forward"
  );
});

add_atomic_task(
  async function test_updateLLMTelemetryRecord_creates_unprocessed_row() {
    const conversation = new ChatConversation({});
    conversation.title = "conversation with llm telemetry";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);

    await gChatStore.updateLLMTelemetryRecord(conversation.id);

    const telemetry = await gChatStore.findLLMTelemetryByConversationId(
      conversation.id
    );

    Assert.ok(telemetry, "LLM telemetry row should exist");
    Assert.withSoftAssertions(function (soft) {
      soft.equal(telemetry.convId, conversation.id);
      soft.equal(telemetry.processed, 0);
      soft.deepEqual(telemetry.telemetryPrompts, {});
      soft.deepEqual(telemetry.telemetryProbabilities, {});
      soft.ok(telemetry.processedTime, "processedTime should be set");
    });
  }
);

add_atomic_task(
  async function test_updateLLMTelemetryRecord_creates_processed_row() {
    const conversation = new ChatConversation({});
    conversation.title = "processed llm telemetry conversation";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);

    await gChatStore.updateLLMTelemetryRecord(
      conversation.id,
      {
        "wasSuccessful-v1": 2,
        "isLongConvo-v1": 2,
      },
      {
        "wasSuccessful-v1": 0.9,
        "isLongConvo-v1": 0.84,
      },
      0,
      1
    );

    const telemetry = await gChatStore.findLLMTelemetryByConversationId(
      conversation.id
    );

    Assert.ok(telemetry, "LLM telemetry row should exist");
    Assert.withSoftAssertions(function (soft) {
      soft.equal(telemetry.convId, conversation.id);
      soft.equal(telemetry.processed, 1);
      soft.deepEqual(telemetry.telemetryPrompts, {
        "wasSuccessful-v1": 2,
        "isLongConvo-v1": 2,
      });
      soft.deepEqual(telemetry.telemetryProbabilities, {
        "wasSuccessful-v1": 0.9,
        "isLongConvo-v1": 0.84,
      });
      soft.ok(telemetry.processedTime, "processedTime should be set");
    });
  }
);

add_atomic_task(
  async function test_updateLLMTelemetryRecord_merges_prompts_and_probabilities() {
    const conversation = new ChatConversation({});
    conversation.title = "merged llm telemetry conversation";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);

    await gChatStore.updateLLMTelemetryRecord(
      conversation.id,
      {
        "wasSuccessful-v1": 2,
        "isLongConvo-v1": 2,
      },
      {
        "wasSuccessful-v1": 0.9,
        "isLongConvo-v1": 0.84,
      },
      0,
      0
    );

    await gChatStore.updateLLMTelemetryRecord(
      conversation.id,
      {
        "isLongConvo-v1": 8,
      },
      {
        "isLongConvo-v1": 0.95,
      },
      0,
      1
    );

    const telemetry = await gChatStore.findLLMTelemetryByConversationId(
      conversation.id
    );

    Assert.ok(telemetry, "LLM telemetry row should exist");
    Assert.withSoftAssertions(function (soft) {
      soft.equal(telemetry.convId, conversation.id);
      soft.equal(telemetry.processed, 1);
      soft.deepEqual(telemetry.telemetryPrompts, {
        "wasSuccessful-v1": 2,
        "isLongConvo-v1": 8,
      });
      soft.deepEqual(telemetry.telemetryProbabilities, {
        "wasSuccessful-v1": 0.9,
        "isLongConvo-v1": 0.84,
      });
      soft.ok(telemetry.processedTime, "processedTime should be set");
    });
  }
);

add_atomic_task(
  async function test_updateLLMTelemetryRecord_preserves_existing_data_when_marking_unprocessed() {
    const conversation = new ChatConversation({});
    conversation.title = "unprocessed preserves telemetry";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);

    await gChatStore.updateLLMTelemetryRecord(
      conversation.id,
      {
        "wasSuccessful-v1": 2,
        "isLongConvo-v1": 8,
      },
      {
        "wasSuccessful-v1": 0.9,
        "isLongConvo-v1": 0.95,
      },
      0,
      1
    );

    await gChatStore.updateLLMTelemetryRecord(conversation.id, {}, {}, 0);

    const telemetry = await gChatStore.findLLMTelemetryByConversationId(
      conversation.id
    );

    Assert.ok(telemetry, "LLM telemetry row should exist");
    Assert.withSoftAssertions(function (soft) {
      soft.equal(telemetry.convId, conversation.id);
      soft.equal(telemetry.processed, 0);
      soft.deepEqual(telemetry.telemetryPrompts, {
        "wasSuccessful-v1": 2,
        "isLongConvo-v1": 8,
      });
      soft.deepEqual(telemetry.telemetryProbabilities, {
        "wasSuccessful-v1": 0.9,
        "isLongConvo-v1": 0.95,
      });
      soft.ok(telemetry.processedTime, "processedTime should be set");
    });
  }
);

add_atomic_task(
  async function test_updateLLMTelemetryRecord_merges_over_null_columns() {
    const conversation = new ChatConversation({});
    conversation.title = "null llm telemetry conversation";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);

    await gChatStore.updateLLMTelemetryRecord(
      conversation.id,
      { "wasSuccessful-v1": 1 },
      { "wasSuccessful-v1": 0.5 },
      0,
      0
    );

    await gChatStore.connection.execute(
      `UPDATE llm_telemetry
       SET telemetry_prompts = NULL,
           telemetry_probabilities = NULL
       WHERE conv_id = :conv_id`,
      { conv_id: conversation.id }
    );

    await gChatStore.updateLLMTelemetryRecord(
      conversation.id,
      { "isLongConvo-v1": 3 },
      { "isLongConvo-v1": 0.7 },
      0,
      1
    );

    const telemetry = await gChatStore.findLLMTelemetryByConversationId(
      conversation.id
    );

    Assert.ok(telemetry, "LLM telemetry row should exist");
    Assert.withSoftAssertions(function (soft) {
      soft.deepEqual(
        telemetry.telemetryPrompts,
        { "isLongConvo-v1": 3 },
        "a NULL prompts column merges to the incoming values, not to NULL"
      );
      soft.deepEqual(
        telemetry.telemetryProbabilities,
        { "isLongConvo-v1": 0.7 },
        "a NULL probabilities column merges to the incoming values, not to NULL"
      );
    });
  }
);

add_atomic_task(
  async function test_findLLMTelemetryByConversationId_returns_null_for_missing_row() {
    const telemetry =
      await gChatStore.findLLMTelemetryByConversationId("missing-conv-id");

    Assert.equal(
      telemetry,
      null,
      "Should return null when no LLM telemetry row exists"
    );
  }
);

add_atomic_task(
  async function test_updateLLMTelemetryRecord_sets_uniform_sampling_probability() {
    const conversation = new ChatConversation({});
    conversation.title = "uniform sampling probability conversation";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);

    await gChatStore.updateLLMTelemetryRecord(conversation.id, {}, {}, 750, 0);

    const telemetry = await gChatStore.findLLMTelemetryByConversationId(
      conversation.id
    );

    Assert.ok(telemetry, "LLM telemetry row should exist");
    Assert.equal(telemetry.uniformSamplingProbability, 750);
  }
);

add_atomic_task(
  async function test_updateLLMTelemetryRecord_preserves_uniform_sampling_probability() {
    const conversation = new ChatConversation({});
    conversation.title = "uniform sampling probability preserved conversation";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);

    await gChatStore.updateLLMTelemetryRecord(conversation.id, {}, {}, 750, 0);

    await gChatStore.updateLLMTelemetryRecord(conversation.id, {}, {}, 999, 1);

    const telemetry = await gChatStore.findLLMTelemetryByConversationId(
      conversation.id
    );

    Assert.ok(telemetry, "LLM telemetry row should exist");
    Assert.equal(
      telemetry.uniformSamplingProbability,
      750,
      "uniform_sampling_probability should not be overwritten on update"
    );
  }
);

add_atomic_task(
  async function test_findConversationById_hydratesUniformSamplingState() {
    const conversation = new ChatConversation({});
    conversation.title = "hydration conversation";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);
    await gChatStore.updateLLMTelemetryRecord(conversation.id, {}, {}, 0.25, 0);

    const reloaded = await gChatStore.findConversationById(conversation.id);

    Assert.equal(
      reloaded._telemetryUniformSample,
      true,
      "_telemetryUniformSample is rehydrated from llm_telemetry on reload"
    );
    Assert.equal(
      reloaded._telemetryUniformProbability,
      0.25,
      "_telemetryUniformProbability is rehydrated from llm_telemetry on reload"
    );
  }
);

add_atomic_task(
  async function test_findConversationById_skipsHydrationWhenNotSampled() {
    const conversation = new ChatConversation({});
    conversation.title = "no-hydration conversation";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);
    await gChatStore.updateLLMTelemetryRecord(conversation.id, {}, {}, 0, 0);

    const reloaded = await gChatStore.findConversationById(conversation.id);

    Assert.notStrictEqual(
      reloaded._telemetryUniformSample,
      true,
      "_telemetryUniformSample stays unset when uniform_sampling_probability is 0"
    );
  }
);

add_atomic_task(
  async function test_findConversationById_skipsHydrationWhenNoTelemetryRow() {
    const conversation = new ChatConversation({});
    conversation.title = "no-telemetry-row conversation";
    conversation.addUserMessage("test content", "https://www.firefox.com");
    await gChatStore.updateConversation(conversation);

    const reloaded = await gChatStore.findConversationById(conversation.id);

    Assert.notStrictEqual(
      reloaded._telemetryUniformSample,
      true,
      "_telemetryUniformSample stays unset when no llm_telemetry row exists"
    );
  }
);

/**
 * Test that messages with website-confirmation toolUIData get isRestored flag
 * when loaded from the database
 */
add_atomic_task(async function test_website_confirmation_isRestored_flag() {
  const conversation = new ChatConversation({});
  conversation.title = "Test isRestored flag";
  conversation.addUserMessage("Close some tabs", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "I'll help close those tabs");

  const assistant = conversation.messages.at(-1);

  // Add website-confirmation toolUIData
  const toolUIData = makeToolUIData({
    uiType: "website-confirmation",
    tabs: [
      { id: "tab-1", url: "https://example.com", title: "Example" },
      { id: "tab-2", url: "https://test.com", title: "Test" },
    ],
  });

  // Add originalUserPrompt to properties
  toolUIData.properties.originalUserPrompt = "Close some tabs";
  assistant.toolUIData = toolUIData;

  // Save the conversation
  await gChatStore.updateConversation(conversation);

  // Load it back from the database
  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  // Verify the isRestored flag was set
  Assert.ok(
    reloadedAssistant.isRestored,
    "Messages with website-confirmation toolUIData should have isRestored flag set when loaded from DB"
  );

  // Verify the toolUIData is preserved
  Assert.equal(
    reloadedAssistant.toolUIData.uiType,
    "website-confirmation",
    "uiType should be preserved"
  );

  Assert.equal(
    reloadedAssistant.toolUIData.properties.originalUserPrompt,
    "Close some tabs",
    "originalUserPrompt should be preserved"
  );

  Assert.equal(
    reloadedAssistant.toolUIData.properties.tabs.length,
    2,
    "tabs array should be preserved"
  );
});

/**
 * Test that messages with other UI types don't get isRestored flag
 */
add_atomic_task(async function test_other_ui_types_no_isRestored_flag() {
  const conversation = new ChatConversation({});
  conversation.title = "Test no isRestored flag";
  conversation.addUserMessage("Do something", "https://example.com/", 0);
  conversation.addAssistantMessage("text", "Task completed");

  const assistant = conversation.messages.at(-1);

  // Add ai-action-result toolUIData (not website-confirmation)
  assistant.toolUIData = makeToolUIData({
    uiType: "ai-action-result",
  });

  // Save the conversation
  await gChatStore.updateConversation(conversation);

  // Load it back from the database
  const reloaded = await gChatStore.findConversationById(conversation.id);
  const reloadedAssistant = reloaded.messages.find(m => m.id === assistant.id);

  // Verify the isRestored flag was NOT set
  Assert.ok(
    !reloadedAssistant.isRestored,
    "Messages with non-website-confirmation toolUIData should NOT have isRestored flag"
  );

  // Verify the toolUIData is still preserved
  Assert.equal(
    reloadedAssistant.toolUIData.uiType,
    "ai-action-result",
    "uiType should be preserved"
  );
});
