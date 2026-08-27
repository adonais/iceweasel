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

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AIWindowUI:
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindowUI.sys.mjs",
});

const PROMPTS_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_smartwindow_prompts_page.html";

// Disable memories by default; relevant tests opt in explicitly.
add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.memories.generateFromConversation", false],
      ["browser.smartwindow.memories.generateFromHistory", false],
    ],
  });
});

/**
 * Creates a smartwindow-prompts element directly on a static test page, for
 * testing pure rendering behavior in isolation from the starter-generation
 * flow.
 *
 * @param {MozTabbrowserTab} tab
 * @param {Array<object>} prompts
 * @param {string} [mode]
 */
async function createPromptsElement(tab, prompts, mode = "fullpage") {
  const browser = tab.linkedBrowser;
  const contentWin = browser.contentWindow;
  const contentDoc = browser.contentDocument;

  await contentWin.customElements.whenDefined("smartwindow-prompts");
  const el = contentDoc.createElement("smartwindow-prompts");
  el.mode = mode;
  el.prompts = prompts;
  contentDoc.body.appendChild(el);
  await el.updateComplete;
  return el;
}

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

async function openBackgroundTab(url, window) {
  let tab = BrowserTestUtils.addTab(window.gBrowser, url);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  return tab;
}

function startMockNonStreamingServer(responseContent) {
  const mockServer = new HttpServer();
  mockServer.delay = 1;
  let reqCount = 0;
  const pendingResponses = [];

  mockServer.registerPathHandler("/v1/chat/completions", (_req, res) => {
    reqCount++;
    res.processAsync();

    const body = JSON.stringify({
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
    });

    const entry = { timerId: null, res };
    pendingResponses.push(entry);

    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    entry.timerId = setTimeout(() => {
      const idx = pendingResponses.indexOf(entry);
      if (idx !== -1) {
        pendingResponses.splice(idx, 1);
      }
      try {
        res.setStatusLine(_req.httpVersion, 200, "OK");
        res.setHeader("Content-Type", "application/json", false);
        res.write(body);
        res.finish();
      } catch (e) {
        // Connection may have closed before the delayed response was sent
        // or connection already torn down.
      }
    }, mockServer.delay);
  });

  mockServer.start(-1);
  return {
    pendingResponses,
    server: mockServer,
    port: mockServer.identity.primaryPort,
    get requestCount() {
      return reqCount;
    },
    cleanup() {
      for (const { timerId, res } of pendingResponses) {
        clearTimeout(timerId);
        try {
          res.finish();
        } catch (e) {
          // Already finished or connection gone.
        }
      }
      pendingResponses.length = 0;
    },
  };
}

