/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// End-to-end generateAITab() with only the LLM mocked: the source pages are
// served over HTTP and read through the real GetPageContent, so this covers
// extraction, prompt assembly, page validation and metadata derivation. The
// last task goes one step further and drives the create_aitab tool itself, then
// loads the viewer link it returns in a tab.

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { generateAITab } = AITab;

const { createAITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);
const { AITabStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AITabStore.sys.mjs"
);
const { expandUrlTokens } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);

const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);
const { MODEL_FEATURES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);
const { ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
);
/**
 * @type {import("../../../../../../toolkit/components/ml/tests/MLTestUtils.sys.mjs")}
 */
const { MLTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLTestUtils.sys.mjs"
);

add_setup(async function () {
  // Raise AITab's log verbosity for the duration of this file so a failing run
  // surfaces the module's debug/error output. Reverted automatically at teardown.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.conversation.logLevel", "Debug"]],
  });
});

// What the mocked model returns. Schema coverage is browser_aitab_validation.js'
// job, so this is the smallest page the packaged schemas accept.
const GENERATED_PAGE = Object.freeze({
  header: { type: "header", title: "Hotels in Lisbon" },
  blocks: [
    {
      type: "text",
      layout: "summary",
      lead: "Budget Central Hostel is $72 / night.",
    },
  ],
});

// Serve a page for generation to read. The URL is not open in a tab, so
// GetPageContent extracts it headlessly — the real path, no stubbing. cleanup()
// resolves once the page has been served, so only call this when the test
// actually reads the URL.
function servePage() {
  const { html } = MLTestUtils.serveHTML();
  return html`
    <article>
      <h1>Hotels in Lisbon</h1>
      <p>Budget Central Hostel is $72 / night in Lisbon.</p>
      <p>It is a short walk from the Baixa district and has free breakfast.</p>
    </article>
  `;
}

function newConversation() {
  return new ChatConversation({
    title: "",
    description: "",
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });
}

add_task(async function test_generateAITab_requires_urls() {
  // No URLs: rejected before any model call, so no engine is needed.
  const result = await generateAITab({ urlList: [] }, newConversation());
  Assert.ok(result.error, "an empty urlList is reported as an error");
});

add_task(async function test_generateAITab_honors_aborted_signal() {
  // Cancellation is checked before the extraction, so the URL is never read and
  // no page needs serving. No model call either, so no engine is needed.
  const result = await generateAITab(
    {
      urlList: ["https://example.com/lisbon-hotels"],
      signal: AbortSignal.abort(),
    },
    newConversation()
  );
  Assert.ok(result.error, "an aborted signal cancels generation");
  Assert.ok(!result.page, "no page config is returned when canceled");
});

add_task(async function test_generateAITab_success() {
  const mockEngine = new MockEngineManager();
  const { url: GEN_URL, cleanup: stopServing } = servePage();
  try {
    const genPromise = generateAITab(
      { urlList: [GEN_URL], focus: "hotels in Lisbon" },
      newConversation()
    );

    // AITAB generation runs on the chat engine purpose (selectFeatureConfig
    // remaps the aitab purpose to chat), so respond there with a valid config.
    const { request, respond } = await mockEngine.captureRequest({
      purpose: MODEL_FEATURES.AITAB,
    });
    const serializedRequest = JSON.stringify(request.args);
    Assert.ok(
      serializedRequest.includes("Budget Central Hostel is $72 / night"),
      "the extracted page content reaches the model prompt"
    );
    Assert.ok(
      serializedRequest.includes("hotels in Lisbon"),
      "the requested focus reaches the model prompt"
    );
    respond(JSON.stringify(GENERATED_PAGE));

    const result = await genPromise;

    Assert.ok(!result.error, `generation should succeed: ${result.error}`);
    Assert.deepEqual(
      result.page,
      GENERATED_PAGE,
      "the validated page config is returned unchanged"
    );
    Assert.equal(
      result.metadata.title,
      GENERATED_PAGE.header.title,
      "metadata title comes from the page header"
    );
    Assert.equal(
      result.metadata.id,
      "hotels_in_lisbon",
      "metadata id is the slugified title"
    );
    Assert.equal(result.metadata.howCreated, "chat", "howCreated is chat");
    Assert.deepEqual(
      result.metadata.components,
      GENERATED_PAGE.blocks,
      "metadata components mirror the page blocks"
    );
    Assert.deepEqual(
      result.metadata.context.urlsUsed.map(u => u.url),
      [GEN_URL],
      "the requested URL is recorded in the generation context"
    );
    Assert.ok(
      result.metadata.context.urlsUsed[0].extractedText.includes(
        "Budget Central Hostel"
      ),
      "the extracted page text is recorded in the generation context"
    );
  } finally {
    await stopServing();
    mockEngine.cleanupMocks();
  }
});

