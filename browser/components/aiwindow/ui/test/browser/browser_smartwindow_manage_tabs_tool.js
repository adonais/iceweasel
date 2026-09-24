/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { UI_TYPES, ToolUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ToolUI.sys.mjs"
);

const { tabManagementService } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/TabManagementService.sys.mjs"
);

const { TabStateFlusher } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs"
);

// Import toolFns to stub the manageTabs function
const { toolFns } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
);

/**
 * Test suite for manage_tabs tool functionality in AI Window
 */
add_setup(async function () {
  await Services.fog.testFlushAllChildren();

  // Set up test preferences to avoid network issues
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.endpoint", "http://localhost:0/v1"],
      ["dom.security.https_first", false],
    ],
  });
});

/**
 * Test that confirmation UI appears with correct content when manage_tabs tool is called
 */
add_task(async function test_manage_tabs_confirmation_ui() {
  const sandbox = sinon.createSandbox();
  const mockEngineMan = new MockEngineManager();
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;

    // Mock the manageTabs tool to return confirmation UI
    sandbox.stub(toolFns, "manageTabs").resolves({
      toolResult: {
        description:
          "The following tabs were found. User confirmation is required to close them.",
        pending: true,
        action: "close_tabs",
        selectedTabs: [
          { url: "https://amazon.com", title: "Amazon", checked: true },
          { url: "https://ebay.com", title: "eBay", checked: true },
        ],
      },
      uiData: {
        uiType: UI_TYPES.WEBSITE_CONFIRMATION,
        toolCallId: "test-tool-call-1",
        properties: {
          tabs: [
            {
              url: "https://amazon.com",
              title: "Amazon",
              linkedPanel: "panel-1",
              checked: true,
            },
            {
              url: "https://ebay.com",
              title: "eBay",
              linkedPanel: "panel-2",
              checked: true,
            },
          ],
          originalUserPrompt: "close my shopping tabs",
        },
      },
    });

    // Step 1: User asks to close tabs
    await typeInSmartbar(browser, "close my shopping tabs");
    await submitSmartbar(browser);

    // Step 2: Mock LLM response with tool call
    await mockEngineMan.respondTo({
      purpose: "chat",
      response: [
        {
          text: "",
          tokens: null,
          isPrompt: false,
          toolCalls: [
            {
              id: "call_manage_1",
              function: {
                name: "manage_tabs",
                arguments: JSON.stringify({
                  action: "close_tabs",
                  ask_confirmation: true,
                }),
              },
            },
          ],
        },
        {
          text: "I found 2 shopping tabs that match your request. Please confirm which ones you'd like to close.",
          tokens: null,
          isPrompt: false,
          toolCalls: null,
        },
      ],
    });

    // Wait for confirmation UI to appear and get its data
    const confirmationData = await TestUtils.waitForCondition(async () => {
      return SpecialPowers.spawn(browser, [], async () => {
        const aiWindowEl = content.document.querySelector("ai-window");
        if (!aiWindowEl?.shadowRoot) {
          return null;
        }

        const aichatBrowser =
          aiWindowEl.shadowRoot.querySelector("#aichat-browser");
        if (!aichatBrowser) {
          return null;
        }

        return SpecialPowers.spawn(aichatBrowser, [], async () => {
          const chatContent = content.document.querySelector("ai-chat-content");
          if (!chatContent) {
            return null;
          }

          await chatContent.updateComplete;
          const confirmation = chatContent.shadowRoot.querySelector(
            "ai-website-confirmation"
          );

          if (!confirmation) {
            return null;
          }

          // Confirmation exists, now get the data
          const tabItems =
            confirmation.shadowRoot.querySelectorAll("ai-website-select");

          const confirmButton = confirmation.shadowRoot.querySelector(
            "moz-button[type='primary']"
          );
          const closeButton =
            confirmation.shadowRoot.querySelector(".close-button");

          return {
            tabCount: tabItems.length,
            hasConfirmButton: !!confirmButton,
            hasCancelButton: !!closeButton,
          };
        });
      });
    }, "Waiting for confirmation UI to appear and retrieving its data");

    Assert.ok(confirmationData, "Confirmation UI data should be available");
    Assert.equal(confirmationData.tabCount, 2, "Should show 2 tabs");
    Assert.ok(confirmationData.hasConfirmButton, "Should have confirm button");
    Assert.ok(confirmationData.hasCancelButton, "Should have cancel button");
  } finally {
    sandbox.restore();
    mockEngineMan.cleanupMocks();
    await BrowserTestUtils.closeWindow(win);
    Services.fog.testResetFOG();
  }
});

/**
 * Test retry flow after cancellation
 */
