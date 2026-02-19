/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

do_get_profile();

const {
  constructRealTimeInfoInjectionMessage,
  getLocalIsoTime,
  getCurrentTabMetadata,
  constructRelevantMemoriesContextMessage,
  parseContentWithTokens,
  detectTokens,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);
const { MemoriesManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs"
);
const { MemoryStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/services/MemoryStore.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

/**
 * Constants for test memories
 */
const TEST_MEMORIES = [
  {
    memory_summary: "Loves drinking coffee",
    category: "Food & Drink",
    intent: "Plan / Organize",
    score: 3,
  },
  {
    memory_summary: "Buys dog food online",
    category: "Pets & Animals",
    intent: "Buy / Acquire",
    score: 4,
  },
];

/**
 * Helper function bulk-add memories
 */
async function clearAndAddMemories() {
  const memories = await MemoryStore.getMemories();
  for (const memory of memories) {
    await MemoryStore.hardDeleteMemory(memory.id);
  }
  for (const memory of TEST_MEMORIES) {
    await MemoryStore.addMemory(memory);
  }
}

/**
 * Constants for preference keys and test values
 */
const PREF_API_KEY = "browser.aiwindow.apiKey";
const PREF_ENDPOINT = "browser.aiwindow.endpoint";
const PREF_MODEL = "browser.aiwindow.model";

const API_KEY = "fake-key";
const ENDPOINT = "https://api.fake-endpoint.com/v1";
const MODEL = "fake-model";

add_setup(async function () {
  // Setup prefs used across multiple tests
  Services.prefs.setStringPref(PREF_API_KEY, API_KEY);
  Services.prefs.setStringPref(PREF_ENDPOINT, ENDPOINT);
  Services.prefs.setStringPref(PREF_MODEL, MODEL);

  // Clear prefs after testing
  registerCleanupFunction(() => {
    for (let pref of [PREF_API_KEY, PREF_ENDPOINT, PREF_MODEL]) {
      if (Services.prefs.prefHasUserValue(pref)) {
        Services.prefs.clearUserPref(pref);
      }
    }
  });
});

add_task(function test_getLocalIsoTime_returns_offset_timestamp() {
  const sb = sinon.createSandbox();
  const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });
  try {
    const iso = getLocalIsoTime();
    Assert.ok(
      typeof iso === "string" && !!iso.length,
      "Should return a non-empty string"
    );
    Assert.ok(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso),
      "Should include date, time (up to seconds), without timezone offset"
    );
  } finally {
    clock.restore();
    sb.restore();
  }
});

add_task(async function test_getCurrentTabMetadata_fetch_fallback() {
  const sb = sinon.createSandbox();
  const tracker = { getTopWindow: sb.stub() };
  const pageData = {
    getCached: sb.stub(),
  };
  const fakeActor = {
    collectPageData: sb.stub().resolves({
      description: "Collected description",
    }),
  };
  const fakeBrowser = {
    currentURI: { spec: "https://example.com/article" },
    contentTitle: "",
    documentTitle: "Example Article",
    browsingContext: {
      currentWindowGlobal: {
        getActor: sb.stub().returns(fakeActor),
      },
    },
  };

  tracker.getTopWindow.returns({
    gBrowser: { selectedBrowser: fakeBrowser },
  });
  pageData.getCached.returns(null);

  try {
    const result = await getCurrentTabMetadata({
      BrowserWindowTracker: tracker,
      PageDataService: pageData,
    });
    Assert.deepEqual(result, {
      url: "https://example.com/article",
      title: "Example Article",
      description: "Collected description",
    });
    Assert.ok(
      fakeActor.collectPageData.calledOnce,
      "Should collect page data from actor when not cached"
    );
    Assert.ok(
      fakeBrowser.browsingContext.currentWindowGlobal.getActor.calledWith(
        "PageData"
      ),
      "Should get PageData actor"
    );
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_constructRealTimeInfoInjectionMessage_with_tab_info() {
    const sb = sinon.createSandbox();
    const tracker = { getTopWindow: sb.stub() };
    const pageData = {
      getCached: sb.stub(),
    };
    const locale = Services.locale.appLocaleAsBCP47;
    const fakeActor = {
      collectPageData: sb.stub(),
    };
    const fakeBrowser = {
      currentURI: { spec: "https://mozilla.org" },
      contentTitle: "Mozilla",
      documentTitle: "Mozilla",
      browsingContext: {
        currentWindowGlobal: {
          getActor: sb.stub().returns(fakeActor),
        },
      },
    };

    tracker.getTopWindow.returns({
      gBrowser: { selectedBrowser: fakeBrowser },
    });
    pageData.getCached.returns({
      description: "Internet for people",
    });
    const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });

    try {
      const message = await constructRealTimeInfoInjectionMessage({
        BrowserWindowTracker: tracker,
        PageDataService: pageData,
      });
      Assert.equal(message.role, "system", "Should return system role");
      Assert.ok(
        message.content.includes(`Locale: ${locale}`),
        "Should include locale"
      );
      Assert.ok(
        message.content.includes("Current active browser tab details:"),
        "Should include tab details heading"
      );
      Assert.ok(
        message.content.includes("- URL: https://mozilla.org"),
        "Should include tab URL"
      );
      Assert.ok(
        message.content.includes("- Title: Mozilla"),
        "Should include tab title"
      );
      Assert.ok(
        message.content.includes("- Description: Internet for people"),
        "Should include tab description"
      );
      Assert.ok(
        fakeActor.collectPageData.notCalled,
        "Should not collect page data when cached data exists"
      );
    } finally {
      clock.restore();
      sb.restore();
    }
  }
);

