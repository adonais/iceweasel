/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for conversation starter prompts in the AI Window.
 *
 * These tests verify that:
 * - Prompts are rendered correctly in both sidebar and fullpage modes
 * - Submitting starter prompts respects the memories preference
 * - Prompts are removed after selection
 */

"use strict";

function getSidebarPromptButtons(win) {
  const sidebarBrowser = win.document.getElementById("ai-window-browser");
  const aiWindowEl =
    sidebarBrowser?.contentDocument?.querySelector("ai-window");
  const promptsEl = aiWindowEl?.shadowRoot?.querySelector(
    "smartwindow-prompts"
  );
  if (!promptsEl) {
    return [];
  }
  const buttons = promptsEl.shadowRoot.querySelectorAll(".sw-prompt-button");
  return Array.from(buttons).map(b => b.textContent.trim());
}

async function navigateTo(url, window) {
  const parentBrowser = window.gBrowser.selectedBrowser;
  const loaded = BrowserTestUtils.browserLoaded(parentBrowser);
  BrowserTestUtils.startLoadingURIString(parentBrowser, url);
  await loaded;
}

function startMockNonStreamingServer(responseContent) {
  const mockServer = new HttpServer();
  let reqCount = 0;

  mockServer.registerPathHandler("/v1/chat/completions", (_req, res) => {
    reqCount++;
    res.setStatusLine(_req.httpVersion, 200, "OK");
    res.setHeader("Content-Type", "application/json", false);
    res.write(
      JSON.stringify({
        id: "chatcmpl-mock",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "mock",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: responseContent[0] },
            finish_reason: "stop",
          },
        ],
      })
    );
  });

  mockServer.start(-1);
  return {
    server: mockServer,
    port: mockServer.identity.primaryPort,
    get requestCount() {
      return reqCount;
    },
  };
}

describe("sidebar conversation starter prompts", () => {
  let responseContent, mock, gAiWindow;

  beforeEach(async () => {
    responseContent = ["prompt 1\nprompt 2"];
    mock = startMockNonStreamingServer(responseContent);

    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.endpoint", `http://localhost:${mock.port}/v1`],
      ],
    });

    gAiWindow = await openAIWindow();
  });

  afterEach(async () => {
    await BrowserTestUtils.closeWindow(gAiWindow);
    await SpecialPowers.popPrefEnv();
    await stopMockOpenAI(mock.server);

    gAiWindow = null;
  });

  describe("when the conversation is empty", () => {
    it("should load new prompts when the tab changes URL", async () => {
      await navigateTo("https://example.com", gAiWindow);

      await TestUtils.waitForCondition(
        () => AIWindowUI.isSidebarOpen(gAiWindow),
        "Sidebar should be open"
      );
      await TestUtils.waitForCondition(
        () => getSidebarPromptButtons(gAiWindow).includes("prompt 1"),
        "First set of prompts should be rendered"
      );

      Assert.deepEqual(
        getSidebarPromptButtons(gAiWindow),
        ["prompt 1", "prompt 2"],
        "Should display first set of prompts"
      );

      responseContent[0] = "prompt 3\nprompt 4";

      await navigateTo("https://example.org", gAiWindow);
      await TestUtils.waitForCondition(
        () => getSidebarPromptButtons(gAiWindow).includes("prompt 3"),
        "Second set of prompts should be rendered"
      );
      Assert.deepEqual(
        getSidebarPromptButtons(gAiWindow),
        ["prompt 3", "prompt 4"],
        "Should display updated prompts after URL change"
      );
    });
  });
});

add_task(async function test_starter_prompts_click_triggers_chat_on_new_tab() {
  const sb = sinon.createSandbox();

  try {
    const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory");
    sb.stub(openAIEngine, "build").resolves({
      loadPrompt: () => Promise.resolve("Mock system prompt"),
    });

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const buttons = await getPromptButtons(browser);
    const firstPromptText = buttons[0].textContent.trim();
    buttons[0].click();

    await TestUtils.waitForCondition(
      () => fetchWithHistoryStub.calledOnce,
      "fetchWithHistory should be called after clicking prompt"
    );

    const conversation = fetchWithHistoryStub.firstCall.args[0];
    const messages = conversation.getMessagesInOpenAiFormat();
    const userMessage = messages.findLast(m => m.role === "user");

    Assert.equal(
      userMessage.content,
      firstPromptText,
      "Should submit starter prompt text as user message on New Tab"
    );

    await BrowserTestUtils.closeWindow(win);
  } finally {
    sb.restore();
  }
});

