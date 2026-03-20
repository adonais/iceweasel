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

    await withServer({ streamChunks: ["Hello from mock."] }, async () => {
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
    });
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
      "1",
      "model_response: error code is captured"
    );
  });
});
