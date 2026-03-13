/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_addTokens_builds_followupSuggestions_array() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.aiwindow.enabled", true]],
  });

  // Open AI Window to get access to ChatMessage class
  const newAIWindow = await BrowserTestUtils.openNewBrowserWindow({
    openerWindow: null,
    aiWindow: true,
  });
  const browser = newAIWindow.gBrowser.selectedBrowser;

  await SpecialPowers.spawn(browser, [], async () => {
    // Import ChatMessage class
    const { ChatMessage } = ChromeUtils.importESModule(
      "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs"
    );

    // Create a ChatMessage instance with required initial arrays
    const mockMessage = new ChatMessage({
      ordinal: 0,
      role: 1, // ASSISTANT
      content: { body: "Test message" },
      memoriesApplied: [],
      webSearchQueries: [],
      followUpSuggestions: [],
    });

    // Test tokens including followup and non-followup tokens
    const testTokens = [
      { key: "followup", value: "What are the best cat breeds?" },
      { key: "search", value: "cat behavior" }, // non-followup token
      { key: "followup", value: "How do I train my cat?" },
      { key: "existing_memory", value: "user has a pet cat" }, // non-followup token
      { key: "followup", value: "What foods are safe for cats?" },
    ];

    // Call the actual addTokens method
    mockMessage.addTokens(testTokens);

    // Verify followup questions were added to followUpSuggestions
    Assert.equal(
      mockMessage.followUpSuggestions.length,
      3,
      "Should have 3 followup questions in followUpSuggestions"
    );
    Assert.equal(
      mockMessage.followUpSuggestions[0],
      "What are the best cat breeds?",
      "First followup question should match"
    );
    Assert.equal(
      mockMessage.followUpSuggestions[1],
      "How do I train my cat?",
      "Second followup question should match"
    );
    Assert.equal(
      mockMessage.followUpSuggestions[2],
      "What foods are safe for cats?",
      "Third followup question should match"
    );

    // Verify all tokens (including non-followup) were added to tokens object
    Assert.equal(
      mockMessage.tokens.followup.length,
      3,
      "Should have 3 followup tokens in tokens object"
    );
    Assert.equal(
      mockMessage.tokens.search.length,
      1,
      "Should have 1 search token"
    );
    Assert.equal(
      mockMessage.tokens.existing_memory.length,
      1,
      "Should have 1 existing_memory token"
    );
    Assert.equal(
      mockMessage.tokens.search[0],
      "cat behavior",
      "Search token should match"
    );
    Assert.equal(
      mockMessage.tokens.existing_memory[0],
      "user has a pet cat",
      "Memory token should match"
    );

    // Verify non-followup tokens were NOT added to followUpSuggestions
    Assert.ok(
      !mockMessage.followUpSuggestions.includes("cat behavior"),
      "Search tokens should not be in followUpSuggestions"
    );
    Assert.ok(
      !mockMessage.followUpSuggestions.includes("user has a pet cat"),
      "Memory tokens should not be in followUpSuggestions"
    );

    // Verify followup tokens were added to the tokens.followup array
    Assert.equal(
      mockMessage.tokens.followup[0],
      "What are the best cat breeds?",
      "First followup token should match in tokens array"
    );
    Assert.equal(
      mockMessage.tokens.followup[1],
      "How do I train my cat?",
      "Second followup token should match in tokens array"
    );
    Assert.equal(
      mockMessage.tokens.followup[2],
      "What foods are safe for cats?",
      "Third followup token should match in tokens array"
    );
  });

  await BrowserTestUtils.closeWindow(newAIWindow);
  await SpecialPowers.popPrefEnv();
});
