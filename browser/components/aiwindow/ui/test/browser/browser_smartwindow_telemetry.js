/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SmartWindowTelemetry } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/SmartWindowTelemetry.sys.mjs"
);

async function dispatchSmartbarCommit(browser, value, action) {
  await SpecialPowers.spawn(browser, [value, action], async (val, act) => {
    const aiWindow = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindow.shadowRoot.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );

    const commitEvent = new content.CustomEvent("smartbar-commit", {
      detail: {
        value: val,
        action: act,
      },
      bubbles: true,
      composed: true,
    });

    smartbar.ownerDocument.dispatchEvent(commitEvent);
  });
}

async function dispatchMemoriesToggle(browser, pressed) {
  await SpecialPowers.spawn(browser, [pressed], async pressedState => {
    const aiWindow = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindow.shadowRoot.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );

    const toggleEvent = new content.CustomEvent(
      "aiwindow-memories-toggle:on-change",
      {
        detail: { pressed: pressedState },
        bubbles: true,
        composed: true,
      }
    );

    smartbar.dispatchEvent(toggleEvent);
  });
}

async function getFirstPromptTextAndClick(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const aiWindow = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    const promptsElement = await ContentTaskUtils.waitForCondition(
      () => aiWindow.shadowRoot.querySelector("smartwindow-prompts"),
      "Wait for smartwindow-prompts element"
    );
    const buttons =
      promptsElement.shadowRoot.querySelectorAll(".sw-prompt-button");
    const firstPromptText = buttons[0].textContent.trim();
    buttons[0].click();
    return firstPromptText;
  });
}

add_task(async function test_smartbar_commit_telemetry() {
  const sb = this.sinon.createSandbox();
  let win;

  try {
    Services.fog.testResetFOG();
    sb.stub(this.Chat, "fetchWithHistory");
    sb.stub(this.openAIEngine, "build");

    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const conversationId = await getConversationId(browser);
    await dispatchSmartbarCommit(browser, "Telemetry prompt", "chat");
    await TestUtils.waitForTick();

    const events = Glean.smartWindow.chatSubmit.testGetValue();
    Assert.equal(events?.length, 1, "One smartbar commit event was recorded");
    Assert.equal(
      events[0].extra.chat_id,
      conversationId,
      "smartbar commit event includes the conversation id"
    );
  } finally {
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    sb.restore();
  }
});

