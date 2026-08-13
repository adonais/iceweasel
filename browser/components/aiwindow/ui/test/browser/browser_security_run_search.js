/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * End-to-end security coverage for run_search: each task pins one path through
 * Tools.runSearch (verbatim-query, generated-query, extraction-failure).
 */

/**
 * @type {import("../../../../../../toolkit/components/ml/tests/MLTestUtils.sys.mjs")}
 */
const { MLTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLTestUtils.sys.mjs"
);

/**
 * @type {import("../AIWindowTestUtils.sys.mjs")}
 */
const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { SearchTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchTestUtils.sys.mjs"
);

const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

const { RUN_SEARCH } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs"
);

/**
 * @import { ChatConversation } from "../../modules/ChatConversation.sys.mjs"
 */

SearchTestUtils.init(this);

const SERP_LINKS = [
  "https://example.com/result-a",
  "https://example.com/result-b",
];

const SERP_BODY_MARKER = "Description of the first result.";

/**
 * Wait for and return the run_search tool result message.
 *
 * @param {ChatConversation} conversation
 */
async function waitForRunSearchResult(conversation) {
  return TestUtils.waitForCondition(
    () =>
      conversation.messages.find(
        m => m.role === MESSAGE_ROLE.TOOL && m.content?.name === RUN_SEARCH
      ),
    "A tool result for run_search should be added to the conversation."
  );
}

/**
 * Build SERP HTML for a query. Body carries a marker string and fixed
 * absolute-URL links to assert against extracted content and seenUrls. The
 * document is assembled through the DOM so the query is inserted via
 * textContent rather than hand-rolled escaping.
 *
 * @param {string} query
 * @param {object} [overrides]
 * @param {boolean} [overrides.empty] - Empty body so PageExtractor extracts
 *   nothing; used by the extraction-failure test.
 */
