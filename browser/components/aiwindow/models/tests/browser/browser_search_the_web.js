/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { SEARCH_ANSWER_SCHEMA, runSearchTheWeb } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/search/SearchWorkflow.sys.mjs"
);

const {
  GetPageContent,
  GET_PAGE_CONTENT,
  SEARCH_QUERY_ENDPOINT_PREF,
  SEARCH_QUERY_APIKEY_PREF,
  SEARCH_THE_WEB_FAST_PREF,
  SEARCH_THE_WEB,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AIWindowConstants.sys.mjs"
);

const { PURPOSES, MODEL_FEATURES, SERVICE_TYPES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const { Chat } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Chat.sys.mjs"
);

const {
  replaceUrlsWithTokens,
  expandUrlTokensInToolParams,
  sanitizeUntrustedContent,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);

const { MockEngineManager, MockSearchManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatConversation.sys.mjs"
);

const TEST_MODEL = "test-model";
const SEARCH_ENDPOINT = "https://search.example.test/v1/search";
const SEARCH_API_KEY = "mock-search-api-key";

/**
 * Point the search provider at the mocked endpoint and provide a test API key.
 * The fast pref is always set explicitly so each task states which path it
 * exercises rather than depending on the default.
 *
 * @param {boolean} [fast] - Value for SEARCH_THE_WEB_FAST_PREF.
 * @returns {Promise<void>}
 */
async function pushSearchPrefs(fast = false) {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SEARCH_QUERY_ENDPOINT_PREF, SEARCH_ENDPOINT],
      [SEARCH_QUERY_APIKEY_PREF, SEARCH_API_KEY],
      [SEARCH_THE_WEB_FAST_PREF, fast],
    ],
  });
}

/**
 * Serve several real result pages from one HTTP server so the workflow's page
 * reads hit the real extractor.
 *
 * @param {string[]} bodies - HTML body for each result page.
 * @returns {{urls: string[], requestCounts: number[], server: object}}
 *   The page URLs, per-page request counts, and server.
 */
function serveResultPages(bodies) {
  const server = new HttpServer();
  const requestCounts = bodies.map(() => 0);
  const paths = bodies.map((body, index) => {
    const path = `/result-${index}.html`;
    server.registerPathHandler(path, (_request, response) => {
      requestCounts[index]++;
      response.setHeader("Content-Type", "text/html");
      response.write(body);
    });
    return path;
  });
  server.start(-1);
  const { primaryHost, primaryPort } = server.identity;
  const urls = paths.map(
    // eslint-disable-next-line sdl/no-insecure-url
    path => `http://${primaryHost}:${primaryPort}${path}`
  );
  return { urls, requestCounts, server };
}

