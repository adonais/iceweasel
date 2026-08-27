/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MockMemoriesRetrieval } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const COFFEE_MEMORY = { id: "mem-1", memory_summary: "Likes coffee" };
const DOG_FOOD_MEMORY = { id: "mem-2", memory_summary: "Buys dog food online" };
const GAMES_MEMORY = { id: "mem-3", memory_summary: "Plays games online" };

// Shares a word with COFFEE_MEMORY's summary and none with the others, so
// retrieval returns the coffee memory alone.
const COFFEE_PROMPT = "I like coffee";

let gMemoriesRetrieval;

/**
 * Records `relevantMemories` on a user message the way injectMemoriesContext
 * does, so later turns can carry them forward.
 *
 * @param {ChatConversation} conversation
 * @param {string} body
 * @param {Array<{id: string, memory_summary: string}>} relevantMemories
 * @returns {ChatMessage}
 */
function addUserMessageWithRelevantMemories(
  conversation,
  body,
  relevantMemories
) {
  const message = conversation.addUserMessage(body);
  message.content.relevantMemories = relevantMemories;
  return message;
}

add_setup(async function install_mock_memories_retrieval() {
  gMemoriesRetrieval = new MockMemoriesRetrieval();

  registerCleanupFunction(async () => {
    await gMemoriesRetrieval.cleanupMocks();
  });
});

add_task(
  async function test_injectMemoriesContext_writes_to_userMessage_userContext() {
    await gMemoriesRetrieval.seedMemories([COFFEE_MEMORY, DOG_FOOD_MEMORY]);

    const conversation = new ChatConversation({});
    const userMessage = conversation.addUserMessage("hi");
    await conversation.injectMemoriesContext(userMessage, COFFEE_PROMPT);

    Assert.ok(
      userMessage.content.userContext.memoriesContext.includes(
        COFFEE_MEMORY.memory_summary
      ),
      "injectMemoriesContext writes content onto userMessage.content.userContext.memoriesContext"
    );
    Assert.deepEqual(
      userMessage.content.relevantMemories,
      [COFFEE_MEMORY],
      "injectMemoriesContext records the retrieved memories on the user message"
    );
  }
);

add_task(async function test_injectMemoriesContext_no_op_when_no_memories() {
  await gMemoriesRetrieval.clearMemories();

  const conversation = new ChatConversation({});
  const userMessage = conversation.addUserMessage("hi");
  await conversation.injectMemoriesContext(userMessage, "hello");

  Assert.ok(
    !userMessage.content.userContext?.memoriesContext,
    "Leaves userContext.memoriesContext unset when there is nothing to inject"
  );
});

/**
 * Tests relevant memories from prior messages are only pulled from those within the sliding window.
 */
add_task(
  async function test_injectMemoriesContext_passes_previous_message_memories() {
    await gMemoriesRetrieval.clearMemories();

    const conversation = new ChatConversation({});

    addUserMessageWithRelevantMemories(conversation, "turn 1", [COFFEE_MEMORY]);
    conversation.addAssistantMessage("text", "reply 1");
    addUserMessageWithRelevantMemories(conversation, "turn 2", [
      DOG_FOOD_MEMORY,
    ]);
    conversation.addAssistantMessage("text", "reply 2");
    addUserMessageWithRelevantMemories(conversation, "turn 3", [GAMES_MEMORY]);
    conversation.addAssistantMessage("text", "reply 3");
    const userMessage = conversation.addUserMessage("turn 4");

    await conversation.injectMemoriesContext(userMessage, "turn 4");

    const memoriesContext = userMessage.content.userContext.memoriesContext;
    Assert.ok(
      memoriesContext.includes(GAMES_MEMORY.memory_summary),
      "Injects the memories recorded for the preceding user message"
    );
    Assert.ok(
      memoriesContext.includes(DOG_FOOD_MEMORY.memory_summary),
      "Injects the memories recorded for the other user message in the window"
    );
    Assert.less(
      memoriesContext.indexOf(GAMES_MEMORY.memory_summary),
      memoriesContext.indexOf(DOG_FOOD_MEMORY.memory_summary),
      "Lists the previous user messages' memories newest message first"
    );
    Assert.ok(
      !memoriesContext.includes(COFFEE_MEMORY.memory_summary),
      "Drops the memories of user messages outside the window"
    );
  }
);

