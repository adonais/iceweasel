/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

do_get_profile();

const { ChatStore, ChatConversation } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);

const { createParserState } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/TokenStreamParser.sys.mjs"
);

const { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

// Must stay above STREAM_PERSIST_INTERVAL_MS in ChatStore.sys.mjs, so a
// coalesced write that was not cancelled has time to land.
const PAST_PERSIST_INTERVAL_MS = 1500;

/**
 * See test_ChatStoreToolResults.js.
 *
 * @param {Function} func - The test function to run
 */
function add_atomic_task(func) {
  return add_task(async function () {
    Services.prefs.setBoolPref(
      "browser.smartwindow.removeDatabaseOnStartup",
      true
    );
    await ChatStore.destroyDatabase();

    try {
      await func();
    } finally {
      Services.prefs.clearUserPref(
        "browser.smartwindow.removeDatabaseOnStartup"
      );
      await ChatStore.destroyDatabase();
    }
  });
}

/**
 * Counts the full-conversation writes made while streaming, which is what this
 * path exists to avoid.
 */
function countFullWrites() {
  const original = ChatStore.updateConversation;
  let count = 0;
  ChatStore.updateConversation = function (...args) {
    count++;
    return original.apply(this, args);
  };
  return {
    get count() {
      return count;
    },
    restore() {
      delete ChatStore.updateConversation;
    },
  };
}

/**
 * Builds a conversation with a user turn and the empty assistant message a
 * reply streams into, matching the state ai-window.mjs sets up before
 * fetchWithHistory runs. Nothing is persisted, so the first chunk is also the
 * conversation's first write.
 *
 * @returns {object}
 */
function startTurn() {
  const conversation = new ChatConversation({});
  conversation.addUserMessage("Tell me about Firefox", null);
  conversation.addAssistantMessage("text", "");
  return {
    conversation,
    message: conversation.messages.at(-1),
    parserState: createParserState(),
  };
}

function streamChunks(turn, chunks) {
  for (const chunk of chunks) {
    turn.conversation.handleChunk(chunk, turn.message, turn.parserState);
  }
}

async function reloadAssistant(conversation, message) {
  const reloaded = await ChatStore.findConversationById(conversation.id);
  return reloaded?.messages.find(m => m.id === message.id);
}

add_atomic_task(async function test_chunks_coalesce_into_one_full_write() {
  const turn = startTurn();
  const writes = countFullWrites();

  try {
    streamChunks(turn, ["Firefox ", "is ", "a ", "browser", "."]);
    await ChatStore.endStreamingWrites(turn.conversation.id);

    Assert.equal(
      writes.count,
      1,
      "Five chunks write the whole conversation once, not once per chunk"
    );
  } finally {
    writes.restore();
  }

  const assistant = await reloadAssistant(turn.conversation, turn.message);
  Assert.equal(
    assistant.content.body,
    "Firefox is a browser.",
    "The flush persists everything streamed after the first chunk"
  );
});

add_atomic_task(async function test_first_chunk_persists_the_whole_turn() {
  // The narrow write's foreign keys need the conversation row and the
  // streaming message's parent, and nothing persists before the first chunk.
  const turn = startTurn();
  streamChunks(turn, ["Hello"]);
  await ChatStore.endStreamingWrites(turn.conversation.id);

  const reloaded = await ChatStore.findConversationById(turn.conversation.id);
  Assert.equal(
    reloaded.messages.length,
    2,
    "The user message is persisted alongside the streaming one"
  );
  Assert.equal(
    reloaded.messages.at(-1).content.body,
    "Hello",
    "The streamed body is persisted"
  );
});

add_atomic_task(async function test_flush_keeps_an_interrupted_stream() {
  // An aborted stream never reaches receiveResponse's updateConversation, so
  // the flush is the only thing that keeps the partial reply.
  const turn = startTurn();
  streamChunks(turn, ["Partial ", "answer"]);
  await ChatStore.endStreamingWrites(turn.conversation.id);

  const assistant = await reloadAssistant(turn.conversation, turn.message);
  Assert.equal(
    assistant.content.body,
    "Partial answer",
    "An aborted stream keeps what it streamed"
  );
});

add_atomic_task(async function test_narrow_write_persists_stream_tokens() {
  // addTokens fills webSearchQueries and memoriesApplied as chunks arrive, so
  // the narrow write has to carry them too, not just the body.
  const turn = startTurn();
  streamChunks(turn, ["Looking "]);
  turn.message.addTokens([
    { key: "search", value: "firefox release notes" },
    { key: "existing_memory", value: "memory-1" },
  ]);
  streamChunks(turn, ["that up"]);
  await ChatStore.endStreamingWrites(turn.conversation.id);

  const assistant = await reloadAssistant(turn.conversation, turn.message);
  Assert.deepEqual(
    assistant.webSearchQueries,
    ["firefox release notes"],
    "Search tokens collected mid-stream are persisted"
  );
  Assert.deepEqual(
    assistant.memoriesApplied,
    ["memory-1"],
    "Memory tokens collected mid-stream are persisted"
  );
  Assert.equal(assistant.content.body, "Looking that up", "The body is intact");
});

add_atomic_task(async function test_delete_cancels_a_coalesced_write() {
  const turn = startTurn();
  streamChunks(turn, ["Doomed ", "reply"]);

  await ChatStore.deleteConversationById(turn.conversation.id);
  Assert.equal(
    await ChatStore.findConversationById(turn.conversation.id),
    null,
    "The conversation is gone once deleted"
  );

  // What is under test is that no write remains scheduled, so there is no
  // event to listen for; the interval has to be allowed to elapse.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, PAST_PERSIST_INTERVAL_MS));
  Assert.equal(
    await ChatStore.findConversationById(turn.conversation.id),
    null,
    "No coalesced write fires afterwards to resurrect it"
  );
});

add_atomic_task(async function test_second_message_streams_after_the_first() {
  // A turn with tool calls streams into a fresh assistant message, so the
  // store has to retire the previous message's coalesced write and start over.
  const turn = startTurn();
  streamChunks(turn, ["First ", "reply"]);
  await ChatStore.endStreamingWrites(turn.conversation.id);

  const second = turn.conversation.addAssistantMessage("text", "");
  const secondTurn = {
    conversation: turn.conversation,
    message: second,
    parserState: createParserState(),
  };
  streamChunks(secondTurn, ["Second ", "reply"]);
  await ChatStore.endStreamingWrites(turn.conversation.id);

  const reloaded = await ChatStore.findConversationById(turn.conversation.id);
  Assert.equal(
    reloaded.messages.find(m => m.id === turn.message.id).content.body,
    "First reply",
    "The earlier message keeps its body"
  );
  Assert.equal(
    reloaded.messages.find(m => m.id === second.id).content.body,
    "Second reply",
    "The later message is persisted too"
  );
});
