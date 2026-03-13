/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_handleTokens_updates_chatMessage() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  // Open AI Window to get access to ai-window element
  const newAIWindow = await BrowserTestUtils.openNewBrowserWindow({
    openerWindow: null,
    aiWindow: true,
  });
  const browser = newAIWindow.gBrowser.selectedBrowser;

  await SpecialPowers.spawn(browser, [], async () => {
    await content.customElements.whenDefined("ai-window");

    const aiWindowElement = content.document.querySelector("ai-window");
    Assert.ok(aiWindowElement, "ai-window element should exist");

    // Create a mock message that matches the real message structure
    const mockMessage = {
      tokens: {
        search: [],
        existing_memory: [],
      },
      webSearchQueries: [],
    };

    // Test tokens including memory and non-memory tokens
    const testTokens = [
      { key: "existing_memory", value: "user asked about cats" },
      { key: "search", value: "cat behavior" }, // non-memory token
      { key: "existing_memory", value: "user prefers tabby cats" },
      { key: "existing_memory", value: "user has a pet cat named Fluffy" },
    ];

    // Call the actual handleTokens method
    aiWindowElement.handleTokens(testTokens, mockMessage);

    // Verify memory IDs are accumulated in _pendingMemoryIds, not memoriesApplied,
    // so the "Memories used" button stays hidden until IDs are resolved post-stream.
    Assert.equal(
      mockMessage._pendingMemoryIds.length,
      3,
      "Should have 3 memory IDs in _pendingMemoryIds"
    );
    Assert.equal(
      mockMessage._pendingMemoryIds[0],
      "user asked about cats",
      "First memory ID should match"
    );
    Assert.equal(
      mockMessage._pendingMemoryIds[1],
      "user prefers tabby cats",
      "Second memory ID should match"
    );
    Assert.equal(
      mockMessage._pendingMemoryIds[2],
      "user has a pet cat named Fluffy",
      "Third memory ID should match"
    );

    Assert.equal(
      mockMessage.memoriesApplied,
      undefined,
      "memoriesApplied should not be set during streaming"
    );

    // Verify all tokens (including non-memory) were added to tokens object
    Assert.equal(
      mockMessage.tokens.existing_memory.length,
      3,
      "Should have 3 existing_memory tokens in tokens object"
    );
    Assert.equal(
      mockMessage.tokens.search.length,
      1,
      "Should have 1 search token"
    );
    Assert.equal(
      mockMessage.tokens.search[0],
      "cat behavior",
      "Search token should match"
    );

    // Verify non-memory tokens were NOT added to _pendingMemoryIds
    Assert.ok(
      !mockMessage._pendingMemoryIds.includes("cat behavior"),
      "Search tokens should not be in _pendingMemoryIds"
    );

    // Verify webSearchQueries array was populated with search tokens
    Assert.equal(
      mockMessage.webSearchQueries.length,
      1,
      "Should have 1 search token in webSearchQueries"
    );
    Assert.equal(
      mockMessage.webSearchQueries[0],
      "cat behavior",
      "webSearchQueries should contain the search token"
    );
  });

  await BrowserTestUtils.closeWindow(newAIWindow);
  await SpecialPowers.popPrefEnv();
});
