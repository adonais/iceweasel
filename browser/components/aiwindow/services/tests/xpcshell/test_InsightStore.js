/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { InsightStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/services/InsightStore.sys.mjs"
);

add_task(async function test_init_empty_state() {
  // First init should succeed and not throw.
  await InsightStore.ensureInitialized();

  let insights = await InsightStore.getInsights();
  equal(insights.length, 0, "New store should start with no insights");

  const meta = await InsightStore.getMeta();
  equal(
    meta.last_history_insight_ts,
    0,
    "Default last_history_insight_ts should be 0"
  );
  equal(
    meta.last_chat_insight_ts,
    0,
    "Default last_chat_insight_ts should be 0"
  );
});

add_task(async function test_addInsight() {
  await InsightStore.ensureInitialized();

  const insight1 = await InsightStore.addInsight({
    insight_summary: "i love driking coffee",
    category: "Food & Drink",
    intent: "Plan / Organize",
    score: 3,
  });

  equal(
    insight1.insight_summary,
    "i love driking coffee",
    "insight summary should match input"
  );
  equal(insight1.category, "Food & Drink", "Category should match input");
  equal(insight1.intent, "Plan / Organize", "Intent should match with input");
  equal(insight1.score, 3, "Score should match input");
  await InsightStore.hardDeleteInsight(insight1.id);
});

add_task(async function test_addInsight_and_upsert_by_content() {
  await InsightStore.ensureInitialized();

  const insight1 = await InsightStore.addInsight({
    insight_summary: "trip plans to Italy",
    category: "Travel & Transportation",
    intent: "Plan / Organize",
    score: 3,
  });

  ok(insight1.id, "Insight should have an id");
  equal(
    insight1.insight_summary,
    "trip plans to Italy",
    "Insight summary should be stored"
  );

  // Add another insight with same (summary, category, intent) – should upsert, not duplicate.
  const insight2 = await InsightStore.addInsight({
    insight_summary: "trip plans to Italy",
    category: "Travel & Transportation",
    intent: "Plan / Organize",
    score: 5,
  });

  equal(
    insight1.id,
    insight2.id,
    "Same (summary, category, intent) should produce same deterministic id"
  );
  equal(
    insight2.score,
    5,
    "Second addInsight call for same id should update score"
  );

  const insights = await InsightStore.getInsights();
  equal(insights.length, 1, "Store should still have only one insight");
  await InsightStore.hardDeleteInsight(insight1.id);
});

add_task(async function test_addInsight_different_intent_produces_new_id() {
  await InsightStore.ensureInitialized();

  const a = await InsightStore.addInsight({
    insight_summary: "trip plans to Italy",
    category: "Travel & Transportation",
    intent: "trip_planning",
    score: 3,
  });

  const b = await InsightStore.addInsight({
    insight_summary: "trip plans to Italy",
    category: "Travel & Transportation",
    intent: "travel_budgeting",
    score: 4,
  });

  notEqual(a.id, b.id, "Different intent should yield different ids");

  const insights = await InsightStore.getInsights();
  equal(
    insights.length == 2,
    true,
    "Store should contain at least two insights now"
  );
});

add_task(async function test_updateInsight_and_soft_delete() {
  await InsightStore.ensureInitialized();

  const insight = await InsightStore.addInsight({
    insight_summary: "debug insight",
    category: "debug",
    intent: "Monitor / Track",
    score: 1,
  });

  const updated = await InsightStore.updateInsight(insight.id, {
    score: 4,
  });
  equal(updated.score, 4, "updateInsight should update fields");

  const deleted = await InsightStore.softDeleteInsight(insight.id);

  ok(deleted, "softDeleteInsight should return the updated insight");
  equal(
    deleted.is_deleted,
    true,
    "Soft-deleted insight should have is_deleted = true"
  );

  const nonDeleted = await InsightStore.getInsights();
  const notFound = nonDeleted.find(i => i.id === insight.id);
  equal(
    notFound,
    undefined,
    "Soft-deleted insight should be filtered out by getInsights()"
  );
});

add_task(async function test_hard_delete() {
  await InsightStore.ensureInitialized();

  const insight = await InsightStore.addInsight({
    insight_summary: "to be hard deleted",
    category: "debug",
    intent: "Monitor / Track",
    score: 2,
  });

  let insights = await InsightStore.getInsights();
  const beforeCount = insights.length;

  const removed = await InsightStore.hardDeleteInsight(insight.id);
  equal(
    removed,
    true,
    "hardDeleteInsight should return true when removing existing insight"
  );

  insights = await InsightStore.getInsights();
  const afterCount = insights.length;

  equal(
    beforeCount - 1,
    afterCount,
    "hardDeleteInsight should physically remove entry from array"
  );
});

add_task(async function test_updateMeta_and_persistence_roundtrip() {
  await InsightStore.ensureInitialized();

  const now = Date.now();

  await InsightStore.updateMeta({
    last_history_insight_ts: now,
  });

  let meta = await InsightStore.getMeta();
  equal(
    meta.last_history_insight_ts,
    now,
    "updateMeta should update last_history_insight_ts"
  );
  equal(
    meta.last_chat_insight_ts,
    0,
    "updateMeta should not touch last_chat_insight_ts when not provided"
  );

  const chatTime = now + 1000;
  await InsightStore.updateMeta({
    last_chat_insight_ts: chatTime,
  });

  meta = await InsightStore.getMeta();
  equal(
    meta.last_history_insight_ts,
    now,
    "last_history_insight_ts should remain unchanged when only chat ts updated"
  );
  equal(
    meta.last_chat_insight_ts,
    chatTime,
    "last_chat_insight_ts should be updated"
  );

  // Force a write to disk.
  await InsightStore.testOnlyFlush();

  // Simulate a fresh import by reloading module.
  // This uses the xpcshell helper to bypass module caching.
  const { InsightStore: FreshStore } = ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/services/InsightStore.sys.mjs",
    { ignoreCache: true }
  );

  await FreshStore.ensureInitialized();

  const meta2 = await FreshStore.getMeta();
  equal(
    meta2.last_history_insight_ts,
    now,
    "last_history_insight_ts should survive roundtrip to disk"
  );
  equal(
    meta2.last_chat_insight_ts,
    chatTime,
    "last_chat_insight_ts should survive roundtrip to disk"
  );

  const insights = await FreshStore.getInsights();
  ok(Array.isArray(insights), "Insights should be an array after reload");
});
