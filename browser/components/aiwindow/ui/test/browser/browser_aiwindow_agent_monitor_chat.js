/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function setupConversationWithToolUI(aichatBrowser, data) {
  await SpecialPowers.spawn(aichatBrowser, [data], async config => {
    const chatContent = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("ai-chat-content"),
      "Wait for ai-chat-content element"
    );

    const chatContentJS = chatContent.wrappedJSObject || chatContent;
    await chatContent.updateComplete;

    const messages = [
      {
        role: "user",
        body: config.userMessage,
        ordinal: 0,
        convId: "test-conv",
      },
      {
        role: "assistant",
        body: config.assistantMessage,
        ordinal: 1,
        convId: "test-conv",
        messageId: config.messageId,
        appliedMemories: [],
        isLastChunk: true,
        toolUIData: config.toolUIData,
      },
    ];

    chatContentJS.conversationState = Cu.cloneInto(messages, content);
    await chatContent.updateComplete;
  });
}

const MONITOR_CARD = {
  userMessage: "monitor this page",
  assistantMessage: "Set up a monitor for this page.",
  messageId: "monitor-msg-1",
  toolUIData: {
    toolCallId: "monitor-call-1",
    uiType: "agent-monitor-item",
    properties: {
      agent: {
        url: "https://example.com/product",
        watchUrls: ["https://example.com/product"],
        condition: "the price drops",
        conditionPresets: [],
      },
    },
  },
};

const DISPLAY_MONITOR_CARD = {
  userMessage: "monitor this page",
  assistantMessage: "Watching this page.",
  messageId: "monitor-msg-2",
  toolUIData: {
    toolCallId: "monitor-call-2",
    uiType: "agent-monitor-item",
    properties: {
      mode: "display",
      agent: {
        id: "monitor-id-2",
        monitorName: "Example product",
        url: "https://example.com/product",
        watchUrls: ["https://example.com/product"],
        condition: "the price drops",
        status: { label: "Watching", kind: "watching" },
        schedule: { frequency: "daily", time: "09:00", weekday: "1" },
      },
    },
  },
};

/**
 * Clicks an action in the expanded display card and returns the detail of the
 * event it makes the chat dispatch.
 *
 * @param {string} selector - Action to click, inside the card's shadow root
 * @param {object} [options]
 * @param {string} [options.matchText]
 * @param {boolean} [options.edit] - Open edit mode before clicking
 * @param {string} [options.eventType] - Event to capture on ai-chat-content
 * @param {string} [options.innerSelector] - Click this inside the action's own
 *  shadow root instead of the action itself, for nested components like chips
 * @returns {Promise<object|null>} The captured event detail
 */
async function getDisplayCardActionDetail(
  selector,
  {
    matchText,
    edit = false,
    eventType = "AIChatContent:ToolUIUpdate",
    innerSelector = "",
  } = {}
) {
  const restoreSignIn = skipSignIn();
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: { streamChunks: ["Watching this page."] },
  });
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;
    const aichatBrowser = await getAichatBrowser(browser);
    await setupConversationWithToolUI(aichatBrowser, DISPLAY_MONITOR_CARD);

    return await SpecialPowers.spawn(
      aichatBrowser,
      [{ selector, matchText, edit, eventType, innerSelector }],
      async args => {
        const chatContent = content.document.querySelector("ai-chat-content");
        const card = await ContentTaskUtils.waitForCondition(
          () => chatContent.shadowRoot.querySelector("agent-monitor-item"),
          "Wait for agent-monitor-item"
        );
        await card.updateComplete;
        Assert.equal(
          card.getAttribute("mode"),
          "display",
          "card renders in display mode"
        );

        card.shadowRoot.querySelector(".chev").click();
        await ContentTaskUtils.waitForCondition(
          () => card.shadowRoot.querySelector(".watch-expand"),
          "Wait for the expanded body"
        );

        if (args.edit) {
          card.shadowRoot.querySelector("#edit-button").click();
          await ContentTaskUtils.waitForCondition(
            () =>
              card.shadowRoot.querySelector(
                'moz-button[data-l10n-id="ai-tasks-alert-save-button"]'
              ),
            "Wait for edit mode Save button"
          );
        }

        let detail = null;
        chatContent.addEventListener(args.eventType, e => (detail = e.detail), {
          once: true,
        });

        const action = card.shadowRoot.querySelector(args.selector);
        Assert.ok(action, `Action (${args.selector}) exists`);
        let button = action;
        if (args.innerSelector) {
          button = action.shadowRoot.querySelector(args.innerSelector);
          Assert.ok(button, `Action target (${args.innerSelector}) exists`);
        }
        button.click();
        await new Promise(resolve => content.setTimeout(resolve, 0));
        return detail;
      }
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    await restore();
  }
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.agent.enabled", true]],
  });
});

