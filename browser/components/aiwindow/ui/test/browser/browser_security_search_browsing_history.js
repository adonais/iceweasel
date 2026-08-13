/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * End-to-end security coverage for the search_browsing_history tool: a mocked
 * model emits the tool_call, exercising the real Chat -> Tools path against
 * seeded Places history. Semantic search is disabled so the tool takes the
 * basic Places path, avoiding the need to stand up an ML embedding engine.
 */

/**
 * @type {import("../AIWindowTestUtils.sys.mjs")}
 */
const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

const { SEARCH_BROWSING_HISTORY } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

const { MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatEnums.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

/**
 * @import { ChatConversation } from "../../modules/ChatConversation.sys.mjs"
 */

// Mirror the tool's own limits so the assertions track the implementation.
const MAX_METADATA_LENGTH = 100;
const MAX_HISTORY_RESULTS = 15;

// Token embedded in every seeded URL so the basic Places search matches exactly
// the entries this test creates, independent of their titles.
const SEARCH_KEYWORD = "zzhistsec";

// The only fields a history record is allowed to expose. favicon and thumbnail
// are UI-only (heavy, page-controlled): searchBrowsingHistory builds the
// model-facing rows from this exact allowlist, so those fields never enter the
// tool body. The history grid renders them from a separate addHistoryResults
// channel instead.
const MODEL_ALLOWED_RECORD_FIELDS = [
  "title",
  "url",
  "visitDate",
  "visitCount",
  "relevanceScore",
];

/**
 * Fail if a tool-body history record carries any field beyond the allowlist.
 * The body is built from MODEL_ALLOWED_RECORD_FIELDS, so favicon/thumbnail must
 * never appear here.
 *
 * @param {object} record
 */
function assertBodyRecordFields(record) {
  Assert.ok(
    !("thumbnail" in record),
    "Tool-body history record never carries thumbnail."
  );
  Assert.ok(
    !("favicon" in record),
    "Tool-body history record never carries favicon."
  );
  Assert.deepEqual(
    Object.keys(record).sort(),
    [...MODEL_ALLOWED_RECORD_FIELDS].sort(),
    "History record body exposes exactly the allowed fields."
  );
}

/**
 * Prove the UI/model split is deliberate, not incidental. The same tool run that
 * strips thumbnail/favicon from the model payload routes them to the UI history
 * grid via addHistoryResults; getHistoryResultsSnapshot exposes that channel.
 * Asserting the keys are PRESENT here (even when null) shows the model-side
 * stripping is an allowlist decision, not an artifact of the data never existing
 * - so a regression that dropped the UI dispatch breaks this while the model-side
 * check still passes.
 *
 * @param {ChatConversation} conversation
 * @param {string[]} expectedUrls
 */
function assertUiChannelCarriesThumbnailFavicon(conversation, expectedUrls) {
  const byUrl = new Map(
    conversation.getHistoryResultsSnapshot().map(r => [r.url, r])
  );
  for (const url of expectedUrls) {
    const record = byUrl.get(url);
    Assert.ok(record, `UI history grid received a record for ${url}.`);
    Assert.ok(
      "thumbnail" in record,
      "UI-channel record carries the thumbnail key the model must not see."
    );
    Assert.ok(
      "favicon" in record,
      "UI-channel record carries the favicon key the model must not see."
    );
  }
}

/**
 * The leak tripwire: inspect the search_browsing_history tool message exactly as
 * it is serialized for the model and fail if a record carries a field the model
 * must never see. searchBrowsingHistory builds the body from an allowlist, so
 * favicon and thumbnail can never appear; if that allowlist regresses, this
 * breaks before it can ship.
 *
 * @param {ChatConversation} conversation
 */
function assertModelHistoryPayloadSanitized(conversation) {
  const toolMessage = conversation
    .getMessagesInChatCompletionsFormat()
    .find(m => m.role === "tool" && m.name === SEARCH_BROWSING_HISTORY);
  Assert.ok(
    toolMessage,
    "The search_browsing_history result is serialized into the model messages."
  );

  const payload = JSON.parse(toolMessage.content);
  for (const record of payload.results) {
    Assert.ok(
      !("thumbnail" in record),
      "Model-facing history record never carries thumbnail."
    );
    Assert.ok(
      !("favicon" in record),
      "Model-facing history record never carries favicon."
    );
    const extra = Object.keys(record).filter(
      key => !MODEL_ALLOWED_RECORD_FIELDS.includes(key)
    );
    Assert.deepEqual(
      extra,
      [],
      "Model-facing history record exposes only the allowed fields."
    );
  }
}

add_setup(async function () {
  // Disable the semantic feature gate to force the basic Places path (semantic
  // search would require an ML embedding engine).
  await SpecialPowers.pushPrefEnv({
    set: [["places.semanticHistory.smartwindow.featureGate", false]],
  });
  await lazy.PlacesUtils.history.clear();
  registerCleanupFunction(async () => {
    await lazy.PlacesUtils.history.clear();
  });
});

/**
 * Seed browsing history with strictly decreasing visit dates (array order =
 * newest first). Each URL carries SEARCH_KEYWORD so the basic search matches it.
 *
 * @param {Array<{url: string, title: string}>} entries
 */
async function seedHistory(entries) {
  await lazy.PlacesUtils.history.clear();
  const now = Date.now();
  await lazy.PlacesUtils.history.insertMany(
    entries.map((entry, index) => ({
      url: entry.url,
      title: entry.title,
      visits: [{ date: new Date(now - index) }],
    }))
  );
}

/**
 * Wait for the search_browsing_history tool result message, then return it.
 *
 * @param {ChatConversation} conversation
 */
async function waitForSearchHistoryResult(conversation) {
  return TestUtils.waitForCondition(
    () =>
      conversation.messages.find(
        m =>
          m.role === MESSAGE_ROLE.TOOL &&
          m.content?.name === SEARCH_BROWSING_HISTORY
      ),
    "A tool result for search_browsing_history should be added to the conversation."
  );
}

/**
 * Drive one chat turn where the mocked model emits a search_browsing_history
 * tool_call with the given arguments, then return the tool result message.
 *
 * @param {object} options
 * @param {MockEngineManager} options.mockEngineManager
 * @param {ChatConversation} options.conversation
 * @param {string} options.callId
 * @param {{ searchTerm?: string }} options.toolArguments
 */
async function runSearchHistoryToolCall({
  mockEngineManager,
  conversation,
  callId,
  toolArguments,
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
          function: {
            name: SEARCH_BROWSING_HISTORY,
            arguments: JSON.stringify(toolArguments),
          },
        },
      ],
    },
  });

  return waitForSearchHistoryResult(conversation);
}

