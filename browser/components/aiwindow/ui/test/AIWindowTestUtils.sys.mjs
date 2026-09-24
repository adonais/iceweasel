/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @import { MockLLMEngine, MockedResponse } from "../../../../toolkit/components/ml/tests/MLTestUtils.sys.mjs"
 * @import { ModelFeature } from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
 * @import { HttpServer } from "resource://testing-common/httpd.sys.mjs"
 */

/* global content, ContentTaskUtils */

import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { sinon } from "resource://testing-common/Sinon.sys.mjs";
import { MLTestUtils } from "resource://testing-common/MLTestUtils.sys.mjs";

import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";
import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs";
import { ExaSearchProvider } from "moz-src:///browser/components/aiwindow/models/search/SearchProviders.sys.mjs";
import { MemoryStore } from "moz-src:///browser/components/aiwindow/services/MemoryStore.sys.mjs";
import { embeddingsGeneratorFactory } from "chrome://global/content/ml/EmbeddingsGenerator.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  HttpServer: "resource://testing-common/httpd.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const testContext = {};

function context() {
  if (!testContext.scope) {
    throw new Error(
      "AIWindowTestUtils.init(scope, window) must be called first"
    );
  }
  return testContext;
}

/**
 * This class manages the MockLLMEngine for Smart Window. Smart Window instantiates
 * multiple engines, each with a different "purpose". This class allows for
 * deterministically testing the behavior of a language model. For instance, this can be
 * used to test application behavior, or assert what happens when a language model has
 * been prompt injected by untrusted content.
 *
 * See browser/components/aiwindow/ui/test/browser/browser_security_chat.js for example usage.
 */
export class MockEngineManager {
  /** @type {Map<ModelFeature, MockLLMEngine>} */
  engines = new Map();
  /** @type {any[]} */
  mocks;

  /**
   * Install the mocks.
   */
  constructor() {
    this.mocks = [
      sinon.stub(openAIEngine, "_createEngine").callsFake(options =>
        // When a new engine is requested create the mock one and track it in
        // the engines map.
        this.engines.getOrInsertComputed(
          options.purpose ?? "unknown",
          () => new MLTestUtils.MockLLMEngine(options)
        )
      ),
      sinon.stub(openAIEngine, "getFxAccountToken").resolves("mock-fxa-token"),
    ];
  }

  /**
   * Provide the response for an engine. The engine purpose is the "purpose" provided
   * to the PipelineOptions when creating an engine. The MockedResponse can be
   * a simple string or the actual response values provided by the engine.
   *
   * @param {object} options
   * @param {ModelFeature} options.purpose
   * @param {MockedResponse} options.response
   * @returns {void}
   */
  async respondTo({ purpose, response }) {
    dump(`[MockEngineManager] Getting the engine with purpose "${purpose}"\n`);
    /** @type {MockLLMEngine} */
    const engine = await TestUtils.waitForCondition(
      () => this.engines.get(purpose),
      `Couldn't find the engine "${purpose}"`
    );
    dump(
      `[MockEngineManager] Waiting for the run request for the engine with purpose "${purpose}"\n`
    );
    await TestUtils.waitForCondition(
      () => engine.runRequests.size,
      `[MockEngineManager] Failed to find a request for the engine with purpose "${purpose}"`
    );
    const [requestId] = engine.getNextRequest();
    if (typeof response === "string") {
      dump(
        `[MockEngineManager] Responding to "${purpose}" engine: ${response}\n`
      );
    } else {
      dump(`[MockEngineManager] Responding to "${purpose}" engine:\n`);
      console.log(response);
    }
    engine.respond(requestId, response);
  }

  /**
   * Wait for a pending run request on the engine with the given purpose and
   * return both the captured request and a `respond` callback, without
   * resolving it. Unlike `respondTo`, this hands the raw request to the test so
   * it can assert on what the real code actually sent to the model (the
   * messages in `request.args`, the `request.tools` array, etc.) before
   * deciding how the model should reply. This is what keeps a test cheat-proof:
   * the assertions are made against real inputs produced by real code, not
   * against values the test itself fed into a stub.
   *
   * @param {object} options
   * @param {ModelFeature} options.purpose
   * @returns {Promise<{request: object, respond: (response: MockedResponse) => void}>}
   */
  async captureRequest({ purpose }) {
    /** @type {MockLLMEngine} */
    const engine = await TestUtils.waitForCondition(
      () => this.engines.get(purpose),
      `Couldn't find the engine "${purpose}"`
    );
    await TestUtils.waitForCondition(
      () => engine.runRequests.size,
      `[MockEngineManager] Failed to find a request for the engine with purpose "${purpose}"`
    );
    const [requestId, { request }] = engine.getNextRequest();
    return {
      request,
      respond: response => engine.respond(requestId, response),
    };
  }

