/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
);
const { ChatMessage } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatMessage.sys.mjs"
);
const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs"
);

describe("duplicate Smart Window chat tabs", () => {
  let win;

  beforeEach(async () => {
    win = await openAIWindow();
  });

  afterEach(async () => {
    await BrowserTestUtils.closeWindow(win);
  });

  // Give the tab a conversation the user has started, as opposed to the empty
  // one every new Smart Window tab holds.
  function attachConversation(tab, id) {
    const conversation = new ChatConversation({
      id,
      title: `Conversation ${id}`,
      pageUrl: new URL("https://example.com/"),
    });
    conversation.messages = [
      new ChatMessage({
        ordinal: 0,
        role: MESSAGE_ROLE.USER,
        content: { text: "Hello" },
      }),
    ];
    AIWindow._aiWindowTabStateManagers
      .get(win)
      .setTabStateConversation(tab, conversation);
  }

  // A new tab's empty conversation only reaches the tab state once the page
  // has connected, so wait for it before judging the tab.
  function waitForNoConversation(tab) {
    return TestUtils.waitForCondition(
      () => AIWindow.getChatTabConversationId(tab) === null,
      "The tab is known to hold only an empty conversation"
    );
  }

  // A chat tab is the Smart Window new-tab page with a conversation open in it.
  async function openChatTab(conversationId) {
    const tab = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      AIWINDOW_URL
    );
    if (conversationId) {
      attachConversation(tab, conversationId);
    }
    return tab;
  }

  it("tells chat tabs apart by their conversation", async () => {
    const newTab = win.gBrowser.selectedTab;
    const chatA = await openChatTab("a");
    const chatB = await openChatTab("b");

    Assert.equal(
      AIWindow.getChatTabConversationId(chatA),
      "a",
      "A chat tab is identified by its conversation"
    );
    await waitForNoConversation(newTab);
    Assert.deepEqual(
      win.gBrowser.getAllDuplicateTabsToClose(),
      [],
      "Chat tabs with different conversations are not duplicates of each other, or of the empty new tab"
    );
    Assert.deepEqual(
      [
        ...win.gBrowser.getDuplicateTabsToClose(chatA),
        ...win.gBrowser.getDuplicateTabsToClose(chatB),
      ],
      [],
      "Nor does either chat tab have duplicates of its own"
    );

    const chatA2 = await openChatTab("a");
    Assert.deepEqual(
      win.gBrowser.getAllDuplicateTabsToClose(),
      [chatA],
      "A second tab on the same conversation is a duplicate, and the older one goes"
    );
    Assert.deepEqual(
      win.gBrowser.getDuplicateTabsToClose(chatA2),
      [chatA],
      "The same holds when closing the duplicates of one tab"
    );
  });

  it("still treats empty new tabs and web pages as duplicates", async () => {
    const newTab = win.gBrowser.selectedTab;
    const secondNewTab = await openChatTab();
    await waitForNoConversation(secondNewTab);
    Assert.deepEqual(
      win.gBrowser.getAllDuplicateTabsToClose(),
      [newTab],
      "Two new tabs whose conversations are still empty are duplicates"
    );
    await BrowserTestUtils.removeTab(secondNewTab);

    const pageA = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.com/"
    );
    attachConversation(pageA, "sidebar");
    const pageB = await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "https://example.com/"
    );
    Assert.equal(
      AIWindow.getChatTabConversationId(pageA),
      null,
      "A web page with a sidebar conversation is still that web page"
    );
    Assert.deepEqual(
      win.gBrowser.getAllDuplicateTabsToClose(),
      [pageA],
      "Two tabs on the same page are duplicates whatever their sidebars hold"
    );
    await BrowserTestUtils.removeTab(pageB);
    await BrowserTestUtils.removeTab(pageA);
  });
});
