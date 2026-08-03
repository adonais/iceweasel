/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

do_get_profile();

const { ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
);
const { SYSTEM_PROMPT_TYPE, MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AIWindowConstants.sys.mjs"
);
const { Chat, executeToolByName } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Chat.sys.mjs"
);
const { RunSearch, GetPageContent, toolFns } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);
const {
  MODEL_FEATURES,
  openAIEngine,
  FEATURE_MAJOR_VERSIONS,
  SERVICE_TYPES,
  PURPOSES,
  _setRemoteClientForTesting,
  _clearRemoteClientForTesting,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

registerCleanupFunction(() => _clearRemoteClientForTesting());

const TEST_MODEL = "test-model";

function getVersionForFeature(feature) {
  const major = FEATURE_MAJOR_VERSIONS[feature] || 1;
  return `${major}.0`;
}

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

// Prefs for aiwindow
const PREF_API_KEY = "browser.smartwindow.apiKey";
const PREF_ENDPOINT = "browser.smartwindow.endpoint";
const PREF_CUSTOM_ENDPOINT = "browser.smartwindow.customEndpoint";
const PREF_MODEL = "browser.smartwindow.model";
const PREF_MODEL_CHOICE = "browser.smartwindow.firstrun.modelChoice";

// Clean prefs after all tests
registerCleanupFunction(() => {
  for (let pref of [
    PREF_API_KEY,
    PREF_ENDPOINT,
    PREF_CUSTOM_ENDPOINT,
    PREF_MODEL,
  ]) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
  }
});

// Assigns engine + parameters onto a ChatConversation for tests that drive
// it through Chat.fetchWithHistory.
function setupConversationForChat(
  conversation,
  { model, engine, parameters } = {}
) {
  if (engine && model) {
    engine.model = model;
  }
  conversation.engine = engine;
  conversation.parameters = parameters ?? {};
}

function getLastAssistantResponse(conversation) {
  return conversation.messages
    .filter(m => m.role == MESSAGE_ROLE.ASSISTANT)
    .filter(m => m.content.type === "text")
    .at(-1);
}

add_task(async function test_Chat_real_tools_are_registered() {
  Assert.strictEqual(
    typeof toolFns.getOpenTabs,
    "function",
    "getOpenTabs should be a function"
  );
  Assert.strictEqual(
    typeof toolFns.searchBrowsingHistory,
    "function",
    "searchBrowsingHistory should be a function"
  );
  Assert.strictEqual(
    typeof GetPageContent.getPageContent,
    "function",
    "GetPageContent.getPageContent should be a function"
  );
  Assert.strictEqual(
    typeof toolFns.getUserMemories,
    "function",
    "getUserMemories should be a function"
  );
  Assert.strictEqual(
    typeof RunSearch.runSearch,
    "function",
    "RunSearch.runSearch should be a function"
  );
  Assert.strictEqual(
    typeof toolFns.manageTabs,
    "function",
    "manageTabs should be a function"
  );
});