/**
 * End to end: searchTerm actually filters (a decoy without the term is dropped);
 * titles are spotlighted, truncated, and escaped; a missing title falls back to
 * the URL; the model-facing record exposes only the allowlist while the UI
 * channel keeps thumbnail/favicon; flags transition (privateData -> true,
 * untrustedInput stays false); and every returned URL is tracked in seenUrls.
 */
add_task(async function test_search_browsing_history_returns_sanitized_data() {
  const shortTitle = "Short History Article";
  const longTitle = "B".repeat(MAX_METADATA_LENGTH + 10);
  const trickyTitle = `Sneaky "quote" and \\ backslash`;

  const shortUrl = `https://example.com/${SEARCH_KEYWORD}/short`;
  const longUrl = `https://example.com/${SEARCH_KEYWORD}/long`;
  const trickyUrl = `https://example.com/${SEARCH_KEYWORD}/tricky`;
  const noTitleUrl = `https://example.com/${SEARCH_KEYWORD}/no-title`;
  const decoyUrl = "https://example.com/unrelated/decoy";

  await seedHistory([
    { url: shortUrl, title: shortTitle },
    { url: longUrl, title: longTitle },
    { url: trickyUrl, title: trickyTitle },
    { url: noTitleUrl, title: "" },
    { url: decoyUrl, title: "Completely unrelated page" },
  ]);

  const mockEngineManager = new MockEngineManager();
  const { win, sidebarBrowser } = await openAIWindowWithSidebar();

  await mockEngineManager.respondTo({
    purpose: "convo-starters-sidebar",
    response: "What have I looked at recently?",
  });

  info("Submit a user message in the smartbar.");
  await typeInSmartbar(sidebarBrowser, "What have I looked at recently?");
  await submitSmartbar(sidebarBrowser);

  /** @type {ChatConversation} */
  const conversation = await TestUtils.waitForCondition(
    () => AIWindow.getActiveConversation(win),
    "Conversation should be created when the first message is sent."
  );

  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput starts false."
  );

  const toolMessage = await runSearchHistoryToolCall({
    mockEngineManager,
    conversation,
    callId: "call_search_history_1",
    toolArguments: { searchTerm: SEARCH_KEYWORD },
  });

  const body = toolMessage.content.body;

  Assert.equal(body.searchTerm, SEARCH_KEYWORD, "searchTerm is echoed back.");

  const results = body.results;
  Assert.equal(
    results.length,
    4,
    "Only the keyword-matching entries are returned; the decoy is excluded."
  );
  Assert.equal(body.count, 4, "count reflects the four matching entries.");

  const byUrl = new Map(results.map(r => [r.url, r]));

  Assert.ok(
    !byUrl.has(decoyUrl),
    "The non-matching decoy entry is filtered out of the results."
  );

  for (const record of results) {
    assertBodyRecordFields(record);
  }

  const recordShort = byUrl.get(shortUrl);
  const recordLong = byUrl.get(longUrl);
  const recordTricky = byUrl.get(trickyUrl);
  const recordNoTitle = byUrl.get(noTitleUrl);

  // The expected string is spelled out rather than recomputed with the
  // sanitizer the tool uses, so the test can't agree with a broken sanitizer.
  Assert.equal(
    recordShort.title,
    `"${shortTitle}" (Untrusted webpage data)`,
    "Short title is wrapped in quotes and suffixed with the spotlighting tag."
  );

  Assert.equal(
    recordLong.title,
    `"${"B".repeat(MAX_METADATA_LENGTH)}…" (Untrusted webpage data)`,
    "Long title is truncated to MAX_METADATA_LENGTH, ellipsized, and spotlighted."
  );
  Assert.ok(
    !recordLong.title.includes("B".repeat(MAX_METADATA_LENGTH + 1)),
    "No content past the truncation cap leaks through."
  );

  // Quotes/backslashes are escaped so a title can't break out of the wrapper.
  Assert.ok(
    recordTricky.title.includes('\\"quote\\"'),
    "Embedded double quotes are backslash-escaped."
  );
  Assert.ok(
    recordTricky.title.includes("\\\\"),
    "Embedded backslashes are escaped."
  );

  Assert.equal(
    recordNoTitle.title,
    `"${noTitleUrl}" (Untrusted webpage data)`,
    "A missing title falls back to the (sanitized) URL."
  );

  Assert.equal(
    conversation.securityProperties.privateData,
    true,
    "privateData becomes true once history enters the conversation."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput stays false because titles are truncated and spotlighted."
  );

  Assert.deepEqual(
    [...conversation.seenUrls].sort(),
    ["about:blank", shortUrl, longUrl, trickyUrl, noTitleUrl].sort(),
    "seenUrls contains exactly about:blank plus the matching history URLs, not the decoy."
  );

  assertModelHistoryPayloadSanitized(conversation);

  assertUiChannelCarriesThumbnailFavicon(conversation, [
    shortUrl,
    longUrl,
    trickyUrl,
    noTitleUrl,
  ]);

  mockEngineManager.rejectAllRequests();
  mockEngineManager.cleanupMocks();
  await BrowserTestUtils.closeWindow(win);
});

