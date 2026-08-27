/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @import { MockLLMEngine, MockedResponse } from "../../../../toolkit/components/ml/tests/MLTestUtils.sys.mjs"
 * @import { ModelFeature } from "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
 */

import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { sinon } from "resource://testing-common/Sinon.sys.mjs";
import { MLTestUtils } from "resource://testing-common/MLTestUtils.sys.mjs";

import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";
import { openAIEngine } from "moz-src:///browser/components/aiwindow/models/openAIEngine.sys.mjs";
import { ExaSearchProvider } from "moz-src:///browser/components/aiwindow/models/search/SearchProviders.sys.mjs";
import { MemoryStore } from "moz-src:///browser/components/aiwindow/services/MemoryStore.sys.mjs";
import { embeddingsGeneratorFactory } from "chrome://global/content/ml/EmbeddingsGenerator.sys.mjs";

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

export const AIWindowTestUtils = {
  async toggleAIWindowPref(SpecialPowers, enabled) {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.enabled", enabled]],
    });
  },

  isAIWindow(win) {
    return win.document.documentElement.hasAttribute("ai-window");
  },

  async openAIWindow(aiWindow = true) {
    return BrowserTestUtils.openNewBrowserWindow({
      openerWindow: null,
      aiWindow,
    });
  },
};
