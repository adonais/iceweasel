/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionTypes: "resource://newtab/common/Actions.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  RecentSearchesFeed:
    "resource://newtab/lib/Widgets/RecentSearchesFeed.sys.mjs",
});

const PREF_WIDGETS_ENABLED = "widgets.enabled";
const PREF_RECENT_SEARCHES_ENABLED = "widgets.recentSearches.enabled";
const PREF_SYSTEM_RECENT_SEARCHES_ENABLED =
  "widgets.system.recentSearches.enabled";

function feedWithPrefs(values) {
  const feed = new RecentSearchesFeed();
  feed.store = {
    getState() {
      return this.state;
    },
    dispatch: sinon.spy(),
    state: { Prefs: { values } },
  };
  return feed;
}

function enabledPrefs() {
  return {
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_RECENT_SEARCHES_ENABLED]: true,
    [PREF_SYSTEM_RECENT_SEARCHES_ENABLED]: true,
  };
}

function broadcastCall(feed) {
  return feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .find(a => a.type === actionTypes.WIDGETS_RECENT_SEARCHES_UPDATE);
}

add_task(async function test_enabled_reflects_registry() {
  const feed = feedWithPrefs(enabledPrefs());
  Assert.ok(feed.enabled, "Enabled when all three prefs are on");

  const off = feedWithPrefs({
    ...enabledPrefs(),
    [PREF_RECENT_SEARCHES_ENABLED]: false,
  });
  Assert.ok(!off.enabled, "Disabled when the user pref is off");

  const noSystem = feedWithPrefs({
    ...enabledPrefs(),
    [PREF_SYSTEM_RECENT_SEARCHES_ENABLED]: false,
  });
  Assert.ok(!noSystem.enabled, "Disabled when the system pref is off");

  const noContainer = feedWithPrefs({
    ...enabledPrefs(),
    [PREF_WIDGETS_ENABLED]: false,
  });
  Assert.ok(!noContainer.enabled, "Disabled when the widgets container is off");
});

add_task(async function test_init_broadcasts_empty_searches() {
  const feed = feedWithPrefs(enabledPrefs());
  await feed.onAction({ type: actionTypes.INIT });

  const call = broadcastCall(feed);
  Assert.ok(call, "Broadcasts WIDGETS_RECENT_SEARCHES_UPDATE on INIT");
  Assert.deepEqual(call.data.searches, [], "Sends an empty searches array");
});

// New tabs receive the store state from NewTabInit, so the feed does not
// rebroadcast on NEW_TAB_INIT.
add_task(async function test_new_tab_init_does_not_broadcast() {
  const feed = feedWithPrefs(enabledPrefs());
  await feed.onAction({ type: actionTypes.NEW_TAB_INIT });
  Assert.ok(!feed.store.dispatch.called, "Does not dispatch on NEW_TAB_INIT");
});

add_task(async function test_no_dispatch_when_disabled() {
  const feed = feedWithPrefs({
    ...enabledPrefs(),
    [PREF_RECENT_SEARCHES_ENABLED]: false,
  });
  await feed.onAction({ type: actionTypes.INIT });
  Assert.ok(!feed.store.dispatch.called, "Does not dispatch when disabled");
});

add_task(async function test_pref_changed_triggers_update() {
  const feed = feedWithPrefs(enabledPrefs());
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: PREF_RECENT_SEARCHES_ENABLED, value: true },
  });
  Assert.ok(broadcastCall(feed), "Broadcasts when an enablement pref changes");
});

add_task(async function test_unrelated_pref_changed_is_ignored() {
  const feed = feedWithPrefs(enabledPrefs());
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "some.other.pref", value: true },
  });
  Assert.ok(!feed.store.dispatch.called, "Ignores unrelated pref changes");
});

add_task(async function test_trainhop_config_change_triggers_update() {
  // The system pref is off, so only the trainhop rollout enables the widget.
  // This fails if "trainhopConfig" is dropped from ENABLEMENT_PREFS.
  const feed = feedWithPrefs({
    "widgets.enabled": true,
    [PREF_RECENT_SEARCHES_ENABLED]: true,
    [PREF_SYSTEM_RECENT_SEARCHES_ENABLED]: false,
    trainhopConfig: { widgets: { recentSearchesEnabled: true } },
  });
  Assert.ok(feed.enabled, "Trainhop config alone enables the feed");

  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "trainhopConfig" },
  });
  Assert.ok(broadcastCall(feed), "Broadcasts when trainhopConfig changes");
});

add_task(async function test_pref_changed_while_disabled_does_not_dispatch() {
  const feed = feedWithPrefs({
    ...enabledPrefs(),
    [PREF_RECENT_SEARCHES_ENABLED]: false,
  });
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: PREF_RECENT_SEARCHES_ENABLED, value: false },
  });
  Assert.ok(
    !feed.store.dispatch.called,
    "An enablement pref change that leaves the widget off stays quiet"
  );
});
