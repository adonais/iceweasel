/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AITab, MAX_AITAB_CONTEXT_TABS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);

const { Chat } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Chat.sys.mjs"
);

const { GENERATE_AITAB } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { MockEngineManager, newChatConversation } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { MODEL_FEATURES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs"
);

const FEWER_THAN_LIMIT_TAB_COUNT = 3;
const MORE_THAN_LIMIT_TAB_COUNT = MAX_AITAB_CONTEXT_TABS + 2;
const CHAT_URL = "https://example.org/only-mentioned-in-chat";

const tabUrl = index => `https://example.com/?tab=${index}`;

const l10n = new Localization(["preview/aiWindow.ftl"]);

describe("when selecting URLs to build an AITab", () => {
  let gWin;
  let gRestoreSignIn;
  let gMockEngineManager;
  let gSandbox;
  let gTabsOldestFirst;
  let gUrlsOldestFirst;
  let gUrlsNewestFirst;

  async function openTabsUpTo(count) {
    for (let i = gTabsOldestFirst.length; i < count; i++) {
      gTabsOldestFirst.push(
        await BrowserTestUtils.openNewForegroundTab(gWin.gBrowser, tabUrl(i))
      );
    }
    pinLastAccessed(gTabsOldestFirst);
    gUrlsOldestFirst = gTabsOldestFirst.map((_, i) => tabUrl(i));
    gUrlsNewestFirst = gUrlsOldestFirst.toReversed();
  }

  beforeEach(async () => {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.aitab.enabled", true]],
    });
    gRestoreSignIn = skipSignIn();
    gMockEngineManager = new MockEngineManager();
    gSandbox = sinon.createSandbox();
    gWin = await AIWindowTestUtils.openReadyAIWindow();
    gTabsOldestFirst = [];
    await openTabsUpTo(FEWER_THAN_LIMIT_TAB_COUNT);
  });

  afterEach(async () => {
    gSandbox.restore();
    await gMockEngineManager.rejectAllRequests();
    gMockEngineManager.cleanupMocks();
    gRestoreSignIn();
    await BrowserTestUtils.closeWindow(gWin);
    await SpecialPowers.popPrefEnv();
  });

  it("should ignore duplicate and non-http URLs", () => {
    const newest = gUrlsNewestFirst[0];
    Assert.deepEqual(
      AITab.selectContextUrls([
        "about:blank",
        newest,
        newest,
        42,
        CHAT_URL,
        CHAT_URL,
      ]),
      [newest, CHAT_URL],
      "Each URL should appear once and about:blank should be dropped, because only http(s) and AITab pages can be read"
    );
  });

  it("should keep AITab page URLs", () => {
    Assert.deepEqual(
      AITab.selectContextUrls(["about:smartpage?page=some_page"]),
      ["about:smartpage?page=some_page"],
      "The AITab page should be kept because its content can be read like a web page"
    );
  });

  it("should drop about:smartpage URLs without a page name", () => {
    Assert.deepEqual(
      AITab.selectContextUrls(["about:smartpage"]),
      [],
      "about:smartpage should be dropped because, without a page name, it does not point to any AITab"
    );
  });

  it("should return open tabs newest first even when passed in a different order", () => {
    const [oldest, middle, newest] = gUrlsOldestFirst;
    Assert.deepEqual(
      AITab.selectContextUrls([middle, oldest, newest]),
      [newest, middle, oldest],
      "Open tabs should come back newest first because their order comes from the lastAccessed attribute"
    );
  });

  it("should submit a prompt listing the selected context URLs", async () => {
    const tabOpened = BrowserTestUtils.waitForEvent(
      gWin.gBrowser.tabContainer,
      "TabOpen"
    );
    AIWindow.createAITab(gWin, gUrlsOldestFirst);
    const aiTab = (await tabOpened).target;

    let userMessage;
    await TestUtils.waitForCondition(
      () => {
        userMessage = aiTab.linkedBrowser.contentDocument
          ?.querySelector("ai-window")
          ?.conversation?.messages.find(m => m.role === MESSAGE_ROLE.USER);
        return userMessage;
      },
      "Wait for the new tab's chat to submit its conversation",
      100,
      150
    );

    const prompt = await l10n.formatValue("ai-tab-create-page-prompt", {
      tabCount: gUrlsNewestFirst.length,
    });
    Assert.equal(
      userMessage.content.body,
      [prompt, ...gUrlsNewestFirst].join("\n"),
      "The prompt should list the newest tabs first, because AIWindow.createAITab selects the context URLs before building it"
    );
  });

  it("should pass generateAITab the selected context URLs", async () => {
    const generate = gSandbox.spy(AITab, "generateAITab");

    const conversation = await newChatConversation();
    conversation.addUserMessage("Make a page from these tabs");
    conversation.addAssistantMessage("text", "");
    Chat.fetchWithHistory({ conversation });
    await gMockEngineManager.respondToWithToolCall({
      toolName: GENERATE_AITAB,
      toolParams: { url_list: [CHAT_URL, ...gUrlsOldestFirst] },
    });
    // Generation has started once it asks for the page; afterEach's
    // rejectAllRequests() ends the turn.
    await gMockEngineManager.captureRequest({
      purpose: MODEL_FEATURES.AITAB,
    });

    Assert.deepEqual(
      generate.firstCall.args[0].urlList,
      [...gUrlsNewestFirst, CHAT_URL],
      "generateAITab should get the open tabs newest first and the chat URL last, because the generate_aitab tool selects the context URLs before generating"
    );
  });

  describe("when the user chooses more tabs than the limit", () => {
    beforeEach(async () => {
      await openTabsUpTo(MORE_THAN_LIMIT_TAB_COUNT);
    });

    it("should keep only the most recently accessed tabs, up to the limit", () => {
      Assert.deepEqual(
        AITab.selectContextUrls(gUrlsOldestFirst),
        gUrlsNewestFirst.slice(0, MAX_AITAB_CONTEXT_TABS),
        `Only the ${MAX_AITAB_CONTEXT_TABS} most recently accessed tabs should be kept, because ${MORE_THAN_LIMIT_TAB_COUNT} tabs were chosen and the oldest ones do not fit the limit`
      );
    });

    it("should drop chat conversation URLs because open tabs fill every slot", () => {
      Assert.ok(
        !AITab.selectContextUrls([CHAT_URL, ...gUrlsOldestFirst]).includes(
          CHAT_URL
        ),
        `The chat URL should be dropped because ${MORE_THAN_LIMIT_TAB_COUNT} open tabs already fill the ${MAX_AITAB_CONTEXT_TABS} slots`
      );
    });

    it("should keep an open AITab page that was accessed most recently", async () => {
      const smartPageUrl = "about:smartpage?page=some_page";
      const smartPageTab = await BrowserTestUtils.openNewForegroundTab(
        gWin.gBrowser,
        smartPageUrl
      );
      pinLastAccessed([...gTabsOldestFirst, smartPageTab]);

      Assert.deepEqual(
        AITab.selectContextUrls([...gUrlsOldestFirst, smartPageUrl]),
        [
          smartPageUrl,
          ...gUrlsNewestFirst.slice(0, MAX_AITAB_CONTEXT_TABS - 1),
        ],
        "The AITab page should come first because it is the most recently accessed open tab, even though it is not an http(s) page"
      );
    });
  });

  describe("when the user chooses fewer tabs than the limit", () => {
    it("should keep every chosen tab", () => {
      Assert.deepEqual(
        AITab.selectContextUrls(gUrlsOldestFirst),
        gUrlsNewestFirst,
        `All ${FEWER_THAN_LIMIT_TAB_COUNT} tabs should be kept, because they fit within the limit of ${MAX_AITAB_CONTEXT_TABS}`
      );
    });

    it("should keep chat conversation URLs after the open tab URLs, because there are free slots", () => {
      Assert.deepEqual(
        AITab.selectContextUrls([CHAT_URL, ...gUrlsOldestFirst]),
        [...gUrlsNewestFirst, CHAT_URL],
        `The chat URL should be kept after the open tabs, because ${FEWER_THAN_LIMIT_TAB_COUNT} tabs leave free slots and it has no lastAccessed to rank it by`
      );
    });
  });
});
