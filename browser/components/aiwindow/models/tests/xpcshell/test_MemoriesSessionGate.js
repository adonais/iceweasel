/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { runHeuristicGate } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesSessionGate.sys.mjs"
);
const { GATE_KEEP, GATE_SKIP } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesConstants.sys.mjs"
);

/**
 * Build a session bundle with sensible defaults. Override any field.
 *
 * @param {object} [overrides]  Fields to override on the default session.
 * @returns {object}            A session bundle for the gate under test.
 */
function makeSession(overrides = {}) {
  return {
    session_id: 1,
    session_start_ms: 0,
    session_end_ms: 0,
    visit_count: 0,
    search_count: 0,
    chat_count: 0,
    total_view_time_ms: 0,
    chats: [],
    history_source_ids: [],
    conversation_source_ids: [],
    domains: [],
    titles: [],
    search_queries: [],
    ...overrides,
  };
}

add_task(async function test_empty_session_skipped() {
  const result = runHeuristicGate(makeSession());
  Assert.equal(result.decision, GATE_SKIP);
  Assert.equal(result.reason, "empty session");
});

add_task(async function test_serp_bounce_no_queries_skipped() {
  const result = runHeuristicGate(
    makeSession({
      visit_count: 0,
      search_count: 2,
      domains: ["www.google.com"],
    })
  );
  Assert.equal(result.decision, GATE_SKIP);
  Assert.equal(result.reason, "search-engine pages with no queries");
});

add_task(
  async function test_search_engine_with_queries_kept_when_high_intent() {
    // The user's "active research" pattern: 11 searches on google.com.
    const result = runHeuristicGate(
      makeSession({
        search_count: 11,
        domains: ["www.google.com"],
        search_queries: [
          "vegan recipes",
          "tofu marinades",
          "high-protein vegan",
          "vegan meal prep",
        ],
      })
    );
    Assert.equal(result.decision, GATE_KEEP);
  }
);

add_task(async function test_nav_only_domains_skipped() {
  const result = runHeuristicGate(
    makeSession({
      visit_count: 3,
      domains: ["accounts.google.com", "auth0.com"],
    })
  );
  Assert.equal(result.decision, GATE_SKIP);
  Assert.equal(result.reason, "only navigation/auth domains");
});

add_task(async function test_high_intent_passes_without_dwell() {
  const result = runHeuristicGate(
    makeSession({
      search_count: 5,
      total_view_time_ms: 0,
      domains: ["www.bing.com"],
      search_queries: ["a", "b", "c", "d", "e"],
    })
  );
  Assert.equal(result.decision, GATE_KEEP);
});

add_task(async function test_single_query_no_visit_handed_to_llm() {
  // Single-query "ephemeral" lookups (weather, conversions, fact checks)
  // are no longer rejected by structure. Content-quality judgment is the
  // downstream LLM step's responsibility.
  const result = runHeuristicGate(
    makeSession({
      search_count: 1,
      visit_count: 0,
      total_view_time_ms: 5_000,
      domains: ["duckduckgo.com"],
      search_queries: ["weather"],
    })
  );
  Assert.equal(result.decision, GATE_KEEP);
});

add_task(async function test_low_view_time_with_meaningful_title_kept() {
  // A real article title is enough to send the session to the LLM; the
  // heuristic does not judge dwell time on its own.
  const result = runHeuristicGate(
    makeSession({
      visit_count: 1,
      total_view_time_ms: 10_000,
      domains: ["example.com"],
      titles: ["This Is A Real Article Title"],
    })
  );
  Assert.equal(result.decision, GATE_KEEP);
});

add_task(async function test_no_meaningful_titles_skipped() {
  const result = runHeuristicGate(
    makeSession({
      visit_count: 3,
      total_view_time_ms: 90_000,
      domains: ["example.com"],
      titles: ["Sign in", "Loading...", "Untitled"],
    })
  );
  Assert.equal(result.decision, GATE_SKIP);
  Assert.equal(result.reason, "no meaningful titles or queries");
});

add_task(async function test_single_page_with_meaningful_title_kept() {
  // One page with a meaningful title is enough to send the session to
  // the LLM; dwell time alone does not gate.
  const result = runHeuristicGate(
    makeSession({
      visit_count: 1,
      total_view_time_ms: 65_000,
      domains: ["example.com"],
      titles: ["A Meaningful Article About Things"],
    })
  );
  Assert.equal(result.decision, GATE_KEEP);
});

add_task(async function test_substantive_browse_kept() {
  const result = runHeuristicGate(
    makeSession({
      visit_count: 5,
      total_view_time_ms: 300_000,
      domains: ["example.com", "blog.example.com"],
      titles: ["A Meaningful Article About Things", "Another Substantive Read"],
    })
  );
  Assert.equal(result.decision, GATE_KEEP);
});

add_task(async function test_chat_only_trivial_skipped() {
  const result = runHeuristicGate(
    makeSession({
      chat_count: 3,
      chats: [{ content: "hi" }, { content: "thanks" }, { content: "ok" }],
    })
  );
  Assert.equal(result.decision, GATE_SKIP);
  Assert.equal(result.reason, "trivial messages only");
});

add_task(async function test_chat_only_substantive_kept() {
  const result = runHeuristicGate(
    makeSession({
      chat_count: 1,
      chats: [
        { content: "What's a good vegan meal prep strategy for the week?" },
      ],
    })
  );
  Assert.equal(result.decision, GATE_KEEP);
});

add_task(async function test_mixed_both_trivial_skipped() {
  const result = runHeuristicGate(
    makeSession({
      visit_count: 1,
      total_view_time_ms: 5_000,
      domains: ["example.com"],
      titles: ["Sign in"],
      chat_count: 1,
      chats: [{ content: "hi" }],
    })
  );
  Assert.equal(result.decision, GATE_SKIP);
  Assert.ok(result.reason.includes("browse:"));
  Assert.ok(result.reason.includes("chat:"));
});

add_task(async function test_mixed_substantive_browse_carries_trivial_chat() {
  const result = runHeuristicGate(
    makeSession({
      visit_count: 5,
      total_view_time_ms: 300_000,
      domains: ["example.com"],
      titles: ["A Meaningful Article About Things"],
      chat_count: 1,
      chats: [{ content: "ok" }],
    })
  );
  Assert.equal(result.decision, GATE_KEEP);
});

add_task(async function test_mixed_substantive_chat_carries_trivial_browse() {
  const result = runHeuristicGate(
    makeSession({
      visit_count: 1,
      total_view_time_ms: 5_000,
      domains: ["example.com"],
      titles: ["Sign in"],
      chat_count: 1,
      chats: [
        { content: "What's a good vegan meal prep strategy for the week?" },
      ],
    })
  );
  Assert.equal(result.decision, GATE_KEEP);
});

add_task(async function test_nav_title_pattern_filtered() {
  // Auth-flow titles get filtered when checking for meaningful content.
  const result = runHeuristicGate(
    makeSession({
      visit_count: 3,
      total_view_time_ms: 90_000,
      domains: ["github.com"],
      titles: ["Two-factor authentication", "Device Activation", "Authorize"],
    })
  );
  Assert.equal(result.decision, GATE_SKIP);
  Assert.equal(result.reason, "no meaningful titles or queries");
});