add_task(async function test_retry_after_cancellation() {
  const sandbox = sinon.createSandbox();
  const mockEngineMan = new MockEngineManager();
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;

    let manageTabsCallCount = 0;
    sandbox.stub(toolFns, "manageTabs").callsFake(async () => {
      manageTabsCallCount++;
      return {
        toolResult: {
          description: "Found tab to close",
          pending: true,
          action: "close_tabs",
          selectedTabs: [
            { url: "https://amazon.com", title: "Amazon", checked: true },
          ],
        },
        uiData: {
          uiType: UI_TYPES.WEBSITE_CONFIRMATION,
          toolCallId: `test-tool-call-${manageTabsCallCount}`,
          properties: {
            tabs: [
              {
                url: "https://amazon.com",
                title: "Amazon",
                linkedPanel: "panel-1",
                checked: true,
              },
            ],
            originalUserPrompt: "close amazon tab",
          },
        },
      };
    });

    // Step 1: Initial request
    await typeInSmartbar(browser, "close amazon tab");
    await submitSmartbar(browser);

    // Step 2: LLM response with tool call
    await mockEngineMan.respondTo({
      purpose: "chat",
      response: [
        {
          text: "",
          tokens: null,
          isPrompt: false,
          toolCalls: [
            {
              id: "call_manage_3",
              function: {
                name: "manage_tabs",
                arguments: JSON.stringify({
                  action: "close_tabs",
                  ask_confirmation: true,
                }),
              },
            },
          ],
        },
        {
          text: "I found the Amazon tab. Please confirm if you'd like to close it.",
          tokens: null,
          isPrompt: false,
          toolCalls: null,
        },
      ],
    });

    // Wait for confirmation UI
    await TestUtils.waitForCondition(async () => {
      return SpecialPowers.spawn(browser, [], async () => {
        const aiWindowEl = content.document.querySelector("ai-window");
        const aichatBrowser =
          aiWindowEl?.shadowRoot?.querySelector("#aichat-browser");
        if (!aichatBrowser) {
          return false;
        }

        return SpecialPowers.spawn(aichatBrowser, [], async () => {
          const chatContent = content.document.querySelector("ai-chat-content");
          await chatContent?.updateComplete;
          return !!chatContent?.shadowRoot?.querySelector(
            "ai-website-confirmation"
          );
        });
      });
    }, "Waiting for initial confirmation UI");

    // Step 3: User submits new prompt (auto-cancels confirmation)
    await typeInSmartbar(browser, "what's the weather?");
    await submitSmartbar(browser);

    // Step 4: New response should trigger auto-cancel and show retry UI
    await mockEngineMan.respondTo({
      purpose: "chat",
      response:
        "I'd need access to real-time data to tell you the current weather.",
    });

    // Wait for retry component to appear
    await TestUtils.waitForCondition(async () => {
      return SpecialPowers.spawn(browser, [], async () => {
        const aiWindowEl = content.document.querySelector("ai-window");
        const aichatBrowser =
          aiWindowEl?.shadowRoot?.querySelector("#aichat-browser");
        if (!aichatBrowser) {
          return false;
        }

        return SpecialPowers.spawn(aichatBrowser, [], async () => {
          const chatContent = content.document.querySelector("ai-chat-content");
          await chatContent?.updateComplete;

          // Look for the retry button in the conversation
          // The retry button is rendered inside chat-bubble divs
          const retryButton =
            chatContent.shadowRoot.querySelector(".tool-retry-button");
          return !!retryButton;
        });
      });
    }, "Waiting for retry component");

    // Verify retry UI exists
    const hasRetryUI = await SpecialPowers.spawn(browser, [], async () => {
      const aiWindowEl = content.document.querySelector("ai-window");
      const aichatBrowser =
        aiWindowEl.shadowRoot.querySelector("#aichat-browser");

      return SpecialPowers.spawn(aichatBrowser, [], async () => {
        const chatContent = content.document.querySelector("ai-chat-content");
        const retryButton =
          chatContent.shadowRoot.querySelector(".tool-retry-button");
        return !!retryButton;
      });
    });

    Assert.ok(hasRetryUI, "Retry UI should be displayed after cancellation");
    Assert.equal(
      manageTabsCallCount,
      1,
      "manageTabs should have been called once"
    );

    // Step 5: Click retry button
    await SpecialPowers.spawn(browser, [], async () => {
      const aiWindowEl = content.document.querySelector("ai-window");
      const aichatBrowser =
        aiWindowEl.shadowRoot.querySelector("#aichat-browser");

      return SpecialPowers.spawn(aichatBrowser, [], async () => {
        const chatContent = content.document.querySelector("ai-chat-content");
        const retryButton =
          chatContent.shadowRoot.querySelector(".tool-retry-button");

        if (!retryButton) {
          throw new Error("Retry button not found");
        }

        retryButton.click();
      });
    });

    // Wait a bit for the retry to process
    await TestUtils.waitForTick();

    // Step 6: Verify the retry prompt appears as a new user message in the conversation
    const retryMessageFound = await TestUtils.waitForCondition(async () => {
      return SpecialPowers.spawn(browser, [], async () => {
        const aiWindowEl = content.document.querySelector("ai-window");

        // Get the conversation messages from the conversation object
        const conversation = aiWindowEl.conversation;
        if (!conversation || !conversation.messages) {
          return false;
        }

        const messages = conversation.messages;

        // Look for the pattern: weather response followed by retry of "close amazon tab"
        let foundWeatherResponse = false;

        for (const msg of messages) {
          // Check if this is the weather response (role = 1 for assistant)
          const msgBody =
            typeof msg.content?.body === "string" ? msg.content.body : "";

          if (
            msg.role === 1 && // Assistant role
            msgBody.toLowerCase().includes("weather")
          ) {
            foundWeatherResponse = true;
          }

          // After finding weather response, look for the retry message (role = 0 for user)
          if (
            foundWeatherResponse &&
            msg.role === 0 && // User role
            msgBody.toLowerCase() === "close amazon tab"
          ) {
            return true; // Found retry message after weather response
          }
        }

        return false;
      });
    }, "Waiting for retry message to appear in conversation");

    Assert.ok(
      retryMessageFound,
      "Retry should resubmit 'close amazon tab' as a new message"
    );
  } finally {
    sandbox.restore();
    mockEngineMan.cleanupMocks();
    await BrowserTestUtils.closeWindow(win);
    Services.fog.testResetFOG();
  }
});

