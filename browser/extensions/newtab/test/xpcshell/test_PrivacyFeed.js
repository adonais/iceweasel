/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionTypes: "resource://newtab/common/Actions.mjs",
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  PrivacyFeed: "resource://newtab/lib/Widgets/PrivacyFeed.sys.mjs",
  PrivacyMetricsService:
    "moz-src:///browser/components/protections/PrivacyMetricsService.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

const PREF_WIDGETS_ENABLED = "widgets.enabled";
const PREF_PRIVACY_ENABLED = "widgets.privacy.enabled";
const PREF_SYSTEM_PRIVACY_ENABLED = "widgets.system.privacy.enabled";

// getSitesVisitedToday() reads the Places history DB, which needs a profile.
do_get_profile();

function feedWithPrefs(values) {
  const feed = new PrivacyFeed();
  feed.store = {
    getState() {
      return this.state;
    },
    dispatch: sinon.spy(),
    state: { Prefs: { values } },
  };
  return feed;
}

add_task(async function test_enabled_via_system_pref() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  Assert.ok(feed.enabled, "Enabled when widgets + user + system prefs are on");
});

add_task(async function test_enabled_via_trainhop_config() {
  // System pref defaults false; a trainhop rollout enables the widget via
  // trainhopConfig, and the feed must follow so the counter actually fetches.
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: false,
    trainhopConfig: { widgets: { privacyEnabled: true } },
  });
  Assert.ok(feed.enabled, "Enabled via trainhopConfig even when system is off");
});

add_task(async function test_disabled_when_master_widgets_off() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: false,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  Assert.ok(!feed.enabled, "Disabled when master widgets.enabled is off");
});

add_task(async function test_broadcasts_total_and_sites_on_each_action() {
  for (const type of [
    actionTypes.INIT,
    actionTypes.SYSTEM_TICK,
    actionTypes.NEW_TAB_INIT,
  ]) {
    const feed = feedWithPrefs({
      [PREF_WIDGETS_ENABLED]: true,
      [PREF_PRIVACY_ENABLED]: true,
      [PREF_SYSTEM_PRIVACY_ENABLED]: true,
    });
    const sandbox = sinon.createSandbox();
    sandbox
      .stub(PrivacyMetricsService, "getTodayStats")
      .resolves({ total: 42, trackers: 10, lastUpdated: 123 });
    sandbox.stub(feed, "getSitesVisitedToday").resolves(7);

    await feed.onAction({ type });

    Assert.ok(feed.store.dispatch.calledOnce, `Dispatched once on ${type}`);
    const [action] = feed.store.dispatch.firstCall.args;
    Assert.equal(
      action.type,
      actionTypes.WIDGETS_PRIVACY_UPDATE,
      `Broadcasts WIDGETS_PRIVACY_UPDATE on ${type}`
    );
    Assert.equal(action.data.trackersToday, 42, "Uses the total, not trackers");
    Assert.equal(action.data.sitesToday, 7, "Includes the site count");
    Assert.equal(action.data.lastUpdated, 123, "Carries lastUpdated");

    sandbox.restore();
  }
});

add_task(async function test_no_fetch_when_disabled() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: false,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  const stats = sandbox.stub(PrivacyMetricsService, "getTodayStats");

  await feed.onAction({ type: actionTypes.SYSTEM_TICK });

  Assert.ok(!feed.store.dispatch.called, "Does not dispatch when disabled");
  Assert.ok(!stats.called, "Does not query stats when disabled");

  sandbox.restore();
});

add_task(async function test_pref_changed_triggers_fetch() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  sandbox
    .stub(PrivacyMetricsService, "getTodayStats")
    .resolves({ total: 1, lastUpdated: 1 });
  sandbox.stub(feed, "getSitesVisitedToday").resolves(1);

  // An enablement pref flipping on should fetch...
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: PREF_SYSTEM_PRIVACY_ENABLED },
  });
  Assert.ok(
    feed.store.dispatch.calledOnce,
    "Fetches on enablement PREF_CHANGED"
  );

  // ...but an unrelated pref should not.
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "some.unrelated.pref" },
  });
  Assert.ok(feed.store.dispatch.calledOnce, "Ignores unrelated PREF_CHANGED");

  sandbox.restore();
});

add_task(async function test_backward_compat_guard() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  // Older platforms ship PrivacyMetricsService without getTodayStats.
  sandbox.stub(PrivacyMetricsService, "getTodayStats").value(undefined);
  const sites = sandbox.stub(feed, "getSitesVisitedToday").resolves(3);

  await feed.onAction({ type: actionTypes.INIT });

  Assert.ok(!feed.store.dispatch.called, "No broadcast without getTodayStats");
  Assert.ok(!sites.called, "Bails before touching Places");

  sandbox.restore();
});

add_task(async function test_getSitesVisitedToday_counts_distinct_origins() {
  // Exercise the real Places query (not the stub the other tests use).
  await PlacesUtils.history.clear();
  await PlacesTestUtils.addVisits([
    "https://example.com/",
    "https://example.com/page-2", // same origin as above
    "https://example.org/", // distinct origin
  ]);

  const count = await new PrivacyFeed().getSitesVisitedToday();

  Assert.equal(count, 2, "Counts distinct origins visited today, not visits");

  await PlacesUtils.history.clear();
});
