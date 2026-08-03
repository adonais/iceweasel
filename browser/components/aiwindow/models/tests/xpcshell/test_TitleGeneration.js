/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { generateChatTitle } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/TitleGeneration.sys.mjs"
);

const {
  openAIEngine,
  MODEL_FEATURES,
  _setRemoteClientForTesting,
  _clearRemoteClientForTesting,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

/**
 * Constants for preference keys and test values
 */
const PREF_API_KEY = "browser.smartwindow.apiKey";
const PREF_ENDPOINT = "browser.smartwindow.endpoint";
const PREF_MODEL = "browser.smartwindow.model";
const PREF_CUSTOM_PROMPTS = "browser.smartwindow.customPrompts";

const API_KEY = "test-api-key";
const ENDPOINT = "https://api.test-endpoint.com/v1";
const MODEL = "test-model";

// Fake RS records returned by getRemoteClient for TITLE_GENERATION
const FAKE_RECORDS = [
  {
    feature: MODEL_FEATURES.TITLE_GENERATION,
    version: "1.0",
    model: MODEL,
    is_default: true,
    parameters: {},
    service_type: "ai",
    purpose: "title-generation",
    prompts: "Summarize: {current_tab}",
  },
];

/**
 * Cleans up preferences after testing
 */
registerCleanupFunction(() => {
  for (let pref of [
    PREF_API_KEY,
    PREF_ENDPOINT,
    PREF_MODEL,
    PREF_CUSTOM_PROMPTS,
  ]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
});

/**
 * Creates a sandbox with stubs for openAIEngine methods used by buildConversation/loadPrompt.
 * Returns { sb, fakeEngineInstance } — caller must call sb.restore() in finally.
 *
 * @param {object} engineRunStub - Sinon stub or resolved value for fakeEngineInstance.run.
 * @param {sinon.SinonSandbox} [existingSb] - Reuse an existing sandbox instead of creating one.
 * @returns {{ sb: sinon.SinonSandbox, fakeEngineInstance: object }}
 */
function setupStubs(engineRunStub, existingSb) {
  const sb = existingSb ?? sinon.createSandbox();
  const fakeEngineInstance = { run: engineRunStub };

  _setRemoteClientForTesting({
    get: sb.stub().resolves(FAKE_RECORDS),
  });
  sb.stub(openAIEngine, "build").resolves(fakeEngineInstance);
  sb.stub(openAIEngine, "getFxAccountToken").resolves(null);

  return { sb, fakeEngineInstance };
}

registerCleanupFunction(() => _clearRemoteClientForTesting());

/**
 * Test that generateChatTitle successfully generates a title
 */
add_task(async function test_generateChatTitle_success() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    // Mock the engine response
    const mockResponse = {
      finalOutput: "Weather Forecast Query",
    };

    const { fakeEngineInstance } = setupStubs(
      sb.stub().resolves(mockResponse),
      sb
    );

    const message = "What's the weather like today?";
    const currentTab = {
      url: "https://weather.example.com",
      title: "Weather Forecast",
      description: "Get current weather conditions",
    };

    const title = await generateChatTitle(message, currentTab);

    Assert.equal(
      title,
      "Weather Forecast Query",
      "Should return the generated title from the LLM"
    );

    Assert.ok(
      fakeEngineInstance.run.calledOnce,
      "Engine run should be called once"
    );

    // Verify the messages structure passed to the engine
    const callArgs = fakeEngineInstance.run.firstCall.args[0];
    Assert.ok(callArgs.args, "Should pass args to the engine");
    Assert.ok(!callArgs.messages, "Should not pass messages at top level");
    Assert.equal(
      callArgs.args.length,
      2,
      "Should have system and user messages"
    );
    Assert.equal(
      callArgs.args[0].role,
      "system",
      "First message should be system"
    );
    Assert.equal(
      callArgs.args[1].role,
      "user",
      "Second message should be user"
    );
    Assert.equal(
      callArgs.args[1].content,
      message,
      "User message should contain the input message"
    );

    // Verify the system prompt contains the tab information
    const systemContent = callArgs.args[0].content;
    Assert.ok(
      systemContent.includes(currentTab.url),
      "System prompt should include tab URL"
    );

    Assert.ok(
      systemContent.includes(JSON.stringify(currentTab.title)),
      "System prompt should include tab title"
    );
    Assert.ok(
      systemContent.includes(currentTab.description),
      "System prompt should include tab description"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Test that generateChatTitle handles missing tab information
 */
add_task(async function test_generateChatTitle_no_tab_info() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    const mockResponse = {
      finalOutput: "General Question",
    };

    const { fakeEngineInstance } = setupStubs(
      sb.stub().resolves(mockResponse),
      sb
    );

    const message = "Tell me about AI";
    const currentTab = null;

    const title = await generateChatTitle(message, currentTab);

    Assert.equal(
      title,
      "General Question",
      "Should return the generated title even without tab info"
    );

    // Verify the system prompt handles null tab
    const callArgs = fakeEngineInstance.run.firstCall.args[0];
    Assert.ok(callArgs.args, "Should pass args even with null tab");
  } finally {
    sb.restore();
  }
});

/**
 * Test that generateChatTitle handles empty tab fields
 */
add_task(async function test_generateChatTitle_empty_tab_fields() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    const mockResponse = {
      finalOutput: "Untitled Chat",
    };

    const { fakeEngineInstance } = setupStubs(
      sb.stub().resolves(mockResponse),
      sb
    );

    const message = "Hello";
    const currentTab = {
      url: "",
      title: "",
      description: "",
    };

    const title = await generateChatTitle(message, currentTab);

    Assert.equal(title, "Untitled Chat", "Should handle empty tab fields");

    // Verify the system prompt includes the empty tab object
    const callArgs = fakeEngineInstance.run.firstCall.args[0];
    Assert.ok(callArgs.args, "Should pass args even with empty tab fields");
  } finally {
    sb.restore();
  }
});

