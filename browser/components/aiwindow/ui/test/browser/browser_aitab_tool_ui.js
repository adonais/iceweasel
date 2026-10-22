/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);
const { AITabStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AITabStore.sys.mjs"
);

const SOURCE_URL =
  "https://example.com/browser/browser/components/aiwindow/ui/test/browser/test_context_url_page.html";

const SURFACE = {
  components: [
    { id: "root", component: "Page", header: "header", children: ["body"] },
    { id: "header", component: "Header", title: "Lisbon hotels" },
    { id: "body", component: "TextBlock", lead: "A generated page." },
  ],
  dataModel: {},
};

const AITAB_RECORDS = [
  {
    kind: "params",
    feature: "aitab",
    model: "test-model",
    service_type: "ai",
    purpose: "aitab",
    parameters: {},
    modules: [
      { name: "system-instructions", version: "v1.0" },
      { name: "user-data", version: "v1.0" },
    ],
    version: "v1.0",
    is_default: true,
  },
  {
    kind: "module",
    feature: "aitab",
    module: "system-instructions",
    model: "test-model",
    prompts: "Create a page using these components:\n{schemas}",
    version: "v1.0",
  },
  {
    kind: "module",
    feature: "aitab",
    module: "user-data",
    model: "test-model",
    prompts: "Focus: {focus}\n{pageContent}",
    version: "v1.0",
  },
];

async function startAITabGeneration(win, mockEngine) {
  const browser = win.gBrowser.selectedBrowser;
  await typeInSmartbar(browser, "Create a page about Lisbon hotels");
  await submitSmartbar(browser);

  const chatRequest = await mockEngine.captureRequest({ purpose: "chat" });
  chatRequest.respond({
    text: "",
    tokens: null,
    isPrompt: false,
    toolCalls: [
      {
        id: "aitab-call",
        function: {
          name: "generate_page",
          arguments: JSON.stringify({
            url_list: [SOURCE_URL],
            focus: "Lisbon hotels",
          }),
        },
      },
    ],
  });
  return mockEngine.captureRequest({ purpose: "aitab" });
}

async function readAITabCard(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const aiWindow = content.document.querySelector("ai-window");
    const chatBrowser = aiWindow?.shadowRoot?.querySelector("#aichat-browser");
    if (!chatBrowser) {
      return null;
    }
    return SpecialPowers.spawn(chatBrowser, [], async () => {
      const chatContent = content.document.querySelector("ai-chat-content");
      const card = chatContent?.shadowRoot.querySelector("aitab-tool-ui");
      if (!card) {
        return null;
      }
      const cardElement = card.wrappedJSObject || card;
      await cardElement.updateComplete;
      return {
        state: cardElement.state,
        title: card.shadowRoot.querySelector(".title")?.textContent.trim(),
        buttonCount: card.shadowRoot.querySelectorAll("moz-button").length,
        hasSpinner: !!chatContent.shadowRoot.querySelector(
          "chat-assistant-loader"
        ),
      };
    });
  });
}

function waitForAITabCardState(browser, state) {
  return TestUtils.waitForCondition(async () => {
    const card = await readAITabCard(browser);
    return card?.state === state ? card : false;
  }, `Wait for the AITab ${state} state`);
}

async function clickAITabAction(win, mockEngine, buttonIndex) {
  const generationRequest = await startAITabGeneration(win, mockEngine);
  generationRequest.respond(JSON.stringify(SURFACE));
  await waitForAITabCardState(win.gBrowser.selectedBrowser, "choose");

  return SpecialPowers.spawn(
    win.gBrowser.selectedBrowser,
    [buttonIndex],
    async actionIndex => {
      const aiWindow = content.document.querySelector("ai-window");
      const chatBrowser = aiWindow.shadowRoot.querySelector("#aichat-browser");
      return SpecialPowers.spawn(chatBrowser, [actionIndex], async index => {
        const chatContent = content.document.querySelector("ai-chat-content");
        const card = chatContent.shadowRoot.querySelector("aitab-tool-ui");
        let requestedAction;
        card.addEventListener(
          "aitab-open-request",
          event => {
            event.stopImmediatePropagation();
            requestedAction = event.detail;
          },
          { capture: true, once: true }
        );
        card.shadowRoot.querySelectorAll("moz-button")[index].click();
        return requestedAction;
      });
    }
  );
}

