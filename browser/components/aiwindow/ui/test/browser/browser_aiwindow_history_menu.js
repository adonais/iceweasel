/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ChatStore, ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);

async function seedConversations(count) {
  const ids = [];
  for (let i = 1; i <= count; i++) {
    const conversation = new ChatConversation({ title: `History chat ${i}` });
    conversation.addUserMessage("message 1", "https://example.com/");
    await ChatStore.updateConversation(conversation);
    ids.push(conversation.id);
  }
  return ids;
}

async function cleanUpConversations() {
  let conversations = await ChatStore.findRecentConversations(100);
  while (conversations.length) {
    for (const conv of conversations) {
      await ChatStore.deleteConversationById(conv.id);
    }
    conversations = await ChatStore.findRecentConversations(100);
  }
}

async function getFullpageAiWindow(win) {
  const aiWindow =
    win.gBrowser.selectedBrowser.contentDocument.querySelector("ai-window");
  await TestUtils.waitForCondition(
    () => aiWindow?.shadowRoot,
    "Fullpage AI Window should be rendered with a shadow root"
  );
  return aiWindow;
}

// The history menu lives in its own <smartwindow-history-menu> component; its
// buttons/panels are in that component's shadow root.
async function getHistoryMenuRoot(aiWindow) {
  await TestUtils.waitForCondition(
    () =>
      aiWindow.shadowRoot.querySelector("smartwindow-history-menu")?.shadowRoot,
    "History menu component should be rendered"
  );
  return aiWindow.shadowRoot.querySelector("smartwindow-history-menu")
    .shadowRoot;
}

async function openMenu(menuRoot, buttonSelector, panelId) {
  const panel = menuRoot.querySelector(`#${panelId}`);
  const shown = BrowserTestUtils.waitForEvent(panel, "shown");
  menuRoot.querySelector(buttonSelector).click();
  await shown;
  return panel;
}

/**
 * The fullpage "Chat history" button opens a dropdown listing recent chats
 * (with a favicon) plus a "View all chats" shortcut.
 */
add_task(async function test_fullpage_chat_history_dropdown() {
  const sb = this.sinon.createSandbox();
  let aiWin;

  try {
    sb.stub(this.openAIEngine, "build");
    await cleanUpConversations();
    await seedConversations(3);

    aiWin = await openAIWindow();
    const aiWindow = await getFullpageAiWindow(aiWin);
    const menuRoot = await getHistoryMenuRoot(aiWindow);

    await openMenu(
      menuRoot,
      "[data-l10n-id='aiwindow-fullpage-chat-history']",
      "fullpage-chats-menu"
    );

    await TestUtils.waitForCondition(
      () => menuRoot.querySelectorAll(".history-menu-chat").length,
      "Recent chats should be listed"
    );
    Assert.equal(
      menuRoot.querySelectorAll(".history-menu-chat").length,
      3,
      "All three recent chats should be listed"
    );
    Assert.ok(
      menuRoot.querySelector(
        "[data-l10n-id='aiwindow-history-menu-view-all-chats']"
      ),
      "Dropdown should have the View all chats shortcut"
    );

    const chatIcon = menuRoot
      .querySelector(".history-menu-chat")
      .style.getPropertyValue("--panel-item-icon-url");
    Assert.ok(
      chatIcon.includes("page-icon:") || chatIcon.includes("view-chats"),
      `Recent chat rows should render a chat/site icon, got: ${chatIcon}`
    );
  } finally {
    if (aiWin) {
      await BrowserTestUtils.closeWindow(aiWin);
    }
    await cleanUpConversations();
    sb.restore();
  }
});

/**
 * "View all chats" opens the Chats section of Firefox View.
 */
add_task(async function test_fullpage_view_all_chats() {
  const sb = this.sinon.createSandbox();
  let aiWin;

  try {
    sb.stub(this.openAIEngine, "build");
    await cleanUpConversations();

    aiWin = await openAIWindow();
    const openTab = sb.stub(aiWin.FirefoxViewHandler, "openTab");
    const aiWindow = await getFullpageAiWindow(aiWin);
    const menuRoot = await getHistoryMenuRoot(aiWindow);

    await openMenu(
      menuRoot,
      "[data-l10n-id='aiwindow-fullpage-chat-history']",
      "fullpage-chats-menu"
    );

    menuRoot
      .querySelector("[data-l10n-id='aiwindow-history-menu-view-all-chats']")
      .click();

    Assert.ok(
      openTab.calledOnceWith("chats"),
      "View all chats should open the Chats section of Firefox View"
    );
  } finally {
    if (aiWin) {
      await BrowserTestUtils.closeWindow(aiWin);
    }
    await cleanUpConversations();
    sb.restore();
  }
});

/**
 * The fullpage "More" button opens a menu with Smart Window settings.
 */
add_task(async function test_fullpage_more_settings() {
  const sb = this.sinon.createSandbox();
  let aiWin;

  try {
    sb.stub(this.openAIEngine, "build");
    await cleanUpConversations();

    aiWin = await openAIWindow();
    const openPreferences = sb.stub(aiWin, "openPreferences");
    const aiWindow = await getFullpageAiWindow(aiWin);
    const menuRoot = await getHistoryMenuRoot(aiWindow);

    await openMenu(
      menuRoot,
      "[data-l10n-id='aiwindow-fullpage-more']",
      "fullpage-more-menu"
    );

    menuRoot
      .querySelector("[data-l10n-id='aiwindow-history-menu-settings']")
      .click();

    Assert.ok(
      openPreferences.calledOnceWith("personalizeSmartWindow"),
      "More > Settings should open the Smart Window preferences"
    );
  } finally {
    if (aiWin) {
      await BrowserTestUtils.closeWindow(aiWin);
    }
    await cleanUpConversations();
    sb.restore();
  }
});

/**
 * Selecting a recent chat whose tab is not open reopens it in a new tab
 * (chats are tab-specific).
 */
add_task(async function test_fullpage_open_recent_chat() {
  const sb = this.sinon.createSandbox();
  let aiWin;

  try {
    sb.stub(this.openAIEngine, "build");
    await cleanUpConversations();
    await seedConversations(1);

    aiWin = await openAIWindow();
    const openTrustedLinkIn = sb.stub(URILoadingHelper, "openTrustedLinkIn");
    const aiWindow = await getFullpageAiWindow(aiWin);
    const menuRoot = await getHistoryMenuRoot(aiWindow);

    await openMenu(
      menuRoot,
      "[data-l10n-id='aiwindow-fullpage-chat-history']",
      "fullpage-chats-menu"
    );

    await TestUtils.waitForCondition(
      () => menuRoot.querySelector(".history-menu-chat"),
      "Recent chat item should be rendered"
    );
    menuRoot.querySelector(".history-menu-chat").click();

    await TestUtils.waitForCondition(
      () => openTrustedLinkIn.called,
      "A tab should be opened for the selected recent chat"
    );
    Assert.equal(
      openTrustedLinkIn.firstCall.args[2],
      "tab",
      "The chat should reopen in a new tab"
    );
  } finally {
    if (aiWin) {
      await BrowserTestUtils.closeWindow(aiWin);
    }
    await cleanUpConversations();
    sb.restore();
  }
});
