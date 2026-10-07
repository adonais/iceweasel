/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for how inline @mentions in the Smartbar editor reach the context we
 * prompt the model with: what getAllMentions reports after inserting,
 * selecting and deleting a mention, and what the prompt builder and the model
 * request end up receiving.
 */

"use strict";

const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

let providerStub;
const DEFAULT_PROVIDER_STUB_RETURN = [
  {
    url: "https://example.com/1",
    title: "Page 1",
    icon: "",
    type: MENTION_TYPE.TAB_OPEN,
    timestamp: Date.now(),
  },
  {
    url: "https://example.com/2",
    title: "Page 2",
    icon: "",
    type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
    timestamp: Date.now(),
  },
  {
    url: "https://example.com/3",
    title: "Page 3",
    icon: "",
    type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
    timestamp: Date.now() - 1000,
  },
  {
    url: "https://example.com/4",
    title: "Page 4",
    icon: "",
    type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
    timestamp: Date.now() - 2000,
  },
];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.search.suggest.enabled", false],
      ["browser.smartwindow.endpoint", "http://localhost:0/v1"],
    ],
  });

  providerStub = sinon.stub(
    SmartbarMentionsPanelSearch.prototype,
    "startQuery"
  );
  providerStub.returns(DEFAULT_PROVIDER_STUB_RETURN);

  registerCleanupFunction(() => {
    providerStub.restore();
  });
});

add_task(async function test_inline_mention_available_via_getAllMentions() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await insertInlineMention(browser);

  const mentions = await getEditorInlineMentions(browser);
  Assert.equal(mentions.length, 1, "getAllMentions should return one mention");
  Assert.equal(
    mentions[0].id,
    "https://example.com/1",
    "Mention id should match the selected tab URL"
  );

  await BrowserTestUtils.closeWindow(win);
});

// select() must cover a mention chip at the end of the input, even without the
// trailing space that @-typing normally inserts. Regression test for the
// selection walk skipping leaf/atom nodes.
add_task(async function test_select_covers_trailing_inline_mention() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const result = await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const editor = smartbar.querySelector("moz-multiline-editor");

    editor.value = "hello";
    editor.insertMention({ type: "default", id: "1", label: "World" }, 5);
    editor.select();

    const mention = editor.getAllMentions()[0];
    const sel = editor.view.state.selection;
    return {
      mentionPos: mention.pos,
      from: sel.from,
      to: sel.to,
      coversChip: sel.from <= mention.pos && sel.to >= mention.pos + 1,
    };
  });

  Assert.ok(
    result.coversChip,
    `select() should cover a trailing mention chip (from=${result.from}, ` +
      `to=${result.to}, mentionPos=${result.mentionPos})`
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(
  async function test_deleted_inline_mention_excluded_from_getAllMentions() {
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    await insertInlineMention(browser);

    // Delete the mention by pressing Backspace twice (once for trailing space,
    // once for the atomic mention node).
    await BrowserTestUtils.synthesizeKey("KEY_Backspace", {}, browser);
    await BrowserTestUtils.synthesizeKey("KEY_Backspace", {}, browser);

    const mentions = await getEditorInlineMentions(browser);
    Assert.equal(
      mentions.length,
      0,
      "getAllMentions should return empty after deleting the inline mention"
    );

    await BrowserTestUtils.closeWindow(win);
  }
);

// Inline @mention must reach the prompt builder as part of `contextMentions`.
add_task(async function test_inline_mention_reaches_prompt_builder() {
  const sb = this.sinon.createSandbox();
  const injectSpy = sb.spy(
    this.ChatConversation.prototype,
    "injectRealTimeContext"
  );
  const mockEngineManager = new MockEngineManager();
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;

    await insertInlineMention(browser);
    await typeInSmartbar(browser, " please summarize");
    await submitSmartbar(browser);

    // Ensure the prompt builder has run.
    await mockEngineManager.respondTo({ purpose: "chat", response: "ok" });

    const userMessage = injectSpy.firstCall.args[0];
    const { contextMentions } = userMessage.content;
    Assert.equal(
      contextMentions.length,
      1,
      "Inline @mention should be included in contextMentions"
    );
    Assert.equal(
      contextMentions[0].url,
      "https://example.com/1",
      "Mention URL should match the @mentioned tab"
    );
  } finally {
    mockEngineManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    await BrowserTestUtils.closeWindow(win);
    sb.restore();
  }
});

// Inline @mention must be resolved to URLs before they are passed to the model.
add_task(async function test_inline_mention_passed_to_model_as_url() {
  const mockEngineManager = new MockEngineManager();
  const win = await openAIWindow();

  try {
    const browser = win.gBrowser.selectedBrowser;

    await insertInlineMention(browser);
    await typeInSmartbar(browser, " please summarize");
    await submitSmartbar(browser);

    const chatRequest = await TestUtils.waitForCondition(() => {
      const engine = mockEngineManager.engines.get("chat");
      return engine?.runRequests.size && engine.getNextRequest()[1].request;
    }, "Chat engine should receive a request");

    const requestText = JSON.stringify(chatRequest);
    Assert.ok(
      !requestText.includes("mention:?"),
      "The mention markdown should not reach the model"
    );

    const urlToken = await SpecialPowers.spawn(browser, [], () => {
      const { conversation } = content.document.querySelector("ai-window");
      return conversation.urlToToken.get("https://example.com/1");
    });
    Assert.ok(
      requestText.includes(urlToken),
      `The @mentioned URL should reach the model as its token: ${urlToken})`
    );
  } finally {
    mockEngineManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    await BrowserTestUtils.closeWindow(win);
  }
});