const OPEN_HERE_BUTTON_INDEX = 0;
const OPEN_NEW_TAB_BUTTON_INDEX = 1;

async function clickReadyAITabAction(browser, buttonIndex) {
  const chatBrowser = await getAichatBrowser(browser);
  await SpecialPowers.spawn(chatBrowser, [buttonIndex], index => {
    const chatContent = content.document.querySelector("ai-chat-content");
    const card = chatContent.shadowRoot.querySelector("aitab-tool-ui");
    const button = card.shadowRoot.querySelectorAll("moz-button")[index];
    content.setTimeout(() => button.click());
  });
}

describe("AITab ToolUI", () => {
  let win;
  let mockEngine;
  let restoreSignIn;

  beforeEach(async () => {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.aitab.enabled", true]],
    });
    await AITabStore.destroyDatabase();
    _setRemoteClientForTesting({
      get: async () => [...MOCK_RS_RECORDS, ...AITAB_RECORDS],
    });
    restoreSignIn = skipSignIn();
    mockEngine = new MockEngineManager();
    win = await openAIWindow();
  });

  afterEach(async () => {
    mockEngine.rejectAllRequests();
    mockEngine.cleanupMocks();
    restoreSignIn();
    await BrowserTestUtils.closeWindow(win);
    await AITabStore.destroyDatabase();
    _setRemoteClientForTesting({ get: async () => MOCK_RS_RECORDS });
    await SpecialPowers.popPrefEnv();
  });

  it("shows the progress state while the page is being created", async () => {
    await startAITabGeneration(win, mockEngine);
    const loading = await waitForAITabCardState(
      win.gBrowser.selectedBrowser,
      "creating"
    );
    Assert.ok(!loading.hasSpinner, "The loading UI suppresses the spinner");
  });

  it("shows the ready card and commits extracted page security flags when the AITab page is generated", async () => {
    const generationRequest = await startAITabGeneration(win, mockEngine);
    const conversation = AIWindow.getActiveConversation(win);
    Assert.ok(
      JSON.stringify(generationRequest.request.args).includes(
        "Test page for context URL chip"
      ),
      "AITab generation extracted the source page"
    );
    Assert.equal(
      conversation.securityProperties.untrustedInput,
      false,
      "The extracted page's security flags are staged during generation"
    );

    generationRequest.respond(JSON.stringify(SURFACE));
    const ready = await waitForAITabCardState(
      win.gBrowser.selectedBrowser,
      "choose"
    );
    Assert.equal(ready.title, "Lisbon hotels");
    Assert.equal(ready.buttonCount, 2);

    await TestUtils.waitForCondition(
      () => conversation.securityProperties.untrustedInput,
      "Wait for generate_page to commit the staged security flags"
    );
    Assert.equal(
      conversation.securityProperties.privateData,
      true,
      "Extracted page content is committed as private data"
    );
    Assert.equal(
      conversation.securityProperties.untrustedInput,
      true,
      "Extracted page content is committed as untrusted input"
    );
  });

  it("emits only the current target from Open here", async () => {
    const requestedAction = await clickAITabAction(win, mockEngine, 0);
    Assert.deepEqual(requestedAction, { openTarget: "current" });
  });

  it("emits only the new target from Open in new tab", async () => {
    const requestedAction = await clickAITabAction(win, mockEngine, 1);
    Assert.deepEqual(requestedAction, { openTarget: "new" });
  });

  describe("AITab failure cleanup", () => {
    let sandbox;
    let generationRequest;
    let conversation;
    let browser;

    beforeEach(async () => {
      sandbox = sinon.createSandbox();
      generationRequest = await startAITabGeneration(win, mockEngine);
      browser = win.gBrowser.selectedBrowser;
      conversation = AIWindow.getActiveConversation(win);
      await waitForAITabCardState(browser, "creating");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("removes the creating card and retains the generation error", async () => {
      await checkFailure(
        "invalid JSON",
        "The page could not be created: the model did not return valid JSON."
      );
    });

    it("removes the creating card and retains the persistence error", async () => {
      // stub create to fake a disk space error
      sandbox
        .stub(AITabStore, "create")
        .rejects(new Error("no space left on device"));

      await checkFailure(
        JSON.stringify(SURFACE),
        "The page could not be created: it could not be saved."
      );
    });

    async function checkFailure(response, expectedError) {
      generationRequest.respond(response);
      const followUp = await mockEngine.captureRequest({ purpose: "chat" });
      const toolMessage = conversation.messages.find(
        message => message.content?.tool_call_id === "aitab-call"
      );

      Assert.equal(toolMessage.content.body, expectedError);
      Assert.ok(
        !conversation.messages.some(
          message => message.toolUIData?.toolCallId === "aitab-call"
        ),
        "The failed tool's UI data is cleared"
      );
      await TestUtils.waitForCondition(
        async () => (await readAITabCard(browser)) === null,
        "The creating card is removed from the chat"
      );

      followUp.respond({
        text: "The page could not be created.",
        tokens: null,
        isPrompt: false,
      });
    }
  });

  describe("navigation", () => {
    let chatTab;
    let viewerURL;
    let initialTabCount;

    beforeEach(async () => {
      const generationRequest = await startAITabGeneration(win, mockEngine);
      generationRequest.respond(JSON.stringify(SURFACE));
      chatTab = win.gBrowser.selectedTab;
      await waitForAITabCardState(chatTab.linkedBrowser, "choose");
      const conversation = AIWindow.getActiveConversation(win);
      const [page] = await AITabStore.getAITabPagesByConvId(conversation.id);
      viewerURL = `about:smartpage?page=${page.slug}`;
      initialTabCount = win.gBrowser.tabs.length;
    });

    it("opens the stored page in the current tab from Open here", async () => {
      const loaded = BrowserTestUtils.browserLoaded(
        chatTab.linkedBrowser,
        false,
        viewerURL
      );

      await clickReadyAITabAction(
        chatTab.linkedBrowser,
        OPEN_HERE_BUTTON_INDEX
      );
      await loaded;

      Assert.equal(win.gBrowser.tabs.length, initialTabCount);
      Assert.equal(win.gBrowser.selectedTab, chatTab);
      Assert.equal(chatTab.linkedBrowser.currentURI.spec, viewerURL);
    });

    it("opens the stored page in a new tab from Open in new tab", async () => {
      const opened = BrowserTestUtils.waitForNewTab(
        win.gBrowser,
        viewerURL,
        true
      );

      await clickReadyAITabAction(
        chatTab.linkedBrowser,
        OPEN_NEW_TAB_BUTTON_INDEX
      );
      const newTab = await opened;

      Assert.equal(win.gBrowser.tabs.length, initialTabCount + 1);
      Assert.notEqual(newTab, chatTab);
      Assert.equal(win.gBrowser.selectedTab, newTab);
      Assert.equal(newTab.linkedBrowser.currentURI.spec, viewerURL);
    });
  });

  it("keeps the complete state after returning to the chat tab", async () => {
    const generationRequest = await startAITabGeneration(win, mockEngine);
    generationRequest.respond(JSON.stringify(SURFACE));
    const chatTab = win.gBrowser.selectedTab;
    await waitForAITabCardState(chatTab.linkedBrowser, "choose");
    const initialTabCount = win.gBrowser.tabs.length;

    await SpecialPowers.spawn(chatTab.linkedBrowser, [], async () => {
      const aiWindow = content.document.querySelector("ai-window");
      const chatBrowser = aiWindow.shadowRoot.querySelector("#aichat-browser");
      await SpecialPowers.spawn(chatBrowser, [], async () => {
        const chatContent = content.document.querySelector("ai-chat-content");
        const card = chatContent.shadowRoot.querySelector("aitab-tool-ui");
        card.shadowRoot.querySelectorAll("moz-button")[1].click();
      });
    });

    await TestUtils.waitForCondition(
      () => win.gBrowser.tabs.length === initialTabCount + 1,
      "The AITab opens in a new tab"
    );
    const newTab = win.gBrowser.selectedTab;
    win.gBrowser.selectedTab = chatTab;
    await waitForAITabCardState(chatTab.linkedBrowser, "complete");
    BrowserTestUtils.removeTab(newTab);
  });
});