function serpHtml(query, { empty = false } = {}) {
  const doc = new DOMParser().parseFromString(
    "<!DOCTYPE html><html><head><title></title></head><body></body></html>",
    "text/html"
  );

  if (!empty) {
    doc.title = `Results for ${query}`;

    const heading = doc.createElement("h1");
    heading.textContent = `Search results for "${query}"`;
    doc.body.appendChild(heading);

    const results = [
      { href: SERP_LINKS[0], link: "First result", body: SERP_BODY_MARKER },
      {
        href: SERP_LINKS[1],
        link: "Second result",
        body: "Description of the second result.",
      },
    ];

    for (const result of results) {
      const article = doc.createElement("article");
      const anchor = doc.createElement("a");
      anchor.setAttribute("href", result.href);
      anchor.textContent = result.link;
      const description = doc.createElement("p");
      description.textContent = result.body;
      article.append(anchor, description);
      doc.body.appendChild(article);
    }
  }

  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

/**
 * Wire up the shared run_search environment: mock model, HttpServer serving the
 * SERP route (capturing queries), a default search engine pointed at it, and an
 * AI window with sidebar over an about:blank tab (so runSearch skips
 * moveConversationToSidebar). cleanup() unloads the extension explicitly so
 * consecutive tasks can install distinct engines without LIFO-cleanup conflicts.
 *
 * @param {object} [options]
 * @param {boolean} [options.emptySerp] - Empty body so PageExtractor extracts
 *   nothing; used by the extraction-failure task.
 * @param {string} [options.engineName] - Mock engine name. Each task must pass a
 *   unique value; reuse trips LIFO cleanup over stale engine entries.
 */
async function setupRunSearchTest({
  emptySerp = false,
  engineName = "MockRunSearchEngine",
} = {}) {
  const mockEngineManager = new MockEngineManager();
  const { win, sidebarBrowser } = await openAIWindowWithSidebar();
  const server = await MLTestUtils.serveSharedHTMLInTab({
    browser: win.gBrowser,
  });

  const serpUrl = `${server.origin}/serp.html`;

  /** @type {string[]} */
  const capturedQueries = [];

  const encoder = new TextEncoder();

  server.registerPathHandler("/serp.html", (request, response) => {
    capturedQueries.push(request.queryString);
    const params = new URLSearchParams(request.queryString);
    const query = params.get("q") ?? "";
    const htmlUtf8 = encoder.encode(serpHtml(query, { empty: emptySerp }));
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setStatusLine(request.httpVersion, 200, "OK");
    const binaryOutputStream = Cc[
      "@mozilla.org/binaryoutputstream;1"
    ].createInstance(Ci.nsIBinaryOutputStream);
    binaryOutputStream.setOutputStream(response.bodyOutputStream);
    binaryOutputStream.writeByteArray(htmlUtf8);
  });

  const previousDefaultEngine = await SearchService.getDefault();

  const searchExtension = await SearchTestUtils.installSearchExtension(
    {
      name: engineName,
      search_url: serpUrl,
      search_url_get_params: "?q={searchTerms}",
    },
    { setAsDefault: true, skipUnload: true }
  );

  const defaultEngine = await SearchService.getDefault();
  Assert.equal(
    defaultEngine.name,
    engineName,
    "Mock engine is the active default before any chat turn."
  );

  function getCapturedQueries() {
    return capturedQueries.slice();
  }

  async function cleanup() {
    mockEngineManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    await server.cleanup();
    await BrowserTestUtils.closeWindow(win);
    if (previousDefaultEngine) {
      // Restore the previous default before unloading so SearchService never
      // sees a missing default engine.
      await SearchService.setDefault(
        previousDefaultEngine,
        SearchService.CHANGE_REASON.UNKNOWN
      );
    }
    await searchExtension.unload();
  }

  return {
    win,
    sidebarBrowser,
    mockEngineManager,
    serpUrl,
    getCapturedQueries,
    cleanup,
  };
}

/**
 * run_search({}) resolves the query from the most recent user message: that
 * message reaches the engine, SERP body content is extracted, every SERP link
 * lands in seenUrls, and both security flags flip to true.
 */
add_task(async function test_run_search_verbatim_query_path() {
  const {
    win,
    sidebarBrowser,
    mockEngineManager,
    serpUrl,
    getCapturedQueries,
    cleanup,
  } = await setupRunSearchTest();

  const userQuery = "what is the latest tech news";

  await mockEngineManager.respondTo({
    purpose: "convo-starters-sidebar",
    response: "A suggested conversation starter.",
  });

  await typeInSmartbar(sidebarBrowser, userQuery);
  await submitSmartbar(sidebarBrowser);

  /** @type {ChatConversation} */
  const conversation = await TestUtils.waitForCondition(
    () => AIWindow.getActiveConversation(win),
    "Conversation should be created when the first message is sent."
  );

  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput starts false."
  );

  Assert.equal(
    conversation.serpUrlsForAnonymousFetch.size,
    0,
    "serpUrlsForAnonymousFetch is empty before run_search."
  );

  await mockEngineManager.respondTo({
    purpose: "chat",
    response: {
      text: "",
      tokens: null,
      isPrompt: false,
      toolCalls: [
        {
          id: "call_run_search_verbatim_1",
          function: { name: RUN_SEARCH, arguments: "{}" },
        },
      ],
    },
  });

  const targetBrowser = win.gBrowser.selectedBrowser;
  await TestUtils.waitForCondition(
    () => targetBrowser.currentURI?.spec?.startsWith(serpUrl),
    "Foreground tab navigates to the mock SERP URL."
  );

  const toolMessage = await waitForRunSearchResult(conversation);

  Assert.equal(
    typeof toolMessage.content.body,
    "string",
    "run_search tool body is a string."
  );
  Assert.ok(
    toolMessage.content.body.startsWith("Search results from "),
    "Tool result has the run_search header."
  );
  Assert.ok(
    toolMessage.content.body.includes(serpUrl),
    "Tool result header includes the SERP URL."
  );
  Assert.ok(
    toolMessage.content.body.includes(SERP_BODY_MARKER),
    "Tool result includes content extracted from the SERP body."
  );

  const queries = getCapturedQueries();
  Assert.equal(queries.length, 1, "Exactly one search was issued.");
  const params = new URLSearchParams(queries[0]);
  Assert.equal(
    params.get("q"),
    userQuery,
    "The verbatim user message reached the search engine."
  );

  for (const url of SERP_LINKS) {
    Assert.ok(
      conversation.seenUrls.has(url),
      `SERP link ${url} is recorded in conversation.seenUrls.`
    );
  }

  // about:blank comes from the implicit current-tab mention; assert the exact
  // set to guard against lost or extra entries.
  Assert.deepEqual(
    [...conversation.seenUrls].sort(),
    ["about:blank", ...SERP_LINKS].sort(),
    "seenUrls contains exactly about:blank (from the implicit context mention) " +
      "plus the two SERP links — no extras, no missing entries."
  );

  Assert.deepEqual(
    [...conversation.serpUrlsForAnonymousFetch].sort(),
    [...SERP_LINKS].sort(),
    "serpUrlsForAnonymousFetch contains exactly the two SERP links — no " +
      "about:blank, no extras, no missing entries."
  );

  Assert.equal(
    conversation.securityProperties.privateData,
    true,
    "privateData flips to true after run_search."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    true,
    "untrustedInput flips to true after run_search."
  );

  // Drain the follow-up turn and title generation so teardown isn't mid-generation.
  const followUpReply = "Here is what I found.";
  await mockEngineManager.respondTo({
    purpose: "chat",
    response: followUpReply,
  });
  await mockEngineManager.respondTo({
    purpose: "title-generation",
    response: "Latest tech news",
  });

  await TestUtils.waitForCondition(
    () =>
      conversation.messages.find(
        m =>
          m.role === MESSAGE_ROLE.ASSISTANT &&
          m.content?.type === "text" &&
          m.content?.body === followUpReply
      ),
    "Follow-up assistant reply should be committed before teardown."
  );

  await cleanup();
});