  /**
   * Reject all outstanding engine requests. This can help ensure that a test
   * run is clean before asserting specific behavior.
   */
  rejectAllRequests() {
    for (const [purpose, engine] of this.engines) {
      if (engine.runRequests.size) {
        dump(
          `[MockEngineManager] Intentionally rejecting any pending requests for engine "${purpose}"\n`
        );
        engine.rejectAllRequests();
      }
    }
  }

  /**
   * Restore all of the mocks.
   */
  cleanupMocks() {
    for (const mock of this.mocks) {
      mock.restore();
    }
  }

  /**
   * Log all of the outstanding engine requests. This is useful for debugging a test.
   *
   * @param {bool} truncateRequest By default truncate the request object as they can
   *   be quite large.
   */
  logAllOutstandingRequests(truncateRequest = true) {
    if (!this.engines.size) {
      console.log("No engines were mocked");
      return;
    }
    for (const [purpose, engine] of this.engines) {
      console.log(`Outstanding requests for engine with purpose "${purpose}"`);
      if (!engine.runRequests.size) {
        console.log(" - No outstanding requests");
      }
      for (const runRequest of engine.runRequests) {
        if (truncateRequest) {
          let request = JSON.stringify(runRequest);
          if (request.length > 100) {
            request =
              request.slice(0, 100) + " … " + request[request.length - 1];
          }
          console.log(` - Request for "${purpose}":`, request);
        } else {
          console.log(` - Request for "${purpose}":`, runRequest);
        }
      }
    }
  }

  /**
   * Nicely assert that all requests to the engine were handled. When a request
   * is not handled it will be output to the console for easier debugging.
   */
  assertAllRequestsHandled() {
    let foundRequest = false;
    for (const [purpose, engine] of this.engines) {
      for (const runRequest of engine.runRequests) {
        foundRequest = true;
        console.error(
          `A run request was not handled for the engine with purpose ${purpose}`,
          runRequest
        );
      }
    }
    if (foundRequest) {
      throw new Error("A request was not handled for an engine.");
    }
  }
}

/**
 * This class is a mock for Search Endpoints for Smart Window. It mocks only the fetch function used by the ExaSearchProvider.
 * It allows for deterministically testing the behavior of a search endpoint.
 */
export class MockSearchManager {
  /** @type {object[]} */
  requests = [];
  mock;

  constructor() {
    this.mock = sinon
      .stub(ExaSearchProvider, "_fetch")
      .callsFake((url, options) => {
        const { promise, resolve, reject } = Promise.withResolvers();
        this.requests.push({
          request: { url, options },
          resolve,
          reject,
        });
        return promise;
      });
  }

  /**
   * Respond to the next pending search endpoint request.
   *
   * @param {object} options
   * @param {object} options.response
   * @param {number} [options.status]
   * @param {string} [options.statusText]
   */
  async respondTo({ response, status = 200, statusText }) {
    const request = await this.captureRequest();
    request.respond(response, { status, statusText });
  }