/**
 * An empty searchTerm takes the separate time-range path (no text filter).
 * Verifies it applies the same sanitization, exposes no extra fields, flips the
 * flags the same way, and tracks returned URLs in seenUrls.
 */
add_task(
  async function test_search_browsing_history_empty_term_time_range_path() {
    const plainTitle = "Recent History Title";
    const longTitle = "C".repeat(MAX_METADATA_LENGTH + 10);

    const plainUrl = `https://example.com/${SEARCH_KEYWORD}/recent`;
    const longUrl = `https://example.com/${SEARCH_KEYWORD}/recent-long`;

    await seedHistory([
      { url: plainUrl, title: plainTitle },
      { url: longUrl, title: longTitle },
    ]);

    // Install the mock before opening the AI window so the sidebar
    // conversation-starter request is captured instead of hitting the backend.
    const mockEngineManager = new MockEngineManager();
    const { win, sidebarBrowser } = await openAIWindowWithSidebar();

    await mockEngineManager.respondTo({
      purpose: "convo-starters-sidebar",
      response: "What did I look at lately?",
    });

    await typeInSmartbar(sidebarBrowser, "What did I look at lately?");
    await submitSmartbar(sidebarBrowser);

    /** @type {ChatConversation} */
    const conversation = await TestUtils.waitForCondition(
      () => AIWindow.getActiveConversation(win),
      "Conversation should be created when the first message is sent."
    );

    // Empty searchTerm exercises the time-range path, not the text search.
    const toolMessage = await runSearchHistoryToolCall({
      mockEngineManager,
      conversation,
      callId: "call_search_history_timerange_1",
      toolArguments: { searchTerm: "" },
    });

    const body = toolMessage.content.body;
    Assert.equal(body.searchTerm, "", "searchTerm is the empty string.");

    const byUrl = new Map(body.results.map(r => [r.url, r]));
    Assert.ok(
      byUrl.has(plainUrl) && byUrl.has(longUrl),
      "Both seeded entries are returned by the time-range path."
    );

    for (const record of body.results) {
      assertBodyRecordFields(record);
    }

    Assert.equal(
      byUrl.get(plainUrl).title,
      `"${plainTitle}" (Untrusted webpage data)`,
      "Plain title is sanitized on the time-range path too."
    );
    Assert.equal(
      byUrl.get(longUrl).title,
      `"${"C".repeat(MAX_METADATA_LENGTH)}…" (Untrusted webpage data)`,
      "Long title is truncated and spotlighted on the time-range path too."
    );
    Assert.ok(
      !byUrl.get(longUrl).title.includes("C".repeat(MAX_METADATA_LENGTH + 1)),
      "No content past the truncation cap leaks through on the time-range path."
    );

    Assert.equal(
      conversation.securityProperties.privateData,
      true,
      "privateData becomes true on the time-range path."
    );
    Assert.equal(
      conversation.securityProperties.untrustedInput,
      false,
      "untrustedInput stays false on the time-range path."
    );

    for (const url of [plainUrl, longUrl]) {
      Assert.ok(
        conversation.seenUrls.has(url),
        `Returned history URL ${url} is tracked in seenUrls.`
      );
    }

    assertModelHistoryPayloadSanitized(conversation);

    mockEngineManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    await BrowserTestUtils.closeWindow(win);
  }
);

