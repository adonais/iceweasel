/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { getRecentChats, computeFreshnessScore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/memories/MemoriesChatSource.sys.mjs"
);
const { ChatStore, ChatMessage, MESSAGE_ROLE } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ChatStore.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function normalizeToMs(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  // assume string (e.g. ISO date)
  return Date.parse(value);
}

let sandbox;

add_setup(function () {
  sandbox = sinon.createSandbox();
  registerCleanupFunction(() => {
    sandbox.restore();
  });
});

// past date check
add_task(function test_computeFreshnessScore_past_date_check() {
  const createdDate = new Date(Date.now() - 10 * MS_PER_DAY);
  const score = computeFreshnessScore(createdDate, 7);

  Assert.less(score, 0.5, "Freshness score should be < 0.5");
});

// future date check
add_task(function test_computeFreshnessScore_future_date_check() {
  const createdDate = new Date(Date.now() + 1 * MS_PER_DAY);
  const score = computeFreshnessScore(createdDate, 7);
  Assert.equal(score, 1, "Freshness score should be 1");
});

// current date check
add_task(function test_computeFreshnessScore_current_date_check() {
  const createdDate = new Date();
  const score = computeFreshnessScore(createdDate, 7);
  // allow tiny floating point / timing jitter
  Assert.greaterOrEqual(score, 0.9999, "Freshness score should be ≈ 1");
  Assert.lessOrEqual(score, 1, "Freshness score must be <= 1");
});

// approx halflife check
add_task(function test_computeFreshnessScore_halflife_approx_check() {
  const createdDate = new Date(Date.now() - 7 * MS_PER_DAY);
  const score = computeFreshnessScore(createdDate, 7);
  // making sure that score in between 0.49 & 0.51 (closer to halflife)
  Assert.less(score, 0.51, "Freshness score should be < 0.51");
  Assert.greater(score, 0.49, "Freshness score should be > 0.49");
});

// older vs recent score check
add_task(function test_computeFreshnessScore_older_vs_recent_check() {
  const olderDate = new Date(Date.now() - 30 * MS_PER_DAY);
  const recentDate = new Date(Date.now() - 1 * MS_PER_DAY);
  const olderScore = computeFreshnessScore(olderDate, 7);
  const recentScore = computeFreshnessScore(recentDate, 7);
  Assert.less(olderScore, recentScore, "Older score should be < recent score");
});

add_task(async function test_getRecentChats_basic_mapping_and_limit() {
  const fixedNow = 1_700_000_000_000;

  const clock = sandbox.useFakeTimers({ now: fixedNow });

  const messages = [
    new ChatMessage({
      createdDate: fixedNow - 1_000,
      ordinal: 1,
      role: MESSAGE_ROLE.USER,
      content: { type: "text", body: "msg1" },
      pageUrl: "https://example.com/1",
      turnIndex: 0,
    }),
    new ChatMessage({
      createdDate: fixedNow - 10_000,
      ordinal: 2,
      role: MESSAGE_ROLE.USER,
      content: { type: "text", body: "msg2" },
      pageUrl: "https://example.com/2",
      turnIndex: 0,
    }),
    new ChatMessage({
      createdDate: fixedNow - 100_000,
      ordinal: 3,
      role: MESSAGE_ROLE.USER,
      content: { type: "text", body: "msg3" },
      pageUrl: "https://example.com/3",
      turnIndex: 0,
    }),
  ];

  messages.forEach(msg => {
    Assert.ok(
      "createdDate" in msg,
      "Test stub message should have createdDate (camelCase)"
    );
    Assert.ok(
      msg.content &&
        typeof msg.content === "object" &&
        !Array.isArray(msg.content),
      "msg.content should be an object, not an array"
    );
    Assert.ok("body" in msg.content, "msg.content should have a body field");
  });

  const maxResults = 3;
  const halfLifeDays = 7;
  const startTime = fixedNow - 1_000_000;

  // Stub the method
  const stub = sandbox
    .stub(ChatStore.prototype, "findMessagesByDate")
    .callsFake(async (startTimeArg, endTimeArg, roleArg, limitArg) => {
      Assert.equal(
        roleArg,
        MESSAGE_ROLE.USER,
        "Role passed to findMessagesByDate should be USER"
      );
      const startMs = normalizeToMs(startTimeArg);
      const endMs = normalizeToMs(endTimeArg);
      Assert.greaterOrEqual(endMs, startMs, "endTime should be >= startTime");
      Assert.equal(limitArg, maxResults, "limit should match maxResults");
      return messages;
    });

  const result = await getRecentChats(startTime, maxResults, halfLifeDays);

  // Assert stub was actually called
  Assert.equal(stub.callCount, 1, "findMessagesByDate should be called once");

  const [startTimeArg, , roleArg] = stub.firstCall.args;
  Assert.equal(roleArg, MESSAGE_ROLE.USER, "Role should be USER");
  const startMs = normalizeToMs(startTimeArg);

  Assert.equal(
    startMs,
    fixedNow - 1_000_000,
    "startTime should be fixedNow - 1_000_000 in ms"
  );

  Assert.equal(result.length, maxResults, "Should respect maxResults");

  const first = result[0];
  const second = result[1];

  Assert.equal(first.content, "msg1");
  Assert.equal(second.content, "msg2");

  Assert.ok("freshness_score" in first);
  Assert.greater(
    first.freshness_score,
    second.freshness_score,
    "More recent message should have higher freshness_score"
  );

  clock.restore?.();
});
