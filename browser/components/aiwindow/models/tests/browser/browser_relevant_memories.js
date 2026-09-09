/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { constructRelevantMemoriesContextMessage } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/ChatUtils.sys.mjs"
);
const { MemoriesManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs"
);
const { MemoryStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/services/MemoryStore.sys.mjs"
);
const { DEFAULT_RELEVANT_MEMORIES_SIMILARITY_THRESHOLD } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/memories/MemoriesConstants.sys.mjs"
  );
const { MockMemoriesRetrieval } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const COFFEE_MEMORY = {
  id: "food_drink.16ec1838",
  memory_summary: "Loves drinking coffee",
};
const DOG_FOOD_MEMORY = {
  id: "pets_animals.4a91cd02",
  memory_summary: "Buys dog food online",
};

let gMemoriesRetrieval;

add_setup(async function install_mock_memories_retrieval() {
  gMemoriesRetrieval = new MockMemoriesRetrieval();

  registerCleanupFunction(async () => {
    await gMemoriesRetrieval.cleanupMocks();
  });
});

/**
 * Tests that the relevant memories context message is constructed when a relevant memory
 * set is found for the latest user message.
 */
add_task(async function test_constructRelevantMemoriesContextMessage() {
  await gMemoriesRetrieval.seedMemories([COFFEE_MEMORY, DOG_FOOD_MEMORY]);

  const relevantMemoriesContextMessage =
    await constructRelevantMemoriesContextMessage("I love drinking coffee");

  // Check relevantMemoriesContextMessage's top level structure
  Assert.strictEqual(
    typeof relevantMemoriesContextMessage,
    "object",
    "Should return an object"
  );
  Assert.deepEqual(
    Object.keys(relevantMemoriesContextMessage).sort(),
    ["message", "relevantMemories"],
    "Should have the message and relevantMemories keys"
  );

  Assert.ok(
    relevantMemoriesContextMessage.message.content.includes(
      "# Existing Memories"
    ),
    "Should include prompt template text"
  );
  Assert.ok(
    relevantMemoriesContextMessage.message.content.includes(
      COFFEE_MEMORY.memory_summary
    ),
    "Should include memory content about coffee"
  );
  Assert.deepEqual(
    relevantMemoriesContextMessage.relevantMemories,
    [COFFEE_MEMORY],
    "Should return the memories retrieved for this message"
  );
});

/**
 * Tests that no relevant memories message is constructed when both the latest and prior user
 * messages did not have any relevant memories.
 */
add_task(
  async function test_constructRelevantMemoriesContextMessage_no_relevant_memories() {
    await gMemoriesRetrieval.seedMemories([COFFEE_MEMORY, DOG_FOOD_MEMORY]);

    const relevantMemoriesContextMessage =
      await constructRelevantMemoriesContextMessage("how tall is that tower?");

    // No relevant memories, so returned value should be null
    Assert.equal(
      relevantMemoriesContextMessage,
      null,
      "Should return null when there are no relevant memories"
    );
  }
);

/**
 * Tests that relevant memory message construction includes relevant memories from prior user messages,
 * not just the latest one.
 */
add_task(
  async function test_constructRelevantMemoriesContextMessage_includes_previous_memories() {
    await gMemoriesRetrieval.seedMemories([COFFEE_MEMORY, DOG_FOOD_MEMORY]);

    const { message, relevantMemories } =
      await constructRelevantMemoriesContextMessage(
        "I love drinking coffee",
        [DOG_FOOD_MEMORY] // Memory retrieved for a prior message
      );

    Assert.ok(
      message.content.includes(DOG_FOOD_MEMORY.memory_summary),
      "Should include a memory carried over from a previous message"
    );
    Assert.less(
      message.content.indexOf(COFFEE_MEMORY.memory_summary),
      message.content.indexOf(DOG_FOOD_MEMORY.memory_summary),
      "Memories for the current message should be listed before older ones"
    );
    Assert.deepEqual(
      relevantMemories,
      [COFFEE_MEMORY],
      "Should return only the memories retrieved for this message, so the window stays sliding rather than cumulative"
    );
  }
);

/**
 * Tests that relevant memories message construction deduplicates relevant memories if a
 * memory appears in the relevant set for the current and prior user messages.
 */
add_task(
  async function test_constructRelevantMemoriesContextMessage_dedupes_previous_memories() {
    await gMemoriesRetrieval.seedMemories([COFFEE_MEMORY, DOG_FOOD_MEMORY]);

    const { message, relevantMemories } =
      await constructRelevantMemoriesContextMessage("I love drinking coffee", [
        COFFEE_MEMORY,
        DOG_FOOD_MEMORY,
      ]);

    Assert.equal(
      relevantMemories.length,
      1,
      "Should return 1 relevant memory for the current message"
    );

    Assert.equal(
      message.content.split(COFFEE_MEMORY.memory_summary).length - 1,
      1,
      "A memory relevant to several messages should only be listed once"
    );
    Assert.ok(
      message.content.includes(DOG_FOOD_MEMORY.memory_summary),
      "Other carried over memories should still be listed"
    );
  }
);

/**
 * Tests that relevant memory message construction still has relevant memories from prior messages
 * even if the latest user message does not have any relevant memories.
 */
add_task(
  async function test_constructRelevantMemoriesContextMessage_only_previous_memories() {
    await gMemoriesRetrieval.seedMemories([COFFEE_MEMORY, DOG_FOOD_MEMORY]);

    const { message, relevantMemories } =
      await constructRelevantMemoriesContextMessage("what about that one?", [
        DOG_FOOD_MEMORY,
      ]);

    Assert.ok(
      message.content.includes(DOG_FOOD_MEMORY.memory_summary),
      "Should still inject context built only from previous messages' memories"
    );
    Assert.deepEqual(
      relevantMemories,
      [],
      "Should record no memories for a message that matched none"
    );
  }
);
