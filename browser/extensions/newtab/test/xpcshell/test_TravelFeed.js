/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionCreators: "resource://newtab/common/Actions.mjs",
  actionTypes: "resource://newtab/common/Actions.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
  TravelFeed: "resource://newtab/lib/Widgets/TravelFeed.sys.mjs",
});

const PREF_WIDGETS_ENABLED = "widgets.enabled";
const PREF_TRAVEL_ENABLED = "widgets.travel.enabled";
const PREF_SYSTEM_TRAVEL_ENABLED = "widgets.system.travel.enabled";

function feedWithPrefs(values) {
  const feed = new TravelFeed();
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
    [PREF_TRAVEL_ENABLED]: true,
    [PREF_SYSTEM_TRAVEL_ENABLED]: true,
  };
}

function updateBroadcasts(feed) {
  return feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .filter(a => a.type === actionTypes.WIDGETS_TRAVEL_UPDATE);
}

add_task(function test_init_broadcasts_an_empty_result_set() {
  const feed = feedWithPrefs(enabledPrefs());
  feed.onAction({ type: actionTypes.INIT });
  Assert.deepEqual(
    updateBroadcasts(feed),
    [
      actionCreators.BroadcastToContent({
        type: actionTypes.WIDGETS_TRAVEL_UPDATE,
        data: { results: [] },
      }),
    ],
    "Broadcasts one empty result set to every tab"
  );
});

add_task(function test_init_is_quiet_when_disabled() {
  for (const pref of [
    PREF_TRAVEL_ENABLED,
    PREF_SYSTEM_TRAVEL_ENABLED,
    PREF_WIDGETS_ENABLED,
  ]) {
    const feed = feedWithPrefs({ ...enabledPrefs(), [pref]: false });
    feed.onAction({ type: actionTypes.INIT });
    Assert.ok(!feed.store.dispatch.called, `No broadcast with ${pref} off`);
  }
});

add_task(function test_turning_widgets_back_on_broadcasts() {
  for (const pref of [
    PREF_WIDGETS_ENABLED,
    PREF_TRAVEL_ENABLED,
    PREF_SYSTEM_TRAVEL_ENABLED,
  ]) {
    const feed = feedWithPrefs(enabledPrefs());
    feed.onAction({
      type: actionTypes.PREF_CHANGED,
      data: { name: pref, value: true },
    });
    Assert.equal(
      updateBroadcasts(feed).length,
      1,
      `Broadcasts when ${pref} turns the widget on`
    );
  }
});

add_task(function test_trainhop_namespace_enables_the_feed() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_TRAVEL_ENABLED]: true,
    [PREF_SYSTEM_TRAVEL_ENABLED]: false,
    region: "US",
    trainhopConfig: { widgetTravel: { visible: true } },
  });
  Assert.ok(feed.enabled, "The dedicated namespace alone enables the feed");
  feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "trainhopConfig" },
  });
  Assert.equal(updateBroadcasts(feed).length, 1, "Broadcasts on the rollout");
});

add_task(function test_region_resolves_broadcasts() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_TRAVEL_ENABLED]: true,
    [PREF_SYSTEM_TRAVEL_ENABLED]: false,
    region: "",
    trainhopConfig: { widgetTravel: { visible: true } },
  });
  Assert.ok(!feed.enabled, "Trainhop reveal ignored without a region");

  feed.store.state.Prefs.values.region = "FR";
  feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "region", value: "FR" },
  });
  Assert.equal(
    updateBroadcasts(feed).length,
    1,
    "Broadcasts when the region resolves"
  );
});

add_task(function test_pref_change_that_leaves_it_off_is_quiet() {
  const feed = feedWithPrefs({
    ...enabledPrefs(),
    [PREF_WIDGETS_ENABLED]: false,
  });
  feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: PREF_WIDGETS_ENABLED, value: false },
  });
  Assert.ok(
    !feed.store.dispatch.called,
    "Stays quiet while widgets are hidden"
  );
});

add_task(function test_unrelated_pref_change_is_ignored() {
  const feed = feedWithPrefs(enabledPrefs());
  feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "some.other.pref", value: true },
  });
  Assert.ok(!feed.store.dispatch.called, "Ignores unrelated pref changes");
});
