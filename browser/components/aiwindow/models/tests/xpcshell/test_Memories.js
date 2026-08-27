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
  applyQualityAndSensitivityFilter,
  computeMemoryStrength,
  classifyMemoryAndCapStrength,
  isShouldDeleteMemoryDueToDecay,
  computeMemoryFrecency,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/Memories.sys.mjs"
);

const {
  MEMORY_TYPE_SHORT_TERM_MEMORY,
  MEMORY_TYPE_LONG_TERM_MEMORY,
  MEMORY_TYPE_DURABLE_MEMORY,
  MEMORY_SENSITIVITY_CATEGORY_NOT_SENSITIVE,
  MEMORY_STRENGTH_LIFETIME_ACCESSED_HALFLIFE,
  MEMORY_STRENGTH_MERGE_COUNT_HALFLIFE,
  MEMORY_STRENGTH_EVIDENCE_CAP,
  MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_AGE_THRESHOLD,
  MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_STRENGTH_THRESHOLD,
  MEMORY_TYPE_LONG_TERM_TO_DURABLE_AGE_THRESHOLD,
  MEMORY_TYPE_LONG_TERM_TO_DURABLE_STRENGTH_THRESHOLD,
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

const NEW_MEMORIES = [
  "Loves hiking and camping",
  "Reads science fiction novels",
  "Likes both dogs and cats",
  "Likes risky stock bets",
];

const STRENGTH_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Converts a day offset into a timestamp that many days in the past. A null
 * offset passes through, matching what MemoryStore writes for a timestamp a
 * memory has never earned.
 *
 * @param {?number} days   Age in days, or null.
 * @returns {?number}      The timestamp, or null.
 */
const daysAgo = days =>
  days === null ? null : Date.now() - days * STRENGTH_DAY_MS;

/**
 * Builds a memory fixture for strength computation. Every strength input
 * defaults to its zero value, so each case below only declares the term it
 * exercises.
 *
 * @param {object} overrides
 * @param {Array<string>} overrides.sources                 Where the memory originated.
 * @param {number} overrides.historyEvidenceCount           Number of supporting history source ids.
 * @param {number} overrides.conversationEvidenceCount      Number of supporting conversation source ids.
 * @param {number} overrides.lifetimeAccessedCount          Lifetime usage count.
 * @param {?number} overrides.daysSinceAccessed             Age in days of last_accessed, or null for never used.
 * @param {number} overrides.mergeCount                     Number of merges.
 * @param {?number} overrides.daysSinceMerged               Age in days of last_merged, or null for never merged.
 * @param {number} overrides.daysSinceCreated               Age in days of created_at.
 * @returns {object}                                        Memory fixture.
 */
function makeStrengthMemory({
  sources = ["history"],
  historyEvidenceCount = 0,
  conversationEvidenceCount = 0,
  lifetimeAccessedCount = 0,
  daysSinceAccessed = null,
  mergeCount = 0,
  daysSinceMerged = null,
  daysSinceCreated = 0,
} = {}) {
  return {
    sources,
    source_ids: {
      history_source_ids: Array.from(
        { length: historyEvidenceCount },
        (_, index) => index
      ),
      conversation_source_ids: Array.from(
        { length: conversationEvidenceCount },
        (_, index) => `conversation-${index}`
      ),
    },
    created_at: daysAgo(daysSinceCreated),
    last_accessed: daysAgo(daysSinceAccessed),
    last_merged: daysAgo(daysSinceMerged),
    lifetime_accessed_count: lifetimeAccessedCount,
    merge_count: mergeCount,
  };
}

/**
 * Age and strength constants set relative to promotion thresholds
 */
const TIER_YOUNG_DAYS = MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_AGE_THRESHOLD - 1;
const TIER_MIDDLE_AGED_DAYS =
  MEMORY_TYPE_LONG_TERM_TO_DURABLE_AGE_THRESHOLD - 1;
const TIER_OLD_DAYS = MEMORY_TYPE_LONG_TERM_TO_DURABLE_AGE_THRESHOLD;
const TIER_STRONG = MEMORY_TYPE_LONG_TERM_TO_DURABLE_STRENGTH_THRESHOLD + 5;
const TIER_MIDDLING =
  MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_STRENGTH_THRESHOLD + 5;
const TIER_WEAK = MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_STRENGTH_THRESHOLD - 5;

/**
 * Builds the subset of a memory that classifyMemoryAndCapStrength reads. The
 * incoming type defaults to the weakest tier so promotions are visible; pass a
 * stronger one to exercise a demotion.
 *
 * @param {object} fields
 * @param {number} fields.daysSinceCreated    Age in days of created_at.
 * @param {number} fields.strength            Already-computed memory strength.
 * @param {string} fields.type                Memory type before assignment.
 * @returns {object}                          Memory fixture.
 */
function makeTieredMemory({
  daysSinceCreated,
  strength,
  type = MEMORY_TYPE_SHORT_TERM_MEMORY,
}) {
  return {
    type,
    strength,
    created_at: daysAgo(daysSinceCreated),
  };
}

/**
 * Builds a memory fixture and assigns its type in place, returning it so the
 * assertions below can read the result inline.
 *
 * @param {object} fields   Fields for {@link makeTieredMemory}.
 * @returns {object}        The assigned memory.
 */
function assignTieredMemoryType(fields) {
  const memory = makeTieredMemory(fields);
  classifyMemoryAndCapStrength(memory);
  return memory;
}

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
      firstMemory.component_summaries.length,
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
      { maxBatchRetries: 1 }
    );

    Assert.equal(result.memories.length, 1, "Should return one memory");
    Assert.equal(
      result.memories[0].memory_summary,
      "Likes both dogs and cats",
      "Should map the filtered summary back to the candidate"
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
        runSessionMemoryPipeline(conversation, twoSessions, {
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
      runSessionMemoryPipeline(conversation, oneSession, {
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

      const result = await runSessionMemoryPipeline(conversation, twoSessions, {
        batchSize: 1,
        maxBatchRetries: 1,
      });

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

/**
 * Tests computeMemoryStrength one term at a time, then all terms together.
 */
add_task(async function test_compute_memory_strength() {
  // 4 (floor)
  Assert.equal(
    computeMemoryStrength(makeStrengthMemory()).toFixed(2),
    4.0,
    "Memory with no evidence, accesses or merges should sit at the floor"
  );

  // 4 (floor) + 11 (user request)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({ sources: ["user_request"] })
    ).toFixed(2),
    15.0,
    "Memory added by user request should add the user request modifier to the floor"
  );

  // 4 (floor) + 6 * 0.3 (evidence)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({ historyEvidenceCount: 6 })
    ).toFixed(2),
    5.8,
    "Supporting evidence should add its weighted count to the floor"
  );

  // 4 (floor) + sqrt(4) * 0.5 * 5 (usage, one halflife elapsed)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        lifetimeAccessedCount: 4,
        daysSinceAccessed: MEMORY_STRENGTH_LIFETIME_ACCESSED_HALFLIFE,
      })
    ).toFixed(2),
    9.0,
    "Usage should add the square root of the count, halved after one accessed halflife"
  );

  // 4 (floor) + 2 * 0.5 * 4.5 (merges, one halflife elapsed)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        mergeCount: 2,
        daysSinceMerged: MEMORY_STRENGTH_MERGE_COUNT_HALFLIFE,
      })
    ).toFixed(2),
    8.5,
    "Merges should add their weighted count, halved after one merge halflife"
  );

  // 4 (floor) + 11 (user request) + 1.8 (evidence) + 5 (usage) + 4.5 (merges)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        sources: ["history", "user_request"],
        historyEvidenceCount: 6,
        lifetimeAccessedCount: 4,
        daysSinceAccessed: MEMORY_STRENGTH_LIFETIME_ACCESSED_HALFLIFE,
        mergeCount: 2,
        daysSinceMerged: MEMORY_STRENGTH_MERGE_COUNT_HALFLIFE,
      })
    ).toFixed(2),
    26.3,
    "Every strength term should sum together"
  );
});

