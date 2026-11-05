/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* import-globals-from head.js */

const AITAB_GENERATION_RECORDS = [
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

function setupAITabGenerationMocks(context) {
  const { MockEngineManager } = ChromeUtils.importESModule(
    "resource://testing-common/AIWindowTestUtils.sys.mjs"
  );
  const { RemoteSettings } = ChromeUtils.importESModule(
    "resource://services-settings/remote-settings.sys.mjs"
  );

  context.sandbox = sinon.createSandbox();
  context.sandbox.stub(RemoteSettings("ai-window-aitab"), "get").resolves([]);
  _setRemoteClientForTesting({
    get: context.sandbox
      .stub()
      .resolves([...MOCK_RS_RECORDS, ...AITAB_GENERATION_RECORDS]),
  });
  context.restoreSignIn = skipSignIn();
  context.mockEngine = new MockEngineManager();
}

async function openAITabGenerationChat(context) {
  context.win = await openAIWindow();
  context.chatTab = context.win.gBrowser.selectedTab;
}

async function cleanupAITabGeneration(context) {
  try {
    await context.mockEngine?.rejectAllRequests();
    if (context.win && !context.win.closed) {
      await BrowserTestUtils.closeWindow(context.win);
    }
  } finally {
    context.mockEngine?.cleanupMocks();
    context.restoreSignIn?.();
    context.sandbox?.restore();
    _setRemoteClientForTesting({ get: async () => MOCK_RS_RECORDS });
  }
}

function makeAITabSurface(title) {
  return {
    components: [
      { id: "root", component: "Page", header: "header", children: [] },
      { id: "header", component: "Header", title },
    ],
    dataModel: {},
  };
}

async function waitForAITabReadyCard(browser, title) {
  const chatBrowser = await getAichatBrowser(browser);
  return TestUtils.waitForCondition(async () => {
    return SpecialPowers.spawn(chatBrowser, [title], async expectedTitle => {
      const chatContent = content.document.querySelector("ai-chat-content");
      const card = Array.from(
        chatContent?.shadowRoot.querySelectorAll("aitab-tool-ui") ?? []
      ).at(-1);
      if (!card) {
        return null;
      }

      await card.wrappedJSObject.updateComplete;
      if (
        card.wrappedJSObject.state !== "choose" ||
        card.wrappedJSObject.title !== expectedTitle
      ) {
        return null;
      }
      return card.wrappedJSObject.viewerURL;
    });
  }, `The generated page card shows "${title}"`);
}

async function waitForAITabPromptComplete(browser) {
  await SpecialPowers.spawn(browser, [], async () => {
    const aiWindow = content.document.querySelector("ai-window");
    const smartbar = aiWindow.shadowRoot.querySelector("#ai-window-smartbar");
    const inputCta = smartbar.querySelector("input-cta");
    await ContentTaskUtils.waitForCondition(
      () => inputCta.getAttribute("action") !== "stop",
      "The smartbar finishes processing the prompt"
    );
  });
}

async function submitAITabPrompt(context, prompt, toolParams, title) {
  const browser = context.chatTab.linkedBrowser;
  await typeInSmartbar(browser, prompt);
  await submitSmartbar(browser);
  await context.mockEngine.respondToWithToolCall({
    toolName: "generate_page",
    toolParams,
  });
  await context.mockEngine.respondTo({
    purpose: "aitab",
    response: JSON.stringify(makeAITabSurface(title)),
  });
  if (toolParams.modify_slug) {
    await context.mockEngine.respondTo({
      purpose: "chat",
      response: "The page has been updated.",
    });
  }
  await waitForAITabPromptComplete(browser);
}

async function createTestAITab(context, title) {
  await submitAITabPrompt(
    context,
    `Create a page about Lisbon hotels with the heading "${title}".`,
    {
      raw_content: "Compare hotels in Lisbon for a weekend visit.",
      focus: title,
    },
    title
  );
  await context.mockEngine.respondTo({
    purpose: "title-generation",
    response: "Lisbon hotels",
  });
  return waitForAITabReadyCard(context.chatTab.linkedBrowser, title);
}

async function reviseTestAITab(context, viewerURL, title) {
  await submitAITabPrompt(
    context,
    `Change the page heading to "${title}".`,
    {
      modify_slug: new URL(viewerURL).searchParams.get("page"),
      modify_instructions: `Change the heading to "${title}".`,
    },
    title
  );
}

async function openGeneratedAITab(context, viewerURL) {
  const opened = BrowserTestUtils.waitForNewTab(
    context.win.gBrowser,
    viewerURL,
    true
  );
  const chatBrowser = await getAichatBrowser(context.chatTab.linkedBrowser);
  await SpecialPowers.spawn(chatBrowser, [], () => {
    const chatContent = content.document.querySelector("ai-chat-content");
    const card = Array.from(
      chatContent.shadowRoot.querySelectorAll("aitab-tool-ui")
    ).at(-1);
    card.shadowRoot
      .querySelector('[data-l10n-id="smartwindow-aitab-open-new"]')
      .click();
  });
  return opened;
}

async function selectAITabTestTab(tab) {
  const win = tab.documentGlobal;
  await BrowserTestUtils.switchTab(win.gBrowser, () => {
    EventUtils.synthesizeMouseAtCenter(tab, {}, win);
  });
}

async function waitForAITabHeading(tab, title) {
  await SpecialPowers.spawn(tab.linkedBrowser, [title], async expectedTitle => {
    await ContentTaskUtils.waitForCondition(() => {
      const page = content.document.querySelector("aitab-page");
      const header = page?.shadowRoot?.querySelector("aitab-header");
      return (
        header?.shadowRoot?.querySelector("h1")?.textContent === expectedTitle
      );
    }, `The page renders the heading "${expectedTitle}"`);
  });
}

const PAGE_CONFIG = {
  component: "Page",
  children: [
    {
      id: "hdr",
      component: "Header",
      eyebrow: "From your open tabs",
      title: "Hotels in Lisbon",
      subhead: "4 options gathered from your open tabs",
    },
    {
      id: "note",
      component: "TextBlock",
      lead: "What you are comparing",
      paragraphs: [],
    },
    { id: "plan", component: "Timeline", title: "Booking plan", items: [] },
    { id: "unknown", component: "NotAComponent", title: "Unknown component" },
    { id: "untyped", title: "A block with no component" },
  ],
};