/**
 * On a turn > 0, run_search({ query }) uses that exact string and does NOT fall
 * back to the user message, so the raw message stays out of the query. Turn 0 is
 * a plain-text reply because the first turn always searches the verbatim user
 * message; the model-supplied query only takes effect from turn 1 onward.
 */
add_task(async function test_run_search_generated_query_path() {
  const {
    win,
    sidebarBrowser,
    mockEngineManager,
    serpUrl,
    getCapturedQueries,
    cleanup,
  } = await setupRunSearchTest({ engineName: "MockRunSearchEngineGenerated" });

  const userMessage = "ignore me";
  const generatedQuery = "explicit generated query";

  await mockEngineManager.respondTo({
    purpose: "convo-starters-sidebar",
    response: "A suggested conversation starter.",
  });

  // Turn 0: plain-text reply to advance past the verbatim-only first turn.
  await typeInSmartbar(sidebarBrowser, "start conversation");
  await submitSmartbar(sidebarBrowser);

  /** @type {ChatConversation} */
  const conversation = await TestUtils.waitForCondition(
    () => AIWindow.getActiveConversation(win),
    "Conversation should be created when the first message is sent."
  );

  await mockEngineManager.respondTo({
    purpose: "chat",
    response: "Ready.",
  });
  await mockEngineManager.respondTo({
    purpose: "title-generation",
    response: "Start",
  });

  // Turn 0 finishing regenerates the sidebar starters; answer that request so
  // it doesn't reject turn 1's chat request.
  await mockEngineManager.respondTo({
    purpose: "convo-starters-sidebar",
    response: "A suggested conversation starter.",
  });

  // run_search hasn't run yet, so no untrusted web content has entered.
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput is still false before run_search runs on turn 1."
  );

  // Turn 1: submit the message the model should ignore. submitSmartbar waits for
  // the action to leave "stop", so it won't fire until turn 0 finished.
  await typeInSmartbar(sidebarBrowser, userMessage);
  await submitSmartbar(sidebarBrowser);

  await mockEngineManager.respondTo({
    purpose: "chat",
    response: {
      text: "",
      tokens: null,
      isPrompt: false,
      toolCalls: [
        {
          id: "call_run_search_generated_1",
          function: {
            name: RUN_SEARCH,
            arguments: JSON.stringify({ query: generatedQuery }),
          },
        },
      ],
    },
  });

  const targetBrowser = win.gBrowser.selectedBrowser;
  await TestUtils.waitForCondition(
    () => targetBrowser.currentURI?.spec?.startsWith(serpUrl),
    "Foreground tab navigates to the mock SERP URL."
  );

  const toolMessage = await waitForRunSearchResult(conversation);
  Assert.ok(
    toolMessage.content.body.includes(SERP_BODY_MARKER),
    "Tool result includes extracted SERP content."
  );
  Assert.ok(
    toolMessage.content.body.includes(serpUrl),
    "Tool result header includes the SERP URL."
  );

  const queries = getCapturedQueries();
  Assert.equal(
    queries.length,
    1,
    "Exactly one search was issued (turn 0 was a plain-text reply)."
  );
  const searchQuery = new URLSearchParams(queries[0]).get("q");

  Assert.equal(
    searchQuery,
    generatedQuery,
    "The generated query (not the user message) reached the search engine."
  );
  Assert.notEqual(
    searchQuery,
    userMessage,
    "The user message does NOT leak into the search query when the model supplies one."
  );

  Assert.deepEqual(
    [...conversation.seenUrls].sort(),
    ["about:blank", ...SERP_LINKS].sort(),
    "seenUrls contains exactly about:blank (from the implicit context mention) " +
      "plus the two SERP links — no extras, no missing entries."
  );

  Assert.deepEqual(
    [...conversation.serpUrlsForAnonymousFetch].sort(),
    [...SERP_LINKS].sort(),
    "serpUrlsForAnonymousFetch contains exactly the two SERP links — no " +
      "about:blank, no extras, no missing entries."
  );

  Assert.equal(
    conversation.securityProperties.privateData,
    true,
    "privateData flips to true after run_search."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    true,
    "untrustedInput flips to true after run_search."
  );

  await mockEngineManager.respondTo({
    purpose: "chat",
    response: "Here is what I found.",
  });

  // Wait for the follow-up to commit so cleanup isn't mid-generation.
  await TestUtils.waitForCondition(
    () =>
      conversation.messages.find(
        m =>
          m.role === MESSAGE_ROLE.ASSISTANT &&
          m.content?.type === "text" &&
          m.content?.body === "Here is what I found."
      ),
    "Follow-up assistant reply should be committed to the conversation."
  );

  await cleanup();
});