/**
 * Tests that the evidence term counts ids from both source id lists and stops
 * growing once the evidence cap is reached.
 */
add_task(async function test_compute_memory_strength_evidence() {
  // 4 (floor) + (4 + 2) * 0.3 (evidence across both id lists)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        historyEvidenceCount: 4,
        conversationEvidenceCount: 2,
      })
    ).toFixed(2),
    5.8,
    "Evidence should be counted across both history and conversation source ids"
  );

  // 4 (floor) + 10 * 0.3 (evidence, exactly at the cap)
  const strengthAtCap = computeMemoryStrength(
    makeStrengthMemory({ historyEvidenceCount: MEMORY_STRENGTH_EVIDENCE_CAP })
  );
  Assert.equal(
    strengthAtCap.toFixed(2),
    7.0,
    "Evidence at the cap should add the full capped weight"
  );

  // 4 (floor) + (10 (cap) + 15 (more evidence on top)) * 0.3
  const strengthOverCap = computeMemoryStrength(
    makeStrengthMemory({
      historyEvidenceCount: MEMORY_STRENGTH_EVIDENCE_CAP + 15,
      conversationEvidenceCount: MEMORY_STRENGTH_EVIDENCE_CAP,
    })
  );
  Assert.equal(
    strengthOverCap.toFixed(2),
    strengthAtCap.toFixed(2),
    "Evidence beyond the cap should not add any further strength"
  );
});

