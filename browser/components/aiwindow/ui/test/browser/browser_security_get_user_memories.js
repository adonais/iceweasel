/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Security coverage for the get_user_memories tool. Memory summaries are
 * private user data, so a memories turn leaves privateData true; but they are
 * model-generated and length-capped at creation, so they surface verbatim and
 * untrustedInput stays false -- unlike untrusted web content (e.g. history
 * titles), which is escaped and spotlighted.
 *
 * Note on privateData: the current-tab context (about:blank) attached to every
 * smartbar submit raises privateData on its own, independent of the tool. So
 * privateData true after a turn is a conversation-level outcome, not proof the
 * tool ran. The uncheatable proof that the tool actually executed is the
 * returned summary data (order, set, soft-delete filtering, verbatim text).
 */

/**
 * @type {import("../AIWindowTestUtils.sys.mjs")}
 */
const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { GET_USER_MEMORIES } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs"
);

const { MemoryStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/services/MemoryStore.sys.mjs"
);

const { MemoriesManager } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesManager.sys.mjs"
);

/**
 * @import { ChatConversation } from "../../modules/ChatConversation.sys.mjs"
 */

const MAX_MEMORY_SUMMARY_LENGTH = 100;

const MAX_LENGTH_SUMMARY = "A".repeat(MAX_MEMORY_SUMMARY_LENGTH);

const OVER_LENGTH_SUMMARY = "D".repeat(MAX_MEMORY_SUMMARY_LENGTH + 10);

const QUOTES_SUMMARY = `Quotes a "favourite" line and a \\ backslash`;

const SOFT_DELETED_SUMMARY = "Soft-deleted secret memory";

const USER_MESSAGE = "What do you remember about me?";

const DISABLED_MEMORIES_ERROR =
  "ERROR: get_user_memories tool call error: inform the user that they have disabled memories, so they cannot be retrieved.";

/** Remove every memory, including soft-deleted, for a clean store. */
async function clearAllMemories() {
  const memories = await MemoryStore.getMemories({ includeSoftDeleted: true });
  for (const memory of memories) {
    await MemoryStore.hardDeleteMemory(memory.id);
  }
}

add_setup(async function () {
  await clearAllMemories();

  // Stub relevant-memory injection to exercise only the tool path and avoid the
  // embeddings model network call.
  const relevantMemoriesStub = sinon
    .stub(MemoriesManager, "getRelevantMemories")
    .resolves([]);

  registerCleanupFunction(() => relevantMemoriesStub.restore());
  registerCleanupFunction(clearAllMemories);
});

/**
 * Wait for and return the get_user_memories tool result message.
 *
 * @param {ChatConversation} conversation
 */
async function waitForGetUserMemoriesResult(conversation) {
  return TestUtils.waitForCondition(
    () =>
      conversation.messages.find(
        m =>
          m.role === MESSAGE_ROLE.TOOL && m.content?.name === GET_USER_MEMORIES
      ),
    "A tool result for get_user_memories should be added to the conversation."
  );
}

/**
 * Arrange: open the AI window and capture the conversation-starter request,
 * returning the freshly-created conversation BEFORE any user message is sent so
 * a caller can guard the starting flag state. Shared by every task so the setup
 * is identical and not hand-rolled per test.
 *
 * @param {MockEngineManager} mockEngineManager
 * @returns {Promise<{win: object, sidebarBrowser: object, conversation: ChatConversation}>}
 */
async function openMemoriesConversation(mockEngineManager) {
  // Install the mock before opening the AI window so the sidebar
  // conversation-starter request is captured instead of hitting the backend.
  const { win, sidebarBrowser } = await openAIWindowWithSidebar();

  await mockEngineManager.respondTo({
    purpose: "convo-starters-sidebar",
    response: USER_MESSAGE,
  });

  /** @type {ChatConversation} */
  const conversation = await TestUtils.waitForCondition(
    () => AIWindow.getActiveConversation(win),
    "Conversation should exist on the active AI window before submit."
  );

  return { win, sidebarBrowser, conversation };
}

/**
 * Submit the memories question in the smartbar.
 *
 * @param {object} sidebarBrowser
 */
async function submitMemoriesQuestion(sidebarBrowser) {
  info("Submit a user message in the smartbar.");
  await typeInSmartbar(sidebarBrowser, USER_MESSAGE);
  await submitSmartbar(sidebarBrowser);
}

/**
 * Drive a chat turn whose mocked model emits a get_user_memories tool_call.
 *
 * @param {object} options
 * @param {MockEngineManager} options.mockEngineManager
 * @param {ChatConversation} options.conversation
 * @param {string} options.callId
 */
async function runGetUserMemoriesToolCall({
  mockEngineManager,
  conversation,
  callId,
}) {
  await mockEngineManager.respondTo({
    purpose: "chat",
    response: {
      text: "",
      tokens: null,
      isPrompt: false,
      toolCalls: [
        {
          id: callId,
          function: { name: GET_USER_MEMORIES, arguments: "{}" },
        },
      ],
    },
  });

  return waitForGetUserMemoriesResult(conversation);
}