add_task(async function test_generateAITab_rejects_invalid_page() {
  const mockEngine = new MockEngineManager();
  const { url: GEN_URL, cleanup: stopServing } = servePage();
  try {
    const genPromise = generateAITab({ urlList: [GEN_URL] }, newConversation());

    // A structurally valid JSON object that does not match the page schema
    // (unknown block type) must fail validation rather than be returned.
    await mockEngine.respondTo({
      purpose: MODEL_FEATURES.AITAB,
      response: JSON.stringify({ blocks: [{ type: "banner" }] }),
    });

    const result = await genPromise;
    Assert.ok(result.error, "a page that fails schema validation is an error");
    Assert.ok(!result.page, "no page config is returned on validation failure");
  } finally {
    await stopServing();
    mockEngine.cleanupMocks();
  }
});

add_task(async function test_generateAITab_default_title_is_localized() {
  const mockEngine = new MockEngineManager();
  // Two URLs, so the single-URL heading fallback doesn't apply either.
  const first = servePage();
  const second = servePage();
  try {
    const genPromise = generateAITab(
      { urlList: [first.url, second.url] },
      newConversation()
    );

    // No header title from the model and no focus from the user, so the title
    // falls all the way through to the localized default.
    await mockEngine.respondTo({
      purpose: MODEL_FEATURES.AITAB,
      response: JSON.stringify({ blocks: GENERATED_PAGE.blocks }),
    });

    const result = await genPromise;
    Assert.ok(!result.error, `generation should succeed: ${result.error}`);
    Assert.equal(
      result.metadata.title,
      "Generated page",
      "the default title comes from ai-tab-default-page-title"
    );
  } finally {
    await first.cleanup();
    await second.cleanup();
    mockEngine.cleanupMocks();
  }
});

// Stands in for the external viewer until its components are in-tree. Served by
// the mochitest server so the link is a real https page a tab can load.
const VIEWER_URL =
  "https://example.com/browser/browser/components/aiwindow/models/tests/browser/aitab_viewer_stub.html";

add_task(async function test_createAITab_link_loads_config_in_a_tab() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.aitab.viewerURL", VIEWER_URL]],
  });
  const mockEngine = new MockEngineManager();
  const { url, cleanup: stopServing } = servePage();
  const conversation = newConversation();
  try {
    // The tool is the production entry point: it generates the page and returns
    // a markdown link carrying the viewer URL as a token.
    const toolPromise = createAITab(
      { url_list: [url], focus: "hotels in Lisbon" },
      conversation
    );
    await mockEngine.respondTo({
      purpose: MODEL_FEATURES.AITAB,
      response: JSON.stringify(GENERATED_PAGE),
    });
    const toolResult = await toolPromise;

    const expanded = expandUrlTokens(toolResult, conversation.tokenToUrl);
    const [, viewerURL] = expanded.match(/\]\((https:\/\/[^\s)]+)\)/) ?? [];
    Assert.ok(viewerURL, `the tool returns a viewer link: ${expanded}`);
    Assert.ok(
      viewerURL.startsWith(`${VIEWER_URL}#`),
      "the link points at the configured viewer, with the config in the hash"
    );

    const tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      viewerURL,
      true // waitForLoad
    );
    try {
      const [title, hash] = await SpecialPowers.spawn(
        tab.linkedBrowser,
        [],
        () => [content.document.title, content.location.hash]
      );
      Assert.equal(title, "AITab viewer stub", "the viewer page loaded");
      Assert.deepEqual(
        JSON.parse(decodeURIComponent(hash.slice(1))),
        GENERATED_PAGE,
        "the page config round-trips through the hash of the loaded URL"
      );
    } finally {
      BrowserTestUtils.removeTab(tab);
    }
  } finally {
    await stopServing();
    mockEngine.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  }
});