/**
 * Tests relevent memories message creation tolerates old conversations before the relevantMemories key was added.
 */
add_task(
  async function test_injectMemoriesContext_tolerates_messages_without_relevantMemories() {
    await gMemoriesRetrieval.clearMemories();

    const conversation = new ChatConversation({});

    // Message before this patch will not have the relevantMemories key
    const legacyMessage = conversation.addUserMessage("turn 1");
    legacyMessage.content = null;
    conversation.addUserMessage("turn 2");
    const userMessage = conversation.addUserMessage("turn 3");

    await conversation.injectMemoriesContext(userMessage, "turn 3");

    Assert.ok(
      !userMessage.content.userContext?.memoriesContext,
      "Treats messages with no recorded memories as contributing none, leaving nothing to inject"
    );

    // A newer message with memories still contributes alongside the legacy ones
    addUserMessageWithRelevantMemories(conversation, "turn 4", [COFFEE_MEMORY]);
    const laterMessage = conversation.addUserMessage("turn 5");

    await conversation.injectMemoriesContext(laterMessage, "turn 5");

    Assert.ok(
      laterMessage.content.userContext.memoriesContext.includes(
        COFFEE_MEMORY.memory_summary
      ),
      "Collects memories from the messages that have them"
    );
  }
);

/**
 * Tests the sliding window for prior messages respects an override argument.
 */
add_task(async function test_injectMemoriesContext_messageCount_override() {
  await gMemoriesRetrieval.clearMemories();

  function conversationWithTwoRecordedTurns() {
    const conversation = new ChatConversation({});
    addUserMessageWithRelevantMemories(conversation, "turn 1", [COFFEE_MEMORY]);
    addUserMessageWithRelevantMemories(conversation, "turn 2", [
      DOG_FOOD_MEMORY,
    ]);
    return { conversation, userMessage: conversation.addUserMessage("turn 3") };
  }

  // Gather relevant memories from 2 messages instead of the default
  const windowOfTwo = conversationWithTwoRecordedTurns();
  await windowOfTwo.conversation.injectMemoriesContext(
    windowOfTwo.userMessage,
    "turn 3",
    undefined,
    2
  );

  const memoriesContext =
    windowOfTwo.userMessage.content.userContext.memoriesContext;
  Assert.ok(
    memoriesContext.includes(DOG_FOOD_MEMORY.memory_summary),
    "A window of 2 reads the single preceding user message"
  );
  Assert.ok(
    !memoriesContext.includes(COFFEE_MEMORY.memory_summary),
    "A window of 2 reads no further back than that"
  );

  // Same but for 1
  const windowOfOne = conversationWithTwoRecordedTurns();
  await windowOfOne.conversation.injectMemoriesContext(
    windowOfOne.userMessage,
    "turn 3",
    undefined,
    1
  );

  Assert.ok(
    !windowOfOne.userMessage.content.userContext?.memoriesContext,
    "A window of 1 reads no previous messages rather than all of them"
  );
});

add_task(
  async function test_injectMemoriesContext_setsPrivateData_when_memoriesFound() {
    await gMemoriesRetrieval.seedMemories([COFFEE_MEMORY]);

    const conversation = new ChatConversation({});
    const userMessage = conversation.addUserMessage("hi");
    await conversation.injectMemoriesContext(userMessage, COFFEE_PROMPT);

    conversation.securityProperties.commit();
    Assert.ok(
      conversation.securityProperties.privateData,
      "privateData should be true after commit when memories were found"
    );
  }
);

add_task(
  async function test_injectMemoriesContext_doesNotSetPrivateData_when_noMemories() {
    await gMemoriesRetrieval.clearMemories();

    const conversation = new ChatConversation({});
    const userMessage = conversation.addUserMessage("hi");
    await conversation.injectMemoriesContext(userMessage, "hello");

    conversation.securityProperties.commit();
    Assert.ok(
      !conversation.securityProperties.privateData,
      "privateData should remain false when no memories were found"
    );
  }
);