/**
 * A tab in a non-interacting window is closed from another window.
 */
add_task(async function test_close_tab_in_non_interacting_window() {
  const interactingWindow = await openAIWindow();
  const otherWindow = await openAIWindow();

  const tab = await BrowserTestUtils.openNewForegroundTab(
    otherWindow.gBrowser,
    "https://example.com/"
  );
  const tokenToKey = new Map([["token-a", tab.permanentKey]]);
  const selectedTabs = [{ token: "token-a", url: "https://example.com/" }];

  try {
    Assert.ok(
      otherWindow.gBrowser.tabs.includes(tab),
      "Target tab starts open in the non-interacting window"
    );

    const result = await ToolUI.closeSelectedTabs(
      selectedTabs,
      tokenToKey,
      interactingWindow
    );

    Assert.ok(result, "closeSelectedTabs should report a result");
    Assert.equal(
      result.operationIds.length,
      1,
      "Should surface an undo operationId"
    );
    Assert.equal(
      result.requestedCount,
      1,
      "Should have requested closing one tab"
    );

    await TestUtils.waitForCondition(
      () => !otherWindow.gBrowser.tabs.includes(tab),
      "Tab in the non-interacting window should be closed"
    );
    Assert.ok(
      !otherWindow.gBrowser.tabs.includes(tab),
      "Target tab is closed in its owning window"
    );
  } finally {
    await BrowserTestUtils.closeWindow(otherWindow);
    await BrowserTestUtils.closeWindow(interactingWindow);
  }
});

/**
 * A tab selection spanning multiple windows closes each tab in its own window.
 */
add_task(async function test_close_tabs_spanning_multiple_windows() {
  const windowA = await openAIWindow();
  const windowB = await openAIWindow();

  const tabA = await BrowserTestUtils.openNewForegroundTab(
    windowA.gBrowser,
    "https://example.com/"
  );
  const tabB = await BrowserTestUtils.openNewForegroundTab(
    windowB.gBrowser,
    "https://example.org/"
  );

  const tokenToKey = new Map([
    ["token-a", tabA.permanentKey],
    ["token-b", tabB.permanentKey],
  ]);
  const selectedTabs = [
    { token: "token-a", url: "https://example.com/" },
    { token: "token-b", url: "https://example.org/" },
  ];

  try {
    const result = await ToolUI.closeSelectedTabs(
      selectedTabs,
      tokenToKey,
      windowA
    );

    Assert.equal(
      result.requestedCount,
      2,
      "Should have requested closing both tabs"
    );
    Assert.ok(
      !windowA.gBrowser.tabs.includes(tabA),
      "Tab in window A is closed"
    );
    Assert.ok(
      !windowB.gBrowser.tabs.includes(tabB),
      "Tab in window B is closed"
    );
  } finally {
    await BrowserTestUtils.closeWindow(windowA);
    await BrowserTestUtils.closeWindow(windowB);
  }
});

/**
 * Undoing a cross-window close restores the tabs in the owning windows.
 */