/**
 * Test that generateChatTitle handles engine errors gracefully
 */
add_task(async function test_generateChatTitle_engine_error() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    setupStubs(sb.stub().rejects(new Error("Engine failed")), sb);

    const message = "Test message for error handling";
    const currentTab = {
      url: "https://example.com",
      title: "Example",
      description: "Test",
    };

    const title = await generateChatTitle(message, currentTab);

    Assert.equal(
      title,
      "Test message for error...",
      "Should return first four words when engine fails"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Test that generateChatTitle handles malformed engine responses
 */
add_task(async function test_generateChatTitle_malformed_response() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  // Test with missing finalOutput
  let sb = sinon.createSandbox();
  try {
    setupStubs(sb.stub().resolves({}), sb);
    let title = await generateChatTitle("test message one two", null);
    Assert.equal(
      title,
      "test message one two...",
      "Should return first four words for missing finalOutput"
    );
  } finally {
    sb.restore();
  }

  // Test with empty string finalOutput
  sb = sinon.createSandbox();
  try {
    setupStubs(sb.stub().resolves({ finalOutput: "" }), sb);
    let title = await generateChatTitle("another test message here", null);
    Assert.equal(
      title,
      "another test message here...",
      "Should return first four words for empty finalOutput"
    );
  } finally {
    sb.restore();
  }

  // Test with null finalOutput
  sb = sinon.createSandbox();
  try {
    setupStubs(sb.stub().resolves({ finalOutput: null }), sb);
    let title = await generateChatTitle("short test here", null);
    Assert.equal(
      title,
      "short test here...",
      "Should return first four words for null finalOutput"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Test that generateChatTitle trims whitespace from response
 */
add_task(async function test_generateChatTitle_trim_whitespace() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    setupStubs(
      sb.stub().resolves({ finalOutput: "  Title With Spaces  \n\n" }),
      sb
    );

    const title = await generateChatTitle("test", null);

    Assert.equal(
      title,
      "Title With Spaces",
      "Should trim whitespace from generated title"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Test default title generation with fewer than four words
 */
add_task(async function test_generateChatTitle_short_message() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    setupStubs(sb.stub().rejects(new Error("Engine failed")), sb);

    // Test with three words
    let title = await generateChatTitle("Hello there friend", null);
    Assert.equal(
      title,
      "Hello there friend...",
      "Should return three words with ellipsis"
    );

    // Test with one word
    title = await generateChatTitle("Hello", null);
    Assert.equal(title, "Hello...", "Should return one word with ellipsis");

    // Test with empty message
    title = await generateChatTitle("", null);
    Assert.equal(
      title,
      "New Chat",
      "Should return 'New Chat' for empty message"
    );

    // Test with whitespace only
    title = await generateChatTitle("   ", null);
    Assert.equal(
      title,
      "New Chat",
      "Should return 'New Chat' for whitespace-only message"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Test that generateChatTitle includes the assistant response in messages when provided
 */
add_task(async function test_generateChatTitle_with_assistant_response() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    const { fakeEngineInstance } = setupStubs(
      sb.stub().resolves({ finalOutput: "Firefox Memories Location" }),
      sb
    );

    const message = "where are my memories";
    const currentTab = { url: "", title: "", description: "" };
    const assistantResponse =
      "Your memories are in AI Controls > Smart Window > Manage memories.";

    const title = await generateChatTitle(
      message,
      currentTab,
      assistantResponse
    );

    Assert.equal(
      title,
      "Firefox Memories Location",
      "Should return the generated title"
    );

    const callArgs = fakeEngineInstance.run.firstCall.args[0];
    Assert.equal(
      callArgs.args.length,
      3,
      "Should have system, user, and assistant messages when assistantResponse is provided"
    );
    Assert.equal(
      callArgs.args[2].role,
      "assistant",
      "Third message should be assistant"
    );
    Assert.equal(
      callArgs.args[2].content,
      assistantResponse,
      "Assistant message should contain the provided response"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Test default title generation with more than four words
 */
add_task(async function test_generateChatTitle_long_message() {
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  const sb = sinon.createSandbox();
  try {
    setupStubs(sb.stub().rejects(new Error("Engine failed")), sb);

    const message = "This is a very long message with many words";
    const title = await generateChatTitle(message, null);

    Assert.equal(
      title,
      "This is a very...",
      "Should return only first four words with ellipsis"
    );
  } finally {
    sb.restore();
  }
});