/**
 * Tests that the usage and merge terms decay exponentially against their
 * halflives rather than dropping by a single fixed step.
 */
add_task(async function test_compute_memory_strength_decay() {
  // 4 (floor) + sqrt(4) * 1 * 5 (usage, no time elapsed)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({ lifetimeAccessedCount: 4, daysSinceAccessed: 0 })
    ).toFixed(2),
    14.0,
    "Usage just before the computation should add its undecayed weight"
  );

  // 4 (floor) + sqrt(4) * 0.25 * 5 (usage, two halflives elapsed)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        lifetimeAccessedCount: 4,
        daysSinceAccessed: 2 * MEMORY_STRENGTH_LIFETIME_ACCESSED_HALFLIFE,
      })
    ).toFixed(2),
    6.5,
    "Usage should decay to a quarter of its weight after two accessed halflives"
  );

  // 4 (floor) + 2 * 1 * 4.5 (merges, no time elapsed)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({ mergeCount: 2, daysSinceMerged: 0 })
    ).toFixed(2),
    13.0,
    "Merges just before the computation should add their undecayed weight"
  );

  // 4 (floor) + 2 * 0.25 * 4.5 (merges, two halflives elapsed)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        mergeCount: 2,
        daysSinceMerged: 2 * MEMORY_STRENGTH_MERGE_COUNT_HALFLIFE,
      })
    ).toFixed(2),
    6.25,
    "Merges should decay to a quarter of their weight after two merge halflives"
  );

  // 4 (floor), both terms decayed away
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        lifetimeAccessedCount: 4,
        daysSinceAccessed: 10000,
        mergeCount: 2,
        daysSinceMerged: 10000,
      })
    ).toFixed(2),
    4.0,
    "Usage and merges from many halflives ago should decay away back to the floor"
  );
});

/**
 * Tests the degenerate-but-persisted memory shapes MemoryStore can produce: a
 * null last_accessed or last_merged alongside a non-zero count, and a sources
 * list that could not be imputed.
 */
