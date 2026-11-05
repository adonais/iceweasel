/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);
const { GET_PAGE_CONTENT } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);
const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs"
);

describe("Get Page Content errors", () => {
  let mockEngineManager;
  let win;
  let sidebarBrowser;
  let conversation;

  beforeEach(async () => {
    mockEngineManager = new MockEngineManager();
    ({ win, sidebarBrowser } = await openAIWindowWithSidebar());

    await mockEngineManager.rejectAllRequests();

    await typeInSmartbar(sidebarBrowser, "What does that page say?");
    await submitSmartbar(sidebarBrowser);

    conversation = await TestUtils.waitForCondition(
      () => AIWindow.getActiveConversation(win),
      "The Smartbar submission creates a conversation"
    );
  });

  afterEach(async () => {
    await mockEngineManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    if (win) {
      await BrowserTestUtils.closeWindow(win);
    }
    mockEngineManager = null;
    win = null;
    sidebarBrowser = null;
    conversation = null;
  });

  it("reports the correct URL when a stored Smart Page is missing", async () => {
    const missing = "about:smartpage?page=missing-content-test";

    await mockEngineManager.respondTo({
      purpose: "chat",
      response: {
        text: "",
        tokens: null,
        isPrompt: false,
        toolCalls: [
          {
            id: "call_missing_smartpage",
            function: {
              name: GET_PAGE_CONTENT,
              arguments: JSON.stringify({ url_list: [missing] }),
            },
          },
        ],
      },
    });

    const toolMessage = await TestUtils.waitForCondition(
      () =>
        conversation.messages.find(
          message =>
            message.role === MESSAGE_ROLE.TOOL &&
            message.content?.name === GET_PAGE_CONTENT
        ),
      "The missing Smart Page result reaches the conversation"
    );

    Assert.deepEqual(
      toolMessage.content.body,
      [`Could not retrieve the content for the page: ${missing}`],
      "The retrieval error identifies the missing Smart Page"
    );
  });

  it("blocks other about URLs", async () => {
    await mockEngineManager.respondTo({
      purpose: "chat",
      response: {
        text: "",
        tokens: null,
        isPrompt: false,
        toolCalls: [
          {
            id: "call_blocked_about_url",
            function: {
              name: GET_PAGE_CONTENT,
              arguments: JSON.stringify({ url_list: ["about:config"] }),
            },
          },
        ],
      },
    });

    const toolMessage = await TestUtils.waitForCondition(
      () =>
        conversation.messages.find(
          message =>
            message.role === MESSAGE_ROLE.TOOL &&
            message.content?.name === GET_PAGE_CONTENT
        ),
      "The blocked URL result reaches the conversation"
    );

    Assert.deepEqual(
      toolMessage.content.body,
      ["This URL is not allowed: about:config"],
      "The Smart Page exception does not allow about:config"
    );
  });
});