add_task(async function test_memories_toggle_telemetry() {
  Services.fog.testResetFOG();

  const win = await openAIWindow();
  try {
    const browser = win.gBrowser.selectedBrowser;

    const conversationId = await getConversationId(browser);
    await dispatchMemoriesToggle(browser, true);
    await TestUtils.waitForTick();

    const events = Glean.smartWindow.memoriesToggle.testGetValue();
    Assert.equal(events?.length, 1, "One memories toggle event was recorded");
    Assert.equal(
      events[0].extra.chat_id,
      conversationId,
      "memories toggle event includes the conversation id"
    );
    Assert.equal(
      events[0].extra.toggle,
      "true",
      "memories toggle event includes the enabled state"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_quick_prompt_displayed_telemetry() {
  Services.fog.testResetFOG();

  const win = await openAIWindow();
  try {
    const browser = win.gBrowser.selectedBrowser;

    const conversationId = await getConversationId(browser);
    await TestUtils.waitForCondition(
      async () => !!(await getPromptButtons(browser)).length,
      "Wait for prompts to render"
    );
    await TestUtils.waitForTick();

    const promptCount = (await getPromptButtons(browser)).length;
    const events = Glean.smartWindow.quickPromptDisplayed.testGetValue();
    Assert.greater(
      events?.length,
      0,
      "At least one quick prompt displayed event was recorded"
    );
    const lastEvent = events.at(-1);
    Assert.equal(
      lastEvent.extra.chat_id,
      conversationId,
      "quick prompt displayed includes the conversation id"
    );
    Assert.equal(
      lastEvent.extra.prompts,
      String(promptCount),
      "quick prompt displayed includes the prompt count"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_followup_displayed_telemetry_sends_count() {
  await withServer(
    {
      streamChunks: [
        "Here is my response.",
        "§followup: Follow up question 1§",
        "§followup: Follow up question 2§",
      ],
    },
    async () => {
      Services.fog.testResetFOG();

      const win = await openAIWindow();
      try {
        const browser = win.gBrowser.selectedBrowser;

        const conversationId = await getConversationId(browser);
        await dispatchSmartbarCommit(browser, "Hello", "chat");

        const followUpEvent = await TestUtils.waitForCondition(
          () =>
            Glean.smartWindow.quickPromptDisplayed
              .testGetValue()
              ?.find(
                e =>
                  e.extra.chat_id === conversationId && e.extra.message_seq > 0
              ),
          "Wait for follow-up displayed event"
        );

        Assert.equal(
          followUpEvent.extra.prompts,
          "2",
          "Follow-up displayed event includes the final prompt count"
        );
      } finally {
        await BrowserTestUtils.closeWindow(win);
      }
    }
  );
});

add_task(async function test_prompt_selected_telemetry() {
  const sb = this.sinon.createSandbox();
  let win;

  try {
    Services.fog.testResetFOG();
    sb.stub(this.Chat, "fetchWithHistory");
    sb.stub(this.openAIEngine, "build");

    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.endpoint", "http://localhost:0/v1"]],
    });

    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const conversationId = await getConversationId(browser);
    const firstPromptText = await getFirstPromptTextAndClick(browser);
    Assert.ok(firstPromptText, "Prompt text is available");
    await TestUtils.waitForTick();

    const events = Glean.smartWindow.quickPromptClicked.testGetValue();
    Assert.equal(events?.length, 1, "One prompt selected event was recorded");
    Assert.equal(
      events[0].extra.chat_id,
      conversationId,
      "prompt selected event includes the conversation id"
    );
  } finally {
    await SpecialPowers.popPrefEnv();
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    sb.restore();
  }
});

add_task(async function test_get_page_content_telemetry() {
  const sb = this.sinon.createSandbox();

  try {
    Services.fog.testResetFOG();
    const getPageContentStub = sb
      .stub(this.Chat.toolMap, "get_page_content")
      .resolves(["abc", "defg"]);

    await withServer(
      {
        toolCall: {
          name: "get_page_content",
          args: JSON.stringify({ url: "https://example.com/" }),
        },
      },
      async () => {
        const win = await openAIWindow();
        try {
          const browser = win.gBrowser.selectedBrowser;
          await dispatchSmartbarCommit(browser, "Read the page", "chat");

          await TestUtils.waitForCondition(
            () => getPageContentStub.calledOnce,
            "get_page_content tool should be called"
          );

          await TestUtils.waitForCondition(
            () => Glean.smartWindow.getPageContent.testGetValue()?.length,
            "get_page_content telemetry should be recorded"
          );

          const events = Glean.smartWindow.getPageContent.testGetValue();
          Assert.equal(
            events?.length,
            1,
            "One get_page_content event recorded"
          );
          Assert.equal(
            events[0].extra.length,
            "7",
            "get_page_content length equals total characters read"
          );
        } finally {
          await BrowserTestUtils.closeWindow(win);
        }
      }
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_link_click_telemetry() {
  Services.fog.testResetFOG();
  const win = await openAIWindow();
  try {
    const browser = win.gBrowser.selectedBrowser;
    const conversationId = await getConversationId(browser);

    const aiWindow = await TestUtils.waitForCondition(
      () => browser.contentDocument?.querySelector("ai-window"),
      "Wait for ai-window element"
    );
    aiWindow.onOpenLink();

    await TestUtils.waitForCondition(
      () => Glean.smartWindow.linkClick.testGetValue()?.length,
      "link click telemetry should be recorded"
    );

    const events = Glean.smartWindow.linkClick.testGetValue();
    Assert.equal(events?.length, 1, "One link click event recorded");
    Assert.equal(
      events[0].extra.chat_id,
      conversationId,
      "link click includes the conversation id"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_memory_removed_panel_telemetry() {
  Services.fog.testResetFOG();

  const win = await openAIWindow();
  let MemoryStore;
  try {
    ({ MemoryStore } = ChromeUtils.importESModule(
      "moz-src:///browser/components/aiwindow/services/MemoryStore.sys.mjs"
    ));
    const preExistingMemories = await MemoryStore.getMemories({
      includeSoftDeleted: true,
    });
    for (const memory of preExistingMemories) {
      await MemoryStore.hardDeleteMemory(memory.id, "other");
    }
    const seededMemories = [
      {
        id: "memory-1",
        memory_summary: "User is vegan",
        category: "preference",
        intent: "profile",
        reasoning: "Test memory",
        score: 0.5,
        updated_at: Date.now(),
        is_deleted: false,
      },
      {
        id: "memory-2",
        memory_summary: "User has a cat",
        category: "personal",
        intent: "profile",
        reasoning: "Test memory",
        score: 0.5,
        updated_at: Date.now(),
        is_deleted: false,
      },
    ];
    for (const memory of seededMemories) {
      await MemoryStore.addMemory(memory);
    }

    const browser = win.gBrowser.selectedBrowser;
    const aiWindow = await TestUtils.waitForCondition(
      () => browser.contentDocument?.querySelector("ai-window"),
      "Wait for ai-window element"
    );

    const { AssistantRoleOpts } = ChromeUtils.importESModule(
      "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs"
    );

    const conversation = new ChatConversation({});
    conversation.addUserMessage("Hello");
    const memories = [
      { id: "memory-1", memory_summary: "User is vegan" },
      { id: "memory-2", memory_summary: "User has a cat" },
    ];
    const assistantOpts = new AssistantRoleOpts(
      null,
      null,
      null,
      true,
      null,
      memories,
      []
    );
    conversation.addAssistantMessage("text", "Hi", assistantOpts);
    aiWindow.openConversation(conversation);
    const assistantMessageId = conversation.messages.at(-1).id;
    aiWindow.handleFooterAction({
      action: "remove-applied-memory",
      messageId: assistantMessageId,
      memory: memories[0],
    });

    await TestUtils.waitForCondition(
      () => Glean.smartWindow.memoryRemovedPanel.testGetValue()?.length,
      "memory removed panel telemetry should be recorded"
    );

    const events = Glean.smartWindow.memoryRemovedPanel.testGetValue();
    Assert.equal(events?.length, 1, "One memory removed panel event recorded");
    Assert.equal(
      events[0].extra.memories,
      "1",
      "memory removed panel event includes memories count"
    );
  } finally {
    if (MemoryStore) {
      const postTestMemories = await MemoryStore.getMemories({
        includeSoftDeleted: true,
      });
      for (const memory of postTestMemories) {
        await MemoryStore.hardDeleteMemory(memory.id, "other");
      }
    }
    await BrowserTestUtils.closeWindow(win);
  }
});