  /**
   * Capture the next request to the search endpoint.
   *
   * @returns {Promise<{request: {url: string, options: RequestInit}, respond: (response: object, options?: {status?: number, statusText?: string}) => void, reject: (reason: any) => void}>}
   */
  async captureRequest() {
    await TestUtils.waitForCondition(
      () => this.requests.length,
      "Couldn't find a search endpoint request"
    );
    const pendingRequest = this.requests[0];
    const settle = callback => {
      const index = this.requests.indexOf(pendingRequest);
      if (index === -1) {
        throw new Error("The search endpoint request was already handled");
      }
      this.requests.splice(index, 1);
      callback();
    };
    return {
      request: pendingRequest.request,
      respond: (response, { status = 200, statusText } = {}) =>
        settle(() =>
          pendingRequest.resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText:
              statusText ?? (status >= 200 && status < 300 ? "OK" : "Error"),
            json: async () => response,
            text: async () =>
              typeof response === "string"
                ? response
                : JSON.stringify(response),
          })
        ),
      reject: reason => settle(() => pendingRequest.reject(reason)),
    };
  }

  /**
   * Reject all outstanding search endpoint requests. This can help ensure that a test
   * run is clean before asserting specific behavior.
   */
  rejectAllRequests() {
    for (const { reject } of this.requests) {
      reject(new Error("Intentionally rejecting search endpoint request"));
    }
    this.requests = [];
  }

  cleanupMocks() {
    this.mock.restore();
  }

  logAllOutstandingRequests() {
    if (!this.requests.length) {
      console.log("No search endpoint requests were mocked");
      return;
    }
    for (const { request } of this.requests) {
      console.log("Outstanding request to the search endpoint", request);
    }
  }

  assertAllRequestsHandled() {
    for (const { request } of this.requests) {
      console.error("A search endpoint request was not handled", request);
    }
    if (this.requests.length) {
      throw new Error("A search endpoint request was not handled.");
    }
  }
}

/**
 * This class makes relevant memories retrieval deterministic for tests. The
 * embedding model can't run in a test, so it stands in for the model with a bag
 * of words. Everything above the model - the memory store, the embeddings cache,
 * the similarity search and the ranking - is the real code.
 */
export class MockMemoriesRetrieval {
  #dimensions = new Map();
  #embeddingSize;
  #realEmbeddingsGenerator;