add_task(async function test_get_user_memories_returns_summaries_in_order() {
  await clearAllMemories();
  const visibleMemories = [
    {
      memory_summary: "Loves drinking coffee",
      category: "Food & Drink",
      intent: "Plan / Organize",
      reasoning: "Frequently orders coffee online for pickup",
      score: 3,
      updated_at: 3000,
    },
    {
      memory_summary: QUOTES_SUMMARY,
      category: "Books",
      intent: "Entertain / Relax",
      reasoning: "Saves literary quotes",
      score: 5,
      updated_at: 1000,
    },
    {
      memory_summary: MAX_LENGTH_SUMMARY,
      category: "Reading",
      intent: "Learn / Research",
      reasoning: "Reads long-form articles end to end",
      score: 4,
      updated_at: 4000,
    },
    {
      memory_summary: OVER_LENGTH_SUMMARY,
      category: "Reading",
      intent: "Learn / Research",
      reasoning: "Over the summary length cap; surfaced verbatim at read time",
      score: 2,
      updated_at: 2000,
    },
  ];
  for (const memory of visibleMemories) {
    await MemoryStore.addMemory(memory);
  }

  // Most-recent-first is the documented default sort (updated_at desc).
  const expectedSummariesInOrder = [
    MAX_LENGTH_SUMMARY, // updated_at 4000
    "Loves drinking coffee", // updated_at 3000
    OVER_LENGTH_SUMMARY, // updated_at 2000
    QUOTES_SUMMARY, // updated_at 1000
  ];

  // A soft-deleted memory with the newest timestamp: if the soft-delete filter
  // were removed it would sort to the front, so its absence proves filtering.
  const deleted = await MemoryStore.addMemory({
    memory_summary: SOFT_DELETED_SUMMARY,
    category: "Food & Drink",
    intent: "Plan / Organize",
    reasoning: "Deleted data must never resurface",
    score: 5,
    updated_at: 9000,
  });
  await MemoryStore.softDeleteMemory(deleted.id);

  const mockEngineManager = new MockEngineManager();
  const { win, sidebarBrowser, conversation } =
    await openMemoriesConversation(mockEngineManager);

  Assert.equal(
    conversation.securityProperties.privateData,
    false,
    "privateData starts false on a fresh conversation."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput starts false on a fresh conversation."
  );

  await submitMemoriesQuestion(sidebarBrowser);
  const toolMessage = await runGetUserMemoriesToolCall({
    mockEngineManager,
    conversation,
    callId: "call_get_user_memories_1",
  });

  const body = toolMessage.content.body;
  Assert.ok(Array.isArray(body), "Tool result body is an array.");

  Assert.ok(
    body.every(entry => typeof entry === "string"),
    "Every returned memory is a summary string, not a record object."
  );

  Assert.deepEqual(
    body,
    expectedSummariesInOrder,
    "Returns exactly the non-deleted summaries, most-recent-updated first."
  );

  Assert.ok(
    !body.includes(SOFT_DELETED_SUMMARY),
    "A soft-deleted memory is never returned to the model."
  );

  Assert.equal(
    body.find(s => s.startsWith("D")),
    OVER_LENGTH_SUMMARY,
    "An over-length summary is returned verbatim, with no read-time truncation."
  );

  Assert.equal(
    body.find(s => s.includes("favourite")),
    QUOTES_SUMMARY,
    "A summary with quotes and backslashes is surfaced exactly as stored."
  );

  Assert.equal(
    conversation.securityProperties.privateData,
    true,
    "privateData is true after a memories turn (private user data surfaced)."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput stays false for get_user_memories."
  );

  Assert.deepEqual(
    [...conversation.seenUrls].sort(),
    ["about:blank"],
    "get_user_memories tracks no URLs; only the implicit about:blank mention."
  );

  mockEngineManager.rejectAllRequests();
  mockEngineManager.cleanupMocks();
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_get_user_memories_empty_store() {
  await clearAllMemories();

  const mockEngineManager = new MockEngineManager();
  const { win, sidebarBrowser, conversation } =
    await openMemoriesConversation(mockEngineManager);

  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput starts false on a fresh conversation."
  );

  await submitMemoriesQuestion(sidebarBrowser);
  const toolMessage = await runGetUserMemoriesToolCall({
    mockEngineManager,
    conversation,
    callId: "call_get_user_memories_empty_1",
  });

  Assert.deepEqual(
    toolMessage.content.body,
    [],
    "Returns an empty array when no memories are stored."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput stays false with no memories."
  );

  mockEngineManager.rejectAllRequests();
  mockEngineManager.cleanupMocks();
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_get_user_memories_blocked_when_disabled() {
  await clearAllMemories();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.memories.generateFromConversation", false],
      ["browser.smartwindow.memories.generateFromHistory", false],
    ],
  });

  const mockEngineManager = new MockEngineManager();
  const { win, sidebarBrowser, conversation } =
    await openMemoriesConversation(mockEngineManager);

  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput starts false before the blocked tool call."
  );

  await submitMemoriesQuestion(sidebarBrowser);
  const toolMessage = await runGetUserMemoriesToolCall({
    mockEngineManager,
    conversation,
    callId: "call_get_user_memories_disabled_1",
  });

  Assert.equal(
    typeof toolMessage.content.body,
    "string",
    "Blocked tool result body is an error string, not a memory data array."
  );
  Assert.equal(
    toolMessage.content.body,
    DISABLED_MEMORIES_ERROR,
    "The tool result is exactly the disabled-memories error, so getUserMemories never ran."
  );

  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput stays false because the blocked tool never surfaced memories."
  );

  mockEngineManager.rejectAllRequests();
  mockEngineManager.cleanupMocks();
  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});