add_task(async function test_undo_close_tabs_spanning_multiple_windows() {
  const windowA = await openAIWindow();
  const windowB = await openAIWindow();

  const tabA = await BrowserTestUtils.openNewForegroundTab(
    windowA.gBrowser,
    "https://example.com/"
  );
  const tabB = await BrowserTestUtils.openNewForegroundTab(
    windowB.gBrowser,
    "https://example.org/"
  );

  // Flush tab state so SessionStore records the loaded URL for each tab
  await TabStateFlusher.flush(tabA.linkedBrowser);
  await TabStateFlusher.flush(tabB.linkedBrowser);

  const tokenToKey = new Map([
    ["token-a", tabA.permanentKey],
    ["token-b", tabB.permanentKey],
  ]);
  const selectedTabs = [
    { token: "token-a", url: "https://example.com/" },
    { token: "token-b", url: "https://example.org/" },
  ];

  try {
    const closeResult = await ToolUI.closeSelectedTabs(
      selectedTabs,
      tokenToKey,
      windowA
    );

    Assert.equal(
      closeResult.operationIds.length,
      2,
      "Should produce one operationId per owning window"
    );

    const tabCountA = windowA.gBrowser.tabs.length;
    const tabCountB = windowB.gBrowser.tabs.length;

    // Undo restores each operation in its own window
    for (const operationId of closeResult.operationIds) {
      const restoreResult = await tabManagementService.restoreTabs({
        operationId,
      });
      Assert.equal(
        restoreResult.restoredCount,
        1,
        `Operation ${operationId} restores its tab`
      );
      Assert.equal(
        restoreResult.failedTabs.length,
        0,
        `Operation ${operationId} has no restore failures`
      );
    }

    await TestUtils.waitForCondition(
      () =>
        windowA.gBrowser.tabs.length === tabCountA + 1 &&
        windowB.gBrowser.tabs.length === tabCountB + 1,
      "Both windows should have their restored tab"
    );
  } finally {
    await BrowserTestUtils.closeWindow(windowA);
    await BrowserTestUtils.closeWindow(windowB);
  }
});

/**
 * Closing the last tab of a non-interacting window keeps that window open
 * instead of closing the window, so the tab stays restorable.
 */
add_task(async function test_close_last_tab_keeps_window_open() {
  const interactingWindow = await openAIWindow();
  const otherWindow = await openAIWindow();

  const tab = otherWindow.gBrowser.selectedTab;
  BrowserTestUtils.startLoadingURIString(
    tab.linkedBrowser,
    "https://example.com/"
  );
  await BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    "https://example.com/"
  );
  // Flush tab state so SessionStore records the loaded URL
  await TabStateFlusher.flush(tab.linkedBrowser);

  Assert.equal(
    otherWindow.gBrowser.tabs.length,
    1,
    "Non-interacting window starts with a single tab"
  );

  const tokenToKey = new Map([["token-a", tab.permanentKey]]);
  const selectedTabs = [{ token: "token-a", url: "https://example.com/" }];

  try {
    const result = await ToolUI.closeSelectedTabs(
      selectedTabs,
      tokenToKey,
      interactingWindow
    );

    Assert.equal(
      result.operationIds.length,
      1,
      "Should close the last tab and surface an undo operationId"
    );

    Assert.ok(!otherWindow.closed, "Non-interacting window stays open");
    Assert.equal(
      otherWindow.gBrowser.tabs.length,
      1,
      "The closed tab was replaced"
    );
    Assert.ok(
      !otherWindow.gBrowser.tabs.includes(tab),
      "The original tab is closed"
    );

    const restoreResult = await tabManagementService.restoreTabs({
      operationId: result.operationIds[0],
    });
    Assert.equal(
      restoreResult.restoredCount,
      1,
      "The last tab can still be undone in its owning window"
    );
  } finally {
    await BrowserTestUtils.closeWindow(otherWindow);
    await BrowserTestUtils.closeWindow(interactingWindow);
  }
});

async function captureFunnel(task) {
  Services.fog.testResetFOG();
  await task();
  await Services.fog.testFlushAllChildren();
  return {
    submits: Glean.smartWindow.browserActionSubmit.testGetValue() ?? [],
    completes: Glean.smartWindow.browserActionComplete.testGetValue() ?? [],
  };
}