add_task(
  async function test_constructRealTimeInfoInjectionMessage_without_tab_info() {
    const sb = sinon.createSandbox();
    const tracker = { getTopWindow: sb.stub() };
    const pageData = {
      getCached: sb.stub(),
      fetchPageData: sb.stub(),
    };
    const locale = Services.locale.appLocaleAsBCP47;

    tracker.getTopWindow.returns(null);
    const clock = sb.useFakeTimers({ now: Date.UTC(2025, 11, 27, 14, 0, 0) });

    try {
      const message = await constructRealTimeInfoInjectionMessage({
        BrowserWindowTracker: tracker,
        PageDataService: pageData,
      });
      Assert.ok(
        message.content.includes("No active browser tab."),
        "Should mention missing tab info"
      );
      Assert.ok(
        !message.content.includes("- URL:"),
        "Should not include empty tab fields"
      );
      Assert.ok(
        message.content.includes(`Locale: ${locale}`),
        "Should include system locale"
      );
    } finally {
      clock.restore();
      sb.restore();
    }
  }
);

add_task(async function test_constructRelevantMemoriesContextMessage() {
  await clearAndAddMemories();

  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
            "categories": ["Food & Drink"],
            "intents": ["Plan / Organize"]
          }`,
        };
      },
    };

    // Stub the `ensureOpenAIEngine` method in MemoriesManager
    const stub = sb
      .stub(MemoriesManager, "ensureOpenAIEngine")
      .returns(fakeEngine);

    const relevantMemoriesContextMessage =
      await constructRelevantMemoriesContextMessage("I love drinking coffee");
    Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

    // Check relevantMemoriesContextMessage's top level structure
    Assert.strictEqual(
      typeof relevantMemoriesContextMessage,
      "object",
      "Should return an object"
    );
    Assert.equal(
      Object.keys(relevantMemoriesContextMessage).length,
      2,
      "Should have 2 keys"
    );

    // Check specific fields
    Assert.equal(
      relevantMemoriesContextMessage.role,
      "system",
      "Should have role 'system'"
    );
    Assert.ok(
      typeof relevantMemoriesContextMessage.content === "string" &&
        relevantMemoriesContextMessage.content.length,
      "Content should be a non-empty string"
    );

    const content = relevantMemoriesContextMessage.content;
    Assert.ok(
      content.includes(
        "Use them to personalized your response using the following guidelines:"
      ),
      "Relevant memories context prompt should pull from the correct base"
    );
    Assert.ok(
      content.includes("- Loves drinking coffee"),
      "Content should include relevant memory"
    );
    Assert.ok(
      !content.includes("- Buys dog food online"),
      "Content should not include non-relevant memory"
    );
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_constructRelevantMemoriesContextMessage_no_relevant_memories() {
    await clearAndAddMemories();

    const sb = sinon.createSandbox();
    try {
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "categories": ["Health & Fitness"],
            "intents": ["Plan / Organize"]
          }`,
          };
        },
      };

      // Stub the `ensureOpenAIEngine` method in MemoriesManager
      const stub = sb
        .stub(MemoriesManager, "ensureOpenAIEngine")
        .returns(fakeEngine);

      const relevantMemoriesContextMessage =
        await constructRelevantMemoriesContextMessage("I love drinking coffee");
      Assert.ok(stub.calledOnce, "ensureOpenAIEngine should be called once");

      // No relevant memories, so returned value should be null
      Assert.equal(
        relevantMemoriesContextMessage,
        null,
        "Should return null when there are no relevant memories"
      );
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_parseContentWithTokens_no_tokens() {
  const content = "This is a regular message with no special tokens.";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    content,
    "Clean content should match original when no tokens present"
  );
  Assert.equal(result.searchQueries.length, 0, "Should have no search queries");
  Assert.equal(result.usedMemories.length, 0, "Should have no used memories");
});

