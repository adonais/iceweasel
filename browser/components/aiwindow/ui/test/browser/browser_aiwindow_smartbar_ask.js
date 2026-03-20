/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.search.suggest.enabled", false]],
  });
});

/**
 * Arrowing down to an "Ask" row in the smartbar should not
 * delete the typed query.
 */
add_task(async function test_arrow_to_ask_preserves_value() {
  info("test_arrow: opening AI window");
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;
  info("test_arrow: AI window open, typing in smartbar");

  const query = "tell me a random fact about something";
  await promiseSmartbarSuggestionsOpen(browser, () =>
    typeInSmartbar(browser, query)
  );
  info("test_arrow: suggestions open, entering spawn");

  await SpecialPowers.spawn(browser, [query], async expectedQuery => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );

    const selectedType = () =>
      smartbar.querySelector(".urlbarView-row[selected]")?.getAttribute("type");

    Assert.equal(
      selectedType(),
      "ai_chat",
      "Initial selection should be the AI_CHAT heuristic row"
    );

    // ArrowDown away from AI_CHAT to the next row.
    EventUtils.synthesizeKey("KEY_ArrowDown", {}, content);
    await ContentTaskUtils.waitForCondition(
      () => selectedType() !== "ai_chat",
      "Selection should move away from ai_chat"
    );

    // ArrowDown again to wrap back to the AI_CHAT row.
    EventUtils.synthesizeKey("KEY_ArrowDown", {}, content);
    await ContentTaskUtils.waitForCondition(
      () => selectedType() === "ai_chat",
      "Selection should wrap back to ai_chat"
    );

    Assert.equal(
      smartbar.value,
      expectedQuery,
      "Smartbar value should be preserved after arrowing to the Ask row"
    );
  });

  await BrowserTestUtils.closeWindow(win);
});

/**
 * Clicking the AI_CHAT ("Ask") row in the dropdown should pick the result,
 * close the view, and submit the query to the chat conversation.
 * Verified via the Chat.fetchWithHistory call-site (integration-level check).
 */
add_task(async function test_click_ask_row_picks_result() {
  const sb = sinon.createSandbox();

  try {
    const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory");
    sb.stub(openAIEngine, "build").resolves({
      loadPrompt: () => Promise.resolve("Mock system prompt"),
    });

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const query = "tell me a random fact about something?";
    await promiseSmartbarSuggestionsOpen(browser, () =>
      typeInSmartbar(browser, query)
    );

    await SpecialPowers.spawn(browser, [], async () => {
      const aiWindowElement = content.document.querySelector("ai-window");
      const smartbar = aiWindowElement.shadowRoot.querySelector(
        "#ai-window-smartbar"
      );

      const aiChatRow = smartbar.querySelector(
        '.urlbarView-row[type="ai_chat"]'
      );
      Assert.ok(aiChatRow, "AI_CHAT row should exist in the dropdown");

      EventUtils.synthesizeMouseAtCenter(aiChatRow, {}, content);

      await ContentTaskUtils.waitForCondition(
        () => !smartbar.view.isOpen,
        "View should close after clicking the AI_CHAT row"
      );

      Assert.equal(
        smartbar.value,
        "",
        "Smartbar should be cleared after clicking the AI_CHAT row"
      );
    });

    await TestUtils.waitForCondition(
      () => fetchWithHistoryStub.calledOnce,
      "fetchWithHistory should be called after picking the AI_CHAT row"
    );

    const conversation = fetchWithHistoryStub.firstCall.args[0];
    const messages = conversation.getMessagesInOpenAiFormat();
    const userMessage = messages.findLast(m => m.role === "user");
    Assert.equal(
      userMessage.content,
      query,
      "Chat conversation should contain the picked query"
    );

    await BrowserTestUtils.closeWindow(win);
  } finally {
    sb.restore();
  }
});
