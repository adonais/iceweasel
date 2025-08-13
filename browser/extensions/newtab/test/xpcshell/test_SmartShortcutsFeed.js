/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionTypes: "resource://newtab/common/Actions.mjs",
  SmartShortcutsFeed: "resource://newtab/lib/SmartShortcutsFeed.sys.mjs",
  PersistentCache: "resource://newtab/lib/PersistentCache.sys.mjs",
});

const PREF_SYSTEM_SHORTCUTS_PERSONALIZATION =
  "discoverystream.shortcuts.personalization.enabled";

add_task(async function test_construction() {
  let feed = new SmartShortcutsFeed();

  feed.store = {
    getState() {
      return this.state;
    },
    state: {
      Prefs: {
        values: {
          [PREF_SYSTEM_SHORTCUTS_PERSONALIZATION]: false,
        },
      },
    },
  };

  info("SmartShortcutsFeed constructor should create initial values");

  Assert.ok(feed, "Could construct a SmartShortcutsFeed");
  Assert.ok(!feed.loaded, "SmartShortcutsFeed is not loaded");
  Assert.ok(!feed.isEnabled());
});

add_task(async function test_onAction_INIT() {
  let feed = new SmartShortcutsFeed();

  feed.store = {
    getState() {
      return this.state;
    },
    state: {
      Prefs: {
        values: {
          [PREF_SYSTEM_SHORTCUTS_PERSONALIZATION]: true,
        },
      },
    },
  };

  info("SmartShortcutsFeed.onAction INIT should set loaded");

  await feed.onAction({
    type: actionTypes.INIT,
  });

  Assert.ok(feed.loaded);
});

add_task(async function test_isEnabled() {
  let feed = new SmartShortcutsFeed();

  feed.store = {
    getState() {
      return this.state;
    },
    state: {
      Prefs: {
        values: {
          [PREF_SYSTEM_SHORTCUTS_PERSONALIZATION]: true,
        },
      },
    },
  };

  info("SmartShortcutsFeed should be enabled");
  Assert.ok(feed.isEnabled());
});

add_task(async function test_clampWeights() {
  let feed = new SmartShortcutsFeed();

  let weights = { a: 0, b: 1000, bias: 0 };
  let result = feed.clampWeights(weights, 100);
  info("clampWeights clamps a big weight vector");
  Assert.equal(result.a, 0);
  Assert.equal(result.b, 100);
  Assert.equal(result.bias, 0);

  weights = { a: 1, b: 1, bias: 1 };
  result = feed.clampWeights(weights, 100);
  info("clampWeights ignores a small weight vector");
  Assert.equal(result.a, 1);
  Assert.equal(result.b, 1);
  Assert.equal(result.bias, 1);
});

add_task(async function test_updateShortcutRanker() {
  let feed = new SmartShortcutsFeed();

  const eta = 1;
  info("updated weight vector for a click");
  let shortcutCache = new PersistentCache("test_shortcut_cache", true);
  await shortcutCache.set("weights", { a: 0, b: 1, bias: 0.1 });
  await shortcutCache.set("score_map", {
    guid_A: { final: 1.1, a: 1, b: 1, bias: 1 },
  });
  let result = await feed.updateShortcutRanker(
    { guid: "guid_A", val: 1, eta },
    "test_shortcut_cache"
  );
  // ugly but we need to force a read
  shortcutCache = new PersistentCache("test_shortcut_cache", true);
  Assert.equal(result, 1);
  let sc_cache = await shortcutCache.get();
  const delta = feed.sigmoid(1.1) - 1;
  Assert.equal(sc_cache.weights.a, 0 - Number(delta) * 1);
  Assert.equal(sc_cache.weights.b, 1 - Number(delta) * 1);
  Assert.equal(sc_cache.weights.bias, 0.1 - Number(delta) * 1);

  info("nothing happens for a missing guid");
  shortcutCache = new PersistentCache("test_shortcut_cache", true);
  await shortcutCache.set("weights", { a: 0, b: 1000, bias: 0 });
  await shortcutCache.set("score_map", {
    guid_A: { final: 1, a: 1, b: 1e-3, bias: 1 },
  });
  result = await feed.updateShortcutRanker(
    { guid: "guid_B", val: 1, eta },
    "test_shortcut_cache"
  );
  // ugly but we need to force a read
  shortcutCache = new PersistentCache("test_shortcut_cache", true);
  Assert.equal(result, 0);
  sc_cache = await shortcutCache.get();
  Assert.equal(sc_cache.weights.a, 0);
  Assert.equal(sc_cache.weights.b, 1000);
  Assert.equal(sc_cache.weights.bias, 0);
});
