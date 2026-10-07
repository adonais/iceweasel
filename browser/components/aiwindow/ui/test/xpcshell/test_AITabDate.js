/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// "Today" in the AI Tab header is a calendar day, not a rolling 24 hours.
// Both `now` and the timestamp are supplied here so the boundary cases are
// deterministic; asserting against the real clock would flake for a suite
// that happened to run across midnight.

do_get_profile();

const { formatCreatedAt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/actors/AITabParent.sys.mjs"
);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The store keeps created_at in microseconds, which is what the formatter
 * takes.
 *
 * @param {string} isoString
 * @returns {number}
 */
function storedTime(isoString) {
  return new Date(isoString).getTime() * 1000;
}

add_task(async function test_today_uses_the_today_string() {
  const now = new Date("2026-09-08T14:30:00").getTime();
  const today = await formatCreatedAt(storedTime("2026-09-08T14:30:00"), now);

  Assert.equal(today, "Created today", "The same instant reads as today");
  Assert.equal(
    await formatCreatedAt(storedTime("2026-09-08T00:00:00"), now),
    today,
    "The first moment of today reads as today"
  );
  Assert.equal(
    await formatCreatedAt(storedTime("2026-09-08T23:59:59"), now),
    today,
    "The last moment of today reads as today"
  );
});

add_task(async function test_other_days_use_a_date() {
  const now = new Date("2026-09-08T14:30:00").getTime();

  const yesterday = await formatCreatedAt(
    storedTime("2026-09-07T23:59:59"),
    now
  );
  Assert.notEqual(
    yesterday,
    "Created today",
    "The last moment of yesterday is not today"
  );
  Assert.ok(yesterday.startsWith("Created "), `Reads as a date: ${yesterday}`);

  Assert.notEqual(
    await formatCreatedAt(storedTime("2026-09-09T00:00:00"), now),
    "Created today",
    "The first moment of tomorrow is not today either"
  );
});

add_task(async function test_within_24_hours_is_not_enough() {
  // Two hours apart but on different calendar days. A rolling 24 hour window
  // would call the earlier one today, which is not what a reader means.
  const now = new Date("2026-09-08T01:00:00").getTime();
  const lateYesterday = new Date("2026-09-07T23:00:00").getTime();

  Assert.less(now - lateYesterday, DAY_MS, "Less than a day apart");
  Assert.notEqual(
    await formatCreatedAt(lateYesterday * 1000, now),
    "Created today",
    "but the previous calendar day is still not today"
  );
});

add_task(async function test_unusable_timestamps_render_nothing() {
  const now = Date.now();

  Assert.equal(await formatCreatedAt(0, now), "", "Zero produces no label");
  Assert.equal(
    await formatCreatedAt(Number.NaN, now),
    "",
    "NaN produces no label"
  );
  Assert.equal(
    await formatCreatedAt(undefined, now),
    "",
    "A missing timestamp produces no label"
  );
});
