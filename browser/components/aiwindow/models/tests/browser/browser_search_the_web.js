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
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { PURPOSES, MODEL_FEATURES, SERVICE_TYPES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

const { Chat } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Chat.sys.mjs"
);

const { replaceUrlsWithTokens, expandUrlTokensInToolParams } =
  ChromeUtils.importESModule(
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
 *
 * @returns {Promise<void>}
 */
async function pushSearchPrefs() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SEARCH_QUERY_ENDPOINT_PREF, SEARCH_ENDPOINT],
      [SEARCH_QUERY_APIKEY_PREF, SEARCH_API_KEY],
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
    // eslint-disable-next-line @microsoft/sdl/no-insecure-url
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
    Assert.deepEqual(
      answerTurn.request.inferenceParams,
      {
        response_format: {
          type: "json_schema",
          json_schema: SEARCH_ANSWER_SCHEMA,
        },
      },
      "The final generation requests the search answer schema"
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
      },
      "The workflow returns the validated answer and code-tracked URLs"
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

add_task(async function test_search_the_web_offers_run_search_fallback() {
  // Tool gating end behavior: run_search is not offered up front, but once
  // search_the_web has executed the dispatcher swaps it in as the fallback.
  // Empty search results keep the tool fast; the tool still ran, which is what
  // triggers the swap.
  // NOTE: this drives the full Chat loop, which records the smart_window.tool_call
  // Glean event. That metric is present in full/CI builds (metrics.yaml) but is
  // absent from local artifact builds, so this task only passes under a full
  // build or on CI. The existing chat-loop tool tests in
  // browser_conversation_stream.js share this constraint.
  await pushSearchPrefs();
  const mockSearchManager = new MockSearchManager();

  const { AIWindow } = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/ui/modules/AIWindow.sys.mjs"
  );
  const isAIWindowActiveStub = sinon
    .stub(AIWindow, "isAIWindowActive")
    .callsFake(win => win === window);

  const requestBodies = [];
  try {
    await withServer(
      {
        toolCall: {
          name: "search_the_web",
          args: JSON.stringify({ query: "weather" }),
        },
        followupChunks: ["Here is what I found."],
        onRequest: body => requestBodies.push(body),
      },
      async () => {
        const engine = await openAIEngine.build({
          model: TEST_MODEL,
          serviceType: SERVICE_TYPES.AI,
          purpose: PURPOSES.CHAT,
          flowId: null,
          feature: MODEL_FEATURES.CHAT,
        });
        const conversation = new ChatConversation({
          pageUrl: new URL("https://example.com"),
          pageMeta: {},
        });
        conversation.engine = engine;
        conversation.addUserMessage(
          "what's the weather",
          "https://example.com",
          0
        );
        conversation.addAssistantMessage("text", "");

        const chatPromise = Chat.fetchWithHistory({ conversation });
        (await mockSearchManager.captureRequest()).respond({ results: [] });
        await chatPromise;
      }
    );

    const firstTools = (
      requestBodies.find(body => Array.isArray(body.tools))?.tools ?? []
    ).map(tool => tool.function?.name);
    Assert.ok(
      firstTools.includes("search_the_web"),
      "search_the_web is offered on the first turn"
    );
    Assert.ok(
      !firstTools.includes("run_search"),
      "run_search is not offered up front"
    );

    const lastTools = (
      requestBodies.filter(body => Array.isArray(body.tools)).at(-1)?.tools ??
      []
    ).map(tool => tool.function?.name);
    Assert.ok(
      lastTools.includes("run_search"),
      "run_search is offered as a fallback after search_the_web runs"
    );
    Assert.ok(
      !lastTools.includes("search_the_web"),
      "search_the_web is removed once it has run"
    );
    mockSearchManager.assertAllRequestsHandled();
  } finally {
    isAIWindowActiveStub.restore();
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
