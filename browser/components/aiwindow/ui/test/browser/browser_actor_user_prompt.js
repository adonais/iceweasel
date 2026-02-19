/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test user prompt dispatch through updated actor system
 */
add_task(async function test_user_prompt_dispatch() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", true]],
  });

  await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
    const actor =
      browser.browsingContext.currentWindowGlobal.getActor("AIChatContent");

    // Test that dispatchUserPrompt method exists and can be called
    const testPrompt = {
      role: "user",
      content: "Hello, AI!",
    };
    const result = await actor.dispatchMessageToChatContent(testPrompt);

    // The method should return true for successful dispatch
    Assert.equal(
      result,
      undefined, // actor is async instead of query now?
      "dispatchUserPrompt should complete successfully"
    );
  });
});

/**
 * Test updated AI response dispatch method works correctly
 */
add_task(async function test_streaming_ai_response() {
  await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
    const actor =
      browser.browsingContext.currentWindowGlobal.getActor("AIChatContent");

    // Test streaming response format
    const streamingResponse = {
      role: "assistant",
      content: "Partial AI response...",
      latestAssistantMessageIndex: 0,
    };

    const result = await actor.dispatchMessageToChatContent(streamingResponse);
    Assert.equal(
      result,
      undefined, // actor is async instead of query now?
      "Streaming AI response should be dispatched successfully"
    );
  });

  await SpecialPowers.popPrefEnv();
});
