/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  IntentClassifier:
    "moz-src:///browser/components/aiwindow/models/IntentClassifier.sys.mjs",
});

describe("SmartWindowFirstCharacterTelemetry", () => {
  let sb;

  beforeEach(async () => {
    sb = sinon.createSandbox();
    sb.stub(lazy.IntentClassifier, "getPromptIntent").resolves("chat");
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.firstrun.modelChoice", "0"],
        ["browser.smartwindow.customEndpoint", "http://localhost:0/v1"],
      ],
    });
    Services.fog.testResetFOG();
  });

  afterEach(async () => {
    sb.restore();
    await SpecialPowers.popPrefEnv();
  });

  it("records the first rendered character after non-text tokens", async () => {
    const visibleText = Promise.withResolvers();
    await AIWindowTestUtils.withHTTPChatWindow(
      {
        streamChunks: ["§followup:next question§", "Hello", " world."],
        beforeStreamChunk: index =>
          index === 1 ? visibleText.promise : undefined,
      },
      async ({ browser }) => {
        try {
          await typeInSmartbar(browser, "testing first character telemetry");
          await submitSmartbar(browser);

          const aiWindow = browser.contentDocument.querySelector("ai-window");
          await TestUtils.waitForCondition(
            () =>
              aiWindow.conversation.messages.some(message =>
                message.tokens?.followup?.includes("next question")
              ),
            "The non-text token is processed before visible text is released"
          );
          Assert.equal(
            Glean.smartWindow.timeToFirstCharacter.testGetValue(),
            undefined,
            "Non-text tokens do not record a first rendered character"
          );
          visibleText.resolve();

          await TestUtils.waitForCondition(
            () => Glean.smartWindow.modelResponse.testGetValue()?.length === 1,
            "Wait for the model response"
          );
          await TestUtils.waitForCondition(
            () => Glean.smartWindow.timeToFirstCharacter.testGetValue()?.length,
            "Wait for the first rendered character"
          );

          const request = Glean.smartWindow.modelRequest.testGetValue()[0];
          const response = Glean.smartWindow.modelResponse.testGetValue()[0];
          const firstCharacter =
            Glean.smartWindow.timeToFirstCharacter.testGetValue()[0];

          Assert.equal(
            firstCharacter.extra.request_id,
            request.extra.request_id,
            "First character is associated with the submitted request"
          );
          Assert.equal(
            firstCharacter.extra.chat_id,
            response.extra.chat_id,
            "First character is associated with the response conversation"
          );
          Assert.greaterOrEqual(
            Number(firstCharacter.extra.latency),
            Number(response.extra.latency),
            "The first character is reported no earlier than the first token"
          );
          Assert.equal(
            Glean.smartWindow.timeToFirstCharacter.testGetValue().length,
            1,
            "Only one first-character event is recorded for the response"
          );
        } finally {
          visibleText.resolve();
        }
      }
    );
  });
});