/**
 * When nothing matches, the tool returns the distinct no-results shape
 * { searchTerm, count: 0, results: [], message }. Pins that shape, confirms the
 * message echoes only the model-supplied searchTerm, no URLs are tracked, and
 * privateData still flips while untrustedInput stays false.
 */
add_task(async function test_search_browsing_history_no_results_shape() {
  // No history at all guarantees an empty result for any non-empty term.
  await lazy.PlacesUtils.history.clear();

  // Install the mock before opening the AI window so the sidebar
  // conversation-starter request is captured instead of hitting the backend.
  const mockEngineManager = new MockEngineManager();
  const { win, sidebarBrowser } = await openAIWindowWithSidebar();

  await mockEngineManager.respondTo({
    purpose: "convo-starters-sidebar",
    response: "Find something in my history.",
  });

  await typeInSmartbar(sidebarBrowser, "Find something in my history.");
  await submitSmartbar(sidebarBrowser);

  /** @type {ChatConversation} */
  const conversation = await TestUtils.waitForCondition(
    () => AIWindow.getActiveConversation(win),
    "Conversation should be created when the first message is sent."
  );

  const missingTerm = "nonexistent-history-term";
  const toolMessage = await runSearchHistoryToolCall({
    mockEngineManager,
    conversation,
    callId: "call_search_history_empty_1",
    toolArguments: { searchTerm: missingTerm },
  });

  const body = toolMessage.content.body;

  Assert.equal(body.count, 0, "count is zero when nothing matches.");
  Assert.deepEqual(body.results, [], "results is an empty array.");
  Assert.ok(
    body.message.includes(missingTerm),
    "The no-results message echoes the model-supplied searchTerm."
  );

  // No history was read, so seenUrls only has the implicit about:blank mention.
  Assert.deepEqual(
    [...conversation.seenUrls].sort(),
    ["about:blank"],
    "No history URLs are tracked when there are no results."
  );

  // Querying history surfaces the fact it was queried, so privateData flips.
  Assert.equal(
    conversation.securityProperties.privateData,
    true,
    "privateData flips to true even when there are no results."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput stays false when there are no results."
  );

  mockEngineManager.rejectAllRequests();
  mockEngineManager.cleanupMocks();
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Seeds MAX_HISTORY_RESULTS + 5 matching entries and verifies the result is
 * capped at MAX_HISTORY_RESULTS, with the expected flag transitions.
 */
add_task(async function test_search_browsing_history_caps_results() {
  const total = MAX_HISTORY_RESULTS + 5;
  const seeded = [];
  for (let i = 0; i < total; i++) {
    seeded.push({
      url: `https://example.com/${SEARCH_KEYWORD}/entry-${i}`,
      title: `History entry ${i}`,
    });
  }
  await seedHistory(seeded);

  // Install the mock before opening the AI window so the sidebar
  // conversation-starter request is captured instead of hitting the backend.
  const mockEngineManager = new MockEngineManager();
  const { win, sidebarBrowser } = await openAIWindowWithSidebar();

  await mockEngineManager.respondTo({
    purpose: "convo-starters-sidebar",
    response: "Show me my history.",
  });

  await typeInSmartbar(sidebarBrowser, "Show me my history.");
  await submitSmartbar(sidebarBrowser);

  /** @type {ChatConversation} */
  const conversation = await TestUtils.waitForCondition(
    () => AIWindow.getActiveConversation(win),
    "Conversation should be created when the first message is sent."
  );

  const toolMessage = await runSearchHistoryToolCall({
    mockEngineManager,
    conversation,
    callId: "call_search_history_cap_1",
    toolArguments: { searchTerm: SEARCH_KEYWORD },
  });

  const { results } = toolMessage.content.body;

  Assert.equal(
    results.length,
    MAX_HISTORY_RESULTS,
    "At most MAX_HISTORY_RESULTS history entries are returned even when more match."
  );

  for (const record of results) {
    assertBodyRecordFields(record);
    Assert.ok(
      conversation.seenUrls.has(record.url),
      `Returned URL ${record.url} is tracked in seenUrls.`
    );
  }

  Assert.equal(
    conversation.securityProperties.privateData,
    true,
    "privateData becomes true once history enters the conversation."
  );
  Assert.equal(
    conversation.securityProperties.untrustedInput,
    false,
    "untrustedInput stays false for search_browsing_history."
  );

  // Even at the cap, no record reaches the model with thumbnail/favicon.
  assertModelHistoryPayloadSanitized(conversation);

  mockEngineManager.rejectAllRequests();
  mockEngineManager.cleanupMocks();
  await BrowserTestUtils.closeWindow(win);
});

/**
 * End-to-end from a fresh conversation, captured before submit (both flags
 * false): pins the transition the tool itself owns - privateData true,
 * untrustedInput stays false. The other tasks capture the conversation after
 * the turn is already underway, so they only guard untrustedInput.
 */
add_task(
  async function test_search_browsing_history_raises_private_data_flag() {
    const isolatedUrl = `https://example.com/${SEARCH_KEYWORD}/isolated`;
    await seedHistory([{ url: isolatedUrl, title: "Isolated history entry" }]);
    const mockEngineManager = new MockEngineManager();
    const { win, sidebarBrowser } = await openAIWindowWithSidebar();

    await mockEngineManager.respondTo({
      purpose: "convo-starters-sidebar",
      response: "What have I looked at recently?",
    });

    /** @type {ChatConversation} */
    const conversation = await TestUtils.waitForCondition(
      () => AIWindow.getActiveConversation(win),
      "Conversation should exist on the active AI window before submit."
    );
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

    await typeInSmartbar(sidebarBrowser, "What have I looked at recently?");
    await submitSmartbar(sidebarBrowser);

    const toolMessage = await runSearchHistoryToolCall({
      mockEngineManager,
      conversation,
      callId: "call_search_history_private_flag_1",
      toolArguments: { searchTerm: SEARCH_KEYWORD },
    });

    Assert.equal(
      conversation.securityProperties.privateData,
      true,
      "privateData flips to true once the tool surfaces history."
    );
    Assert.equal(
      conversation.securityProperties.untrustedInput,
      false,
      "untrustedInput stays false; the tool never introduces untrusted input."
    );

    const { results } = toolMessage.content.body;
    Assert.ok(results.length, "The seeded entry is returned.");
    for (const record of results) {
      assertBodyRecordFields(record);
      Assert.ok(
        conversation.seenUrls.has(record.url),
        `Returned history URL ${record.url} is tracked in seenUrls.`
      );
    }

    mockEngineManager.rejectAllRequests();
    mockEngineManager.cleanupMocks();
    await BrowserTestUtils.closeWindow(win);
  }
);