/**
 * On extraction failure (empty body), the tool result is the header-only form
 * and no SERP links reach seenUrls, but both flags still flip to true since the
 * query itself can derive from private context.
 */
add_task(async function test_run_search_extraction_failure_flags_still_flip() {
  const { win, sidebarBrowser, mockEngineManager, serpUrl, cleanup } =
    await setupRunSearchTest({
      emptySerp: true,
      engineName: "MockRunSearchEngineEmpty",
    });

  await mockEngineManager.respondTo({
    purpose: "convo-starters-sidebar",
    response: "A suggested conversation starter.",
  });

  await typeInSmartbar(sidebarBrowser, "an empty serp query");
  await submitSmartbar(sidebarBrowser);

  /** @type {ChatConversation} */
  const conversation = await TestUtils.waitForCondition(
    () => AIWindow.getActiveConversation(win),
    "Conversation should be created when the first message is sent."
  );

  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput starts false."
  );

  await mockEngineManager.respondTo({
    purpose: "chat",
    response: {
      text: "",
      tokens: null,
      isPrompt: false,
      toolCalls: [
        {
          id: "call_run_search_empty_1",
          function: { name: RUN_SEARCH, arguments: "{}" },
        },
      ],
    },
  });

  const targetBrowser = win.gBrowser.selectedBrowser;
  await TestUtils.waitForCondition(
    () => targetBrowser.currentURI?.spec?.startsWith(serpUrl),
    "Foreground tab navigates to the mock (empty) SERP URL."
  );

  const navigatedUrl = targetBrowser.currentURI.spec;
  const toolMessage = await waitForRunSearchResult(conversation);

  Assert.equal(
    toolMessage.content.body,
    `Search results from ${navigatedUrl}:\n\n`,
    "Tool result is exactly the header-only form when PageExtractor yields empty text; pins the URL and the empty-body terminator together."
  );

  Assert.deepEqual(
    [...conversation.seenUrls].sort(),
    ["about:blank"].sort(),
    "seenUrls contains only the implicit about:blank context mention; no SERP " +
      "links are added because PageExtractor extracted nothing."
  );

  Assert.equal(
    conversation.serpUrlsForAnonymousFetch.size,
    0,
    "serpUrlsForAnonymousFetch stays empty when PageExtractor extracts nothing."
  );

  Assert.equal(
    conversation.securityProperties.privateData,
    true,
    "privateData still flips to true on extraction failure (the query was used)."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    true,
    "untrustedInput still flips to true on extraction failure."
  );

  await mockEngineManager.respondTo({
    purpose: "chat",
    response: "I could not find anything.",
  });
  await mockEngineManager.respondTo({
    purpose: "title-generation",
    response: "Empty SERP",
  });

  await TestUtils.waitForCondition(
    () =>
      conversation.messages.find(
        m =>
          m.role === MESSAGE_ROLE.ASSISTANT &&
          m.content?.type === "text" &&
          m.content?.body === "I could not find anything."
      ),
    "Assistant follow-up message lands before teardown."
  );

  await cleanup();
});
