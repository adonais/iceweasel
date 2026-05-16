/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  IntentClassifier:
    "moz-src:///browser/components/aiwindow/models/IntentClassifier.sys.mjs",
});

describe("SmartWindowRequestResponseTelemetry", () => {
  let win;
  let sb;

  beforeEach(async () => {
    sb = sinon.createSandbox();
    sb.stub(lazy.IntentClassifier, "getPromptIntent").resolves("chat");
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.firstrun.modelChoice", "0"]],
    });
    Services.fog.testResetFOG();
  });

  afterEach(async () => {
    if (win) {
      await BrowserTestUtils.closeWindow(win);
      win = null;
    }
    sb.restore();
    await SpecialPowers.popPrefEnv();
  });

  it("records model_request and model_response on success", async () => {
    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    await withServer(
      { streamChunks: ["Hello from mock."], streamChunkDelayMs: 25 },
      async () => {
        await typeInSmartbar(browser, "testing telemetry");
        await submitSmartbar(browser);
        await TestUtils.waitForCondition(
          () => Glean.smartWindow.modelResponse.testGetValue()?.length > 0,
          "Wait for model_response event"
        );

        const requestEvents = Glean.smartWindow.modelRequest.testGetValue();
        Assert.equal(
          requestEvents?.length,
          1,
          "One model_request event was recorded"
        );
        Assert.equal(
          requestEvents[0].extra.location,
          "home",
          "model_request: location is home"
        );
        Assert.equal(
          requestEvents[0].extra.intent,
          "chat",
          "model_request: intent is chat"
        );
        Assert.equal(
          requestEvents[0].extra.message_seq,
          1,
          "model_request: message_seq is 1"
        );
        Assert.equal(
          requestEvents[0].extra.memories,
          0,
          "model_request: memories is 0"
        );
        Assert.ok(
          "tokens" in requestEvents[0].extra,
          "model_request: tokens exists"
        );
        Assert.ok(
          "chat_id" in requestEvents[0].extra,
          "model_request: chat_id exists"
        );
        Assert.ok(
          "request_id" in requestEvents[0].extra,
          "model_request: request_id exists"
        );

        const responseEvents = Glean.smartWindow.modelResponse.testGetValue();
        Assert.equal(
          responseEvents?.length,
          1,
          "One model_response event was recorded"
        );
        Assert.equal(
          responseEvents[0].extra.location,
          "home",
          "model_response: location is home"
        );
        Assert.equal(
          responseEvents[0].extra.model,
          "custom-model",
          "model_response: model is custom-model"
        );
        Assert.equal(
          responseEvents[0].extra.intent,
          "chat",
          "model_response: intent is chat"
        );
        Assert.equal(
          responseEvents[0].extra.message_seq,
          2,
          "model_response: message_seq is 2"
        );
        Assert.equal(
          responseEvents[0].extra.memories,
          0,
          "model_response: memories is 0"
        );
        Assert.ok(
          "tokens" in responseEvents[0].extra,
          "model_response: tokens exists"
        );
        Assert.ok(
          "duration" in responseEvents[0].extra,
          "model_response: duration exists"
        );
        Assert.ok(
          "latency" in responseEvents[0].extra,
          "model_response: latency exists"
        );
        Assert.greater(
          Number(responseEvents[0].extra.latency),
          0,
          "model_response: latency is greater than 0"
        );
        Assert.ok(
          "chat_id" in responseEvents[0].extra,
          "model_response: chat_id exists"
        );
        Assert.ok(
          "request_id" in responseEvents[0].extra,
          "model_response: request_id exists"
        );
        Assert.ok(
          "error" in responseEvents[0].extra,
          "model_response: error attribute exists"
        );
        Assert.ok(
          !responseEvents[0].extra.error,
          "model_response: error is empty"
        );
      }
    );
  });

  it("multi-turn conversation has consistent E2E telemetry", async () => {
    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const buildSpy = sb.spy(openAIEngine, "build");

    await withServer(
      { streamChunks: ["Reply from mock."], streamChunkDelayMs: 25 },
      async () => {
        // -- Turn 1 --
        await typeInSmartbar(browser, "first message");
        await submitSmartbar(browser);
        await TestUtils.waitForCondition(
          () => Glean.smartWindow.modelResponse.testGetValue()?.length >= 1,
          "Wait for turn 1 model_response"
        );

        // -- Turn 2 --
        await typeInSmartbar(browser, "second message");
        await submitSmartbar(browser);
        await TestUtils.waitForCondition(
          () => Glean.smartWindow.modelResponse.testGetValue()?.length >= 2,
          "Wait for turn 2 model_response"
        );

        // -- Verify chat_submit events --
        const chatSubmits = Glean.smartWindow.chatSubmit.testGetValue();
        Assert.equal(chatSubmits.length, 2, "Two chat_submit events recorded");

        const chatId = chatSubmits[0].extra.chat_id;
        Assert.ok(chatId, "chat_id is present");
        Assert.equal(
          chatSubmits[1].extra.chat_id,
          chatId,
          "Both turns share the same chat_id"
        );

        // -- Verify model_request events --
        const modelRequests = Glean.smartWindow.modelRequest.testGetValue();
        Assert.equal(
          modelRequests.length,
          2,
          "Two model_request events recorded"
        );
        Assert.equal(
          modelRequests[0].extra.chat_id,
          chatId,
          "Turn 1 model_request has same chat_id"
        );
        Assert.equal(
          modelRequests[1].extra.chat_id,
          chatId,
          "Turn 2 model_request has same chat_id"
        );
        Assert.equal(
          modelRequests[0].extra.message_seq,
          1,
          "Turn 1 model_request message_seq is 1"
        );
        Assert.equal(
          modelRequests[1].extra.message_seq,
          3,
          "Turn 2 model_request message_seq is 3"
        );

        // -- Verify model_response events --
        const modelResponses = Glean.smartWindow.modelResponse.testGetValue();
        Assert.equal(
          modelResponses.length,
          2,
          "Two model_response events recorded"
        );
        Assert.equal(
          modelResponses[0].extra.chat_id,
          chatId,
          "Turn 1 model_response has same chat_id"
        );
        Assert.equal(
          modelResponses[1].extra.chat_id,
          chatId,
          "Turn 2 model_response has same chat_id"
        );
        Assert.equal(
          modelResponses[0].extra.message_seq,
          2,
          "Turn 1 model_response message_seq is 2"
        );
        Assert.equal(
          modelResponses[1].extra.message_seq,
          4,
          "Turn 2 model_response message_seq is 4"
        );
        Assert.greater(
          Number(modelResponses[0].extra.latency),
          0,
          "Turn 1 has latency"
        );
        Assert.greater(
          Number(modelResponses[0].extra.duration),
          0,
          "Turn 1 has duration"
        );
        Assert.greater(
          Number(modelResponses[1].extra.latency),
          0,
          "Turn 2 has latency"
        );
        Assert.greater(
          Number(modelResponses[1].extra.duration),
          0,
          "Turn 2 has duration"
        );

        const chatBuildCalls = buildSpy
          .getCalls()
          .filter(call => call.args[0] === "chat");
        Assert.greaterOrEqual(
          chatBuildCalls.length,
          2,
          "At least two chat engine builds (one per turn)"
        );
        for (const call of chatBuildCalls) {
          Assert.equal(
            call.args[1],
            chatId,
            "Every chat engine build receives conversationId as flowId"
          );
        }

        const runtimeCreations = (
          Glean.firefoxAiRuntime.engineCreationSuccessFlow.testGetValue() ?? []
        ).filter(e => e.extra.flow_id === chatId);
        Assert.greaterOrEqual(
          runtimeCreations.length,
          1,
          "Engine creation event carries our chat_id as flow_id"
        );

        const engineRuns = (
          Glean.firefoxAiRuntime.engineRun.testGetValue() ?? []
        ).filter(e => e.extra.flow_id === chatId);
        Assert.greaterOrEqual(
          engineRuns.length,
          2,
          "At least two engineRun events carry our chat_id as flow_id (one per turn)"
        );
      }
    );
  });

  it("separate conversations have isolated IDs", async () => {
    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const buildSpy = sb.spy(openAIEngine, "build");

    await withServer(
      { streamChunks: ["Response."], streamChunkDelayMs: 25 },
      async () => {
        // -- Conversation A --
        await typeInSmartbar(browser, "conversation A");
        await submitSmartbar(browser);
        await TestUtils.waitForCondition(
          () => Glean.smartWindow.modelResponse.testGetValue()?.length >= 1,
          "Wait for conversation A model_response"
        );

        const chatSubmitsA = Glean.smartWindow.chatSubmit.testGetValue();
        const chatIdA = chatSubmitsA[0].extra.chat_id;

        // -- Start new chat (resets conversationId) --
        await SpecialPowers.spawn(browser, [], async () => {
          const aiWindow = content.document.querySelector("ai-window");
          aiWindow.onCreateNewChatClick();
        });

        // -- Conversation B --
        await typeInSmartbar(browser, "conversation B");
        await submitSmartbar(browser);
        await TestUtils.waitForCondition(
          () => Glean.smartWindow.chatSubmit.testGetValue()?.length >= 2,
          "Wait for conversation B chat_submit"
        );

        const chatSubmits = Glean.smartWindow.chatSubmit.testGetValue();
        Assert.equal(chatSubmits.length, 2, "Two chat_submit events total");

        const chatIdB = chatSubmits[1].extra.chat_id;

        Assert.ok(chatIdA, "Conversation A has a chat_id");
        Assert.ok(chatIdB, "Conversation B has a chat_id");
        Assert.notEqual(
          chatIdA,
          chatIdB,
          "Conversations A and B have different chat_ids"
        );

        const chatBuilds = buildSpy
          .getCalls()
          .filter(call => call.args[0] === "chat");
        Assert.greaterOrEqual(
          chatBuilds.length,
          2,
          "At least two chat engine builds"
        );

        const flowIds = new Set(chatBuilds.map(call => call.args[1]));
        Assert.ok(
          flowIds.has(chatIdA),
          "Engine build for conversation A used chatIdA as flowId"
        );
        Assert.ok(
          flowIds.has(chatIdB),
          "Engine build for conversation B used chatIdB as flowId"
        );
        Assert.greaterOrEqual(
          flowIds.size,
          2,
          "flowIds are distinct across conversations"
        );
      }
    );
  });

  it("createEngine error path receives flowId matching chat_id", async () => {
    const createError = new Error("engine process unavailable");
    createError.error = 1;
    const createEngineSpy = sb
      .stub(openAIEngine, "_createEngine")
      .rejects(createError);

    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;
    await typeInSmartbar(browser, "trigger engine error");
    await submitSmartbar(browser);

    await TestUtils.waitForCondition(
      () => Glean.smartWindow.modelResponse.testGetValue()?.length > 0,
      "Wait for model_response event with error"
    );

    const responseEvents = Glean.smartWindow.modelResponse.testGetValue();
    const chatId = responseEvents[0].extra.chat_id;
    Assert.ok(chatId, "Error response has a non-empty chat_id");

    const chatCreateCalls = createEngineSpy
      .getCalls()
      .filter(call => call.args[0]?.featureId === "chat");
    Assert.greaterOrEqual(
      chatCreateCalls.length,
      1,
      "At least one chat createEngine call"
    );
    Assert.equal(
      chatCreateCalls[0].args[0].flowId,
      chatId,
      "createEngine received flowId matching chat_id"
    );
  });

  it("records model_response with error when build fails", async () => {
    const error = new Error("test error");
    error.error = 1;
    sb.stub(openAIEngine, "build").rejects(error);

    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;
    await typeInSmartbar(browser, "trigger error");
    await submitSmartbar(browser);

    await TestUtils.waitForCondition(
      () => Glean.smartWindow.modelResponse.testGetValue()?.length > 0,
      "Wait for model_response event with error"
    );

    const requestEvents = Glean.smartWindow.modelRequest.testGetValue();
    Assert.equal(
      requestEvents,
      undefined,
      "No model_request event when build fails"
    );

    const responseEvents = Glean.smartWindow.modelResponse.testGetValue();
    Assert.equal(
      responseEvents?.length,
      1,
      "One model_response event was recorded"
    );
    Assert.equal(
      responseEvents[0].extra.location,
      "home",
      "model_response: location is home"
    );
    Assert.equal(
      responseEvents[0].extra.model,
      "custom-model",
      "model_response: model is custom-model"
    );
    Assert.equal(
      responseEvents[0].extra.message_seq,
      0,
      "model_response: message_seq is 0"
    );
    Assert.equal(
      responseEvents[0].extra.memories,
      0,
      "model_response: memories is 0"
    );
    Assert.equal(
      responseEvents[0].extra.intent,
      "chat",
      "model_response: intent is chat"
    );
    Assert.ok(
      "tokens" in responseEvents[0].extra,
      "model_response: tokens exists"
    );
    Assert.ok(
      "duration" in responseEvents[0].extra,
      "model_response: duration exists"
    );
    Assert.ok(
      "latency" in responseEvents[0].extra,
      "model_response: latency exists"
    );
    Assert.ok(
      "chat_id" in responseEvents[0].extra,
      "model_response: chat_id exists"
    );
    Assert.ok(
      "error" in responseEvents[0].extra,
      "model_response: error attribute exists"
    );
    Assert.equal(
      responseEvents[0].extra.error,
      "Budget exceeded",
      "model_response: error code is 1 which is budget exceeded"
    );
  });
});