add_task(async function test_compute_memory_strength_missing_fields() {
  // 4 (floor) + sqrt(4) * 0.5 * 5 (usage decayed from created_at)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        lifetimeAccessedCount: 4,
        daysSinceAccessed: null,
        daysSinceCreated: MEMORY_STRENGTH_LIFETIME_ACCESSED_HALFLIFE,
      })
    ).toFixed(2),
    9.0,
    "A null last_accessed should decay the usage term from created_at"
  );

  // 4 (floor) + 2 * 0.5 * 4.5 (merges decayed from created_at)
  Assert.equal(
    computeMemoryStrength(
      makeStrengthMemory({
        mergeCount: 2,
        daysSinceMerged: null,
        daysSinceCreated: MEMORY_STRENGTH_MERGE_COUNT_HALFLIFE,
      })
    ).toFixed(2),
    8.5,
    "A null last_merged should decay the merge term from created_at"
  );

  // No sources
  Assert.equal(
    computeMemoryStrength(makeStrengthMemory({ sources: [] })).toFixed(2),
    4.0,
    "A memory with no imputed sources should sit at the floor"
  );
});

/**
 * Tests the ordering properties that the individual term values above cannot
 * pin down on their own: evidence only ever helps, and age only ever hurts.
 */
add_task(async function test_compute_memory_strength_monotonicity() {
  Assert.greater(
    computeMemoryStrength(makeStrengthMemory({ historyEvidenceCount: 6 })),
    computeMemoryStrength(makeStrengthMemory({ historyEvidenceCount: 3 })),
    "More supporting evidence should never compute a weaker memory"
  );

  Assert.greater(
    computeMemoryStrength(
      makeStrengthMemory({ lifetimeAccessedCount: 4, daysSinceAccessed: 0 })
    ),
    computeMemoryStrength(
      makeStrengthMemory({
        lifetimeAccessedCount: 4,
        daysSinceAccessed: 2 * MEMORY_STRENGTH_LIFETIME_ACCESSED_HALFLIFE,
      })
    ),
    "A staler last_accessed should compute a weaker memory for the same usage count"
  );
});

/**
 * Tests that a memory old enough for every tier is typed purely by strength.
 */
add_task(async function test_assign_memory_type_promotes_by_strength() {
  const strong = assignTieredMemoryType({
    daysSinceCreated: TIER_OLD_DAYS,
    strength: TIER_STRONG,
  });
  Assert.equal(
    strong.type,
    MEMORY_TYPE_DURABLE_MEMORY,
    "A memory past the durable age and strength thresholds should be durable"
  );
  Assert.equal(
    strong.strength,
    TIER_STRONG,
    "A memory that has aged into its tier should keep its computed strength"
  );

  Assert.equal(
    assignTieredMemoryType({
      daysSinceCreated: TIER_OLD_DAYS,
      strength: TIER_MIDDLING,
    }).type,
    MEMORY_TYPE_LONG_TERM_MEMORY,
    "An old memory that only clears the long term threshold should be long term"
  );

  Assert.equal(
    assignTieredMemoryType({
      daysSinceCreated: TIER_OLD_DAYS,
      strength: TIER_WEAK,
    }).type,
    MEMORY_TYPE_SHORT_TERM_MEMORY,
    "An old memory below every strength threshold should be short term"
  );
});

/**
 * Tests that a memory too young for a tier is denied it and has its strength
 * held at that tier's entry requirement.
 */
