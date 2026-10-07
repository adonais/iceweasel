/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { ATTENTION_KINDS, MONITOR_ATTENTION_LIFETIME_MS, MonitorAttention } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/ui/modules/MonitorAttention.sys.mjs"
  );

const NOW = 1_800_000_000_000;
const MATCH = ATTENTION_KINDS.MATCH;
const ERROR = ATTENTION_KINDS.ERROR;

add_task(function test_parse_rejects_anything_unrecognized() {
  Assert.deepEqual(MonitorAttention.parseEntries(""), [], "Nothing stored");
  Assert.deepEqual(
    MonitorAttention.parseEntries("not json"),
    [],
    "Unparseable"
  );
  Assert.deepEqual(
    MonitorAttention.parseEntries(JSON.stringify({ "monitor-1": NOW })),
    [],
    "The shape this pref held before it had to carry an order"
  );
});

add_task(function test_parse_keeps_good_entries_beside_bad_ones() {
  Assert.deepEqual(
    MonitorAttention.parseEntries(
      JSON.stringify([
        { id: "monitor-1", at: NOW, kind: ERROR },
        null,
        { at: NOW },
        { id: "monitor-2", at: "not a number" },
        { id: "monitor-3", at: NOW - 1, kind: MATCH },
      ])
    ),
    [
      { id: "monitor-1", at: NOW, kind: ERROR },
      { id: "monitor-3", at: NOW - 1, kind: MATCH },
    ],
    "Malformed entries are skipped, valid ones survive in order"
  );
});

add_task(function test_parse_only_fills_in_a_missing_kind() {
  Assert.deepEqual(
    MonitorAttention.parseEntries(
      JSON.stringify([
        // Written before the dot covered failed checks.
        { id: "monitor-1", at: NOW },
        // Written by a build that knows a kind this one does not.
        { id: "monitor-2", at: NOW, kind: "something else" },
      ])
    ),
    [
      { id: "monitor-1", at: NOW, kind: MATCH },
      { id: "monitor-2", at: NOW, kind: "something else" },
    ],
    "A missing kind is a match; an unknown one is left as it was stored"
  );
});

add_task(function test_an_unknown_kind_is_not_promoted_to_a_match() {
  try {
    Services.prefs.setStringPref(
      "browser.smartwindow.agent.monitorAttention",
      JSON.stringify([{ id: "monitor-1", at: Date.now(), kind: "from-later" }])
    );
    Assert.deepEqual(
      MonitorAttention.attentionIds,
      ["monitor-1"],
      "It still has something to say, so the dot stays lit"
    );
    Assert.deepEqual(
      MonitorAttention.matchedIds,
      [],
      "But the panel does not list it under New matches"
    );
  } finally {
    MonitorAttention.clearAttention();
  }
});

add_task(function test_unexpired_drops_only_what_has_lapsed() {
  const matches = [
    { id: "fresh", at: NOW - 1000 },
    { id: "stale", at: NOW - MONITOR_ATTENTION_LIFETIME_MS - 1 },
    { id: "edge", at: NOW - MONITOR_ATTENTION_LIFETIME_MS + 1 },
  ];
  Assert.deepEqual(
    MonitorAttention.unexpiredIds(matches, NOW),
    ["fresh", "edge"],
    "A match past its lifetime stops being advertised"
  );
  Assert.deepEqual(
    MonitorAttention.unexpiredIds([], NOW),
    [],
    "No matches, nothing to say"
  );
});

add_task(function test_with_entry_keeps_one_entry_per_monitor() {
  // Same millisecond throughout: the order has to come from how the entries
  // were stored, not from comparing their timestamps afterwards.
  let matches = MonitorAttention.withEntry([], "monitor-1", MATCH, NOW);
  matches = MonitorAttention.withEntry(matches, "monitor-2", MATCH, NOW);
  Assert.deepEqual(
    MonitorAttention.unexpiredIds(matches, NOW),
    ["monitor-2", "monitor-1"],
    "Newest match first even when the timestamps tie"
  );

  matches = MonitorAttention.withEntry(matches, "monitor-1", MATCH, NOW);
  Assert.deepEqual(
    MonitorAttention.unexpiredIds(matches, NOW),
    ["monitor-1", "monitor-2"],
    "Matching again moves the monitor to the front rather than duplicating it"
  );
});

add_task(function test_with_entry_does_not_mutate_its_input() {
  const matches = [{ id: "monitor-1", at: NOW }];
  const next = MonitorAttention.withEntry(matches, "monitor-2", MATCH, NOW);
  Assert.deepEqual(
    matches,
    [{ id: "monitor-1", at: NOW }],
    "The caller's list is left alone"
  );
  Assert.equal(next.length, 2, "The returned list has both");
});

add_task(function test_error_lights_the_dot_but_is_not_a_match() {
  try {
    MonitorAttention.recordError("monitor-1");
    Assert.ok(
      MonitorAttention.hasAttention,
      "A failed check is worth the dot on its own"
    );
    Assert.deepEqual(
      MonitorAttention.attentionIds,
      ["monitor-1"],
      "The failed monitor is what the dot is about"
    );
    Assert.deepEqual(
      MonitorAttention.matchedIds,
      [],
      "It is not offered to the panel as a new match"
    );

    MonitorAttention.recordMatch("monitor-2");
    Assert.deepEqual(
      MonitorAttention.attentionIds,
      ["monitor-2", "monitor-1"],
      "Matches and failures share the dot, newest first"
    );
    Assert.deepEqual(
      MonitorAttention.matchedIds,
      ["monitor-2"],
      "Only the match is offered to the panel"
    );

    // The same monitor is one entry whichever way its last run went.
    MonitorAttention.recordMatch("monitor-1");
    Assert.deepEqual(
      MonitorAttention.matchedIds,
      ["monitor-1", "monitor-2"],
      "A monitor that failed and then matched is a match"
    );

    MonitorAttention.clearAttention();
    Assert.ok(
      !MonitorAttention.hasAttention,
      "Clearing retires failures as well as matches"
    );
  } finally {
    MonitorAttention.clearAttention();
  }
});
