/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MONITOR_ATTENTION_LIFETIME_MS, MonitorAttention } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/ui/modules/MonitorAttention.sys.mjs"
  );

const NOW = 1_800_000_000_000;

add_task(function test_parse_rejects_anything_unrecognized() {
  Assert.deepEqual(MonitorAttention.parseMatches(""), [], "Nothing stored");
  Assert.deepEqual(
    MonitorAttention.parseMatches("not json"),
    [],
    "Unparseable"
  );
  Assert.deepEqual(
    MonitorAttention.parseMatches(JSON.stringify({ "monitor-1": NOW })),
    [],
    "The shape this pref held before it had to carry an order"
  );
});

add_task(function test_parse_keeps_good_entries_beside_bad_ones() {
  Assert.deepEqual(
    MonitorAttention.parseMatches(
      JSON.stringify([
        { id: "monitor-1", at: NOW },
        null,
        { at: NOW },
        { id: "monitor-2", at: "not a number" },
        { id: "monitor-3", at: NOW - 1 },
      ])
    ),
    [
      { id: "monitor-1", at: NOW },
      { id: "monitor-3", at: NOW - 1 },
    ],
    "Malformed entries are skipped, valid ones survive in order"
  );
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

add_task(function test_with_match_keeps_one_entry_per_monitor() {
  // Same millisecond throughout: the order has to come from how the entries
  // were stored, not from comparing their timestamps afterwards.
  let matches = MonitorAttention.withMatch([], "monitor-1", NOW);
  matches = MonitorAttention.withMatch(matches, "monitor-2", NOW);
  Assert.deepEqual(
    MonitorAttention.unexpiredIds(matches, NOW),
    ["monitor-2", "monitor-1"],
    "Newest match first even when the timestamps tie"
  );

  matches = MonitorAttention.withMatch(matches, "monitor-1", NOW);
  Assert.deepEqual(
    MonitorAttention.unexpiredIds(matches, NOW),
    ["monitor-1", "monitor-2"],
    "Matching again moves the monitor to the front rather than duplicating it"
  );
});

add_task(function test_with_match_does_not_mutate_its_input() {
  const matches = [{ id: "monitor-1", at: NOW }];
  const next = MonitorAttention.withMatch(matches, "monitor-2", NOW);
  Assert.deepEqual(
    matches,
    [{ id: "monitor-1", at: NOW }],
    "The caller's list is left alone"
  );
  Assert.equal(next.length, 2, "The returned list has both");
});