add_task(async function test_assign_memory_type_age_caps() {
  const youngAndStrong = assignTieredMemoryType({
    daysSinceCreated: TIER_YOUNG_DAYS,
    strength: TIER_STRONG,
  });
  Assert.equal(
    youngAndStrong.type,
    MEMORY_TYPE_SHORT_TERM_MEMORY,
    "A memory too young for the long term tier should stay short term however strong"
  );
  Assert.equal(
    youngAndStrong.strength,
    MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_STRENGTH_THRESHOLD,
    "A memory too young for the long term tier should be capped at its strength threshold"
  );

  const youngAndMiddling = assignTieredMemoryType({
    daysSinceCreated: TIER_YOUNG_DAYS,
    strength: TIER_MIDDLING,
  });
  Assert.equal(
    youngAndMiddling.type,
    MEMORY_TYPE_SHORT_TERM_MEMORY,
    "A young memory over only the long term threshold should still stay short term"
  );
  Assert.equal(
    youngAndMiddling.strength,
    MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_STRENGTH_THRESHOLD,
    "The long term cap should apply even when the durable cap is a no-op"
  );

  const youngAndWeak = assignTieredMemoryType({
    daysSinceCreated: TIER_YOUNG_DAYS,
    strength: TIER_WEAK,
  });
  Assert.equal(
    youngAndWeak.type,
    MEMORY_TYPE_SHORT_TERM_MEMORY,
    "A young memory below the long term threshold should stay short term"
  );
  Assert.equal(
    youngAndWeak.strength,
    TIER_WEAK,
    "A cap should never raise a strength that is already below it"
  );

  const middleAgedAndStrong = assignTieredMemoryType({
    daysSinceCreated: TIER_MIDDLE_AGED_DAYS,
    strength: TIER_STRONG,
  });
  Assert.equal(
    middleAgedAndStrong.type,
    MEMORY_TYPE_LONG_TERM_MEMORY,
    "A memory too young for the durable tier should stop at long term however strong"
  );
  Assert.equal(
    middleAgedAndStrong.strength,
    MEMORY_TYPE_LONG_TERM_TO_DURABLE_STRENGTH_THRESHOLD,
    "A memory too young for the durable tier should be capped at its strength threshold"
  );

  const middleAgedAndMiddling = assignTieredMemoryType({
    daysSinceCreated: TIER_MIDDLE_AGED_DAYS,
    strength: TIER_MIDDLING,
  });
  Assert.equal(
    middleAgedAndMiddling.type,
    MEMORY_TYPE_LONG_TERM_MEMORY,
    "A memory that has aged into the long term tier should be promoted into it"
  );
  Assert.equal(
    middleAgedAndMiddling.strength,
    TIER_MIDDLING,
    "A memory below the durable cap should keep its computed strength"
  );

  Assert.equal(
    assignTieredMemoryType({
      daysSinceCreated: TIER_MIDDLE_AGED_DAYS,
      strength: TIER_WEAK,
    }).type,
    MEMORY_TYPE_SHORT_TERM_MEMORY,
    "A middle aged memory below the long term threshold should stay short term"
  );
});

/**
 * Tests the threshold boundaries: strength must exceed a tier's requirement
 * rather than merely reach it, while age only has to reach it.
 */
add_task(async function test_assign_memory_type_thresholds() {
  Assert.equal(
    assignTieredMemoryType({
      daysSinceCreated: TIER_OLD_DAYS,
      strength: MEMORY_TYPE_LONG_TERM_TO_DURABLE_STRENGTH_THRESHOLD,
    }).type,
    MEMORY_TYPE_LONG_TERM_MEMORY,
    "Strength exactly at the durable threshold should not promote to durable"
  );

  Assert.equal(
    assignTieredMemoryType({
      daysSinceCreated: TIER_OLD_DAYS,
      strength: MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_STRENGTH_THRESHOLD,
    }).type,
    MEMORY_TYPE_SHORT_TERM_MEMORY,
    "Strength exactly at the long term threshold should not promote to long term"
  );

  Assert.equal(
    assignTieredMemoryType({
      daysSinceCreated: MEMORY_TYPE_SHORT_TERM_TO_LONG_TERM_AGE_THRESHOLD,
      strength: TIER_MIDDLING,
    }).type,
    MEMORY_TYPE_LONG_TERM_MEMORY,
    "Age exactly at the long term threshold should count as having aged into the tier"
  );
});

/**
 * Tests that a memory whose strength has fallen is demoted, and that the
 * assignment is made in place.
 */
