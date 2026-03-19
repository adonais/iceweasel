/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
);

const { ChatMessage } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs"
);

const { ChatStore, MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

function createMockConversation(id = "test-restore-id") {
  const conversation = new ChatConversation({
    id,
    title: "Restored Conversation",
    pageUrl: new URL("https://example.com/"),
  });

  conversation.messages = [
    new ChatMessage({
      ordinal: 0,
      role: MESSAGE_ROLE.USER,
      content: { text: "Hello" },
    }),
    new ChatMessage({
      ordinal: 1,
      role: MESSAGE_ROLE.ASSISTANT,
      content: { text: "Hi there" },
    }),
  ];

  return conversation;
}

describe("AI Window session restore", () => {
  let win, browser, sb, mockConversation, findStub;

  beforeEach(async () => {
    sb = sinon.createSandbox();
    findStub = sb.stub(ChatStore, "findConversationById");
    win = await openAIWindow();
    browser = win.gBrowser.selectedBrowser;
  });

  afterEach(async () => {
    await BrowserTestUtils.closeWindow(win);
    sb.restore();
    win = null;
    browser = null;
    sb = null;
    mockConversation = null;
    findStub = null;
  });

  describe("fullpage AI window", () => {
    beforeEach(() => {
      mockConversation = createMockConversation();
      findStub.resolves(mockConversation);
    });

    it("should restore conversation from window.history.state.conversationId", async () => {
      // Clear the attribute set during initial load so that #getPendingConversationId
      // falls through to history.state, which is what session restore actually provides.
      browser.removeAttribute("data-conversation-id");

      // Simulate what session restore does: restore a history entry with conversationId.
      await SpecialPowers.spawn(
        browser,
        [mockConversation.id],
        async convId => {
          content.history.replaceState({ conversationId: convId }, "");
        }
      );

      // Reload to trigger connectedCallback, which calls #loadPendingConversation and reads history.state.
      browser.reload();
      await BrowserTestUtils.browserLoaded(browser, false, AIWINDOW_URL);

      await TestUtils.waitForCondition(
        () => findStub.calledWith(mockConversation.id),
        "findConversationById should be called with the history.state conversation ID"
      );

      Assert.ok(
        findStub.calledWith(mockConversation.id),
        "Should restore conversation from window.history.state.conversationId"
      );

      const title = await SpecialPowers.spawn(
        browser,
        [],
        () => content.document.title
      );
      Assert.equal(
        title,
        mockConversation.title,
        "Document title should be set to the restored conversation title"
      );
    });

    it("should not clear an existing conversation when OpenConversation fires with no detail", async () => {
      const contentWin = browser.contentWindow;

      // Open a conversation with messages by dispatching OpenConversation with detail.
      contentWin.document.dispatchEvent(
        new contentWin.CustomEvent("OpenConversation", {
          detail: mockConversation,
        })
      );

      await TestUtils.waitForCondition(
        () =>
          contentWin.document.querySelector("ai-window")?.conversationId ===
          mockConversation.id,
        "conversation should be set after OpenConversation with detail"
      );

      // Dispatch OpenConversation with no detail — should not clear the conversation.
      contentWin.document.dispatchEvent(
        new contentWin.CustomEvent("OpenConversation", { detail: null })
      );

      const conversationId =
        contentWin.document.querySelector("ai-window")?.conversationId;
      Assert.equal(
        conversationId,
        mockConversation.id,
        "conversationId should not change after OpenConversation with no detail when messages exist"
      );
    });
  });

  describe("tab switching", () => {
    let newTab;

    beforeEach(async () => {
      mockConversation = createMockConversation("tab-a-conv");
      findStub.resolves(mockConversation);

      BrowserTestUtils.startLoadingURIString(browser, "https://example.com/");
      await BrowserTestUtils.browserLoaded(browser);
    });

    afterEach(async () => {
      if (newTab) {
        await BrowserTestUtils.removeTab(newTab);
        newTab = null;
      }
    });

    it("should open a fresh chat on a new tab and restore the conversation when switching back", async () => {
      const tabA = win.gBrowser.selectedTab;

      // Simulate a sidebar conversation on tab A.
      win.dispatchEvent(
        new win.CustomEvent("ai-window:opened-conversation", {
          detail: {
            mode: "sidebar",
            conversationId: mockConversation.id,
            conversation: mockConversation,
            tab: tabA,
          },
        })
      );

      // Open a new tab with no conversation.
      newTab = await BrowserTestUtils.openNewForegroundTab(
        win.gBrowser,
        "https://example.org/"
      );

      await TestUtils.waitForCondition(
        () => !AIWindowUI.isSidebarOpen(win),
        "Sidebar should close when switching to new tab"
      );

      findStub.resetHistory();

      // Simulate clicking the Ask button on the new tab — should open a fresh chat.
      AIWindowUI.toggleSidebar(win);

      await TestUtils.waitForCondition(
        () => AIWindowUI.isSidebarOpen(win),
        "Sidebar should open after Ask button click"
      );

      Assert.ok(
        !findStub.calledWith(mockConversation.id),
        "Should not load the previous tab's conversation in the new tab's sidebar"
      );

      // Switch back to tab A — its sidebar conversation should be restored.
      win.gBrowser.selectedTab = tabA;

      await TestUtils.waitForCondition(
        () => AIWindowUI.isSidebarOpen(win),
        "Sidebar should reopen when switching back to tab A"
      );

      Assert.ok(
        AIWindowUI.isSidebarOpen(win),
        "Sidebar should be open with tab A's conversation after switching back"
      );
    });
  });
});