  /**
   * Install the mock.
   */
  constructor() {
    const embeddingsGenerator = embeddingsGeneratorFactory.forGeneral();
    this.#embeddingSize = embeddingsGenerator.embeddingSize;
    embeddingsGenerator.setEngine({
      run: async request => {
        const texts = Array.isArray(request.args[0])
          ? request.args[0]
          : request.args;
        return texts.map(text => this.#embed(text));
      },
    });

    this.#realEmbeddingsGenerator = MemoryStore.embeddingsGenerator;
    MemoryStore.embeddingsGenerator = embeddingsGenerator;
    MemoryStore._clearEmbeddingsCache();
  }

  #embed(text) {
    const vector = new Array(this.#embeddingSize).fill(0);
    for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
      if (!this.#dimensions.has(word)) {
        if (this.#dimensions.size === this.#embeddingSize) {
          throw new Error(
            `Test corpus exceeds ${this.#embeddingSize} distinct words`
          );
        }
        this.#dimensions.set(word, this.#dimensions.size);
      }
      vector[this.#dimensions.get(word)] = 1;
    }
    return vector;
  }

  /**
   * Replace everything in the memory store with `memories`, so each test picks
   * the memories retrieval runs against.
   *
   * @param {Array<{id: string, memory_summary: string}>} memories
   */
  async seedMemories(memories) {
    await this.clearMemories();
    for (const memory of memories) {
      await MemoryStore.addMemory(memory);
    }
    MemoryStore._clearEmbeddingsCache();
  }

  /**
   * Empty the memory store, leaving retrieval nothing to match.
   */
  async clearMemories() {
    for (const memory of await MemoryStore.getMemories({
      includeSoftDeleted: true,
    })) {
      await MemoryStore.hardDeleteMemory(memory.id);
    }
  }

  async cleanupMocks() {
    MemoryStore.embeddingsGenerator = this.#realEmbeddingsGenerator;
    MemoryStore._clearEmbeddingsCache();
    await this.clearMemories();
  }
}

function readRequestBody(request) {
  const stream = request.bodyInputStream;
  const available = stream.available();
  return lazy.NetUtil.readInputStreamToString(stream, available, {
    charset: "UTF-8",
  });
}

export const AIWindowTestUtils = {
  AIWINDOW_URL: "chrome://browser/content/aiwindow/aiWindow.html",

  /**
   * Gives the helpers access to test scope globals such as info and
   * SimpleTest, and to window globals such as SpecialPowers. Call once at the
   * top of head.js.
   *
   * @param {object} scope - The global scope where tests are being run.
   * @param {Window} win - The browser window running the tests.
   */
  init(scope, win) {
    if (!scope || !win) {
      throw new Error(
        "AIWindowTestUtils.init() must be called with a scope and a window"
      );
    }
    testContext.scope = scope;
    testContext.window = win;
    scope.registerCleanupFunction(() => {
      delete testContext.scope;
      delete testContext.window;
    });
  },

  async toggleAIWindowPref(SpecialPowers, enabled) {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.enabled", enabled]],
    });
  },

  isAIWindow(win) {
    return win.document.documentElement.hasAttribute("ai-window");
  },

  /**
   * Opens a browser window without waiting for it to be ready. Prefer
   * openReadyAIWindow when the test needs a focused AI window.
   *
   * @param {boolean} [aiWindow] - Whether to open an AI window or a regular one.
   * @returns {Promise<Window>}
   */
  async openAIWindow(aiWindow = true) {
    return BrowserTestUtils.openNewBrowserWindow({
      openerWindow: null,
      aiWindow,
    });
  },

  /**
   * Opens a new AI Window and waits until it is focused and flagged as an AI
   * window.
   *
   * @param {object} [options]
   * @param {string} [options.waitForTabURL] - URL to wait for, or empty string
   *   to skip waiting.
   * @returns {Promise<Window>}
   */
  async openReadyAIWindow({
    waitForTabURL = AIWindowTestUtils.AIWINDOW_URL,
  } = {}) {
    const { info, SimpleTest } = context().scope;
    info("Opening new AI Window");
    const win = await BrowserTestUtils.openNewBrowserWindow({
      aiWindow: true,
      waitForTabURL,
    });
    info("Waiting for AI window attr");
    await BrowserTestUtils.waitForMutationCondition(
      win.document.documentElement,
      { attributes: true },
      () => win.document.documentElement.hasAttribute("ai-window")
    );
    info("Promising focus");
    await SimpleTest.promiseFocus(win);
    return win;
  },

  /**
   * Waits for ai-window, then its shadowRoot, then the loaded #aichat-browser.
   *
   * @param {object} browser - The chrome browser element hosting ai-window
   * @returns {Promise<object>} The aichat browser element
   */
  async getAichatBrowser(browser) {
    const aiWindowEl = await TestUtils.waitForCondition(
      () => browser.contentDocument?.querySelector("ai-window"),
      "Wait for ai-window element to exist"
    );

    await TestUtils.waitForCondition(
      () => aiWindowEl.shadowRoot,
      "Wait for ai-window shadowRoot to be ready"
    );

    const aichatBrowser = await TestUtils.waitForCondition(
      () => aiWindowEl.shadowRoot.querySelector("#aichat-browser"),
      "Wait for aichat-browser element"
    );

    if (aichatBrowser.currentURI?.spec !== "about:aichatcontent") {
      await BrowserTestUtils.browserLoaded(
        aichatBrowser,
        false,
        "about:aichatcontent"
      );
    }

    if (aichatBrowser.currentURI.spec !== "about:aichatcontent") {
      throw new Error(
        `aichat-browser loaded ${aichatBrowser.currentURI.spec} instead of about:aichatcontent`
      );
    }

    return aichatBrowser;
  },

  /**
   * Select an explicit action from the smartbar CTA dropdown menu.
   *
   * @param {object} browser - The browser element
   * @param {string} action - The action to select
   */
  async selectExplicitSmartbarAction(browser, action) {
    const { SpecialPowers } = context().window;
    await SpecialPowers.spawn(browser, [action], async actionType => {
      const aiWindow = content.document.querySelector("ai-window");
      await ContentTaskUtils.waitForMutationCondition(
        aiWindow.shadowRoot,
        { childList: true, subtree: true },
        () => aiWindow.shadowRoot.querySelector("#ai-window-smartbar")
      );
      const smartbar = aiWindow.shadowRoot.querySelector("#ai-window-smartbar");
      const inputCta = smartbar.querySelector("input-cta");
      const mozButton = inputCta.shadowRoot.querySelector("moz-button");

      await ContentTaskUtils.waitForMutationCondition(
        mozButton.shadowRoot,
        { childList: true, subtree: true },
        () => mozButton.shadowRoot.querySelector("#chevron-button")
      );
      const chevronButton =
        mozButton.shadowRoot.querySelector("#chevron-button");
      const panelList = inputCta.shadowRoot.querySelector("panel-list");
      const shownPromise = ContentTaskUtils.waitForEvent(panelList, "shown");
      chevronButton.click();
      await shownPromise;

      const actionItem = panelList.querySelector(
        `panel-item[icon="${actionType}"]`
      );
      actionItem.click();
    });
  },

  /**
   * Wait for the smartbar action to be set.
   *
   * @param {object} browser - The browser element
   * @param {string} expectedAction - The expected action value
   */
  async waitForSmartbarAction(browser, expectedAction) {
    const { SpecialPowers } = context().window;
    await SpecialPowers.spawn(browser, [expectedAction], async action => {
      const aiWindow = content.document.querySelector("ai-window");
      await ContentTaskUtils.waitForMutationCondition(
        aiWindow.shadowRoot,
        { childList: true, subtree: true },
        () => aiWindow.shadowRoot.querySelector("#ai-window-smartbar")
      );
      const smartbar = aiWindow.shadowRoot.querySelector("#ai-window-smartbar");
      await ContentTaskUtils.waitForCondition(
        () => smartbar.smartbarAction === action,
        `Wait for smartbar action to be "${action}"`
      );
    });
  },

  /**
   * @typedef {object} MockToolCall
   * @property {string} name - The tool function name (e.g. "run_search",
   *   "get_page_content").
   * @property {string} [args] - JSON-encoded arguments for the tool call.
   *   Defaults to "{}".
   */

  /**
   * @typedef {object} MockOpenAIServerOptions
   * @property {string[]} [streamChunks] - Array of content strings sent as
   *   individual SSE chunks in the streaming response. Defaults to
   *   ["Hello from mock."].
   * @property {number} [streamChunkDelayMs] - Delay in milliseconds before
   *   each streamed chunk. Defaults to 0.
   * @property {MockToolCall|null} [toolCall] - When non-null, the first
   *   streaming request that includes tools will respond with this tool call
   *   instead of text content. A subsequent request containing the tool result
   *   will receive followupChunks as the response. Defaults to null.
   * @property {string[]} [followupChunks] - Content chunks sent in the
   *   streaming response after a tool result is received. Only used when
   *   toolCall is set. Defaults to ["Tool complete."].
   * @property {Function} [onRequest] - Callback invoked with the parsed
   *   request body for every request to /v1/chat/completions.
   */

  /**
   * Starts a local HTTP server that mimics the OpenAI chat completions API.
   *
   * Handles both streaming (SSE) and non-streaming (JSON) requests to
   * /v1/chat/completions. When toolCall is configured, the server simulates
   * a tool-use round-trip: the first request returns the tool call, and the
   * follow-up request (containing the tool result) returns followupChunks.
   *
   * @deprecated - Please use MockEngineManager unless a test explicitly needs
   *   the network layer of the OpenAI chat protocol.
   *   TODO (Bug 2045844): Remove and replace existing usages across test files.
   * @param {MockOpenAIServerOptions} [options]
   * @returns {{ server: HttpServer, port: number }} The running server and
   *   its port number.
   */
  startMockOpenAI({
    streamChunks = ["Hello from mock."],
    streamChunkDelayMs = 0,
    toolCall = null,
    followupChunks = ["Tool complete."],
    onRequest,
  } = {}) {
    const server = new lazy.HttpServer();

    server.registerPathHandler("/v1/chat/completions", (request, response) => {
      let bodyText = "";
      if (request.method === "POST") {
        try {
          bodyText = readRequestBody(request);
        } catch (_) {}
      }

      let body;
      try {
        body = JSON.parse(bodyText || "{}");
      } catch (_) {
        body = {};
      }

      onRequest?.(body);

      const wantsStream = !!body.stream;
      const tools = Array.isArray(body.tools) ? body.tools : [];
      const askedForTools = tools.length;
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const hasToolResult = messages.some(m => m && m.role === "tool");
      const timestamp = Math.floor(Date.now() / 1000);

      const startSSE = () => {
        response.setStatusLine(request.httpVersion, 200, "OK");
        response.setHeader(
          "Content-Type",
          "text/event-stream; charset=utf-8",
          false
        );
        response.setHeader("Cache-Control", "no-cache", false);
        response.setHeader("Access-Control-Allow-Origin", "*", false);
        response.processAsync();
      };

      const sendSSE = obj => {
        // Encode data so special §followup:§-type tokens preserves utf-8
        response.write(
          Array.from(
            new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`),
            b => String.fromCharCode(b)
          ).join("")
        );
      };

      if (wantsStream && toolCall && askedForTools && !hasToolResult) {
        startSSE();

        sendSSE({
          id: "chatcmpl-aiwindow-stream-tool-1",
          object: "chat.completion.chunk",
          created: timestamp,
          model: "aiwindow-mock",
          choices: [
            {
              index: 0,
              delta: {
                content: "",
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: {
                      name: toolCall.name,
                      arguments: toolCall.args ?? "{}",
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });

        sendSSE({
          id: "chatcmpl-aiwindow-stream-tool-2",
          object: "chat.completion.chunk",
          created: timestamp,
          model: "aiwindow-mock",
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        });

        response.write("data: [DONE]\n\n");
        response.finish();
        return;
      }

      if (wantsStream && toolCall && askedForTools && hasToolResult) {
        startSSE();

        followupChunks.forEach((chunk, index) => {
          sendSSE({
            id: `chatcmpl-aiwindow-stream-tool-followup-${index}`,
            object: "chat.completion.chunk",
            created: timestamp,
            model: "aiwindow-mock",
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason:
                  index === followupChunks.length - 1 ? "stop" : null,
              },
            ],
          });
        });

        response.write("data: [DONE]\n\n");
        response.finish();
        return;
      }

      if (wantsStream) {
        startSSE();

        (async () => {
          for (const [index, chunk] of streamChunks.entries()) {
            if (streamChunkDelayMs) {
              await new Promise(resolve =>
                lazy.setTimeout(resolve, streamChunkDelayMs)
              );
            }
            sendSSE({
              id: `chatcmpl-aiwindow-stream-${index}`,
              object: "chat.completion.chunk",
              created: timestamp,
              model: "aiwindow-mock",
              choices: [
                {
                  index: 0,
                  delta: { content: chunk },
                  finish_reason:
                    index === streamChunks.length - 1 ? "stop" : null,
                },
              ],
            });
          }

          response.write("data: [DONE]\n\n");
          response.finish();
        })();
        return;
      }

      // Non-streaming fallback for conversation starters, title generation, etc.
      response.setStatusLine(request.httpVersion, 200, "OK");
      response.setHeader("Content-Type", "application/json", false);
      response.write(
        JSON.stringify({
          id: "chatcmpl-aiwindow-non-stream",
          object: "chat.completion",
          created: timestamp,
          model: "aiwindow-mock",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Mock response" },
              finish_reason: "stop",
            },
          ],
        })
      );
    });

    server.start(-1);
    return { server, port: server.identity.primaryPort };
  },

  /**
   * Stops a running mock OpenAI server.
   *
   * @param {HttpServer} server - The server instance returned by
   *   startMockOpenAI.
   * @returns {Promise<void>} Resolves when the server has fully stopped.
   */
  stopMockOpenAI(server) {
    return new Promise(resolve => server.stop(resolve));
  },

  /**
   * Convenience wrapper that starts a mock OpenAI server, pushes the endpoint
   * pref, stubs getFxAccountToken, runs a task, then tears everything down.
   *
   * Consider using stubEngineNetworkBoundaries (in the functional suite's
   * head.js) instead for new tests — it additionally stubs openAIEngine.build
   * to prevent leaked-window issues from background async operations, and its
   * setup/restore pattern fits beforeEach/afterEach without requiring a
   * callback wrapper.
   *
   * @param {MockOpenAIServerOptions} serverOptions - Options for the mock
   *   server.
   * @param {Function} task - Async callback receiving { port }.
   */
  async withServer(serverOptions, task) {
    const { SpecialPowers } = context().window;
    const { server, port } = AIWindowTestUtils.startMockOpenAI(serverOptions);
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.smartwindow.endpoint", `http://localhost:${port}/v1`],
        ["browser.smartwindow.customEndpoint", `http://localhost:${port}/v1`],
      ],
    });

    const getFxAccountTokenStub = sinon
      .stub(openAIEngine, "getFxAccountToken")
      .resolves("mock-fxa-token");

    try {
      await task({ port });
    } finally {
      getFxAccountTokenStub.restore();
      await SpecialPowers.popPrefEnv();
      await AIWindowTestUtils.stopMockOpenAI(server);
    }
  },
};