add_task(async function test_assign_memory_type_demotes_by_strength() {
  Assert.equal(
    assignTieredMemoryType({
      daysSinceCreated: TIER_OLD_DAYS,
      strength: TIER_WEAK,
      type: MEMORY_TYPE_DURABLE_MEMORY,
    }).type,
    MEMORY_TYPE_SHORT_TERM_MEMORY,
    "A durable memory that has decayed below every threshold should be demoted to short term"
  );

  Assert.equal(
    assignTieredMemoryType({
      daysSinceCreated: TIER_OLD_DAYS,
      strength: TIER_MIDDLING,
      type: MEMORY_TYPE_DURABLE_MEMORY,
    }).type,
    MEMORY_TYPE_LONG_TERM_MEMORY,
    "A durable memory that has decayed past the durable threshold should be demoted to long term"
  );

  const memory = makeTieredMemory({
    daysSinceCreated: TIER_OLD_DAYS,
    strength: TIER_STRONG,
  });
  Assert.strictEqual(
    classifyMemoryAndCapStrength(memory),
    undefined,
    "The assignment should be made in place rather than returned"
  );
  Assert.equal(
    memory.type,
    MEMORY_TYPE_DURABLE_MEMORY,
    "The passed-in memory should have been mutated"
  );
});

add_task(async function test_memory_should_delete_due_to_decay() {
  const now = Date.now();

  const veryOldMemory = {
    last_accessed: 0,
    strength: 10,
  };
  Assert.ok(
    isShouldDeleteMemoryDueToDecay(veryOldMemory),
    "Very old memory with 10 strength should be flagged to decay"
  );

  const veryNewMemory = {
    last_accessed: now,
    strength: 10,
  };
  Assert.ok(
    !isShouldDeleteMemoryDueToDecay(veryNewMemory),
    "Very new memory with 10 strength shold not be flagged to decay"
  );

  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const lowStrengthMemoryFrom30DaysAgo = {
    last_accessed: thirtyDaysAgo,
    strength: 10,
  };
  Assert.ok(
    isShouldDeleteMemoryDueToDecay(lowStrengthMemoryFrom30DaysAgo),
    "Memory from 30 days ago with strength 10 should be flagged to decay"
  );
  const strongerMemoryFrom30DaysAgo = {
    last_accessed: thirtyDaysAgo,
    strength: 11,
  };
  Assert.ok(
    !isShouldDeleteMemoryDueToDecay(strongerMemoryFrom30DaysAgo),
    "Slightly strong memory from 30 days ago with strength 11 should not be flagged to decay"
  );

  const oldMemoryWithoutLastAccessed = {
    created_at: 0,
    strength: 10,
  };
  Assert.ok(
    isShouldDeleteMemoryDueToDecay(oldMemoryWithoutLastAccessed),
    "Old memory without last_accessed should fallback to created_at and be flagged to decay"
  );

  const newMemoryWithoutLastAccessed = {
    created_at: now,
    strength: 10,
  };
  Assert.ok(
    !isShouldDeleteMemoryDueToDecay(newMemoryWithoutLastAccessed),
    "New memory without last_accesssed should fallback to created_at and not be flagged to decay"
  );

  // A never-used memory is persisted with an explicit null rather than a missing
  // key, so the fallback has to treat the two the same way.
  const newMemoryWithNullLastAccessed = {
    created_at: now,
    last_accessed: null,
    strength: 10,
  };
  Assert.ok(
    !isShouldDeleteMemoryDueToDecay(newMemoryWithNullLastAccessed),
    "New memory with a null last_accessed should fallback to created_at and not be flagged to decay"
  );

  const oldMemoryWithNullLastAccessed = {
    created_at: 0,
    last_accessed: null,
    strength: 10,
  };
  Assert.ok(
    isShouldDeleteMemoryDueToDecay(oldMemoryWithNullLastAccessed),
    "Old memory with a null last_accessed should fallback to created_at and be flagged to decay"
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