add_task(async function test_agent_monitor_item_renders_in_chat() {
  const restoreSignIn = skipSignIn();
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: { streamChunks: ["Set up a monitor for this page."] },
  });
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;
    const aichatBrowser = await getAichatBrowser(browser);

    await setupConversationWithToolUI(aichatBrowser, MONITOR_CARD);

    await SpecialPowers.spawn(aichatBrowser, [], async () => {
      const chatContent = content.document.querySelector("ai-chat-content");

      await ContentTaskUtils.waitForCondition(
        () => chatContent.shadowRoot.querySelector("agent-monitor-item"),
        "Wait for agent-monitor-item to render"
      );

      const card = chatContent.shadowRoot.querySelector("agent-monitor-item");
      Assert.ok(card, "agent-monitor-item should render");
      Assert.equal(
        card.getAttribute("mode"),
        "create",
        "card is rendered in create mode"
      );

      const parent = card.parentElement.parentElement;
      Assert.ok(
        parent?.classList.contains("chat-bubble-assistant"),
        "card is inside the assistant message bubble"
      );
    });
  } finally {
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    await restore();
  }
});

add_task(async function test_monitor_start_dispatches_create_update() {
  const restoreSignIn = skipSignIn();
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: { streamChunks: ["Set up a monitor for this page."] },
  });
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;
    const aichatBrowser = await getAichatBrowser(browser);

    await setupConversationWithToolUI(aichatBrowser, MONITOR_CARD);

    await SpecialPowers.spawn(aichatBrowser, [], async () => {
      const chatContent = content.document.querySelector("ai-chat-content");

      const card = await ContentTaskUtils.waitForCondition(
        () => chatContent.shadowRoot.querySelector("agent-monitor-item"),
        "Wait for agent-monitor-item"
      );
      await card.updateComplete;

      let detail = null;
      chatContent.addEventListener(
        "AIChatContent:ToolUIUpdate",
        e => (detail = e.detail),
        { once: true }
      );

      const startButton = card.shadowRoot.querySelector(
        'moz-button[data-l10n-id="ai-tasks-alert-create-button"]'
      );
      Assert.ok(startButton, "Create alert button exists");
      startButton.click();
      await new Promise(resolve => content.setTimeout(resolve, 0));

      Assert.ok(detail, "AIChatContent:ToolUIUpdate should fire on submit");
      Assert.equal(
        detail.updateType,
        "create-watch",
        "updateType is create-watch"
      );
      Assert.equal(
        detail.messageId,
        "monitor-msg-1",
        "messageId is correlated back"
      );
      Assert.equal(
        detail.toolCallId,
        "monitor-call-1",
        "toolCallId is correlated back"
      );
      Assert.equal(
        detail.updateData?.mode,
        "create",
        "submit payload reports create mode"
      );
      Assert.deepEqual(
        detail.updateData?.watchUrls,
        ["https://example.com/product"],
        "submit payload carries the seeded watch URL"
      );
    });
  } finally {
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    await restore();
  }
});

add_task(async function test_form_edit_dispatches_draft_update() {
  const restoreSignIn = skipSignIn();
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: { streamChunks: ["Set up a monitor for this page."] },
  });
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;
    const aichatBrowser = await getAichatBrowser(browser);

    await setupConversationWithToolUI(aichatBrowser, MONITOR_CARD);

    const detail = await SpecialPowers.spawn(aichatBrowser, [], async () => {
      const chatContent = content.document.querySelector("ai-chat-content");

      const card = await ContentTaskUtils.waitForCondition(
        () => chatContent.shadowRoot.querySelector("agent-monitor-item"),
        "Wait for agent-monitor-item"
      );
      await card.updateComplete;

      let captured = null;
      chatContent.addEventListener(
        "AIChatContent:ToolUIUpdate",
        e => (captured = e.detail),
        { once: true }
      );

      const nameInput = card.shadowRoot.querySelector(
        "moz-input-text.monitor-name-input"
      );
      // value is a Lit property, so it has to be set on the element itself and
      // not on the Xray wrapper, or the card reads it back empty
      const nameInputJS = nameInput.wrappedJSObject || nameInput;
      nameInputJS.value = "Example product";
      nameInput.dispatchEvent(new content.Event("change", { bubbles: true }));
      await new Promise(resolve => content.setTimeout(resolve, 0));

      return captured;
    });

    Assert.ok(detail, "AIChatContent:ToolUIUpdate fires on a form edit");
    Assert.equal(
      detail.updateType,
      "save-watch-draft",
      "updateType is save-watch-draft"
    );
    Assert.equal(
      detail.messageId,
      "monitor-msg-1",
      "messageId is correlated back"
    );
    Assert.equal(
      detail.toolCallId,
      "monitor-call-1",
      "toolCallId is correlated back"
    );
    Assert.equal(
      detail.updateData?.draft?.monitorName,
      "Example product",
      "draft payload carries the edited field"
    );
    Assert.deepEqual(
      detail.updateData?.draft?.watchUrls,
      ["https://example.com/product"],
      "draft payload is a full snapshot of the form, not just the edit"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    await restore();
  }
});