add_task(async function test_parseContentWithTokens_single_search_token() {
  const content =
    "You can find great coffee in the downtown area.§search: best coffee shops near me§";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "You can find great coffee in the downtown area.",
    "Should remove search token from content"
  );
  Assert.equal(result.searchQueries.length, 1, "Should have one search query");
  Assert.equal(
    result.searchQueries[0],
    "best coffee shops near me",
    "Should extract correct search query"
  );
  Assert.equal(result.usedMemories.length, 0, "Should have no used memories");
});

add_task(async function test_parseContentWithTokens_single_memory_token() {
  const content =
    "I recommend trying herbal tea blends.§existing_memory: likes tea§";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "I recommend trying herbal tea blends.",
    "Should remove memory token from content"
  );
  Assert.equal(result.searchQueries.length, 0, "Should have no search queries");
  Assert.equal(result.usedMemories.length, 1, "Should have one used memory");
  Assert.equal(
    result.usedMemories[0],
    "likes tea",
    "Should extract correct memory"
  );
});

add_task(async function test_parseContentWithTokens_multiple_mixed_tokens() {
  const content =
    "I recommend checking out organic coffee options.§existing_memory: prefers organic§ They have great flavor profiles.§search: organic coffee beans reviews§§search: best organic cafes nearby§";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "I recommend checking out organic coffee options. They have great flavor profiles.",
    "Should remove all tokens from content"
  );
  Assert.equal(
    result.searchQueries.length,
    2,
    "Should have two search queries"
  );
  Assert.deepEqual(
    result.searchQueries,
    ["organic coffee beans reviews", "best organic cafes nearby"],
    "Should extract search queries in correct order"
  );
  Assert.equal(result.usedMemories.length, 1, "Should have one used memory");
  Assert.equal(
    result.usedMemories[0],
    "prefers organic",
    "Should extract correct memory"
  );
});

add_task(async function test_parseContentWithTokens_tokens_with_whitespace() {
  const content =
    "You can find more details online.§search:   coffee brewing methods   §";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "You can find more details online.",
    "Should remove token with whitespace"
  );
  Assert.equal(result.searchQueries.length, 1, "Should have one search query");
  Assert.equal(
    result.searchQueries[0],
    "coffee brewing methods",
    "Should trim whitespace from extracted query"
  );
});

add_task(async function test_parseContentWithTokens_adjacent_tokens() {
  const content =
    "Here are some great Italian dining options.§existing_memory: prefers italian food§§search: local italian restaurants§";
  const result = await parseContentWithTokens(content);

  Assert.equal(
    result.cleanContent,
    "Here are some great Italian dining options.",
    "Should remove adjacent tokens"
  );
  Assert.equal(result.searchQueries.length, 1, "Should have one search query");
  Assert.equal(
    result.searchQueries[0],
    "local italian restaurants",
    "Should extract search query"
  );
  Assert.equal(result.usedMemories.length, 1, "Should have one memory");
  Assert.equal(
    result.usedMemories[0],
    "prefers italian food",
    "Should extract memory"
  );
});

add_task(function test_detectTokens_basic_pattern() {
  const content =
    "There are many great options available.§search: coffee shops near downtown§§search: best rated restaurants§";
  const searchRegex = /§search:\s*([^§]+)§/gi;
  const result = detectTokens(content, searchRegex, "query");

  Assert.equal(result.length, 2, "Should find two matches");
  Assert.equal(
    result[0].query,
    "coffee shops near downtown",
    "First match should extract correct query"
  );
  Assert.equal(
    result[0].fullMatch,
    "§search: coffee shops near downtown§",
    "First match should include full match"
  );
  Assert.equal(
    result[0].startIndex,
    39,
    "First match should have correct start index"
  );
  Assert.equal(
    result[1].query,
    "best rated restaurants",
    "Second match should extract correct query"
  );
});

add_task(function test_detectTokens_custom_key() {
  const content =
    "I recommend trying the Thai curry.§memory: prefers spicy food§";
  const memoryRegex = /§memory:\s*([^§]+)§/gi;
  const result = detectTokens(content, memoryRegex, "customKey");

  Assert.equal(result.length, 1, "Should find one match");
  Assert.equal(
    result[0].customKey,
    "prefers spicy food",
    "Should use custom key for extracted value"
  );
  Assert.ok(
    result[0].hasOwnProperty("customKey"),
    "Result should have the custom key property"
  );
  Assert.ok(
    !result[0].hasOwnProperty("query"),
    "Result should not have default 'query' property"
  );
});