add_task(async function test_close_tabs_records_one_submit_and_complete() {
  const win = await openAIWindow();
  const url = "https://example.com/tab-success";

  try {
    const tab = await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
    // A second tab makes this not test “close all tabs”.
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.org/keep"
    );

    const conversation = new ChatConversation({});
    const { submits, completes } = await captureFunnel(() =>
      toolFns.manageTabs(
        { action: "close_tabs", ask_confirmation: false, url_tokens: [url] },
        conversation,
        "sidebar",
        "test-model",
        "tab-success"
      )
    );

    await TestUtils.waitForCondition(
      () => !win.gBrowser.tabs.includes(tab),
      "The targeted tab is really closed"
    );

    Assert.equal(submits.length, 1, "Records exactly one submit");
    Assert.equal(completes.length, 1, "Records exactly one paired complete");
    Assert.equal(
      submits[0].extra.action,
      "close_tabs",
      "Submit carries the invoked action"
    );
    Assert.equal(
      completes[0].extra.action,
      "close_tabs",
      "Complete carries the same action"
    );
    Assert.equal(
      completes[0].extra.chat_id,
      submits[0].extra.chat_id,
      "The two events share a chat_id, so the funnel can be joined"
    );
    Assert.equal(completes[0].extra.result, "success", "Reports success");
    Assert.equal(completes[0].extra.tabs_affected, "1", "One tab closed");
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_cancelled_confirmation_still_completes() {
  const win = await openAIWindow();
  const url = "https://example.com/tab-cancel";

  try {
    const tab = await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.org/keep"
    );

    const conversation = new ChatConversation({});
    const toolCallId = "tab-cancel";
    const { submits, completes } = await captureFunnel(async () => {
      const { uiData } = await toolFns.manageTabs(
        { action: "close_tabs", ask_confirmation: true, url_tokens: [url] },
        conversation,
        "sidebar",
        "test-model",
        toolCallId
      );
      Assert.equal(
        uiData.uiType,
        UI_TYPES.WEBSITE_CONFIRMATION,
        "Deferred to a confirmation card"
      );

      const message = conversation.addAssistantMessage("text", "Confirm?");
      message.toolUIData = { toolCallId, uiType: uiData.uiType };
      await ToolUI.handleUpdate(
        {
          messageId: message.id,
          toolCallId,
          updateType: "cancel-tab-selection",
          updateData: { reason: "user_action", actionType: "close_tabs" },
        },
        conversation,
        win,
        "sidebar"
      );
    });

    Assert.ok(win.gBrowser.tabs.includes(tab), "The tab is left open");
    Assert.equal(submits.length, 1, "Records one submit for the deferred call");
    Assert.equal(
      completes.length,
      1,
      "A cancelled confirmation still closes the funnel"
    );
    Assert.equal(
      completes[0].extra.result,
      "cancelled",
      "Reports the cancellation"
    );
    Assert.equal(
      conversation.pendingBrowserActionTelemetryCount,
      0,
      "Consumes the stashed submit context"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_group_tabs_records_one_submit_and_complete() {
  const win = await openAIWindow();
  const url = "https://example.com/tab-group";

  try {
    const tab = await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.org/keep"
    );

    const conversation = new ChatConversation({});
    const { submits, completes } = await captureFunnel(() =>
      toolFns.manageTabs(
        {
          action: "group_tabs",
          ask_confirmation: false,
          url_tokens: [url],
          label: "Funnel Group",
        },
        conversation,
        "sidebar",
        "test-model",
        "tab-group"
      )
    );

    Assert.ok(tab.group, "The targeted tab is really in a tab group");
    Assert.equal(submits.length, 1, "Records exactly one submit");
    Assert.equal(completes.length, 1, "Records exactly one paired complete");
    Assert.equal(
      submits[0].extra.action,
      "group_tabs",
      "Submit carries group_tabs"
    );
    Assert.equal(
      completes[0].extra.action,
      "group_tabs",
      "Complete carries group_tabs"
    );
    Assert.equal(completes[0].extra.result, "success", "Reports success");
    Assert.equal(completes[0].extra.tabs_affected, "1", "One tab grouped");
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_tabs_closed_before_confirm_still_completes() {
  const win = await openAIWindow();
  const url = "https://example.com/tab-closed";

  try {
    const tab = await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.org/keep"
    );

    const conversation = new ChatConversation({});
    const toolCallId = "tab-closed";
    const { submits, completes } = await captureFunnel(async () => {
      const { uiData } = await toolFns.manageTabs(
        { action: "close_tabs", ask_confirmation: true, url_tokens: [url] },
        conversation,
        "sidebar",
        "test-model",
        toolCallId
      );

      // The user closes the tab themselves before confirming the card.
      const selectedTabs = uiData.properties.tabs.map(
        ({ token, url: tabUrl }) => ({
          token,
          url: tabUrl,
        })
      );
      BrowserTestUtils.removeTab(tab);

      const message = conversation.addAssistantMessage("text", "Confirm?");
      message.toolUIData = { toolCallId, uiType: uiData.uiType };
      await ToolUI.handleUpdate(
        {
          messageId: message.id,
          toolCallId,
          updateType: "confirmation-tab-selection",
          updateData: { selectedTabs },
        },
        conversation,
        win,
        "sidebar"
      );
    });

    Assert.equal(submits.length, 1, "Records one submit");
    Assert.equal(
      completes.length,
      1,
      "A confirmation for tabs that vanished still closes the funnel"
    );
    Assert.equal(completes[0].extra.result, "error", "Reported as an error");
    Assert.equal(
      completes[0].extra.error,
      "tabs_unavailable",
      "Names the reason the action could not run"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

// A cancel racing confirmation should not add a second terminal event.
add_task(async function test_double_terminal_records_one_complete() {
  const win = await openAIWindow();
  const url = "https://example.com/tab-double";

  try {
    await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.org/keep"
    );

    const conversation = new ChatConversation({});
    const toolCallId = "tab-double";
    const { completes } = await captureFunnel(async () => {
      const { uiData } = await toolFns.manageTabs(
        { action: "close_tabs", ask_confirmation: true, url_tokens: [url] },
        conversation,
        "sidebar",
        "test-model",
        toolCallId
      );
      const selectedTabs = uiData.properties.tabs.map(
        ({ token, url: tabUrl }) => ({
          token,
          url: tabUrl,
        })
      );
      const message = conversation.addAssistantMessage("text", "Confirm?");
      message.toolUIData = { toolCallId, uiType: uiData.uiType };

      for (const update of [
        {
          updateType: "confirmation-tab-selection",
          updateData: { selectedTabs },
        },
        {
          updateType: "cancel-tab-selection",
          updateData: { reason: "auto_cancel", actionType: "close_tabs" },
        },
      ]) {
        message.toolUIData.toolCallId = toolCallId;
        await ToolUI.handleUpdate(
          { messageId: message.id, toolCallId, ...update },
          conversation,
          win,
          "sidebar"
        );
      }
    });

    Assert.equal(
      completes.length,
      1,
      "Only the first terminal event records a complete"
    );
    Assert.equal(
      conversation.pendingBrowserActionTelemetryCount,
      0,
      "The stash is consumed once"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

// `auto_cancel` distinguishes superseded confirmation cards from user a
// initiated dismissal.
add_task(async function test_cancel_reasons_record_distinct_errors() {
  for (const [reason, expectedError] of [
    ["user_action", ""],
    ["auto_cancel", "auto_cancel"],
  ]) {
    const win = await openAIWindow();
    const url = `https://example.com/tab-${reason}`;

    try {
      await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
      await BrowserTestUtils.openNewForegroundTab(
        win.gBrowser,
        "https://example.org/keep"
      );

      const conversation = new ChatConversation({});
      const toolCallId = `tab-${reason}`;
      const { completes } = await captureFunnel(async () => {
        const { uiData } = await toolFns.manageTabs(
          { action: "close_tabs", ask_confirmation: true, url_tokens: [url] },
          conversation,
          "sidebar",
          "test-model",
          toolCallId
        );
        const message = conversation.addAssistantMessage("text", "Confirm?");
        message.toolUIData = { toolCallId, uiType: uiData.uiType };
        await ToolUI.handleUpdate(
          {
            messageId: message.id,
            toolCallId,
            updateType: "cancel-tab-selection",
            updateData: { reason, actionType: "close_tabs" },
          },
          conversation,
          win,
          "sidebar"
        );
      });

      Assert.equal(completes.length, 1, `${reason}: one complete`);
      Assert.equal(
        completes[0].extra.result,
        "cancelled",
        `${reason}: result is cancelled`
      );
      Assert.equal(
        completes[0].extra.error,
        expectedError,
        `${reason}: error distinguishes the cancel kind`
      );
    } finally {
      await BrowserTestUtils.closeWindow(win);
    }
  }
});

// `autoCancelActiveConfirmation` builds its own cancel update
add_task(async function test_auto_cancel_records_the_card_action() {
  for (const [action, uiType] of [
    ["close_tabs", UI_TYPES.WEBSITE_CONFIRMATION],
    ["group_tabs", UI_TYPES.TAB_GROUP_CONFIRMATION],
  ]) {
    const win = await openAIWindow();
    const url = `https://example.com/auto-cancel-${action}`;

    try {
      await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
      await BrowserTestUtils.openNewForegroundTab(
        win.gBrowser,
        "https://example.org/keep"
      );

      const conversation = new ChatConversation({});
      const toolCallId = `auto-cancel-${action}`;
      Services.fog.testResetFOG();

      const { uiData } = await toolFns.manageTabs(
        {
          action,
          ask_confirmation: true,
          url_tokens: [url],
          label: "Auto Cancel Group",
        },
        conversation,
        "sidebar",
        "test-model",
        toolCallId
      );
      Assert.equal(uiData.uiType, uiType, `${action}: deferred to a card`);

      const message = conversation.addAssistantMessage("text", "Confirm?");
      message.toolUIData = { toolCallId, uiType: uiData.uiType };

      await ToolUI.autoCancelActiveConfirmation(conversation, win, "sidebar");
      await Services.fog.testFlushAllChildren();

      const responses =
        Glean.smartWindow.browserActionPromptResponse.testGetValue() ?? [];
      const completes =
        Glean.smartWindow.browserActionComplete.testGetValue() ?? [];

      Assert.equal(responses.length, 1, `${action}: one prompt response`);
      Assert.equal(
        responses[0].extra.action,
        action,
        `${action}: the response names the superseded card's action`
      );
      Assert.equal(completes.length, 1, `${action}: one complete`);
      Assert.equal(
        completes[0].extra.action,
        action,
        `${action}: the complete agrees with the response`
      );
      Assert.equal(
        completes[0].extra.error,
        "auto_cancel",
        `${action}: recorded as an auto cancel`
      );
    } finally {
      await BrowserTestUtils.closeWindow(win);
    }
  }
});

// Some offered tabs are not available by confirmation time.
add_task(async function test_partial_close_records_partial_success() {
  const win = await openAIWindow();
  const urlA = "https://example.com/tab-partial-ok";
  const urlB = "https://example.com/tab-partial-gone";

  try {
    await BrowserTestUtils.openNewForegroundTab(win.gBrowser, urlA);
    const tabB = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      urlB
    );
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.org/keep"
    );

    const conversation = new ChatConversation({});
    const toolCallId = "tab-partial";
    const { completes } = await captureFunnel(async () => {
      const { uiData } = await toolFns.manageTabs(
        {
          action: "close_tabs",
          ask_confirmation: true,
          url_tokens: [urlA, urlB],
        },
        conversation,
        "sidebar",
        "test-model",
        toolCallId
      );

      const selectedTabs = uiData.properties.tabs.map(
        ({ token, url: tabUrl }) => ({
          token,
          url: tabUrl,
        })
      );
      Assert.equal(selectedTabs.length, 2, "Both tabs were offered");

      // The user closes one of the tabs offered before confirming.
      BrowserTestUtils.removeTab(tabB);

      const message = conversation.addAssistantMessage("text", "Confirm?");
      message.toolUIData = { toolCallId, uiType: uiData.uiType };
      await ToolUI.handleUpdate(
        {
          messageId: message.id,
          toolCallId,
          updateType: "confirmation-tab-selection",
          updateData: { selectedTabs },
        },
        conversation,
        win,
        "sidebar"
      );
    });

    Assert.equal(completes.length, 1, "Records one complete");
    Assert.equal(
      completes[0].extra.result,
      "partial_success",
      "One of two selected tabs closed is a partial success"
    );
    Assert.equal(
      completes[0].extra.tabs_affected,
      "1",
      "Only the surviving tab was closed"
    );
    Assert.equal(
      completes[0].extra.error,
      "some_tabs_failed_to_close",
      "Names the partial-failure code"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

// All offered tabs are not available by confirmation time.
add_task(async function test_total_failure_records_error() {
  const win = await openAIWindow();
  const urlA = "https://example.com/funnel-total-a";
  const urlB = "https://example.com/funnel-total-b";

  try {
    const tabA = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      urlA
    );
    const tabB = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      urlB
    );
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.org/keep"
    );

    const conversation = new ChatConversation({});
    const toolCallId = "funnel-total";
    const { completes } = await captureFunnel(async () => {
      const { uiData } = await toolFns.manageTabs(
        {
          action: "close_tabs",
          ask_confirmation: true,
          url_tokens: [urlA, urlB],
        },
        conversation,
        "sidebar",
        "test-model",
        toolCallId
      );
      const selectedTabs = uiData.properties.tabs.map(
        ({ token, url: tabUrl }) => ({
          token,
          url: tabUrl,
        })
      );
      BrowserTestUtils.removeTab(tabA);
      BrowserTestUtils.removeTab(tabB);

      const message = conversation.addAssistantMessage("text", "Confirm?");
      message.toolUIData = { toolCallId, uiType: uiData.uiType };
      await ToolUI.handleUpdate(
        {
          messageId: message.id,
          toolCallId,
          updateType: "confirmation-tab-selection",
          updateData: { selectedTabs },
        },
        conversation,
        win,
        "sidebar"
      );
    });

    Assert.equal(completes.length, 1, "Records one complete");
    Assert.equal(
      completes[0].extra.result,
      "error",
      "No tab closed is an error, not a partial success"
    );
    Assert.equal(completes[0].extra.tabs_affected, "0", "No tabs affected");
    Assert.equal(
      completes[0].extra.undo_available,
      "false",
      "Nothing to undo when nothing closed"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_open_tabs_records_no_complete() {
  const win = await openAIWindow();
  const url = "https://example.com/funnel-open";

  try {
    const tab = await BrowserTestUtils.openNewForegroundTab(win.gBrowser, url);
    const toolCallId = "funnel-open";
    const tokenToKey = new Map([["tok-open", tab.permanentKey]]);
    ToolUI.registerTabKeys(toolCallId, tokenToKey);

    const conversation = new ChatConversation({});
    const message = conversation.addAssistantMessage("text", "Confirm?");
    message.toolUIData = {
      toolCallId,
      uiType: UI_TYPES.TAB_GROUP_CONFIRMATION,
      properties: { actionType: "open_tabs" },
    };

    const { submits, completes } = await captureFunnel(() =>
      ToolUI.handleUpdate(
        {
          messageId: message.id,
          toolCallId,
          updateType: "confirm-open-and-group-tabs-selection",
          updateData: { selectedTabs: [{ token: "tok-open", url }] },
        },
        conversation,
        win,
        "sidebar"
      )
    );

    Assert.equal(submits.length, 0, "No submit: manage_tabs never ran");
    Assert.equal(completes.length, 0, "Records no complete");
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_already_closing_tab_is_a_partial_failure() {
  const win = await openAIWindow();
  const ok = "https://example.com/funnel-closing-ok";
  const closing = "https://example.com/funnel-closing-busy";

  try {
    await BrowserTestUtils.openNewForegroundTab(win.gBrowser, ok);
    const busy = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      closing
    );
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.org/keep"
    );

    const conversation = new ChatConversation({});
    const toolCallId = "funnel-closing";
    const { completes } = await captureFunnel(async () => {
      const { uiData } = await toolFns.manageTabs(
        {
          action: "close_tabs",
          ask_confirmation: true,
          url_tokens: [ok, closing],
        },
        conversation,
        "sidebar",
        "test-model",
        toolCallId
      );
      const selectedTabs = uiData.properties.tabs.map(
        ({ token, url: tabUrl }) => ({
          token,
          url: tabUrl,
        })
      );

      // Mark the tab as closing without removing it, so it is still resolvable
      // by permanentKey but rejected by the service's validation.
      busy.closing = true;

      const message = conversation.addAssistantMessage("text", "Confirm?");
      message.toolUIData = { toolCallId, uiType: uiData.uiType };
      await ToolUI.handleUpdate(
        {
          messageId: message.id,
          toolCallId,
          updateType: "confirmation-tab-selection",
          updateData: { selectedTabs },
        },
        conversation,
        win,
        "sidebar"
      );
      busy.closing = false;
    });

    Assert.equal(completes.length, 1, "Records one complete");
    Assert.equal(
      completes[0].extra.result,
      "partial_success",
      "An already-closing tab is a real per-tab failure"
    );
    Assert.equal(
      completes[0].extra.tabs_affected,
      "1",
      "Only the healthy tab closed"
    );
    Assert.strictEqual(
      completes[0].extra.undo_available,
      "true",
      "The successful close still offers undo"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_display_telemetry_per_card_type() {
  const win = await openAIWindow();

  try {
    Services.fog.testResetFOG();
    const telemetryData = {
      location: "sidebar",
      chat_id: "card-types",
      message_seq: 1,
    };

    for (const toolUIData of [
      {
        uiType: UI_TYPES.WEBSITE_CONFIRMATION,
        properties: { tabs: [{}, {}] },
      },
      { uiType: UI_TYPES.TAB_GROUP_CONFIRMATION, properties: { tabs: [{}] } },
      {
        uiType: UI_TYPES.TAB_GROUP_CONFIRMATION,
        properties: { actionType: "open_tabs", tabs: [{}] },
      },
      { uiType: UI_TYPES.AI_ACTION_RESULT, properties: {} },
    ]) {
      ToolUI.handleUIDisplayTelemetry(toolUIData, telemetryData);
    }
    await Services.fog.testFlushAllChildren();

    const prompts = Glean.smartWindow.browserActionPrompt.testGetValue() ?? [];
    Assert.deepEqual(
      prompts.map(prompt => prompt.extra.action),
      ["close_tabs", "group_tabs", "open_tabs"],
      "One prompt per confirmation type, and none for a result card"
    );
    Assert.equal(prompts[0].extra.candidates, "2", "Counts candidate tabs");
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

add_task(async function test_unknown_action_is_normalized() {
  const win = await openAIWindow();

  try {
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.com/funnel-unknown"
    );

    const conversation = new ChatConversation({});
    const { submits, completes } = await captureFunnel(() =>
      toolFns.manageTabs(
        {
          action: "delete_history",
          ask_confirmation: true,
          url_tokens: ["https://example.com/funnel-unknown"],
        },
        conversation,
        "sidebar",
        "test-model",
        "funnel-unknown"
      )
    );

    Assert.equal(submits.length, 1, "Records one submit");
    Assert.equal(
      submits[0].extra.action,
      "unsupported",
      "Submit normalizes an invented action instead of echoing it"
    );
    Assert.equal(completes.length, 1, "Records one complete");
    Assert.equal(
      completes[0].extra.action,
      "unsupported",
      "Complete normalizes it too"
    );
    Assert.equal(
      completes[0].extra.error,
      "unsupported_action",
      "Names the reason the action was rejected"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});