describe("sidebar conversation starter prompts", () => {
  let responseContent, mock, gAiWindow, backgroundTab;

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
    mock.cleanup();
    if (backgroundTab) {
      BrowserTestUtils.removeTab(backgroundTab);
    }

    await BrowserTestUtils.closeWindow(gAiWindow);
    await SpecialPowers.popPrefEnv();
    await stopMockOpenAI(mock.server);

    gAiWindow = null;
  });

  describe("when switching tabs while starter prompts load", () => {
    let firstTab, secondTab;
    afterEach(async () => {
      if (firstTab) {
        await BrowserTestUtils.removeTab(firstTab);
      }

      if (secondTab) {
        await BrowserTestUtils.removeTab(secondTab);
      }
    });

    it("should not load prompts to the wrong tab", async () => {
      // Trigger opening the sidebar so initial starter prompts display
      await navigateTo("https://example.com", gAiWindow);
      firstTab = gAiWindow.gBrowser.selectedTab;

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

      // Open up second tab
      secondTab = await BrowserTestUtils.openNewForegroundTab({
        gBrowser: gAiWindow.gBrowser,
        opening: "https://example.net",
        waitForLoad: true,
      });

      // Start a conversation so that starter prompts should not be displayed
      const sidebarBrowser =
        gAiWindow.document.getElementById("ai-window-browser");
      await typeInSmartbar(sidebarBrowser, "Hello world");
      await submitSmartbar(sidebarBrowser);
      await TestUtils.waitForCondition(
        () => !getSidebarPromptButtons(gAiWindow).length,
        "Starter prompts should be hidden after starting a conversation on tab 2"
      );

      // Navigate tab 1 in the background so switching back to it triggers
      // an uncached starter request instead of reusing the starters cached
      // for the initial example.com load.
      const firstTabLoaded = BrowserTestUtils.browserLoaded(
        firstTab.linkedBrowser
      );
      BrowserTestUtils.startLoadingURIString(
        firstTab.linkedBrowser,
        "https://example.com"
      );
      await firstTabLoaded;

      // wait for conversation messages
      await TestUtils.waitForCondition(() => {
        const el = sidebarBrowser?.contentDocument?.querySelector("ai-window");
        return el && el.conversationMessageCount > 0;
      }, "Tab 2's conversation should have messages after submit");

      // Add an artificial delay on the starter prompts mocked response
      mock.server.delay = 200;

      // Switch back to tab 1 to trigger loading starter prompts, and before
      // the 200 ms delay switch back to tab 2 where starter prompts should
      // not display
      await BrowserTestUtils.switchTab(gAiWindow.gBrowser, firstTab);
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => gAiWindow.setTimeout(resolve, 10));
      await BrowserTestUtils.switchTab(gAiWindow.gBrowser, secondTab);

      await TestUtils.waitForCondition(
        () => mock.pendingResponses.length === 0,
        "Waiting for all starter prompt requests/etc to resolve"
      );

      // Wait for conversation to start and starters to hide
      const sidebarBrowser2 =
        gAiWindow.document.getElementById("ai-window-browser");
      await TestUtils.waitForCondition(() => {
        const aiWindowEl =
          sidebarBrowser2?.contentDocument?.querySelector("ai-window");
        return (
          aiWindowEl &&
          aiWindowEl.conversationMessageCount > 0 &&
          !aiWindowEl.showStarters
        );
      }, "Sidebar should have settled on tab 2's conversation with starters hidden");

      // Verify that starter prompts aren't being displayed on tab 2
      Assert.deepEqual(
        getSidebarPromptButtons(gAiWindow),
        [],
        "Starter prompts from tab 1 should not appear on tab 2"
      );
    });
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

    it("should not reload prompts when background tabs change URL", async () => {
      const updateStarterPromptsSpy = sinon.spy(
        lazy.AIWindowUI,
        "updateStarterPrompts"
      );

      try {
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
        updateStarterPromptsSpy.resetHistory();

        backgroundTab = await openBackgroundTab(
          "https://example.org",
          gAiWindow
        );

        Assert.deepEqual(
          getSidebarPromptButtons(gAiWindow),
          ["prompt 1", "prompt 2"],
          "Should continue to display initial starter prompts after background URL load"
        );
        Assert.equal(
          0,
          updateStarterPromptsSpy.callCount,
          "There should not be any more calls to update starter prompts"
        );
      } finally {
        updateStarterPromptsSpy.restore();
      }
    });

    it("should load new prompts when navigating back to a previously visited URI", async () => {
      await navigateTo("https://example.com", gAiWindow);

      await TestUtils.waitForCondition(
        () => AIWindowUI.isSidebarOpen(gAiWindow),
        "Sidebar should be open"
      );
      await TestUtils.waitForCondition(
        () => getSidebarPromptButtons(gAiWindow).includes("prompt 1"),
        "First set of prompts should be rendered"
      );

      const requestCountAfterFirstLoad = mock.requestCount;

      responseContent[0] = "prompt 3\nprompt 4";
      await navigateTo("https://example.org", gAiWindow);
      await TestUtils.waitForCondition(
        () => getSidebarPromptButtons(gAiWindow).includes("prompt 3"),
        "Second set of prompts should be rendered"
      );
      Assert.equal(
        mock.requestCount,
        requestCountAfterFirstLoad + 1,
        "Navigating to a new URI should generate a new starter request"
      );

      responseContent[0] = "prompt 5\nprompt 6";
      await navigateTo("https://example.com", gAiWindow);
      await TestUtils.waitForCondition(
        () => getSidebarPromptButtons(gAiWindow).includes("prompt 5"),
        "New prompts should be rendered when navigating back"
      );
      Assert.deepEqual(
        getSidebarPromptButtons(gAiWindow),
        ["prompt 5", "prompt 6"],
        "Should display newly generated prompts when navigating back"
      );
      Assert.equal(
        mock.requestCount,
        requestCountAfterFirstLoad + 2,
        "Navigating back to a previously visited URI should generate a new starter request"
      );
    });

    it("should evict the oldest cached prompts after exceeding the cache limit", async () => {
      for (let i = 0; i <= 20; i++) {
        responseContent[0] = `prompt ${i}a\nprompt ${i}b`;
        await navigateTo(`https://example.com/${i}`, gAiWindow);
        await TestUtils.waitForCondition(
          () => getSidebarPromptButtons(gAiWindow).includes(`prompt ${i}a`),
          `Prompts for URI ${i} should be rendered`
        );
      }

      const requestCountAfterFillingCache = mock.requestCount;

      responseContent[0] = "prompt evicted a\nprompt evicted b";
      await navigateTo("https://example.com/0", gAiWindow);
      await TestUtils.waitForCondition(
        () => getSidebarPromptButtons(gAiWindow).includes("prompt evicted a"),
        "Evicted prompts should be regenerated for the oldest URI"
      );

      Assert.equal(
        mock.requestCount,
        requestCountAfterFillingCache + 1,
        "Revisiting the oldest URI after the cache limit should generate a new starter request"
      );
    });
  });
});