add_task(async function test_search_the_web_end_to_end() {
  const query = "What is the featured widget's price?";
  const pageContent = "The featured widget is on sale for nine dollars today.";
  const {
    urls: [pageUrl],
    requestCounts,
    server: pageServer,
  } = serveResultPages([
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Widget Store</title></head>
      <body><article><h1>Widget Store</h1><p>${pageContent}</p></article></body></html>`,
  ]);
  const results = [
    {
      title: "Widget Store",
      url: pageUrl,
      text: "A page containing the featured widget's price.",
    },
  ];
  await pushSearchPrefs();

  const mockEngineManager = new MockEngineManager();
  const mockSearchManager = new MockSearchManager();
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });

  try {
    const runPromise = runSearchTheWeb({ query }, conversation);

    const search = await mockSearchManager.captureRequest();
    Assert.equal(
      search.request.url,
      SEARCH_ENDPOINT,
      "The provider uses the configured search endpoint"
    );
    Assert.equal(
      search.request.options.method,
      "POST",
      "The provider sends a POST request"
    );
    Assert.deepEqual(
      search.request.options.headers,
      {
        "Content-Type": "application/json",
        Accept: "application/json",
        "service-type": "search",
        Authorization: `Bearer ${SEARCH_API_KEY}`,
      },
      "The provider sends the expected search headers"
    );
    Assert.deepEqual(
      JSON.parse(search.request.options.body),
      { query, max_results: 10 },
      "The provider sends the expected search body"
    );
    search.respond({ results });

    const readTurn = await mockEngineManager.captureRequest({
      purpose: PURPOSES.CHAT,
    });
    Assert.equal(
      readTurn.request.tool_choice,
      "auto",
      "The answer-generation model may request page content"
    );
    Assert.deepEqual(
      readTurn.request.tools.map(tool => tool.function.name),
      [GET_PAGE_CONTENT],
      "Only get_page_content is offered to the answer-generation model"
    );
    const readRequestArgs = JSON.stringify(readTurn.request.args);
    Assert.ok(
      readRequestArgs.includes(query),
      "The model request includes the search query"
    );
    Assert.ok(
      readRequestArgs.includes("Widget Store"),
      "The model request includes the normalized search result"
    );
    Assert.ok(
      readRequestArgs.includes("result_1"),
      "The search result has a stable result id"
    );
    readTurn.respond({
      text: "",
      tokens: null,
      isPrompt: false,
      toolCalls: [
        {
          id: "read_search_result",
          function: {
            name: GET_PAGE_CONTENT,
            arguments: JSON.stringify({ result_ids: ["result_1"] }),
          },
        },
      ],
    });

    const pageContentTurn = await mockEngineManager.captureRequest({
      purpose: PURPOSES.CHAT,
    });
    Assert.ok(
      JSON.stringify(pageContentTurn.request.args).includes(pageContent),
      "The next model request includes content extracted from the result page"
    );
    pageContentTurn.respond("The page contains enough information to answer.");

    const answerTurn = await mockEngineManager.captureRequest({
      purpose: PURPOSES.CHAT,
    });
    Assert.equal(
      answerTurn.request.tool_choice,
      "none",
      "The final generation cannot call tools"
    );
    Assert.deepEqual(
      answerTurn.request.tools,
      [],
      "No tools are offered during final generation"
    );
    const expectedAnswer = {
      answer: "The widget is nine dollars.",
      could_answer: true,
      confidence: 0.9,
    };
    answerTurn.respond(JSON.stringify(expectedAnswer));

    const result = await runPromise;
    conversation.securityProperties.commit();

    Assert.deepEqual(
      result,
      {
        ...expectedAnswer,
        searched_urls: [pageUrl],
        read_urls: [pageUrl],
        requiresSearchHandoff: false,
      },
      "The workflow returns the validated answer and code-tracked URLs"
    );
    Assert.deepEqual(
      conversation.getCitationsSnapshot(),
      [{ url: pageUrl, title: "Widget Store" }],
      "The read page is registered as a citation on the conversation"
    );
    Assert.equal(
      requestCounts[0],
      1,
      "The selected result page is fetched once"
    );
    Assert.deepEqual(
      [...conversation.seenUrls],
      [pageUrl],
      "The search result is recorded as a seen URL"
    );
    Assert.deepEqual(
      [...conversation.serpUrlsForAnonymousFetch],
      [pageUrl],
      "The search result is eligible for anonymous page extraction"
    );
    Assert.ok(
      conversation.securityProperties.privateData,
      "Running a web search marks the conversation as private"
    );
    Assert.ok(
      conversation.securityProperties.untrustedInput,
      "Search results are treated as untrusted input"
    );
    mockEngineManager.assertAllRequestsHandled();
    mockSearchManager.assertAllRequestsHandled();
  } finally {
    mockEngineManager.rejectAllRequests();
    mockSearchManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
    await new Promise(resolve => pageServer.stop(resolve));
  }
});

add_task(function test_exa_result_url_token_round_trip() {
  const conversation = new ChatConversation({});
  const results = [
    {
      title: "One",
      url: "https://round-trip.example.com/alpha",
      snippet: "s1",
    },
    { title: "Two", url: "https://round-trip.example.com/beta", snippet: "s2" },
  ];
  const urls = results.map(result => result.url);
  const formatted = results
    .map(result => `${result.title} — ${result.url}\n${result.snippet}`)
    .join("\n\n");
  conversation.addSeenUrls(urls);
  conversation.addSerpUrlsForAnonymousFetch(urls);

  Assert.equal(
    conversation.serpUrlsForAnonymousFetch.size,
    urls.length,
    "The ledger holds all result URLs"
  );

  replaceUrlsWithTokens(conversation, [{ role: "tool", content: formatted }]);

  for (const url of urls) {
    const token = conversation.urlToToken.get(url);
    Assert.ok(token, `The result URL is tokenized: ${url}`);

    const toolParams = { url_list: [`§url_token: ${token}§`] };
    expandUrlTokensInToolParams(toolParams, conversation.tokenToUrl);
    Assert.deepEqual(
      toolParams.url_list,
      [url],
      "The token expands back to the exact ledger URL"
    );
  }
});

add_task(async function test_search_the_web_reads_result_pages_up_to_limit() {
  // Four results are returned, the model asks to read all of them, and the
  // workflow caps the reads at MAX_PAGES (3), fetching the real served pages.
  const bodies = [0, 1, 2, 3].map(
    index =>
      `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Page ${index}</title></head>` +
      `<body><article><p>Result page ${index} body content.</p></article></body></html>`
  );
  const { urls, requestCounts, server: pagesServer } = serveResultPages(bodies);
  const results = urls.map((url, index) => ({
    title: `Page ${index}`,
    url,
    snippet: `snippet ${index}`,
  }));
  await pushSearchPrefs();

  const mockEngineManager = new MockEngineManager();
  const mockSearchManager = new MockSearchManager();
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });

  try {
    const runPromise = runSearchTheWeb({ query: "pages" }, conversation);
    (await mockSearchManager.captureRequest()).respond({ results });

    // First answer-gen turn: the model requests every result id.
    const readTurn = await mockEngineManager.captureRequest({
      purpose: PURPOSES.CHAT,
    });
    readTurn.respond([
      {
        text: "",
        tokens: null,
        isPrompt: false,
        toolCalls: [
          {
            id: "call_read_all",
            function: {
              name: "get_page_content",
              arguments: JSON.stringify({
                result_ids: ["result_1", "result_2", "result_3", "result_4"],
              }),
            },
          },
        ],
      },
    ]);

    // Second turn: no further reads, so the loop ends.
    (
      await mockEngineManager.captureRequest({ purpose: PURPOSES.CHAT })
    ).respond("");

    // Final turn: structured answer.
    (
      await mockEngineManager.captureRequest({ purpose: PURPOSES.CHAT })
    ).respond(
      JSON.stringify({
        answer: "Answer from pages.",
        could_answer: true,
        confidence: 0.8,
      })
    );

    const result = await runPromise;

    Assert.equal(
      result.searched_urls.length,
      4,
      "All four search results are tracked as searched"
    );
    Assert.equal(
      result.read_urls.length,
      3,
      "The page-read loop is capped at MAX_PAGES (3)"
    );
    for (const readUrl of result.read_urls) {
      Assert.ok(
        urls.includes(readUrl),
        `A read URL is one of the served result pages: ${readUrl}`
      );
    }
    Assert.deepEqual(
      conversation.getCitationsSnapshot().map(citation => citation.url),
      result.read_urls,
      "The citation snapshot matches the read URLs"
    );
    Assert.deepEqual(
      requestCounts,
      [1, 1, 1, 0],
      "Only the first three result pages are fetched"
    );
    mockEngineManager.assertAllRequestsHandled();
    mockSearchManager.assertAllRequestsHandled();
  } finally {
    mockEngineManager.rejectAllRequests();
    mockSearchManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
    await new Promise(resolve => pagesServer.stop(resolve));
  }
});

add_task(async function test_search_the_web_invalid_answer_is_not_answered() {
  // A non-JSON model answer must fail schema validation and default to a
  // not-answered result so the assistant falls back rather than surfacing junk.
  const results = [
    { title: "Page", url: "https://example.com/page", snippet: "s" },
  ];
  await pushSearchPrefs();

  const mockEngineManager = new MockEngineManager();
  const mockSearchManager = new MockSearchManager();
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });

  try {
    const runPromise = runSearchTheWeb({ query: "q" }, conversation);
    (await mockSearchManager.captureRequest()).respond({ results });
    (
      await mockEngineManager.captureRequest({ purpose: PURPOSES.CHAT })
    ).respond("");
    (
      await mockEngineManager.captureRequest({ purpose: PURPOSES.CHAT })
    ).respond("this is not valid json");

    const result = await runPromise;
    Assert.equal(
      result.could_answer,
      false,
      "A non-JSON answer is treated as not-answered"
    );
    Assert.equal(
      result.answer,
      "",
      "The answer defaults to empty on malformed output"
    );
    mockEngineManager.assertAllRequestsHandled();
    mockSearchManager.assertAllRequestsHandled();
  } finally {
    mockEngineManager.rejectAllRequests();
    mockSearchManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_search_the_web_retrieval_error_returns_failure() {
  // A non-2xx from the search endpoint must be caught and returned as a
  // not-answered result with an error, never thrown.
  await pushSearchPrefs();

  const mockSearchManager = new MockSearchManager();
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });

  try {
    const runPromise = runSearchTheWeb({ query: "q" }, conversation);
    (await mockSearchManager.captureRequest()).respond("boom", {
      status: 500,
      statusText: "Internal Server Error",
    });
    const result = await runPromise;
    Assert.equal(
      result.could_answer,
      false,
      "A retrieval error yields a not-answered result"
    );
    Assert.deepEqual(
      result.searched_urls,
      [],
      "No URLs are searched when retrieval fails"
    );
    Assert.ok(
      result.error,
      "An error message is returned so the assistant can fall back"
    );
    mockSearchManager.assertAllRequestsHandled();
  } finally {
    mockSearchManager.rejectAllRequests();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_search_the_web_no_results_returns_failure() {
  // An empty result set short-circuits before answer generation.
  await pushSearchPrefs();

  const mockSearchManager = new MockSearchManager();
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });

  try {
    const runPromise = runSearchTheWeb({ query: "q" }, conversation);
    (await mockSearchManager.captureRequest()).respond({ results: [] });
    const result = await runPromise;
    Assert.equal(
      result.could_answer,
      false,
      "No results yields a not-answered result"
    );
    Assert.deepEqual(result.searched_urls, [], "No URLs are searched");
    mockSearchManager.assertAllRequestsHandled();
  } finally {
    mockSearchManager.rejectAllRequests();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_search_the_web_second_call_escalates_to_handoff() {
  // The first search_the_web call answers in chat and marks the turn as having
  // searched; a second call in the same turn escalates to the handoff (kind
  // HANDOFF) without running another retrieval. Empty results keep the first
  // call fast — the tool still ran, which is what marks the turn.
  await pushSearchPrefs();

  const mockSearchManager = new MockSearchManager();
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });

  try {
    const firstPromise = runSearchTheWeb({ query: "weather" }, conversation);
    (await mockSearchManager.captureRequest()).respond({ results: [] });
    const first = await firstPromise;
    Assert.equal(
      first.requiresSearchHandoff,
      false,
      "The first call answers in chat (ANSWER), not a handoff"
    );
    Assert.equal(
      conversation._searchTheWebTurn,
      conversation.currentTurnIndex(),
      "The first call marks the current turn as having searched"
    );

    // No captureRequest() is set up for the second call: had it tried to
    // retrieve again, this await would hang. Its resolving is the proof that the
    // handoff short-circuits before any Exa search.
    const second = await runSearchTheWeb(
      { query: "weather again" },
      conversation
    );
    Assert.equal(
      second.requiresSearchHandoff,
      true,
      "A second call in the same turn escalates to the handoff"
    );

    mockSearchManager.assertAllRequestsHandled();
  } finally {
    mockSearchManager.rejectAllRequests();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_search_the_web_page_read_timeout_does_not_hang() {
  // A headless page load that never settles must not hang the answer flow:
  // readPage races the fetch against a resolving timeout, so a stuck read
  // yields a fallback and generateAnswer still produces an answer. The read
  // timeout pref is shrunk so the test doesn't wait the 15s default.
  await pushSearchPrefs();
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.search.readTimeoutMs", 50]],
  });

  const sb = sinon.createSandbox();
  const mockEngineManager = new MockEngineManager();
  const mockSearchManager = new MockSearchManager();
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });

  // Simulate a stuck headless load: getPageContent never settles.
  const hangStub = sb
    .stub(GetPageContent, "getPageContent")
    .callsFake(() => new Promise(() => {}));

  try {
    const runPromise = runSearchTheWeb({ query: "widgets" }, conversation);

    (await mockSearchManager.captureRequest()).respond({
      results: [
        {
          title: "Widget Store",
          url: "https://widgets.example/store",
          text: "A page with widget prices.",
        },
      ],
    });

    // First answer-generation turn: the model asks to read the result page.
    (
      await mockEngineManager.captureRequest({ purpose: PURPOSES.CHAT })
    ).respond({
      text: "",
      tokens: null,
      isPrompt: false,
      toolCalls: [
        {
          id: "read_1",
          function: {
            name: GET_PAGE_CONTENT,
            arguments: JSON.stringify({ result_ids: ["result_1"] }),
          },
        },
      ],
    });

    // The read hangs and times out (~50ms). The fallback text is fed back as
    // the tool result, so the next request's args must contain it — proof the
    // stuck read resolved instead of hanging the flow.
    const afterReadTurn = await mockEngineManager.captureRequest({
      purpose: PURPOSES.CHAT,
    });
    Assert.ok(
      JSON.stringify(afterReadTurn.request.args).includes("Timed out reading"),
      "A stuck page read resolves to the timeout fallback"
    );
    afterReadTurn.respond("The results are enough to answer.");

    // Final structured-answer turn.
    (
      await mockEngineManager.captureRequest({ purpose: PURPOSES.CHAT })
    ).respond(
      JSON.stringify({
        answer: "Widgets vary in price.",
        could_answer: true,
        confidence: 0.6,
      })
    );

    const result = await runPromise;
    Assert.ok(
      result.could_answer,
      "The workflow still produces an answer despite the stuck read"
    );
    Assert.ok(
      hangStub.called,
      "getPageContent was invoked (and abandoned on timeout)"
    );
    mockEngineManager.assertAllRequestsHandled();
    mockSearchManager.assertAllRequestsHandled();
  } finally {
    sb.restore();
    mockEngineManager.rejectAllRequests();
    mockSearchManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv(); // read-timeout pref
    await SpecialPowers.popPrefEnv(); // search prefs
  }
});

// ---------------------------------------------------------------------------
// Fast path (SEARCH_THE_WEB_FAST_PREF on): Exa snippets are returned directly
// to the main assistant, with no answer generation and no page reads.
// ---------------------------------------------------------------------------

// Mirrors MAX_RESULTS_RETRIEVED / MAX_RESULTS_RETURNED in SearchWorkflow: the
// fast path over-fetches so that dropping unusable results still leaves a full
// set.
const FAST_MAX_REQUESTED = 5;
const FAST_MAX_RETURNED = 3;

// Long enough to clear the workflow's MIN_SNIPPET_LENGTH.
const GOOD_SNIPPET = "A sufficiently long snippet of page text.";

/**
 * Runs the fast path against a mocked search endpoint.
 *
 * @param {object} options
 * @param {string} [options.query]
 * @param {object} options.response - Body the mocked endpoint returns.
 * @param {number} [options.status] - HTTP status the mocked endpoint returns.
 * @returns {Promise<{result: object, request: object, conversation: ChatConversation}>}
 */
async function runFastSearchWithMock({
  query = "widgets",
  response,
  status = 200,
}) {
  await pushSearchPrefs(true);
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });
  const mockSearchManager = new MockSearchManager();
  try {
    const runPromise = runSearchTheWeb({ query }, conversation);
    const search = await mockSearchManager.captureRequest();
    search.respond(response, { status });
    const result = await runPromise;
    mockSearchManager.assertAllRequestsHandled();
    return { result, request: search.request, conversation };
  } finally {
    mockSearchManager.rejectAllRequests();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  }
}

add_task(async function test_fast_search_returns_snippets() {
  const query = "What is the featured widget's price?";
  const results = [
    {
      title: "Widget Store",
      url: "https://widgets.example/store",
      text: "The featured widget is on sale for nine dollars today.",
    },
    {
      title: "Widget Reviews",
      url: "https://widgets.example/reviews",
      text: "Reviewers agree the featured widget is a reasonable buy.",
    },
  ];

  // The conversation-level effects (citations, the fetch ledger, the security
  // flags) are asserted in test_fast_search_through_chat, which drives the real
  // caller instead of committing the flags on its own behalf.
  const { result, request } = await runFastSearchWithMock({
    query,
    response: { results },
  });

  Assert.deepEqual(
    JSON.parse(request.options.body),
    { query, max_results: FAST_MAX_REQUESTED },
    "The fast path over-fetches so filtering still leaves a full set"
  );
  Assert.deepEqual(
    result,
    {
      results: results.map(item => ({
        title: sanitizeUntrustedContent(item.title),
        url: item.url,
        snippet: item.text,
      })),
      requiresSearchHandoff: false,
    },
    "The Exa results are returned directly, with no generated answer"
  );
});

add_task(async function test_fast_search_filters_and_caps_results() {
  // Five results come back: one with a non-http URL and one with a stub
  // snippet are dropped, leaving exactly the cap of three.
  const { result, conversation } = await runFastSearchWithMock({
    response: {
      results: [
        {
          title: "First",
          url: "https://widgets.example/first",
          text: GOOD_SNIPPET,
        },
        {
          title: "Not a web URL",
          url: "ftp://widgets.example/file",
          text: GOOD_SNIPPET,
        },
        { title: "Stub", url: "https://widgets.example/stub", text: "Sign in" },
        {
          title: "Second",
          url: "https://widgets.example/second",
          text: GOOD_SNIPPET,
        },
        {
          title: "Third",
          url: "https://widgets.example/third",
          text: GOOD_SNIPPET,
        },
      ],
    },
  });

  Assert.deepEqual(
    result.results.map(item => item.url),
    [
      "https://widgets.example/first",
      "https://widgets.example/second",
      "https://widgets.example/third",
    ],
    "Bad URLs and unusable snippets are dropped, capped at the returned max"
  );
  Assert.equal(
    result.results.length,
    FAST_MAX_RETURNED,
    "No more than the returned max reaches the assistant"
  );
  Assert.deepEqual(
    [...conversation.serpUrlsForAnonymousFetch],
    result.results.map(item => item.url),
    "Only the returned results are fetchable; dropped results are not"
  );
});

add_task(async function test_fast_search_snippet_collapsed_and_truncated() {
  const { result } = await runFastSearchWithMock({
    response: {
      results: [
        {
          title: "Whitespace",
          url: "https://widgets.example/whitespace",
          text: "  Lots\n\n  of\tirregular   whitespace in this snippet.  ",
        },
        {
          title: "Long",
          url: "https://widgets.example/long",
          text: "word ".repeat(1000),
        },
      ],
    },
  });

  Assert.equal(
    result.results[0].snippet,
    "Lots of irregular whitespace in this snippet.",
    "Whitespace is collapsed and the snippet is trimmed"
  );
  // MAX_SNIPPET_LENGTH (2000) plus the single-character ellipsis.
  Assert.equal(
    result.results[1].snippet.length,
    2001,
    "An over-long snippet is truncated to the cap"
  );
  Assert.ok(
    result.results[1].snippet.endsWith("…"),
    "A truncated snippet is marked with an ellipsis"
  );
});

add_task(async function test_fast_search_second_call_escalates_to_handoff() {
  // The handoff escalation is shared by both paths: a second call in the same
  // turn short-circuits before any Exa retrieval.
  await pushSearchPrefs(true);

  const mockSearchManager = new MockSearchManager();
  const conversation = new ChatConversation({
    pageUrl: new URL("https://example.com"),
    pageMeta: {},
  });

  try {
    const firstPromise = runSearchTheWeb({ query: "weather" }, conversation);
    (await mockSearchManager.captureRequest()).respond({ results: [] });
    const first = await firstPromise;
    Assert.equal(
      first.requiresSearchHandoff,
      false,
      "The first call answers in chat, not a handoff"
    );

    // No captureRequest() is set up for the second call: had it tried to
    // retrieve again, this await would hang.
    const second = await runSearchTheWeb(
      { query: "weather again" },
      conversation
    );
    Assert.equal(
      second.requiresSearchHandoff,
      true,
      "A second call in the same turn escalates to the handoff"
    );

    mockSearchManager.assertAllRequestsHandled();
  } finally {
    mockSearchManager.rejectAllRequests();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_fast_search_through_chat() {
  // Drives the real caller: Chat.fetchWithHistory runs the tool-call loop, so
  // the conversation-level effects happen the way they do in production. In
  // particular the security flags are committed by Chat once the tool batch
  // finishes, so this test never calls commit() itself.
  const query = "how much are widgets?";
  const results = [
    {
      title: "Widget Store",
      url: "https://widgets.example/store",
      text: "The featured widget is on sale for nine dollars today.",
    },
    {
      title: "Widget Reviews",
      url: "https://widgets.example/reviews",
      text: "Reviewers agree the featured widget is a reasonable buy.",
    },
  ];

  await pushSearchPrefs(true);
  const mockSearchManager = new MockSearchManager();
  const wireRequests = [];

  try {
    await withServer(
      {
        toolCall: { name: SEARCH_THE_WEB, args: JSON.stringify({ query }) },
        followupChunks: ["Widgets cost nine dollars."],
        onRequest(body) {
          wireRequests.push(body);
        },
      },
      async () => {
        const conversation = new ChatConversation({
          pageUrl: new URL("https://example.com"),
          pageMeta: {},
        });
        conversation.engine = await openAIEngine.build({
          model: TEST_MODEL,
          serviceType: SERVICE_TYPES.AI,
          purpose: PURPOSES.CHAT,
          flowId: null,
          feature: MODEL_FEATURES.CHAT,
        });
        conversation.addUserMessage(query, "https://example.com", 0);
        conversation.addAssistantMessage("text", "");

        const fetchPromise = Chat.fetchWithHistory({ conversation });
        await mockSearchManager.respondTo({ response: { results } });
        await fetchPromise;

        const toolMessages = conversation.messages.filter(
          message => message.role === MESSAGE_ROLE.TOOL
        );
        Assert.equal(toolMessages.length, 1, "One search tool result recorded");
        Assert.deepEqual(
          toolMessages[0].content.body,
          {
            results: results.map(item => ({
              title: sanitizeUntrustedContent(item.title),
              url: item.url,
              snippet: item.text,
            })),
            requiresSearchHandoff: false,
          },
          "The snippets reach the conversation as the tool result"
        );

        // No commit() here: Chat committed the staged flags itself.
        Assert.ok(
          conversation.securityProperties.privateData,
          "Chat commits the private-data flag the tool staged"
        );
        Assert.ok(
          conversation.securityProperties.untrustedInput,
          "Chat commits the untrusted-input flag the tool staged"
        );

        Assert.deepEqual(
          conversation.getCitationsSnapshot(),
          results.map(item => ({ url: item.url, title: item.title })),
          "Every returned result is registered as a citation, with its raw title"
        );
        Assert.deepEqual(
          [...conversation.serpUrlsForAnonymousFetch],
          results.map(item => item.url),
          "The returned results are eligible for anonymous page extraction"
        );

        // The follow-up turn carries the tool result back to the model, which
        // is where the generic URL tokenization has to have taken effect.
        Assert.equal(
          wireRequests.length,
          2,
          "A tool turn and a follow-up turn"
        );
        const wireToolMessage = wireRequests[1].messages.find(
          message => message.role === "tool"
        );
        Assert.ok(
          wireToolMessage,
          "The follow-up turn includes the tool result"
        );
        for (const item of results) {
          const token = conversation.urlToToken.get(item.url);
          Assert.ok(token, `The result URL is tokenized: ${item.url}`);
          Assert.ok(
            wireToolMessage.content.includes(`§url_token: ${token}§`),
            "The model sees the token for the result URL"
          );
          Assert.ok(
            !wireToolMessage.content.includes(item.url),
            "The model does not see the raw result URL"
          );
        }
      }
    );
  } finally {
    mockSearchManager.rejectAllRequests();
    mockSearchManager.cleanupMocks();
    await SpecialPowers.popPrefEnv();
  }
});