add_task(async function test_monitor_cancel_dispatches_cancel_update() {
  const restoreSignIn = skipSignIn();
  const { restore } = await stubEngineNetworkBoundaries({
    serverOptions: { streamChunks: ["Set up a monitor for this page."] },
  });
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;
    const aichatBrowser = await getAichatBrowser(browser);

    await setupConversationWithToolUI(aichatBrowser, MONITOR_CARD);

    await SpecialPowers.spawn(aichatBrowser, [], async () => {
      const chatContent = content.document.querySelector("ai-chat-content");

      const card = await ContentTaskUtils.waitForCondition(
        () => chatContent.shadowRoot.querySelector("agent-monitor-item"),
        "Wait for agent-monitor-item"
      );
      await card.updateComplete;

      let detail = null;
      chatContent.addEventListener(
        "AIChatContent:ToolUIUpdate",
        e => (detail = e.detail),
        { once: true }
      );

      const cancelButton = card.shadowRoot.querySelector(
        "#cancel-create-button"
      );
      Assert.ok(cancelButton, "Cancel button exists");
      cancelButton.click();
      await new Promise(resolve => content.setTimeout(resolve, 0));

      Assert.ok(detail, "AIChatContent:ToolUIUpdate should fire on cancel");
      Assert.equal(
        detail.updateType,
        "cancel-watch",
        "updateType is cancel-watch"
      );
      Assert.equal(
        detail.messageId,
        "monitor-msg-1",
        "messageId is correlated back"
      );
    });
  } finally {
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    await restore();
  }
});

add_task(async function test_display_save_dispatches_update_update() {
  const detail = await getDisplayCardActionDetail(
    'moz-button[data-l10n-id="ai-tasks-alert-save-button"]',
    {
      edit: true,
    }
  );
  Assert.ok(detail, "ToolUIUpdate fires when saving an edit");
  Assert.equal(
    detail.updateType,
    "update-watch",
    "saving a display card routes to update-watch, not create"
  );
  Assert.equal(
    detail.updateData?.mode,
    "display",
    "submit reports display mode"
  );
  Assert.equal(detail.updateData?.id, "monitor-id-2", "submit carries the id");
});

add_task(async function test_delete_dispatches_delete_update() {
  const detail = await getDisplayCardActionDetail(
    'moz-button[data-l10n-id="ai-tasks-alert-delete-button"]'
  );
  Assert.ok(detail, "ToolUIUpdate fires on delete");
  Assert.equal(detail.updateType, "delete-watch", "updateType is delete-watch");
  Assert.deepEqual(
    detail.updateData,
    { id: "monitor-id-2" },
    "delete carries the monitor id"
  );
});

add_task(async function test_pause_dispatches_pause_update() {
  const detail = await getDisplayCardActionDetail(
    'moz-button[data-l10n-id="ai-tasks-alert-pause-button"]'
  );
  Assert.ok(detail, "ToolUIUpdate fires on pause");
  Assert.equal(detail.updateType, "pause-watch", "updateType is pause-watch");
  Assert.deepEqual(
    detail.updateData,
    { id: "monitor-id-2", paused: true },
    "pause carries the id and desired paused state"
  );
});

add_task(async function test_check_now_dispatches_check_update() {
  const detail = await getDisplayCardActionDetail(
    'moz-button[data-l10n-id="ai-tasks-alert-check-now-button"]',
    {}
  );
  Assert.ok(detail, "ToolUIUpdate fires on check now");
  Assert.equal(detail.updateType, "check-watch", "updateType is check-watch");
  Assert.deepEqual(
    detail.updateData,
    { id: "monitor-id-2" },
    "check now carries the monitor id"
  );
});

add_task(async function test_watch_url_chip_dispatches_open_link() {
  const detail = await getDisplayCardActionDetail("ai-website-chip", {
    eventType: "AIChatContent:OpenLink",
    innerSelector: ".chip",
  });
  Assert.ok(detail, "OpenLink fires when a watched page chip is clicked");
  Assert.equal(
    detail.url,
    "https://example.com/product",
    "OpenLink carries the full watched page URL"
  );
  Assert.ok(
    detail.preferSwitchToTab,
    "A watched page prefers an already open tab"
  );
});