add_task(async function test_fullpage_resume_starters() {
  const sb = sinon.createSandbox();
  let win;

  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.memories.generateFromConversation", true],
      ["browser.smartwindow.memories.generateFromHistory", true],
    ],
  });

  let resumeActivityStubs;
  try {
    resumeActivityStubs = await stubResumeActivityGeneration(sb);
    win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;
    const buttons = await getPromptButtons(browser);
    const aiWindow = browser.contentDocument.querySelector("ai-window");
    const promptsEl = aiWindow.shadowRoot.querySelector("smartwindow-prompts");

    // 1 valid resume pill (memory-2's headline comes back empty) + 3 static
    // starters, truncated to MAX_PILL_COUNT (3) - independent of
    // MAX_NUM_MEMORIES_FOR_RESUME_ACTIVITY, since this fixture never yields
    // more than 1 valid resume pill.
    Assert.equal(
      buttons.length,
      3,
      "Resume pill plus static starters, truncated to MAX_PILL_COUNT"
    );
    Assert.equal(
      buttons[0].ariaLabel,
      "Pick up your research",
      "The resume pill should be prepended to static starters"
    );
    Assert.equal(
      promptsEl.prompts.filter(prompt => prompt.type === "resume").length,
      1,
      "Entries with empty generated headlines should be omitted"
    );
    Assert.deepEqual(
      {
        previewIcons: promptsEl.prompts[0].previewIcons,
        previewTabsLength: promptsEl.prompts[0].content.previewTabs.length,
        memoryId: promptsEl.prompts[0].memory.id,
      },
      {
        previewIcons: [1, 2, 3, 4].map(id => ({
          iconSrc: `page-icon:https://example.com/${id}`,
        })),
        previewTabsLength: 4,
        memoryId: "memory-1",
      },
      "The resume pill should retain favicons, tab payload, and memory id"
    );
  } finally {
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    sb.restore();
    await resumeActivityStubs?.cleanup();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(
  async function test_fullpage_resume_starters_not_regenerated_after_new_chat() {
    const sb = sinon.createSandbox();
    let win;

    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.memories.generateFromConversation", true],
        ["browser.smartwindow.memories.generateFromHistory", true],
      ],
    });

    let resumeActivityStubs;
    try {
      resumeActivityStubs = await stubResumeActivityGeneration(sb);
      win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;
      await getPromptButtons(browser);
      const aiWindow = browser.contentDocument.querySelector("ai-window");

      Assert.ok(
        aiWindow.shadowRoot
          .querySelector("smartwindow-prompts")
          .prompts.some(prompt => prompt.type === "resume"),
        "Resume pill should show on the tab's initial load"
      );

      resumeActivityStubs.getMemoriesStub.resetHistory();
      aiWindow.onCreateNewChatClick();

      await TestUtils.waitForCondition(() => {
        const promptsEl = aiWindow.shadowRoot.querySelector(
          "smartwindow-prompts"
        );
        return (
          promptsEl?.prompts.length &&
          promptsEl.prompts.every(prompt => prompt.type !== "resume")
        );
      }, "Starters should reload without a resume pill after New Chat");

      Assert.ok(
        resumeActivityStubs.getMemoriesStub.notCalled,
        "New Chat should not re-trigger resume-activity generation"
      );
    } finally {
      if (win) {
        await BrowserTestUtils.closeWindow(win);
      }
      sb.restore();
      await resumeActivityStubs?.cleanup();
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(
  async function test_fullpage_resume_starters_fresh_opportunity_per_tab() {
    const sb = sinon.createSandbox();
    let win, tab2;

    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.memories.generateFromConversation", true],
        ["browser.smartwindow.memories.generateFromHistory", true],
      ],
    });

    let resumeActivityStubs;
    try {
      resumeActivityStubs = await stubResumeActivityGeneration(sb);

      win = await openAIWindow();
      await getPromptButtons(win.gBrowser.selectedBrowser);
      const aiWindow1 =
        win.gBrowser.selectedBrowser.contentDocument.querySelector("ai-window");
      aiWindow1.onCreateNewChatClick();
      await TestUtils.waitForCondition(() => {
        const promptsEl = aiWindow1.shadowRoot.querySelector(
          "smartwindow-prompts"
        );
        return (
          promptsEl?.prompts.length &&
          promptsEl.prompts.every(prompt => prompt.type !== "resume")
        );
      }, "First tab's starters should reload without a resume pill after New Chat");

      tab2 = await BrowserTestUtils.openNewForegroundTab({
        gBrowser: win.gBrowser,
        opening: AIWINDOW_URL,
        waitForLoad: true,
      });
      await getPromptButtons(tab2.linkedBrowser);
      const aiWindow2 =
        tab2.linkedBrowser.contentDocument.querySelector("ai-window");

      Assert.ok(
        aiWindow2.shadowRoot
          .querySelector("smartwindow-prompts")
          .prompts.some(prompt => prompt.type === "resume"),
        "A newly opened tab should get its own fresh resume-pill opportunity"
      );
    } finally {
      if (tab2) {
        BrowserTestUtils.removeTab(tab2);
      }
      if (win) {
        await BrowserTestUtils.closeWindow(win);
      }
      sb.restore();
      await resumeActivityStubs?.cleanup();
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(async function test_resume_prompt_click_shows_confirmation_card() {
  const sb = sinon.createSandbox();
  try {
    sb.stub(openAIEngine, "build").resolves({});
    const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory").resolves();

    await testResumeActivityClick(sb, async ({ aiWindow, buttons }) => {
      buttons[0].click();

      await TestUtils.waitForCondition(
        () => fetchWithHistoryStub.calledOnce,
        "Should generate a response for the resume-activity conversation"
      );

      const assistantMessage = aiWindow.conversation.messages.at(-1);
      Assert.deepEqual(
        assistantMessage.toolUIData,
        {
          uiType: "tab-group-confirmation",
          toolCallId: "resume-activity-memory-1",
          properties: {
            actionType: "open_tabs",
            tabGroupLabel: "Pick up your research",
            tabs: [1, 2, 3, 4].map((id, index) => ({
              token: String(index),
              url: `https://example.com/${id}`,
              title: `Example ${id}`,
              iconSrc: `page-icon:https://example.com/${id}`,
              checked: false,
            })),
          },
        },
        "Should attach a tab-selection confirmation card built from the pill's preview tabs"
      );
    });
  } finally {
    sb.restore();
  }
});

add_task(async function test_resume_prompt_click_injects_context() {
  const sb = sinon.createSandbox();
  try {
    sb.stub(openAIEngine, "build").resolves({});
    const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory").resolves();
    const realTimeStub = sb
      .stub(this.ChatConversation.prototype, "injectRealTimeContext")
      .resolves();

    await testResumeActivityClick(sb, async ({ buttons }) => {
      buttons[0].click();

      await TestUtils.waitForCondition(
        () => fetchWithHistoryStub.calledOnce,
        "Should generate a response for the resume-activity conversation"
      );

      Assert.ok(
        realTimeStub.calledOnce,
        "Should inject real-time context onto the resume-activity user message"
      );
    });
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_resume_prompt_click_shows_confirmation_card_without_memory_context_when_toggled_off() {
    const sb = sinon.createSandbox();
    try {
      sb.stub(openAIEngine, "build").resolves({});
      const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory").resolves();

      await testResumeActivityClick(sb, async ({ aiWindow, buttons }) => {
        const memoriesButton = aiWindow.shadowRoot.querySelector(
          "memories-icon-button"
        );
        memoriesButton.dispatchEvent(
          new CustomEvent("aiwindow-memories-toggle:on-change", {
            bubbles: true,
            composed: true,
            detail: { pressed: false },
          })
        );
        await TestUtils.waitForCondition(
          () => memoriesButton.pressed === false,
          "Memories toggle should turn off"
        );

        buttons[0].click();

        await TestUtils.waitForCondition(
          () => fetchWithHistoryStub.calledOnce,
          "Should generate a response for the resume-activity conversation"
        );

        const assistantMessage = aiWindow.conversation.messages.at(-1);
        Assert.deepEqual(
          assistantMessage.toolUIData,
          {
            uiType: "tab-group-confirmation",
            toolCallId: "resume-activity-memory-1",
            properties: {
              actionType: "open_tabs",
              tabGroupLabel: "Pick up your research",
              tabs: [1, 2, 3, 4].map((id, index) => ({
                token: String(index),
                url: `https://example.com/${id}`,
                title: `Example ${id}`,
                iconSrc: `page-icon:https://example.com/${id}`,
                checked: false,
              })),
            },
          },
          "Should still attach a tab-selection confirmation card when memories are toggled off"
        );

        const userMessage = aiWindow.conversation.messages.at(-2);
        Assert.ok(
          !userMessage.content.userContext?.resumeActivityContext,
          "Should not bake memory context into the conversation when memories are toggled off"
        );
      });
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_fullpage_resume_starters_disabled_without_existing_memories() {
    const sb = sinon.createSandbox();
    let win;

    // Prefs off alone don't disable resume starters - #memoriesIconShown
    // falls back to #hasMemories, so this only holds with no existing
    // memories either.
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.memories.generateFromConversation", false],
        ["browser.smartwindow.memories.generateFromHistory", false],
      ],
    });

    try {
      const getMemoriesStub = sb
        .stub(MemoriesManager, "getMemoriesByAttribute")
        .resolves([]);
      sb.stub(MemoriesManager, "getAllMemories").resolves([]);
      win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;
      await getPromptButtons(browser);
      const aiWindow = browser.contentDocument.querySelector("ai-window");
      const promptsEl = aiWindow.shadowRoot.querySelector(
        "smartwindow-prompts"
      );

      Assert.ok(
        promptsEl.prompts.every(prompt => prompt.type !== "resume"),
        "Resume pills should not render with memories disabled and none existing"
      );
      Assert.ok(
        getMemoriesStub.notCalled,
        "Resume starter generation should not run with memories disabled and none existing"
      );
    } finally {
      if (win) {
        await BrowserTestUtils.closeWindow(win);
      }
      sb.restore();
      await SpecialPowers.popPrefEnv();
    }
  }
);

add_task(async function test_starter_prompts_click_triggers_chat_on_new_tab() {
  const sb = sinon.createSandbox();

  try {
    const fetchWithHistoryStub = sb.stub(Chat, "fetchWithHistory");
    sb.stub(openAIEngine, "build").resolves({});

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const buttons = await getPromptButtons(browser);
    const firstPromptText = buttons[0].ariaLabel;
    buttons[0].click();

    await TestUtils.waitForCondition(
      () => fetchWithHistoryStub.calledOnce,
      "fetchWithHistory should be called after clicking prompt"
    );

    const conversation = fetchWithHistoryStub.firstCall.args[0].conversation;
    const messages = conversation.getMessagesInChatCompletionsFormat();
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
    sb.stub(openAIEngine, "build").resolves({});

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const buttons = await getPromptButtons(browser);
    const firstPromptText = buttons[0].ariaLabel;
    buttons[0].click();

    await TestUtils.waitForCondition(
      () => fetchWithHistoryStub.calledOnce,
      "fetchWithHistory should be called after clicking prompt"
    );

    const conversation = fetchWithHistoryStub.firstCall.args[0].conversation;
    const messages = conversation.getMessagesInChatCompletionsFormat();
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
      sb.stub(openAIEngine, "build").resolves({});
      const memoriesStub = sb
        .stub(this.ChatConversation.prototype, "injectMemoriesContext")
        .resolves(null);

      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      (await getPromptButtons(browser))[0].click();

      await TestUtils.waitForCondition(
        () => memoriesStub.called,
        "injectMemoriesContext should be called with memories enabled"
      );

      Assert.ok(
        memoriesStub.calledOnce,
        "injectMemoriesContext should be called once"
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
      sb.stub(openAIEngine, "build").resolves({});
      const memoriesStub = sb
        .stub(this.ChatConversation.prototype, "injectMemoriesContext")
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
        "injectMemoriesContext should not be called when memories are disabled"
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
    sb.stub(openAIEngine, "build").resolves({});

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
    sb.stub(openAIEngine, "build").resolves({});

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

// Confirms a resume pill's click event carries memory/content while a chat
// pill's stays plain {text, type}. Clicks both in one render purely to check
// each shape - not a simulated user session.
add_task(async function test_prompt_selected_event_detail() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    PROMPTS_PAGE
  );
  try {
    const memory = { id: "memory-1", memory_summary: "Research project" };
    const content = {
      headline: "Pick up your research",
      status: "Continue reading",
      previewTabs: [
        { url: "https://example.com/1", title: "First tab" },
        { url: "https://example.com/2", title: "Second tab" },
      ],
    };
    const el = await createPromptsElement(tab, [
      {
        text: "Pick up your research",
        type: "resume",
        memory,
        content,
      },
      { text: "Write a first draft", type: "chat" },
    ]);

    const details = [];
    el.addEventListener("SmartWindowPrompt:prompt-selected", event => {
      details.push(event.detail);
    });

    const buttons = el.shadowRoot.querySelectorAll(".sw-prompt-button");
    buttons[0].click();
    buttons[1].click();

    Assert.deepEqual(
      details[0],
      {
        text: "Pick up your research",
        type: "resume",
        memory,
        content,
      },
      "Resume prompt events should include their memory and content payload"
    );
    Assert.deepEqual(
      details[1],
      { text: "Write a first draft", type: "chat" },
      "Chat prompt event detail should remain unchanged"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});

// Favicon cluster rendering. Tested in isolation on a static page rather
// than the full AI Window, since this is pure rendering behavior with no
// starter-generation or chat involved.

add_task(async function test_prompts_no_favicons_without_preview_icons() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    PROMPTS_PAGE
  );
  try {
    const el = await createPromptsElement(tab, [
      { text: "Write a first draft", type: "chat" },
    ]);
    Assert.ok(
      !el.shadowRoot.querySelector(".sw-prompt-favicons"),
      "No favicon cluster should render without previewIcons"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(
  async function test_prompts_favicon_cluster_renders_all_icons_up_to_max() {
    const tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      PROMPTS_PAGE
    );
    try {
      const el = await createPromptsElement(tab, [
        {
          text: "Pick up your Tokyo trip",
          type: "resume",
          previewIcons: [
            { iconSrc: "page-icon:https://example.com/1" },
            { iconSrc: "page-icon:https://example.com/2" },
          ],
        },
      ]);
      Assert.equal(
        el.shadowRoot.querySelectorAll(".sw-prompt-favicon").length,
        2,
        "Should render one icon per previewIcons entry when under the max"
      );
      Assert.ok(
        !el.shadowRoot.querySelector(".sw-prompt-favicon-overflow"),
        "No overflow badge should render when under the max"
      );
    } finally {
      BrowserTestUtils.removeTab(tab);
    }
  }
);

add_task(
  async function test_prompts_favicon_cluster_shows_overflow_badge_beyond_max() {
    const tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      PROMPTS_PAGE
    );
    try {
      const el = await createPromptsElement(tab, [
        {
          text: "Continue shopping",
          type: "resume",
          previewIcons: [
            { iconSrc: "page-icon:https://example.com/1" },
            { iconSrc: "page-icon:https://example.com/2" },
            { iconSrc: "page-icon:https://example.com/3" },
            { iconSrc: "page-icon:https://example.com/4" },
          ],
        },
      ]);
      Assert.equal(
        el.shadowRoot.querySelectorAll(".sw-prompt-favicon").length,
        2,
        "Should cap visible icons when previewIcons exceeds the max"
      );
      const overflow = el.shadowRoot.querySelector(
        ".sw-prompt-favicon-overflow"
      );
      Assert.ok(
        overflow,
        "Overflow badge should render when previewIcons exceeds the max"
      );
      Assert.equal(
        overflow.textContent,
        "+2",
        "Overflow badge should show the count of hidden icons"
      );
    } finally {
      BrowserTestUtils.removeTab(tab);
    }
  }
);