add_task(async function test_starter_prompts_click_triggers_chat_in_sidebar() {
  const sb = sinon.createSandbox();

  try {
    const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory");
    sb.stub(openAIEngine, "build").resolves({
      loadPrompt: () => Promise.resolve("Mock system prompt"),
    });

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const buttons = await getPromptButtons(browser);
    const firstPromptText = buttons[0].textContent.trim();
    buttons[0].click();

    await TestUtils.waitForCondition(
      () => fetchWithHistoryStub.calledOnce,
      "fetchWithHistory should be called after clicking prompt"
    );

    const conversation = fetchWithHistoryStub.firstCall.args[0];
    const messages = conversation.getMessagesInOpenAiFormat();
    const userMessage = messages.findLast(m => m.role === "user");

    Assert.equal(
      userMessage.content,
      firstPromptText,
      "Should submit starter prompt text as user message in the sidebar"
    );

    await BrowserTestUtils.closeWindow(win);
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_starter_prompts_click_fetches_memories_when_enabled() {
    const sb = sinon.createSandbox();

    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.memories.generateFromConversation", true],
        ["browser.smartwindow.memories.generateFromHistory", true],
      ],
    });

    try {
      sb.stub(Chat, "fetchWithHistory");
      sb.stub(openAIEngine, "build").resolves({
        loadPrompt: () => Promise.resolve("Mock system prompt"),
      });
      const memoriesStub = sb
        .stub(this.ChatConversation.prototype, "getMemoriesContext")
        .resolves(null);

      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      (await getPromptButtons(browser))[0].click();

      await TestUtils.waitForCondition(
        () => memoriesStub.called,
        "getMemoriesContext should be called with memories enabled"
      );

      Assert.ok(
        memoriesStub.calledOnce,
        "getMemoriesContext should be called once"
      );

      await BrowserTestUtils.closeWindow(win);
    } finally {
      sb.restore();
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(
  async function test_starter_prompts_click_skips_memories_when_disabled() {
    const sb = sinon.createSandbox();

    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.memories.generateFromConversation", false],
        ["browser.smartwindow.memories.generateFromHistory", false],
      ],
    });

    try {
      const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory");
      sb.stub(openAIEngine, "build").resolves({
        loadPrompt: () => Promise.resolve("Mock system prompt"),
      });
      const memoriesStub = sb
        .stub(this.ChatConversation.prototype, "getMemoriesContext")
        .resolves(null);

      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      (await getPromptButtons(browser))[0].click();

      await TestUtils.waitForCondition(
        () => fetchWithHistoryStub.calledOnce,
        "fetchWithHistory should be called after clicking prompt"
      );

      Assert.ok(
        memoriesStub.notCalled,
        "getMemoriesContext should not be called when memories are disabled"
      );

      await BrowserTestUtils.closeWindow(win);
    } finally {
      sb.restore();
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(async function test_starter_prompts_hidden_after_click_on_new_tab() {
  const sb = sinon.createSandbox();

  try {
    sb.stub(Chat, "fetchWithHistory");
    sb.stub(openAIEngine, "build").resolves({
      loadPrompt: () => Promise.resolve("Mock system prompt"),
    });

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    (await getPromptButtons(browser))[0].click();

    await SpecialPowers.spawn(browser, [], async () => {
      const aiWindowElement = content.document.querySelector("ai-window");
      await ContentTaskUtils.waitForMutationCondition(
        aiWindowElement.shadowRoot,
        { childList: true, subtree: true },
        () => !aiWindowElement.shadowRoot.querySelector("smartwindow-prompts")
      );
    });

    await BrowserTestUtils.closeWindow(win);
  } finally {
    sb.restore();
  }
});

add_task(async function test_starter_prompts_hidden_after_click_in_sidebar() {
  const sb = sinon.createSandbox();

  try {
    sb.stub(Chat, "fetchWithHistory");
    sb.stub(openAIEngine, "build").resolves({
      loadPrompt: () => Promise.resolve("Mock system prompt"),
    });

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    (await getPromptButtons(browser))[0].click();

    await SpecialPowers.spawn(browser, [], async () => {
      const aiWindowElement = content.document.querySelector("ai-window");
      await ContentTaskUtils.waitForMutationCondition(
        aiWindowElement.shadowRoot,
        { childList: true, subtree: true },
        () => !aiWindowElement.shadowRoot.querySelector("smartwindow-prompts")
      );
    });

    await BrowserTestUtils.closeWindow(win);
  } finally {
    sb.restore();
  }
});
