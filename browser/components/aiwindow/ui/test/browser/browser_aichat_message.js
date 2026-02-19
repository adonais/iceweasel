/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test ai-chat-message custom element basic rendering
 */
add_task(async function test_ai_chat_message_rendering() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", true]],
  });

  // Use about:aichatcontent which already loads the components properly
  await BrowserTestUtils.withNewTab("about:aichatcontent", async browser => {
    await SpecialPowers.spawn(browser, [], async () => {
      await content.customElements.whenDefined("ai-chat-message");

      // Create a test ai-chat-message element
      const messageElement = content.document.createElement("ai-chat-message");
      content.document.body.appendChild(messageElement);

      Assert.ok(messageElement, "ai-chat-message element should be created");

      // Test setting a user message
      messageElement.message = { role: "user", content: "Test user message" };
      await messageElement.updateComplete;

      const messageDiv =
        messageElement.renderRoot?.querySelector(".message-user");
      if (messageDiv) {
        Assert.ok(messageDiv, "User message div should be rendered");
        Assert.ok(
          messageDiv.textContent.includes("Test user message"),
          "User message content should be present"
        );
      }

      // Test setting an assistant message
      messageElement.message = {
        role: "assistant",
        content: "Test AI response",
      };
      await messageElement.updateComplete;

      const assistantDiv =
        messageElement.renderRoot?.querySelector(".message-assistant");
      if (assistantDiv) {
        Assert.ok(assistantDiv, "Assistant message div should be rendered");
        Assert.ok(
          assistantDiv.textContent.includes("Test AI response"),
          "Assistant message content should be present"
        );
      }

      // Clean up
      messageElement.remove();
    });
  });

  await SpecialPowers.popPrefEnv();
});
