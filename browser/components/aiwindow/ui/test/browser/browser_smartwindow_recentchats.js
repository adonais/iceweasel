const { ChatStore, ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);

async function addTestConversations(pageUrl) {
  for (let i = 1; i <= 5; i++) {
    const conversation = new ChatConversation({ title: `Chat ${i}` });
    conversation.addUserMessage("message 1", pageUrl);
    await ChatStore.updateConversation(conversation);
  }
}

async function cleanUpAllConversations() {
  let conversations = await ChatStore.findRecentConversations(100);
  while (conversations.length) {
    for (const conv of conversations) {
      await ChatStore.deleteConversationById(conv.id);
    }
    conversations = await ChatStore.findRecentConversations(100);
  }
}

async function openHistoryMenu() {
  const historyMenubarItem = gAiWindow.document.getElementById("history-menu");
  Assert.ok(!!historyMenubarItem, "History menu item should be in DOM");

  const historyMenu = gAiWindow.document.getElementById("historyMenuPopup");
  Assert.ok(!!historyMenu, "History menu popup should be in history menu");

  const menuShown = BrowserTestUtils.waitForEvent(historyMenu, "popupshown");
  historyMenubarItem.openMenu(true);
  await menuShown;

  await TestUtils.waitForTick();

  return historyMenu;
}

async function closeHistoryMenu(historyMenu) {
  const historyMenubarItem = gAiWindow.document.getElementById("history-menu");
  const menuClosed = BrowserTestUtils.waitForEvent(historyMenu, "popuphidden");
  historyMenubarItem.openMenu(false);
  await menuClosed;
}

async function triggerMenuItem(menu, menuItem) {
  const newTabPromise = BrowserTestUtils.waitForNewTab(gAiWindow.gBrowser);

  const menuHidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.activateItem(menuItem);
  await menuHidden;

  return newTabPromise;
}

let gAiWindow;

describe("recent chats", () => {
  let historyMenu;

  beforeEach(async () => {
    gAiWindow = await openAIWindow();
  });

  afterEach(async () => {
    await cleanUpAllConversations();
    await BrowserTestUtils.closeWindow(gAiWindow);
    gAiWindow = null;
  });

  describe("clicking history menu with chats in history", () => {
    beforeEach(async () => {
      await addTestConversations();

      historyMenu = await openHistoryMenu();
    });

    afterEach(async () => {
      await closeHistoryMenu(historyMenu);
    });

    it("shows the most recent 4 conversations", async () => {
      await BrowserTestUtils.waitForMutationCondition(
        historyMenu,
        { childList: true },
        () => historyMenu.querySelectorAll(".recent-chat-item").length
      );

      const recentChatItems = historyMenu.querySelectorAll(".recent-chat-item");
      Assert.equal(
        recentChatItems.length,
        4,
        "History menu should contain 4 items"
      );
    });
  });

  describe("clicking history menu with no chats in history", () => {
    beforeEach(async () => {
      historyMenu = await openHistoryMenu();
    });

    afterEach(async () => {
      await closeHistoryMenu(historyMenu);
    });

    it("doesn't have any recent chat item menu options", async () => {
      const recentChatItems = historyMenu.querySelectorAll(".recent-chat-item");
      Assert.equal(
        recentChatItems.length,
        0,
        "History menu should not have any recent chat items"
      );
    });
  });

  describe("recent chats click on full window chat", () => {
    beforeEach(async () => {
      await addTestConversations();
      historyMenu = await openHistoryMenu();
    });

    it("opens a chat in fullwindow mode", async () => {
      // const historyMenu = await openHistoryMenu();

      await BrowserTestUtils.waitForMutationCondition(
        historyMenu,
        { childList: true },
        () => historyMenu.querySelectorAll(".recent-chat-item").length
      );

      const recentChatItem = historyMenu.querySelector(".recent-chat-item");
      Assert.ok(
        !!recentChatItem,
        "History menu should have a recent chat item"
      );

      const expectedConversationId =
        recentChatItem.getAttribute("data-conv-id");

      let newTab = await triggerMenuItem(historyMenu, recentChatItem);
      await BrowserTestUtils.waitForMutationCondition(
        newTab.linkedBrowser,
        { attributes: true },
        () => newTab.linkedBrowser.hasAttribute("data-conversation-id")
      );

      Assert.equal(
        newTab.linkedBrowser.getAttribute("data-conversation-id"),
        expectedConversationId,
        "The tab should have the conversation loaded"
      );

      await BrowserTestUtils.removeTab(newTab);
      newTab = null;
    });
  });

  describe("recent chats menu item click on chat that navigated to a url", () => {
    beforeEach(async () => {
      await addTestConversations(new URL("https://www.example.com"));
      historyMenu = await openHistoryMenu();
    });

    it("it opens the conversation in sidebar", async () => {
      await BrowserTestUtils.waitForMutationCondition(
        historyMenu,
        { childList: true },
        () => historyMenu.querySelectorAll(".recent-chat-item").length
      );

      const recentChatItem = historyMenu.querySelector(".recent-chat-item");
      Assert.ok(
        !!recentChatItem,
        "History menu should have a recent chat item"
      );

      const expectedConversationId =
        recentChatItem.getAttribute("data-conv-id");

      let newTab = await triggerMenuItem(historyMenu, recentChatItem);

      const sidebarBrowser =
        gAiWindow.document.getElementById("ai-window-browser");
      await BrowserTestUtils.waitForCondition(() =>
        AIWindowUI.isSidebarOpen(gAiWindow)
      );

      Assert.equal(
        sidebarBrowser.getAttribute("data-conversation-id"),
        expectedConversationId,
        "Sidebar should open the selected conversation ID"
      );

      await BrowserTestUtils.removeTab(newTab);
      newTab = null;
    });
  });
});
