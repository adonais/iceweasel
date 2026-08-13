/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

do_get_profile();

const { Conversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Conversation.sys.mjs"
);
const { MODEL_FEATURES, SERVICE_TYPES, PURPOSES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const TEST_MODEL = "test-model";

const {
  renderSessionsForPrompt,
  mapFilteredMemoriesToInitialList,
  generateInitialMemoriesList,
  runSessionMemoryPipeline,
  deduplicateMemories,
  applyQualityAndSensitivityFilter,
  computeMemoryStrength,
  computeMemoryFrecency,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/Memories.sys.mjs"
);

const {
  MEMORY_TYPE_SHORT_TERM_MEMORY,
  MEMORY_TYPE_DURABLE_MEMORY,
  MEMORY_SENSITIVITY_CATEGORY_NOT_SENSITIVE,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesConstants.sys.mjs"
);

/**
 * Minimal gate-passing session bundle used to exercise the sessions pipeline.
 * The fake engines below return canned output regardless of input, so the exact
 * contents only matter for `renderSessionsForPrompt` assertions.
 */
const SAMPLE_SESSIONS = [
  {
    session_id: 1_700_000_000_000,
    session_start_ms: 1_700_000_000_000,
    session_end_ms: 1_700_000_500_000,
    search_queries: ["firefox history"],
    titles: ["Internet for people, not profit — Mozilla"],
    chats: [{ content: "tell me about firefox" }],
  },
];

/**
 * Constants for preference keys and test values
 */
const PREF_API_KEY = "browser.smartwindow.apiKey";
const PREF_ENDPOINT = "browser.smartwindow.endpoint";
const PREF_MODEL = "browser.smartwindow.model";

const API_KEY = "fake-key";
const ENDPOINT = "https://api.fake-endpoint.com/v1";
const MODEL = "fake-model";

const EXISTING_MEMORIES = [
  "Loves outdoor activities",
  "Enjoys cooking recipes",
  "Like sci-fi media",
];
const NEW_MEMORIES = [
  "Loves hiking and camping",
  "Reads science fiction novels",
  "Likes both dogs and cats",
  "Likes risky stock bets",
];

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

/**
 * Test successful initial memories generation
 */
add_task(async function test_generateInitialMemoriesList_happy_path() {
  const sb = sinon.createSandbox();
  try {
    /**
     * The fake engine returns canned LLM response.
     * The main `generateInitialMemoriesList` function should modify this heavily, cutting it back to only the required fields.
     */
    const fakeEngine = {
      run() {
        return {
          finalOutput: `[
  {
    "reasoning": "User has recently searched for Firefox history and visited mozilla.org.",
    "category": "Internet & Telecom",
    "intent": "Research / Learn",
    "memory_summary": "Searches for Firefox information",
    "score": 7,
    "entities": ["Firefox", "Mozilla"],
    "evidence": [
      {
        "type": "search",
        "value": "Google Search: firefox history"
      },
      {
        "type": "domain",
        "value": "mozilla.org"
      }
    ]
  },
  {
    "reasoning": "User buys dog food online regularly from multiple sources.",
    "category": "Pets & Animals",
    "intent": "Buy / Acquire",
    "memory_summary": "Purchases dog food online",
    "score": -1,
    "evidence": [
      {
        "type": "domain",
        "value": "example.com"
      }
    ]
  }
]`,
        };
      },
    };

    const conversation = new Conversation({
      feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
      model: TEST_MODEL,
      serviceType: SERVICE_TYPES.MEMORIES,
      purpose: PURPOSES.MEMORY_GENERATION,
      parameters: {},
      flowId: null,
      engine: fakeEngine,
    });

    const sources = { sessions: SAMPLE_SESSIONS };
    const memoriesList = await generateInitialMemoriesList(
      conversation,
      sources
    );

    // Check top level structure
    Assert.ok(
      Array.isArray(memoriesList),
      "Should return an array of memories"
    );
    Assert.equal(memoriesList.length, 2, "Array should contain 2 memories");

    // Check first memory structure and content
    const firstMemory = memoriesList[0];
    Assert.equal(
      typeof firstMemory,
      "object",
      "First memory should be an object/map"
    );
    Assert.equal(
      Object.keys(firstMemory).length,
      18,
      "First memory should have 18 keys (incl. derived source and source_ids)"
    );

    // Check system fields
    Assert.equal(
      firstMemory.type,
      MEMORY_TYPE_SHORT_TERM_MEMORY,
      "First memory type should be short term"
    );
    Assert.ok(Array.isArray(firstMemory.sources), "Sources should be an array");
    Assert.equal(
      firstMemory.sources.length,
      1,
      "Sources array should have 1 entry to start with"
    );
    Assert.ok(
      firstMemory.sources.includes("history"),
      "First memory sources should include history"
    );
    Assert.deepEqual(
      firstMemory.source_ids,
      { history_source_ids: [], conversation_source_ids: [] },
      "source_ids present (empty here: evidence strings don't match the session)"
    );
    Assert.equal(
      firstMemory.sensitivity_category,
      MEMORY_SENSITIVITY_CATEGORY_NOT_SENSITIVE,
      "First memory sensitivity type should be not sensitive"
    );
    Assert.equal(
      firstMemory.is_deleted,
      false,
      "First memory should not be soft deleted"
    );

    // Check descriptive fields
    Assert.equal(
      firstMemory.memory_summary,
      "Searches for Firefox information",
      "First memory should have expected summary"
    );
    Assert.equal(
      firstMemory.reasoning,
      "User has recently searched for Firefox history and visited mozilla.org.",
      "First memory should have the expected reasoning"
    );
    Assert.ok(
      Array.isArray(firstMemory.tags),
      "First memory tags should be an array"
    );
    Assert.deepEqual(
      firstMemory.tags,
      ["category:Internet & Telecom", "intent:Research / Learn"],
      "First memory should have the expected initial tags (category and intent)"
    );
    Assert.ok(
      Array.isArray(firstMemory.keywords),
      "First memory keywords should be an array"
    );
    Assert.deepEqual(
      firstMemory.keywords,
      ["Firefox", "Mozilla"],
      "First memory should have the expected keywords"
    );
    Assert.ok(
      Array.isArray(firstMemory.component_summaries),
      "First memory component summaries should be an array"
    );
    Assert.equal(
      firstMemory.component_summaries,
      0,
      "First memory component summaries should be empty"
    );

    // Check tracker fields
    Assert.ok(
      Number.isFinite(firstMemory.created_at),
      "First memory created at timestamp should be a valid number"
    );
    Assert.ok(
      Number.isFinite(firstMemory.updated_at),
      "First memory updated at timestamp should be a valid number"
    );
    Assert.equal(
      firstMemory.last_accessed,
      null,
      "First memory last accessed timestamp should be null (never used)"
    );
    Assert.equal(
      typeof firstMemory.recent_accessed_counts,
      "object",
      "First memory recent accessed counts should be an object"
    );
    Assert.deepEqual(
      firstMemory.recent_accessed_counts,
      { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      "First memory recent acceessed counts object should have 1 key per day for 7 days with values set to 0 (never used)"
    );
    Assert.equal(
      firstMemory.lifetime_accessed_count,
      0,
      "First memory lifetime accessed count should be 0 (never used)"
    );
    Assert.equal(
      firstMemory.frecency,
      0,
      "First memory frequency should be 0 (never used)"
    );
    Assert.equal(
      firstMemory.merge_count,
      0,
      "First memory merge count should be 0 (never merged)"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed initial memories generation - Empty output
 */
add_task(
  async function test_generateInitialMemoriesList_sad_path_empty_output() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns an empty memories list
      const fakeEngine = {
        run() {
          return {
            finalOutput: `[]`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const sources = { sessions: SAMPLE_SESSIONS };
      const memoriesList = await generateInitialMemoriesList(
        conversation,
        sources
      );

      Assert.equal(Array.isArray(memoriesList), true, "Should return an array");
      Assert.equal(memoriesList.length, 0, "Array should contain 0 memories");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed initial memories generation - Output not array
 */
add_task(
  async function test_generateInitialMemoriesList_sad_path_output_not_array() {
    const sb = sinon.createSandbox();
    try {
      // LLM doesn't return an array
      const fakeEngine = {
        run() {
          return {
            finalOutput: `testing`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const sources = { sessions: SAMPLE_SESSIONS };
      const memoriesList = await generateInitialMemoriesList(
        conversation,
        sources
      );

      Assert.equal(Array.isArray(memoriesList), true, "Should return an array");
      Assert.equal(memoriesList.length, 0, "Array should contain 0 memories");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed initial memories generation - Output not array of maps
 */
add_task(
  async function test_generateInitialMemoriesList_sad_path_output_not_array_of_maps() {
    const sb = sinon.createSandbox();
    try {
      // LLM doesn't return an array of maps
      const fakeEngine = {
        run() {
          return {
            finalOutput: `["testing1", "testing2", ["testing3"]]`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const sources = { sessions: SAMPLE_SESSIONS };
      const memoriesList = await generateInitialMemoriesList(
        conversation,
        sources
      );

      Assert.equal(Array.isArray(memoriesList), true, "Should return an array");
      Assert.equal(memoriesList.length, 0, "Array should contain 0 memories");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed initial memories generation - Some correct memories
 */
add_task(
  async function test_generateInitialMemoriesList_sad_path_some_correct_memories() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a memories list where:
      // - 1 is missing required keys (category), so it should be rejected
      // - 1 has a memory_summary exceeding MAX_MEMORY_SUMMARY_LENGTH (100 chars), so it should be rejected
      // - 1 is fully correct and should be kept
      const fakeEngine = {
        run() {
          return {
            finalOutput: `[
  {
    "reasoning": "User has recently searched for Firefox history and visited mozilla.org.",
    "intent": "Research / Learn",
    "memory_summary": "Searches for Firefox information",
    "score": 7,
    "evidence": [
      {
        "type": "search",
        "value": "Google Search: firefox history"
      },
      {
        "type": "domain",
        "value": "mozilla.org"
      }
    ]
  },
  {
    "reasoning": "User buys dog food online regularly from multiple sources.",
    "category": "Pets & Animals",
    "intent": "Buy / Acquire",
    "memory_summary": "Purchases dog food online",
    "score": -1,
    "evidence": [
      {
        "type": "domain",
        "value": "example.com"
      }
    ]
  },
  {
    "reasoning": "User visited many travel sites.",
    "category": "Travel",
    "intent": "Research / Learn",
    "memory_summary": "This memory summary is intentionally way too long and exceeds the one hundred character maximum limit set",
    "score": 3,
    "evidence": [
      {
        "type": "domain",
        "value": "travel.example.com"
      }
    ]
  }
]`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const sources = { sessions: SAMPLE_SESSIONS };
      const memoriesList = await generateInitialMemoriesList(
        conversation,
        sources
      );

      Assert.equal(
        Array.isArray(memoriesList),
        true,
        "Should return an array of memories"
      );
      Assert.equal(memoriesList.length, 1, "Array should contain 1 memory");
      Assert.equal(
        memoriesList[0].memory_summary,
        "Purchases dog food online",
        "Memory summary should match the valid memory"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests that a memory whose required field is present but not a string is rejected.
 */
add_task(
  async function test_generateInitialMemoriesList_rejects_non_string_field() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a memories list where:
      // - 1 has a `category` that is present but a number instead of a string, so it should be rejected
      // - 1 is fully correct and should be kept
      const fakeEngine = {
        run() {
          return {
            finalOutput: `[
  {
    "reasoning": "User has recently searched for Firefox history and visited mozilla.org.",
    "category": 12345,
    "intent": "Research / Learn",
    "memory_summary": "Searches for Firefox information",
    "score": 7,
    "evidence": [
      {
        "type": "domain",
        "value": "mozilla.org"
      }
    ]
  },
  {
    "reasoning": "User buys dog food online regularly from multiple sources.",
    "category": "Pets & Animals",
    "intent": "Buy / Acquire",
    "memory_summary": "Purchases dog food online",
    "score": 4,
    "evidence": [
      {
        "type": "domain",
        "value": "example.com"
      }
    ]
  }
]`,
          };
        },
      };

      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const sources = { sessions: SAMPLE_SESSIONS };
      const memoriesList = await generateInitialMemoriesList(
        conversation,
        sources
      );

      Assert.equal(
        Array.isArray(memoriesList),
        true,
        "Should return an array of memories"
      );
      Assert.equal(
        memoriesList.length,
        1,
        "Memory with a non-string required field should be rejected"
      );
      Assert.equal(
        memoriesList[0].memory_summary,
        "Purchases dog food online",
        "Memory summary should match the valid memory"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests successful memories deduplication
 */
add_task(async function test_deduplicateMemoriesList_happy_path() {
  const sb = sinon.createSandbox();
  try {
    /**
     * The fake engine that returns a canned LLM response for deduplication.
     * The `deduplicateMemories` function should return an array containing only the `main_memory` values.
     */
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
            "unique_memories": [
              {
                "main_memory": "Loves outdoor activities",
                "duplicates": ["Loves hiking and camping"]
              },
              {
                "main_memory": "Enjoys cooking recipes",
                "duplicates": []
              },
              {
                "main_memory": "Like sci-fi media",
                "duplicates": ["Reads science fiction novels"]
              },
              {
                "main_memory": "Likes both dogs and cats",
                "duplicates": []
              },
              {
                "main_memory": "Likes risky stock bets",
                "duplicates": []
              }
            ]
          }`,
        };
      },
    };

    // Check that the stub was called
    const conversation = new Conversation({
      feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
      model: TEST_MODEL,
      serviceType: SERVICE_TYPES.MEMORIES,
      purpose: PURPOSES.MEMORY_GENERATION,
      parameters: {},
      flowId: null,
      engine: fakeEngine,
    });

    const dedupedMemoriesList = await deduplicateMemories(
      conversation,
      EXISTING_MEMORIES,
      NEW_MEMORIES
    );

    // Check that the deduplicated list contains only unique memories (`main_memory` values)
    Assert.equal(
      dedupedMemoriesList.length,
      5,
      "Deduplicated memories list should contain 5 unique memories"
    );
    Assert.ok(
      dedupedMemoriesList.includes("Loves outdoor activities"),
      "Deduplicated memories should include 'Loves outdoor activities'"
    );
    Assert.ok(
      dedupedMemoriesList.includes("Enjoys cooking recipes"),
      "Deduplicated memories should include 'Enjoys cooking recipes'"
    );
    Assert.ok(
      dedupedMemoriesList.includes("Like sci-fi media"),
      "Deduplicated memories should include 'Like sci-fi media'"
    );
    Assert.ok(
      dedupedMemoriesList.includes("Likes both dogs and cats"),
      "Deduplicated memories should include 'Likes both dogs and cats'"
    );
    Assert.ok(
      dedupedMemoriesList.includes("Likes risky stock bets"),
      "Deduplicated memories should include 'Likes risky stock bets'"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed memories deduplication - Empty output
 */
add_task(async function test_deduplicateMemoriesList_sad_path_empty_output() {
  const sb = sinon.createSandbox();
  try {
    // LLM returns the correct schema but with an empty unique_memories array
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
            "unique_memories": []
          }`,
        };
      },
    };

    // Check that the stub was called
    const conversation = new Conversation({
      feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
      model: TEST_MODEL,
      serviceType: SERVICE_TYPES.MEMORIES,
      purpose: PURPOSES.MEMORY_GENERATION,
      parameters: {},
      flowId: null,
      engine: fakeEngine,
    });

    const dedupedMemoriesList = await deduplicateMemories(
      conversation,
      EXISTING_MEMORIES,
      NEW_MEMORIES
    );

    Assert.ok(Array.isArray(dedupedMemoriesList), "Should return an array");
    Assert.equal(dedupedMemoriesList.length, 0, "Should return an empty array");
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed memories deduplication - Wrong top-level data type
 */
add_task(
  async function test_deduplicateMemoriesList_sad_path_wrong_top_level_data_type() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns an incorrect data type
      const fakeEngine = {
        run() {
          return {
            finalOutput: `testing`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const dedupedMemoriesList = await deduplicateMemories(
        conversation,
        EXISTING_MEMORIES,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(dedupedMemoriesList), "Should return an array");
      Assert.equal(
        dedupedMemoriesList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed memories deduplication - Wrong inner data type
 */
add_task(
  async function test_deduplicateMemoriesList_sad_path_wrong_inner_data_type() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a map with the right top-level key, but the inner structure is wrong
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "unique_memories": "testing"
          }`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const dedupedMemoriesList = await deduplicateMemories(
        conversation,
        EXISTING_MEMORIES,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(dedupedMemoriesList), "Should return an array");
      Assert.equal(
        dedupedMemoriesList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed memories deduplication - Wrong inner array structure
 */
add_task(
  async function test_deduplicateMemoriesList_sad_path_wrong_inner_array_structure() {
    const sb = sinon.createSandbox();
    try {
      // LLM returns a map of nested arrays, but the array structure is wrong
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "unique_memories": ["testing1", "testing2"]
          }`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const dedupedMemoriesList = await deduplicateMemories(
        conversation,
        EXISTING_MEMORIES,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(dedupedMemoriesList), "Should return an array");
      Assert.equal(
        dedupedMemoriesList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed memories deduplication - Incorrect top-level schema key
 */
add_task(
  async function test_deduplicateMemoriesList_sad_path_bad_top_level_key() {
    const sb = sinon.createSandbox();
    try {
      // LLm returns correct output except that the top-level key is wrong
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "correct_memories": [
              {
                "main_memory": "Loves outdoor activities",
                "duplicates": ["Loves hiking and camping"]
              },
              {
                "main_memory": "Enjoys cooking recipes",
                "duplicates": []
              },
              {
                "main_memory": "Like sci-fi media",
                "duplicates": ["Reads science fiction novels"]
              },
              {
                "main_memory": "Likes both dogs and cats",
                "duplicates": []
              },
              {
                "main_memory": "Likes risky stock bets",
                "duplicates": []
              }
            ]
          }`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const dedupedMemoriesList = await deduplicateMemories(
        conversation,
        EXISTING_MEMORIES,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(dedupedMemoriesList), "Should return an array");
      Assert.equal(
        dedupedMemoriesList.length,
        0,
        "Should return an empty array"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed memories deduplication - Some correct inner schema
 */
add_task(
  async function test_deduplicateMemoriesList_sad_path_bad_some_correct_inner_schema() {
    const sb = sinon.createSandbox();
    try {
      // LLm returns correct output except that 1 of the inner maps is wrong and 1 main_memory is the wrong data type
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
            "unique_memories": [
              {
                "primary_memory": "Loves outdoor activities",
                "duplicates": ["Loves hiking and camping"]
              },
              {
                "main_memory": "Enjoys cooking recipes",
                "duplicates": []
              },
              {
                "main_memory": 12345,
                "duplicates": []
              }
            ]
          }`,
          };
        },
      };

      // Check that the stub was called
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const dedupedMemoriesList = await deduplicateMemories(
        conversation,
        EXISTING_MEMORIES,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(dedupedMemoriesList), "Should return an array");
      Assert.equal(
        dedupedMemoriesList.length,
        1,
        "Should return an array with one valid memory"
      );
      Assert.equal(
        dedupedMemoriesList[0],
        "Enjoys cooking recipes",
        "Should return the single valid memory"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests successful memories quality + sensitivity filtering
 */
add_task(async function test_applyQualityAndSensitivityFilter_happy_path() {
  const sb = sinon.createSandbox();
  try {
    /**
     * Fake engine that returns three of the four NEW_MEMORIES as kept memories.
     * `applyQualityAndSensitivityFilter` should return those three verbatim.
     */
    const fakeEngine = {
      run() {
        return {
          finalOutput: `{
  "kept_memories": [
    "Loves hiking and camping",
    "Reads science fiction novels",
    "Likes both dogs and cats"
  ]
}`,
        };
      },
    };
    const conversation = new Conversation({
      feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
      model: TEST_MODEL,
      serviceType: SERVICE_TYPES.MEMORIES,
      purpose: PURPOSES.MEMORY_GENERATION,
      parameters: {},
      flowId: null,
      engine: fakeEngine,
    });

    const keptMemoriesList = await applyQualityAndSensitivityFilter(
      conversation,
      NEW_MEMORIES
    );

    Assert.equal(
      keptMemoriesList.length,
      3,
      "Kept memories list should contain 3 memories"
    );
    Assert.ok(
      keptMemoriesList.includes("Loves hiking and camping"),
      "Kept memories should include 'Loves hiking and camping'"
    );
    Assert.ok(
      keptMemoriesList.includes("Reads science fiction novels"),
      "Kept memories should include 'Reads science fiction novels'"
    );
    Assert.ok(
      keptMemoriesList.includes("Likes both dogs and cats"),
      "Kept memories should include 'Likes both dogs and cats'"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests failed fused filter - Empty output
 */
add_task(
  async function test_applyQualityAndSensitivityFilter_sad_path_empty_output() {
    const sb = sinon.createSandbox();
    try {
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
  "kept_memories": []
}`,
          };
        },
      };
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const keptMemoriesList = await applyQualityAndSensitivityFilter(
        conversation,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(keptMemoriesList), "Should return an array");
      Assert.equal(keptMemoriesList.length, 0, "Should return an empty array");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed filter - Wrong outer data type (not JSON)
 */
add_task(
  async function test_applyQualityAndSensitivityFilter_sad_path_wrong_data_type() {
    const sb = sinon.createSandbox();
    try {
      const fakeEngine = {
        run() {
          return {
            finalOutput: `testing`,
          };
        },
      };
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const keptMemoriesList = await applyQualityAndSensitivityFilter(
        conversation,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(keptMemoriesList), "Should return an array");
      Assert.equal(keptMemoriesList.length, 0, "Should return an empty array");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed filter - Wrong inner data type
 */
add_task(
  async function test_applyQualityAndSensitivityFilter_sad_path_wrong_inner_data_type() {
    const sb = sinon.createSandbox();
    try {
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
  "kept_memories": "testing"
}`,
          };
        },
      };
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const keptMemoriesList = await applyQualityAndSensitivityFilter(
        conversation,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(keptMemoriesList), "Should return an array");
      Assert.equal(keptMemoriesList.length, 0, "Should return an empty array");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests failed filter - Wrong outer schema (top-level key mismatch)
 */
add_task(
  async function test_applyQualityAndSensitivityFilter_sad_path_wrong_outer_schema() {
    const sb = sinon.createSandbox();
    try {
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
  "these_are_kept_memories": [
    "testing1", "testing2", "testing3"
  ]
}`,
          };
        },
      };
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const keptMemoriesList = await applyQualityAndSensitivityFilter(
        conversation,
        NEW_MEMORIES
      );

      Assert.ok(Array.isArray(keptMemoriesList), "Should return an array");
      Assert.equal(keptMemoriesList.length, 0, "Should return an empty array");
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests that reworded memories are dropped
 */
add_task(
  async function test_applyQualityAndSensitivityFilter_drops_reworded_memories() {
    const sb = sinon.createSandbox();
    try {
      // LLM reworded one memory and returned a verbatim-correct one
      const fakeEngine = {
        run() {
          return {
            finalOutput: `{
  "kept_memories": [
    "Loves hiking and camping",
    "Reads sci-fi novels"
  ]
}`,
          };
        },
      };
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const keptMemoriesList = await applyQualityAndSensitivityFilter(
        conversation,
        NEW_MEMORIES
      );

      Assert.equal(
        keptMemoriesList.length,
        1,
        "Only the verbatim memory should be kept"
      );
      Assert.equal(
        keptMemoriesList[0],
        "Loves hiking and camping",
        "Reworded memory should be dropped"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests mapping filtered memories back to full memory objects
 */
add_task(async function test_mapFilteredMemoriesToInitialList() {
  // Raw mock full memories object list
  const initialMemoriesList = [
    // Imagined duplicate - should have been filtered out
    {
      memory_summary: "Buys dog food online",
      tags: ["category:Pets & Animals", "intent:Buy / Acquire"],
    },
    // Sensitive content (stocks) - should have been filtered out
    {
      memory_summary: "Likes to invest in risky stocks",
      tags: ["category:News", "intent:Research / Learn"],
    },
    {
      memory_summary: "Enjoys strategy games",
      tags: ["category:Games", "intent: Entertain / Relax"],
    },
  ];

  // Mock list of good memories to keep
  const filteredMemoriesList = ["Enjoys strategy games"];

  const finalMemoriesList = await mapFilteredMemoriesToInitialList(
    initialMemoriesList,
    filteredMemoriesList
  );

  // Check that only the non-duplicate, non-sensitive memory remains
  Assert.equal(
    finalMemoriesList.length,
    1,
    "Final memories should contain 1 memory"
  );
  Assert.equal(
    finalMemoriesList[0].memory_summary,
    "Enjoys strategy games",
    "Final memory should match the filtered memory"
  );
  Assert.deepEqual(
    finalMemoriesList[0].tags,
    ["category:Games", "intent: Entertain / Relax"],
    "Final memory should have the expected tags"
  );
});

/**
 * Tests rendering of unified session bundles into prompt text.
 */
add_task(async function test_renderSessionsForPrompt() {
  const rendered = renderSessionsForPrompt(SAMPLE_SESSIONS);
  Assert.ok(
    rendered.includes("# Session 1 ("),
    "Should render a numbered, dated session header"
  );
  Assert.ok(rendered.includes("## Web Searches"), "Should render searches");
  Assert.ok(rendered.includes("- firefox history"), "Should list the query");
  Assert.ok(rendered.includes("## Website Titles"), "Should render titles");
  Assert.ok(
    rendered.includes("- Internet for people, not profit — Mozilla"),
    "Should list the title"
  );
  Assert.ok(rendered.includes("## Chat"), "Should render chat");
  Assert.ok(
    rendered.includes("- tell me about firefox"),
    "Should list the chat content"
  );

  // A session with no chat should omit the Chat section.
  const noChat = renderSessionsForPrompt([
    {
      session_start_ms: 1_700_000_000_000,
      session_end_ms: 1_700_000_500_000,
      search_queries: ["only a query"],
      titles: [],
      chats: [],
    },
  ]);
  Assert.ok(noChat.includes("## Web Searches"), "Should still render searches");
  Assert.ok(
    !noChat.includes("## Chat"),
    "Should omit Chat section when there are no chats"
  );
});

/**
 * Builds a fake engine whose `run()` returns a different canned payload per
 * call, matching the pipeline order: generate -> filter -> dedup.
 */
function makeSessionsPipelineEngine() {
  let callIndex = 0;
  return {
    run() {
      callIndex++;
      if (callIndex === 1) {
        // Step 1: initial generation.
        return {
          finalOutput: `[
  {
    "reasoning": "User likes dogs and cats.",
    "category": "Pets & Animals",
    "intent": "Entertain / Relax",
    "memory_summary": "Likes both dogs and cats",
    "score": 4,
    "evidence": []
  }
]`,
        };
      }
      if (callIndex === 2) {
        // Step 2: quality + sensitivity filter.
        return {
          finalOutput: `{ "kept_memories": ["Likes both dogs and cats"] }`,
        };
      }
      // Step 3: dedup.
      return {
        finalOutput: `{ "unique_memories": [{ "main_memory": "Likes both dogs and cats" }] }`,
      };
    },
  };
}

/**
 * Tests the batched sessions pipeline end-to-end: generate -> global filter ->
 * global dedup -> map, and that the watermark advances to the max processed
 * session end.
 */
add_task(async function test_runSessionMemoryPipeline_happy_path() {
  const sb = sinon.createSandbox();
  try {
    const fakeEngine = makeSessionsPipelineEngine();
    const conversation = new Conversation({
      feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
      model: TEST_MODEL,
      serviceType: SERVICE_TYPES.MEMORIES,
      purpose: PURPOSES.MEMORY_GENERATION,
      parameters: {},
      flowId: null,
      engine: fakeEngine,
    });

    const result = await runSessionMemoryPipeline(
      conversation,
      SAMPLE_SESSIONS,
      EXISTING_MEMORIES,
      { maxBatchRetries: 1 }
    );

    Assert.equal(result.memories.length, 1, "Should return one memory");
    Assert.equal(
      result.memories[0].memory_summary,
      "Likes both dogs and cats",
      "Should map the deduped summary back to the candidate"
    );
    Assert.equal(
      result.processedThroughMs,
      SAMPLE_SESSIONS[0].session_end_ms,
      "Watermark should advance to the max processed session end"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests that a rate-limited (429) batch aborts the pipeline by re-throwing, so
 * the caller can back off and the whole run is retried next time.
 */
add_task(
  async function test_runSessionMemoryPipeline_rate_limited_batch_throws() {
    const sb = sinon.createSandbox();
    try {
      const twoSessions = [
        { ...SAMPLE_SESSIONS[0], session_end_ms: 1_000 },
        { ...SAMPLE_SESSIONS[0], session_end_ms: 2_000 },
      ];

      let callIndex = 0;
      const fakeEngine = {
        run() {
          callIndex++;
          if (callIndex === 1) {
            // First batch generates one candidate.
            return {
              finalOutput: `[
  {
    "reasoning": "r",
    "category": "Pets & Animals",
    "intent": "Entertain / Relax",
    "memory_summary": "Likes both dogs and cats",
    "score": 4,
    "evidence": []
  }
]`,
            };
          }
          // Second batch is rate-limited -> the pipeline re-throws.
          throw Object.assign(new Error("rate limited"), { status: 429 });
        },
      };
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      await Assert.rejects(
        runSessionMemoryPipeline(conversation, twoSessions, EXISTING_MEMORIES, {
          batchSize: 1,
          maxBatchRetries: 1,
        }),
        /rate limited/,
        "A 429 during generation should propagate out of the pipeline"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests that a 429 from the quality+sensitivity filter step (after generation
 * succeeds) propagates out of the pipeline so the caller can back off.
 */
add_task(async function test_runSessionMemoryPipeline_filter_429_throws() {
  const sb = sinon.createSandbox();
  try {
    const oneSession = [{ ...SAMPLE_SESSIONS[0], session_end_ms: 1_000 }];

    let callIndex = 0;
    const fakeEngine = {
      run() {
        callIndex++;
        if (callIndex === 1) {
          // Generation succeeds.
          return {
            finalOutput: `[
  {
    "reasoning": "r",
    "category": "Pets & Animals",
    "intent": "Entertain / Relax",
    "memory_summary": "Likes both dogs and cats",
    "score": 4,
    "evidence": []
  }
]`,
          };
        }
        // Quality+sensitivity filter is rate-limited -> the pipeline re-throws.
        throw Object.assign(new Error("rate limited"), { status: 429 });
      },
    };
    const conversation = new Conversation({
      feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
      model: TEST_MODEL,
      serviceType: SERVICE_TYPES.MEMORIES,
      purpose: PURPOSES.MEMORY_GENERATION,
      parameters: {},
      flowId: null,
      engine: fakeEngine,
    });

    await Assert.rejects(
      runSessionMemoryPipeline(conversation, oneSession, EXISTING_MEMORIES, {
        batchSize: 1,
        maxBatchRetries: 1,
      }),
      /rate limited/,
      "A 429 from the filter step should propagate out of the pipeline"
    );
  } finally {
    sb.restore();
  }
});

/**
 * Tests that a deterministic (non-429) batch failure advances the watermark past
 * the failed batch: retrying it would only wedge the pipeline, so it is skipped.
 */
add_task(
  async function test_runSessionMemoryPipeline_deterministic_failure_skips_batch() {
    const sb = sinon.createSandbox();
    try {
      const twoSessions = [
        { ...SAMPLE_SESSIONS[0], session_end_ms: 1_000 },
        { ...SAMPLE_SESSIONS[0], session_end_ms: 2_000 },
      ];

      let callIndex = 0;
      const fakeEngine = {
        run() {
          callIndex++;
          if (callIndex === 1) {
            // First batch generates one candidate.
            return {
              finalOutput: `[
  {
    "reasoning": "r",
    "category": "Pets & Animals",
    "intent": "Entertain / Relax",
    "memory_summary": "Likes both dogs and cats",
    "score": 4,
    "evidence": []
  }
]`,
            };
          }
          if (callIndex === 2) {
            // Second batch fails deterministically -> skipped, watermark advances.
            throw new Error("simulated deterministic failure");
          }
          if (callIndex === 3) {
            return {
              finalOutput: `{ "kept_memories": ["Likes both dogs and cats"] }`,
            };
          }
          return {
            finalOutput: `{ "unique_memories": [{ "main_memory": "Likes both dogs and cats" }] }`,
          };
        },
      };
      const conversation = new Conversation({
        feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
        model: TEST_MODEL,
        serviceType: SERVICE_TYPES.MEMORIES,
        purpose: PURPOSES.MEMORY_GENERATION,
        parameters: {},
        flowId: null,
        engine: fakeEngine,
      });

      const result = await runSessionMemoryPipeline(
        conversation,
        twoSessions,
        EXISTING_MEMORIES,
        { batchSize: 1, maxBatchRetries: 1 }
      );

      Assert.equal(
        result.processedThroughMs,
        2_000,
        "Watermark should advance past the deterministically-failed batch"
      );
    } finally {
      sb.restore();
    }
  }
);

/**
 * Tests that source + source_ids are derived from evidence and joined back to
 * the session bundles client-side (cross-modal -> "session", real IDs attached).
 */
add_task(async function test_generateInitialMemoriesList_source_attribution() {
  const sb = sinon.createSandbox();
  try {
    const fakeEngine = {
      run() {
        return {
          finalOutput: `[
  {
    "reasoning": "Recurring vegan interest across browse and chat.",
    "category": "Food & Drink",
    "intent": "Research / Learn",
    "memory_summary": "Researches vegan meal prep",
    "score": 4,
    "evidence": [
      { "type": "search", "value": "vegan recipes" },
      { "type": "chat", "value": "vegan meal prep" }
    ]
  }
]`,
        };
      },
    };
    const conversation = new Conversation({
      feature: MODEL_FEATURES.MEMORIES_INITIAL_GENERATION_SYSTEM,
      model: TEST_MODEL,
      serviceType: SERVICE_TYPES.MEMORIES,
      purpose: PURPOSES.MEMORY_GENERATION,
      parameters: {},
      flowId: null,
      engine: fakeEngine,
    });

    const sessions = [
      {
        session_id: 1,
        session_start_ms: 1_700_000_000_000,
        session_end_ms: 1_700_000_500_000,
        search_queries: ["vegan recipes"],
        titles: [],
        chats: [{ content: "what's a good vegan meal prep for the week?" }],
        history_source_ids: ["h1"],
        conversation_source_ids: ["c1"],
      },
    ];

    const [memory] = await generateInitialMemoriesList(conversation, {
      sessions,
    });

    Assert.deepEqual(
      memory.sources,
      ["session"],
      "Cross-modal evidence (search + chat) should derive source 'session'"
    );
    Assert.deepEqual(
      memory.source_ids,
      { history_source_ids: ["h1"], conversation_source_ids: ["c1"] },
      "source_ids should be joined back from the matching session"
    );
    Assert.ok(
      !("evidence" in memory),
      "Transient evidence should be stripped before returning"
    );
  } finally {
    sb.restore();
  }
});

add_task(async function test_compute_memory_strength() {
  const memoryNotUserRequested = {
    type: MEMORY_TYPE_DURABLE_MEMORY,
    sources: ["history"],
    source_ids: {
      history_source_ids: [1, 2, 3],
      conversation_source_ids: [4, 5, 6],
    },
    lifetime_accessed_count: 2,
    merge_count: 4,
  };

  Assert.equal(
    computeMemoryStrength(memoryNotUserRequested),
    102.4,
    "Memory without the user request source and durable type should have the expected strength"
  );

  const memoryUserRequested = {
    type: MEMORY_TYPE_SHORT_TERM_MEMORY,
    sources: ["user_request"],
    source_ids: {
      history_source_ids: [1, 2, 3],
      conversation_source_ids: [4, 5, 6],
    },
    lifetime_accessed_count: 2,
    merge_count: 4,
  };

  Assert.equal(
    computeMemoryStrength(memoryUserRequested),
    17.4,
    "Memory with the user request source and short term type should have the expected strength"
  );
});

add_task(async function test_compute_memory_frecency() {
  const memoryAllZeros = {
    recent_accessed_counts: {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
    },
  };
  Assert.equal(
    computeMemoryFrecency(memoryAllZeros),
    0,
    "All zeros for all days in recent accessed counts should compute 0 frecency"
  );

  const memoryWithValues = {
    recent_accessed_counts: {
      0: 4,
      1: 3,
      2: 2,
      3: 1,
      4: 0,
      5: 0,
      6: 0,
    },
  };
  Assert.equal(
    computeMemoryFrecency(memoryWithValues).toFixed(2),
    8.14,
    "Some days with counts should compute the expected frecency"
  );
});