add_task(
  async function test_openAIEngine_build_with_chat_feature_and_nonexistent_model() {
    Services.prefs.setStringPref(PREF_API_KEY, "test-key-123");
    Services.prefs.setStringPref(
      PREF_CUSTOM_ENDPOINT,
      "https://example.test/v1"
    );
    Services.prefs.setStringPref(PREF_MODEL, "nonexistent-model");
    Services.prefs.setStringPref(PREF_MODEL_CHOICE, "0");

    const sb = sinon.createSandbox();
    try {
      const fakeEngineInstance = {
        runWithGenerator() {
          throw new Error("not used");
        },
      };
      const stub = sb
        .stub(openAIEngine, "_createEngine")
        .resolves(fakeEngineInstance);

      const { baseURL, apiKey } = openAIEngine.resolveEndpointConfig("0");
      const engine = await openAIEngine.build({
        model: "nonexistent-model",
        serviceType: SERVICE_TYPES.AI,
        purpose: PURPOSES.CHAT,
        flowId: null,
        feature: MODEL_FEATURES.CHAT,
        baseURL,
        apiKey,
      });

      Assert.ok(
        engine instanceof openAIEngine,
        "Should return openAIEngine instance"
      );
      Assert.strictEqual(
        engine.engineInstance,
        fakeEngineInstance,
        "Should store engine instance"
      );
      Assert.ok(stub.calledOnce, "_createEngine should be called once");

      const opts = stub.firstCall.args[0];
      Assert.equal(opts.apiKey, "test-key-123", "apiKey should come from pref");
      Assert.equal(
        opts.baseURL,
        "https://example.test/v1",
        "baseURL should come from pref"
      );
      Assert.equal(
        opts.modelId,
        "nonexistent-model",
        "modelId should use custom model with custom endpoint"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_Chat_fetchWithHistory_streams_and_forwards_args() {
  const sb = sinon.createSandbox();
  try {
    let capturedArgs = null;
    let capturedOptions = null;

    // Fake openAIEngine instance that directly has runWithGenerator method
    const fakeEngine = {
      runWithGenerator(options) {
        capturedArgs = options.args;
        capturedOptions = options;
        async function* gen() {
          yield { text: "Hello" };
          yield { text: " from" };
          yield { text: " fake engine!" };
          yield {}; // ignored by Chat
          // No toolCalls yielded, so loop will exit after first iteration
        }
        return gen();
      },
      getConfig() {
        return {};
      },
    };

    sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

    const conversation = new ChatConversation({
      title: "chat title",
      description: "chat desc",
      pageUrl: new URL("https://www.firefox.com"),
      pageMeta: {},
    });
    conversation.addSystemMessage(
      SYSTEM_PROMPT_TYPE.TEXT,
      "You are helpful",
      0
    );
    conversation.addUserMessage("Hi there", "https://www.firefox.com", 0);
    conversation.addAssistantMessage("text", "");

    setupConversationForChat(conversation, {
      model: TEST_MODEL,
      engine: fakeEngine,
      parameters: { temperature: 0.7 },
    });
    await Chat.fetchWithHistory({
      conversation,
    });

    Assert.equal(
      getLastAssistantResponse(conversation).content.body,
      "Hello from fake engine!",
      "Should concatenate streamed chunks"
    );
    // The empty trailing assistant placeholder is filtered out by
    // getMessagesInChatCompletionsFormat, so we expect system + user only.
    Assert.equal(
      capturedArgs.length,
      2,
      "Should forward 2 messages (no empty placeholder)"
    );
    Assert.equal(
      capturedArgs[0].role,
      "system",
      "First arg should be system message"
    );
    Assert.equal(
      capturedArgs[0].content,
      "You are helpful",
      "System message content should match"
    );
    Assert.equal(
      capturedArgs[1].role,
      "user",
      "Second arg should be user message"
    );
    Assert.equal(
      capturedArgs[1].content,
      "Hi there",
      "User message content should match"
    );
    Assert.deepEqual(
      capturedOptions.streamOptions.enabled,
      true,
      "Should enable streaming in runWithGenerator()"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_Chat_fetchWithHistory_sends_compacted_args() {
  const sb = sinon.createSandbox();
  try {
    let capturedArgs = null;
    const fakeEngine = {
      runWithGenerator(options) {
        capturedArgs = options.args;
        async function* gen() {
          yield { text: "ok" };
        }
        return gen();
      },
      getConfig() {
        return {};
      },
    };
    sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

    const conversation = new ChatConversation({
      title: "t",
      description: "d",
      pageUrl: new URL("https://example.test"),
      pageMeta: {},
    });
    conversation.addSystemMessage(SYSTEM_PROMPT_TYPE.TEXT, "sys", 0);
    conversation.addUserMessage("Read this", "https://example.test", 0);
    conversation.addAssistantMessage("text", "");

    setupConversationForChat(conversation, {
      model: TEST_MODEL,
      engine: fakeEngine,
      parameters: {},
    });

    const compactSpy = sb.spy(conversation, "compactChatCompletions");
    await Chat.fetchWithHistory({ conversation });

    Assert.ok(
      compactSpy.called,
      "conversation.compactChatCompletions() should be called"
    );
    Assert.deepEqual(
      capturedArgs,
      compactSpy.firstCall.returnValue,
      "runWithGenerator must receive the compacted snapshot, not the raw history"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_Chat_fetchWithHistory_handles_tool_calls() {
  const sb = sinon.createSandbox();
  try {
    let callCount = 0;
    const capturedArgs = [];
    const fakeEngine = {
      runWithGenerator(_options) {
        callCount++;
        capturedArgs.push(_options.args);
        async function* gen() {
          if (callCount === 1) {
            // First call: yield text and tool call
            yield { text: "I'll help you with that. " };
            yield {
              toolCalls: [
                {
                  id: "call_123",
                  function: {
                    name: "search_browsing_history",
                    arguments: JSON.stringify({ searchTerm: "hello" }),
                  },
                },
              ],
            };
          } else {
            // Second call: after tool execution
            yield { text: "Tool executed successfully!" };
          }
        }
        return gen();
      },
      getConfig() {
        return {};
      },
    };

    const toolStub = sb
      .stub(toolFns, "searchBrowsingHistory")
      .resolves("tool result");

    sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

    const conversation = new ChatConversation({
      title: "chat title",
      description: "chat desc",
      pageUrl: new URL("https://www.firefox.com"),
      pageMeta: {},
    });
    conversation.addUserMessage(
      "Use the test tool",
      "https://www.firefox.com",
      0
    );
    conversation.addAssistantMessage("text", "");

    setupConversationForChat(conversation, {
      model: TEST_MODEL,
      engine: fakeEngine,
    });
    await Chat.fetchWithHistory({
      conversation,
    });

    const toolCalls = conversation.messages.filter(
      message =>
        message.role === MESSAGE_ROLE.ASSISTANT &&
        message?.content?.type === "function"
    );

    Assert.equal(
      getLastAssistantResponse(conversation).content.body,
      "I'll help you with that. \n\nTool executed successfully!",
      "Should yield text from both model calls"
    );
    Assert.equal(toolCalls.length, 1, "Should have one tool call");
    Assert.ok(
      toolCalls[0].content.body.tool_calls[0].function.name.includes(
        "search_browsing_history"
      ),
      "Tool call log should mention tool name"
    );
    Assert.ok(toolStub.calledOnce, "Tool should be called once");
    Assert.deepEqual(
      toolStub.firstCall.args[0],
      { searchTerm: "hello" },
      "Tool should receive correct parameters"
    );
    Assert.equal(
      callCount,
      2,
      "Engine should be called twice (initial + after tool)"
    );

    // Turn 2's args must include the assistant tool_call + tool result
    // accumulated on the conversation during turn 1. This guards the accumulator pattern.
    const turn2Args = capturedArgs[1];
    Assert.ok(
      turn2Args.some(
        m => m.role === "assistant" && m.tool_calls?.[0]?.id === "call_123"
      ),
      "Turn 2 snapshot includes the assistant tool_call from turn 1"
    );
    Assert.ok(
      turn2Args.some(m => m.role === "tool" && m.tool_call_id === "call_123"),
      "Turn 2 snapshot includes the tool result from turn 1"
    );
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_Chat_fetchWithHistory_propagates_engine_build_error() {
    const sb = sinon.createSandbox();
    try {
      const err = new Error("engine build failed");
      const fakeEngine = {
        getConfig() {
          return {};
        },
        runWithGenerator() {
          throw err; // throwing error in generation
        },
      };

      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const conversation = new ChatConversation({
        title: "chat title",
        description: "chat desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addUserMessage("Hi", "https://www.firefox.com", 0);
      conversation.addAssistantMessage("text", "");

      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });
      const consume = async () => {
        await Chat.fetchWithHistory({
          conversation,
        });
      };

      await Assert.rejects(
        consume(),
        e => e === err,
        "Should propagate the same error thrown by openAIEngine.build"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_fetchWithHistory_handles_invalid_tool_arguments() {
    const sb = sinon.createSandbox();
    try {
      let callCount = 0;
      const fakeEngine = {
        runWithGenerator(_options) {
          callCount++;
          async function* gen() {
            if (callCount === 1) {
              // First call: yield text and invalid tool call
              yield { text: "Using tool with bad args: " };
              yield {
                toolCalls: [
                  {
                    id: "call_456",
                    function: {
                      name: "search_browsing_history",
                      arguments: "invalid json {",
                    },
                  },
                ],
              };
            } else {
              // Second call: no more tool calls, should exit loop
              yield { text: "Done." };
            }
          }
          return gen();
        },
        getConfig() {
          return {};
        },
      };

      const toolStub = sb
        .stub(toolFns, "searchBrowsingHistory")
        .resolves("should not be called");

      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const conversation = new ChatConversation({
        title: "chat title",
        description: "chat desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addUserMessage(
        "Test bad JSON",
        "https://www.firefox.com",
        0
      );
      conversation.addAssistantMessage("text", "");

      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });
      await Chat.fetchWithHistory({
        conversation,
      });

      Assert.equal(
        getLastAssistantResponse(conversation).content.body,
        "Using tool with bad args: \n\nDone.",
        "Should yield text from both calls"
      );
      Assert.ok(
        toolStub.notCalled,
        "Tool should not be called with invalid JSON"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_fetchWithHistory_handles_tool_call_with_empty_arguments() {
    const sb = sinon.createSandbox();
    try {
      let callCount = 0;
      const fakeEngine = {
        runWithGenerator(_options) {
          callCount++;
          async function* gen() {
            if (callCount === 1) {
              // First call: yield tool call with empty string arguments
              yield { text: "Calling tool with no args: " };
              yield {
                toolCalls: [
                  {
                    id: "call_empty_args",
                    function: {
                      name: "get_open_tabs",
                      arguments: "", // Empty string instead of "{}"
                    },
                  },
                ],
              };
            } else {
              // Second call: after tool execution
              yield { text: "Tool completed." };
            }
          }
          return gen();
        },
        getConfig() {
          return {};
        },
      };

      sb.stub(toolFns, "getOpenTabs").resolves([]);
      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const conversation = new ChatConversation({
        title: "chat title",
        description: "chat desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addUserMessage(
        "Get my open tabs",
        "https://www.firefox.com",
        0
      );
      conversation.addAssistantMessage("text", "");

      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });
      await Chat.fetchWithHistory({
        conversation,
      });

      // Find the assistant message with tool_calls
      const assistantToolCallMessage = conversation.messages.find(
        message =>
          message.role === MESSAGE_ROLE.ASSISTANT &&
          message?.content?.type === "function" &&
          message?.content?.body?.tool_calls
      );

      Assert.ok(
        assistantToolCallMessage,
        "Should have assistant message with tool_calls"
      );
      Assert.equal(
        assistantToolCallMessage.content.body.tool_calls[0].function.arguments,
        "{}",
        "Empty arguments string should be converted to '{}'"
      );
      Assert.ok(
        toolFns.getOpenTabs.calledOnce,
        "Tool should be called once by the tool call"
      );
      Assert.equal(
        getLastAssistantResponse(conversation).content.body,
        "Calling tool with no args: \n\nTool completed.",
        "Should yield text from both calls"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_fetchWithHistory_get_page_content_sets_flags_and_only_works_once() {
    const sb = sinon.createSandbox();
    try {
      let callCount = 0;
      const fakeEngine = {
        runWithGenerator(_options) {
          callCount++;
          async function* gen() {
            if (callCount === 1) {
              yield {
                toolCalls: [
                  {
                    id: "call_gpc_001",
                    function: {
                      name: "get_page_content",
                      arguments: JSON.stringify({ url: "https://example.com" }),
                    },
                  },
                ],
              };
            } else if (callCount === 2) {
              yield {
                toolCalls: [
                  {
                    id: "call_gpc_002",
                    function: {
                      name: "get_page_content",
                      arguments: JSON.stringify({ url: "https://example.com" }),
                    },
                  },
                ],
              };
            } else {
              yield { text: "Final answer." };
            }
          }
          return gen();
        },
        getConfig() {
          return {};
        },
      };

      const getPageContentStub = sb
        .stub(GetPageContent, "getPageContent")
        .callsFake(async (_params, conversation) => {
          const secProps = conversation.securityProperties;
          if (secProps.untrustedInput && secProps.privateData) {
            return [
              `get_page_content is not available for ${_params?.url} when the conversation involves both untrusted input and private data.`,
            ];
          }
          secProps.setUntrustedInput();
          secProps.setPrivateData();
          return ["page content"];
        });
      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const conversation = new ChatConversation({
        title: "flags test",
        description: "desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addUserMessage(
        "Get page content twice",
        "https://www.firefox.com",
        0
      );
      conversation.addAssistantMessage("text", "");

      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });
      await Chat.fetchWithHistory({
        conversation,
      });

      Assert.strictEqual(
        conversation.securityProperties.untrustedInput,
        true,
        "untrusted_input should be true after get_page_content"
      );
      Assert.strictEqual(
        conversation.securityProperties.privateData,
        true,
        "private_data should be true after get_page_content"
      );
      Assert.ok(
        getPageContentStub.calledTwice,
        "get_page_content should be called twice"
      );

      const toolResultMessages = conversation.messages.filter(
        message => message.role === MESSAGE_ROLE.TOOL
      );
      Assert.equal(
        toolResultMessages.length,
        2,
        "Should have two tool result messages"
      );
      Assert.ok(
        String(toolResultMessages[0].content?.body).includes("page content"),
        "First call should return actual content"
      );
      Assert.ok(
        String(toolResultMessages[1].content?.body).includes("not available"),
        "Second call should return refusal"
      );
      Assert.ok(
        getLastAssistantResponse(conversation).content.body.includes(
          "Final answer."
        ),
        "Should yield text from the final engine call"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_Chat_fetchWithHistory_uses_modelId_from_pref() {
  const sb = sinon.createSandbox();
  try {
    const customModelId = "test-custom-model-123";
    Services.prefs.setStringPref(PREF_MODEL, customModelId);

    const fakeRecords = [
      {
        feature: MODEL_FEATURES.CHAT,
        version: getVersionForFeature(MODEL_FEATURES.CHAT),
        model: customModelId,
        is_default: true,
      },
      {
        feature: MODEL_FEATURES.CHAT,
        version: getVersionForFeature(MODEL_FEATURES.CHAT),
        model: "generic",
        is_default: false,
      },
    ];

    _setRemoteClientForTesting({
      get: sb.stub().resolves(fakeRecords),
    });

    const fakeEngineInstance = {
      runWithGenerator(_options) {
        async function* gen() {
          yield { text: "Test response" };
        }
        return gen();
      },
    };

    const createEngineStub = sb
      .stub(openAIEngine, "_createEngine")
      .resolves(fakeEngineInstance);
    sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

    const conversation = new ChatConversation({
      title: "chat title",
      description: "chat desc",
      pageUrl: new URL("https://www.firefox.com"),
      pageMeta: {},
    });
    conversation.addAssistantMessage("text", "");

    await openAIEngine.build({
      model: customModelId,
      serviceType: SERVICE_TYPES.AI,
      purpose: PURPOSES.CHAT,
      flowId: null,
      feature: MODEL_FEATURES.CHAT,
    });

    setupConversationForChat(conversation, {
      model: customModelId,
      engine: fakeEngineInstance,
    });
    await Chat.fetchWithHistory({ conversation });

    Assert.ok(
      createEngineStub.calledOnce,
      "_createEngine should be called once"
    );
    const createEngineArgs = createEngineStub.firstCall.args[0];
    Assert.equal(
      createEngineArgs.modelId,
      customModelId,
      "Engine should be created with the custom model from pref"
    );
  } finally {
    sb.restore();
    Services.prefs.clearUserPref(PREF_MODEL);
  }
});

add_task(
  async function test_Chat_fetchWithHistory_run_search_executes_only_once() {
    const sb = sinon.createSandbox();
    try {
      let callCount = 0;
      const fakeEngine = {
        runWithGenerator(_options) {
          callCount++;
          async function* gen() {
            if (callCount === 1) {
              yield {
                toolCalls: [
                  {
                    id: "call_search_001",
                    function: {
                      name: "run_search",
                      arguments: JSON.stringify({ query: "test query" }),
                    },
                  },
                ],
              };
            } else if (callCount === 2) {
              yield {
                toolCalls: [
                  {
                    id: "call_search_002",
                    function: {
                      name: "run_search",
                      arguments: JSON.stringify({
                        query: "second search query",
                      }),
                    },
                  },
                ],
              };
            } else {
              yield { text: "Final answer." };
            }
          }
          return gen();
        },
        getConfig() {
          return {};
        },
      };

      const runSearchStub = sb
        .stub(RunSearch, "runSearch")
        .resolves("search result");
      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const mockBrowser = {
        documentGlobal: {
          closed: false,
          gBrowser: {
            getTabForBrowser: () => ({ selected: true }),
            selectedTab: null,
          },
        },
      };
      const openSidebarStub = sb.stub().callsFake(() => {});
      const origLazy = ChromeUtils.importESModule(
        "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs"
      );
      const origOpenSidebar = origLazy.AIWindow.openSidebarAndContinue;
      origLazy.AIWindow.openSidebarAndContinue = openSidebarStub;

      const conversation = new ChatConversation({
        title: "search guard test",
        description: "desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addUserMessage(
        "Search for something",
        "https://www.firefox.com",
        0
      );
      conversation.addAssistantMessage("text", "");

      const context = {
        browsingContext: { embedderElement: mockBrowser },
        telemetry: { location: "home" },
      };

      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });
      await Chat.fetchWithHistory({
        conversation,
        browsingContext: context.browsingContext,
      });

      Assert.ok(
        runSearchStub.calledOnce,
        "run_search should be called exactly once"
      );

      // Simulate openSidebarAndContinue calling fetchWithHistory again
      // on the same conversation (same turn). The guard should block
      // execution and the model continues generating text.
      callCount = 1;
      conversation.addAssistantMessage("text", "");
      await Chat.fetchWithHistory({
        conversation,
        browsingContext: context.browsingContext,
      });

      Assert.ok(
        runSearchStub.calledOnce,
        "run_search should still be called exactly once after second fetchWithHistory"
      );
      Assert.equal(
        getLastAssistantResponse(conversation).content.body,
        "Final answer.",
        "Model should continue generating text after blocked search"
      );

      // Verify guard message is in conversation with correct text
      const toolMessages = conversation.messages.filter(
        msg => msg.role === MESSAGE_ROLE.TOOL
      );
      const guardMessage = toolMessages.find(msg =>
        String(msg.content?.body).includes("ERROR: run_search tool call error:")
      );
      Assert.ok(guardMessage, "Guard tool result should be in conversation");

      // Simulate user sending "Go ahead" (new turn). Guard should allow.
      conversation.addUserMessage("Go ahead", "https://www.firefox.com", 0);
      conversation.addAssistantMessage("text", "");
      callCount = 0;
      await Chat.fetchWithHistory({
        conversation,
        browsingContext: context.browsingContext,
      });

      Assert.ok(
        runSearchStub.calledTwice,
        "run_search should be called twice total (once per turn)"
      );

      origLazy.AIWindow.openSidebarAndContinue = origOpenSidebar;
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_fetchWithHistory_get_user_memories_called_when_memories_enabled() {
    const sb = sinon.createSandbox();
    try {
      let callCount = 0;
      const fakeEngine = {
        runWithGenerator(_options) {
          callCount++;
          async function* gen() {
            if (callCount === 1) {
              yield {
                toolCalls: [
                  {
                    id: "call_get_user_memories_001",
                    function: {
                      name: "get_user_memories",
                      arguments: JSON.stringify({}),
                    },
                  },
                ],
              };
            } else {
              yield { text: "Final answer." };
            }
          }
          return gen();
        },
        getConfig() {
          return {};
        },
      };

      sb.stub(toolFns, "getUserMemories").resolves("list of memories");
      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const conversation = new ChatConversation({
        title: "memories are enabled",
        description: "desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addUserMessage(
        "What memories have you saved about me?",
        "https://www.firefox.com",
        { memoriesEnabled: true }
      );
      conversation.addAssistantMessage("text", "");

      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });
      await Chat.fetchWithHistory({
        conversation,
      });

      Assert.ok(
        toolFns.getUserMemories.calledOnce,
        "get_user_memories should be called exactly once"
      );

      // Verify tool response is in the conversation
      const toolMessages = conversation.messages.filter(
        msg => msg.role === MESSAGE_ROLE.TOOL
      );
      const getUserMemoriesErrorMsg = toolMessages.find(msg =>
        String(msg.content?.body).includes("list of memories")
      );
      Assert.ok(
        getUserMemoriesErrorMsg,
        "get_user_memories should return the correct string when memories are enabled"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_fetchWithHistory_get_user_memories_returns_error_when_memories_disabled() {
    const sb = sinon.createSandbox();
    try {
      let callCount = 0;
      const fakeEngine = {
        runWithGenerator(_options) {
          callCount++;
          async function* gen() {
            if (callCount === 1) {
              yield {
                toolCalls: [
                  {
                    id: "call_get_user_memories_001",
                    function: {
                      name: "get_user_memories",
                      arguments: JSON.stringify({}),
                    },
                  },
                ],
              };
            } else {
              yield { text: "Final answer." };
            }
          }
          return gen();
        },
        getConfig() {
          return {};
        },
      };

      sb.stub(toolFns, "getUserMemories").resolves("list of memories");
      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const conversation = new ChatConversation({
        title: "memories are enabled",
        description: "desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addUserMessage(
        "What memories have you saved about me?",
        "https://www.firefox.com",
        { memoriesEnabled: false }
      );
      conversation.addAssistantMessage("text", "");

      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });
      await Chat.fetchWithHistory({
        conversation,
      });

      Assert.ok(
        !toolFns.getUserMemories.calledOnce,
        "get_user_memories should not be called when memories are disabled"
      );

      // Verify tool response is in conversation with correct text
      const toolMessages = conversation.messages.filter(
        msg => msg.role === MESSAGE_ROLE.TOOL
      );
      const getUserMemoriesErrorMsg = toolMessages.find(msg =>
        String(msg.content?.body).includes(
          "ERROR: get_user_memories tool call error:"
        )
      );
      Assert.ok(
        getUserMemoriesErrorMsg,
        "get_user_memories error should be raised when memories are disabled"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_fetchWithHistory_forwards_signal_to_runWithGenerator() {
    const sb = sinon.createSandbox();
    try {
      let capturedOptions = null;
      const fakeEngine = {
        runWithGenerator(options) {
          capturedOptions = options;
          async function* gen() {
            yield { text: "Hello" };
          }
          return gen();
        },
        getConfig() {
          return {};
        },
      };

      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const conversation = new ChatConversation({
        title: "chat title",
        description: "chat desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addSystemMessage(
        SYSTEM_PROMPT_TYPE.TEXT,
        "You are helpful",
        0
      );
      conversation.addUserMessage("Hi there", "https://www.firefox.com", 0);
      conversation.addAssistantMessage("text", "");

      const abortController = new AbortController();
      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });

      await Chat.fetchWithHistory({
        conversation,
        signal: abortController.signal,
      });

      Assert.strictEqual(
        capturedOptions.signal,
        abortController.signal,
        "signal should be forwarded to runWithGenerator"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_fetchWithHistory_abort_during_tool_stops_generation() {
    const sb = sinon.createSandbox();
    try {
      const abortController = new AbortController();

      const fakeEngine = {
        runWithGenerator(options) {
          // If already aborted, yield nothing so receiveResponse returns no tool calls.
          if (options.signal?.aborted) {
            return (async function* () {})();
          }
          return (async function* () {
            yield {
              toolCalls: [
                {
                  id: "call_001",
                  function: {
                    name: "search_browsing_history",
                    arguments: JSON.stringify({ searchTerm: "test" }),
                  },
                },
              ],
            };
          })();
        },
        getConfig() {
          return {};
        },
      };

      sb.stub(toolFns, "searchBrowsingHistory").callsFake(async () => {
        abortController.abort();
        return "tool result";
      });
      sb.stub(openAIEngine, "getFxAccountToken").resolves("mock_token");

      const conversation = new ChatConversation({
        title: "chat title",
        description: "chat desc",
        pageUrl: new URL("https://www.firefox.com"),
        pageMeta: {},
      });
      conversation.addUserMessage("Hi there", "https://www.firefox.com", 0);
      conversation.addAssistantMessage("text", "");

      setupConversationForChat(conversation, {
        model: TEST_MODEL,
        engine: fakeEngine,
      });

      await Chat.fetchWithHistory({
        conversation,
        signal: abortController.signal,
      });

      Assert.equal(
        getLastAssistantResponse(conversation).content.body,
        "",
        "Should produce no assistant text response after abort during tool execution"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_Chat_executeToolByName_throws_unknownTool_clientReason() {
    await Assert.rejects(
      executeToolByName(
        "no_such_tool",
        {},
        "tool-call-id",
        /* conversation */ null,
        /* browsingContext */ null,
        "fullpage",
        0
      ),
      err => err.clientReason === "unknownTool",
      "executeToolByName should reject with clientReason unknownTool"
    );
  }
);
