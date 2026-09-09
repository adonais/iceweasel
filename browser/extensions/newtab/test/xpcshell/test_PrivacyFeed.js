/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  actionTypes: "resource://newtab/common/Actions.mjs",
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  PrivacyFeed: "resource://newtab/lib/Widgets/PrivacyFeed.sys.mjs",
  PrivacyMetricsService:
    "moz-src:///browser/components/protections/PrivacyMetricsService.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
  Sqlite: "resource://gre/modules/Sqlite.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  this,
  "TrackingDBService",
  "@mozilla.org/tracking-db-service;1",
  Ci.nsITrackingDBService
);

const PREF_WIDGETS_ENABLED = "widgets.enabled";
const PREF_PRIVACY_ENABLED = "widgets.privacy.enabled";
const PREF_SYSTEM_PRIVACY_ENABLED = "widgets.system.privacy.enabled";
const PREF_MESSAGE_STATE = "widgets.privacy.messageState";
const PREF_FORCE_MESSAGE_ID = "widgets.privacy.forceMessageId";
const DAY_MS = 24 * 60 * 60 * 1000;

const INSERT_EVENT_SQL =
  "INSERT INTO events (type, count, timestamp) VALUES (:type, :count, date(:timestamp));";

// getSitesVisitedToday() reads the Places history DB, which needs a profile.
do_get_profile();

add_setup(async function () {
  Services.prefs.setBoolPref("browser.contentblocking.database.enabled", true);
  // saveEvents initializes the schema; clearAll resets between runs.
  await TrackingDBService.saveEvents(JSON.stringify({}));
  await TrackingDBService.clearAll();
});

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("browser.contentblocking.database.enabled");
});

// Seed tracker-blocked events at given (offsetDays-from-now, count) points.
async function seedEvents(events) {
  const db = await Sqlite.openConnection({
    path: PathUtils.join(PathUtils.profileDir, "protections.sqlite"),
  });
  try {
    for (const { offsetDays = 0, count } of events) {
      await db.execute(INSERT_EVENT_SQL, {
        type: TrackingDBService.TRACKERS_ID,
        count,
        timestamp: new Date(Date.now() - offsetDays * DAY_MS).toISOString(),
      });
    }
  } finally {
    await db.close();
  }
}

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

function broadcastCall(feed) {
  return feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .find(a => a.type === actionTypes.WIDGETS_PRIVACY_UPDATE);
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

add_task(async function test_disabled_when_history_is_off() {
  // The readout needs history, so profiles that record none hide the widget
  // outright and the feed must stop fetching for them (Bug 2063207).
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
    recordsHistory: false,
  });
  Assert.ok(!feed.enabled, "Disabled when the profile records no history");
});

add_task(async function test_enabled_when_history_value_is_absent() {
  // A missing PrefsFeed broadcast must not disable a working widget.
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  Assert.ok(feed.enabled, "Enabled when recordsHistory was never broadcast");
});

add_task(async function test_disabled_when_master_widgets_off() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: false,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  Assert.ok(!feed.enabled, "Disabled when master widgets.enabled is off");
});

add_task(async function test_view_refresh_broadcasts_counts_only() {
  // A preloaded tab reads the count at NEW_TAB_INIT, while it is still hidden.
  // Showing it has to re-read the count, but must NOT re-run the scheduler:
  // that would swap the message out from under the user (Bug 2063963).
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  sandbox
    .stub(PrivacyMetricsService, "getTodayStats")
    .resolves({ total: 137, trackers: 20, lastUpdated: 456 });
  sandbox.stub(feed, "getSitesVisitedToday").resolves(9);
  const runSelection = sandbox.spy(feed, "_runMessageSelection");

  await feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE });

  const action = broadcastCall(feed);
  Assert.ok(action, "Broadcasts a count update when a tab is shown");
  Assert.equal(action.data.trackersToday, 137, "Sends the fresh count");
  Assert.equal(action.data.variant, undefined, "Sends no message fields");
  Assert.ok(!runSelection.called, "Does not re-run the message scheduler");

  sandbox.restore();
});

add_task(async function test_view_refresh_sends_counts_and_nothing_else() {
  // The reducer merges, so every key omitted here leaves that tab's own value
  // alone. countCeiling: clearing it would drop the daily-cap "100+" as the tab
  // is revealed, which is the view the cap exists for. celebration: awarding one
  // here could start a second count-up over a running one.
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  sandbox
    .stub(PrivacyMetricsService, "getTodayStats")
    .resolves({ total: 137, trackers: 20, lastUpdated: 1 });
  sandbox.stub(feed, "getSitesVisitedToday").resolves(9);
  const resolveCelebration = sandbox.spy(feed, "resolveCelebration");

  await feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE });

  const action = broadcastCall(feed);
  Assert.equal(action.data.trackersToday, 137, "Sends the fresh count");
  Assert.ok(!("countCeiling" in action.data), "Sends no countCeiling");
  Assert.ok(!("celebration" in action.data), "Sends no celebration");
  Assert.ok(!resolveCelebration.called, "Awards no celebration on this path");

  sandbox.restore();
});

add_task(async function test_view_refresh_skips_a_read_already_running() {
  // Two tabs revealed together both pass the freshness check, since the stamp
  // only lands after the await. An in-flight flag is what stops the second.
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  const getTodayStats = sandbox
    .stub(PrivacyMetricsService, "getTodayStats")
    .resolves({ total: 42, trackers: 4, lastUpdated: 1 });
  sandbox.stub(feed, "getSitesVisitedToday").resolves(3);

  // The store middleware does not await onAction, so a real burst overlaps.
  await Promise.all([
    feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE }),
    feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE }),
    feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE }),
  ]);

  Assert.equal(getTodayStats.callCount, 1, "Only the first reveal reads");

  sandbox.restore();
});

add_task(async function test_view_refresh_skips_a_recent_read() {
  // Each reveal costs a Places query, so one that lands while the last read is
  // still fresh is dropped. Awaited one at a time on purpose: each read has to
  // finish for the next to see its stamp. Concurrent reveals are the test below.
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  const getTodayStats = sandbox
    .stub(PrivacyMetricsService, "getTodayStats")
    .resolves({ total: 50, trackers: 5, lastUpdated: 1 });
  sandbox.stub(feed, "getSitesVisitedToday").resolves(3);

  await feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE });
  await feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE });
  await feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE });
  Assert.equal(getTodayStats.callCount, 1, "Reads the count once for a burst");

  // Past the throttle window, the next reveal reads again.
  feed._lastCountsAt -= 60 * 1000;
  await feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE });
  Assert.equal(getTodayStats.callCount, 2, "Reads again once the count is old");

  sandbox.restore();
});

add_task(async function test_view_refresh_follows_the_enabled_pref() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: false,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  const getTodayStats = sandbox
    .stub(PrivacyMetricsService, "getTodayStats")
    .resolves({ total: 12, trackers: 2, lastUpdated: 1 });
  sandbox.stub(feed, "getSitesVisitedToday").resolves(1);

  await feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE });
  Assert.ok(!getTodayStats.called, "No fetch while the widget is disabled");

  // Same feed, same action, only the pref changed — so the pref is what stopped
  // the fetch, not a handler that never ran.
  feed.store.state.Prefs.values[PREF_WIDGETS_ENABLED] = true;
  await feed.onAction({ type: actionTypes.WIDGETS_PRIVACY_VISIBLE });
  Assert.equal(
    getTodayStats.callCount,
    1,
    "Fetches once the widget is enabled"
  );

  sandbox.restore();
});

add_task(async function test_broadcasts_counts_only_on_tick() {
  // INIT/SYSTEM_TICK refresh the live count without running the scheduler, so
  // no message fields are broadcast (the reducer keeps the current message).
  for (const type of [actionTypes.INIT, actionTypes.SYSTEM_TICK]) {
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

    // One broadcast per tick. The feed may also dispatch a SetPref to seed the
    // celebration baseline, so count broadcasts rather than all dispatches.
    const broadcasts = feed.store.dispatch
      .getCalls()
      .filter(c => c.args[0]?.type === actionTypes.WIDGETS_PRIVACY_UPDATE);
    Assert.equal(broadcasts.length, 1, `Broadcast once on ${type}`);
    const action = broadcastCall(feed);
    Assert.equal(action.data.trackersToday, 42, "Uses the total, not trackers");
    Assert.equal(action.data.sitesToday, 7, "Includes the site count");
    Assert.equal(action.data.lastUpdated, 123, "Carries lastUpdated");
    Assert.equal(action.data.variant, undefined, "No message fields on a tick");
    Assert.equal(
      action.data.countCeiling,
      null,
      "Clears a stale daily-cap ceiling"
    );

    // INIT registers the ETP pref observers; drop them so a later test's pref
    // write can't refresh a feed whose stubs are gone.
    feed.uninit();
    sandbox.restore();
  }
});

add_task(async function test_new_tab_init_runs_scheduler() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  // The data-gathering helpers are stubbed so we exercise the scheduler +
  // routing wiring only.
  sandbox
    .stub(feed, "fetchTodayCounts")
    .resolves({ trackersToday: 42, sitesToday: 7, lastUpdated: 123 });
  sandbox.stub(feed, "getPeriodTotals").resolves({
    weekTotal: 0,
    monthTotal: 0,
    yearTotal: 0,
    allTimeTotal: 0,
    streakDays: 0,
  });
  sandbox
    .stub(feed, "getFeatureFlags")
    .resolves({ signedIn: false, hasLogins: false, relayMasks: false });
  sandbox.stub(feed, "getProfileCreatedMs").resolves(0);

  // Mirror the real NEW_TAB_INIT: data is the tabDetails (carries portID) and
  // meta.fromTarget is the originating content port.
  const portID = "port-42";
  await feed.onAction({
    type: actionTypes.NEW_TAB_INIT,
    data: { portID, browser: {} },
    meta: { fromTarget: portID },
  });

  // The count + this tab's selection are broadcast together (a one-shot per-tab
  // send is dropped by content's rehydrationMiddleware at preload; see feed).
  const message = broadcastCall(feed);
  Assert.ok(message, "Broadcasts an update on NEW_TAB_INIT");
  Assert.equal(message.data.trackersToday, 42, "Carries the live count");
  // First non-zero render with empty state -> first-protection celebration.
  Assert.equal(message.data.variant, "tip", "Picks a message");
  Assert.ok(message.data.messageId, "Carries a messageId");
  Assert.equal(
    message.data.category,
    "firstProtection",
    "Carries the category"
  );
  Assert.equal(message.data.icon, "kit", "First-protection uses the kit icon");
  // strictEqual, so dropping the field from the broadcast fails here rather
  // than quietly passing as undefined == false.
  Assert.strictEqual(
    message.data.etpOff,
    false,
    "Carries the ETP state, off by default in this profile"
  );

  const setPref = feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .find(
      a =>
        a.type === actionTypes.SET_PREF && a.data?.name === PREF_MESSAGE_STATE
    );
  Assert.ok(setPref, "Persists the scheduler state");
  Assert.ok(
    JSON.parse(setPref.data.value).firstProtectionShown,
    "Records that first-protection fired"
  );
  Assert.ok("cta" in message.data, "Message carries the cta field");

  sandbox.restore();
});

add_task(async function test_force_message_id_pins_the_message() {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
    [PREF_FORCE_MESSAGE_ID]: "newtab-privacy-message-promo-relay-1",
  });
  const sandbox = sinon.createSandbox();
  sandbox
    .stub(feed, "fetchTodayCounts")
    .resolves({ trackersToday: 42, sitesToday: 7, lastUpdated: 123 });
  sandbox.stub(feed, "getPeriodTotals").resolves({
    weekTotal: 0,
    monthTotal: 0,
    yearTotal: 0,
    allTimeTotal: 0,
    streakDays: 0,
  });
  sandbox
    .stub(feed, "getFeatureFlags")
    .resolves({ signedIn: false, hasLogins: false, relayMasks: false });
  sandbox.stub(feed, "getProfileCreatedMs").resolves(0);

  await feed.onAction({ type: actionTypes.NEW_TAB_INIT });

  const action = broadcastCall(feed);
  Assert.equal(
    action.data.messageId,
    "newtab-privacy-message-promo-relay-1",
    "forceMessageId pref pins the broadcast message"
  );
  Assert.equal(action.data.cta.type, "OPEN_URL", "Carries the message's cta");

  sandbox.restore();
});

add_task(async function test_cta_action_forwarded_to_sma() {
  const feed = feedWithPrefs({});
  const sandbox = sinon.createSandbox();
  const handleAction = sandbox
    .stub(SpecialMessageActions, "handleAction")
    .resolves();
  const smaAction = { type: "OPEN_ABOUT_PAGE", data: { args: "protections" } };
  const browser = { documentGlobal: {} };

  await feed.onAction({
    type: actionTypes.WIDGETS_PRIVACY_CTA,
    data: { action: smaAction, message_id: "newtab-privacy-message-info-1" },
    _target: { browser },
  });

  Assert.ok(handleAction.calledOnce, "Runs the SpecialMessageAction");
  Assert.deepEqual(
    handleAction.firstCall.args[0],
    smaAction,
    "Forwards the message's action descriptor"
  );
  Assert.equal(
    handleAction.firstCall.args[1],
    browser,
    "Targets the browser that fired the CTA"
  );

  sandbox.restore();
});

add_task(async function test_cta_action_ignored_without_target() {
  const feed = feedWithPrefs({});
  const sandbox = sinon.createSandbox();
  const handleAction = sandbox
    .stub(SpecialMessageActions, "handleAction")
    .resolves();

  await feed.onAction({
    type: actionTypes.WIDGETS_PRIVACY_CTA,
    data: { action: { type: "OPEN_ABOUT_PAGE" } },
    // no _target
  });

  Assert.ok(handleAction.notCalled, "No-ops when the target browser is absent");
  sandbox.restore();
});

add_task(async function test_getPeriodTotals_buckets_by_period() {
  await TrackingDBService.clearAll();
  // Today is in every period; a 400-day-old block is only in all-time (it
  // predates the current calendar year regardless of what day it is now).
  await seedEvents([
    { offsetDays: 0, count: 10 },
    { offsetDays: 400, count: 1000 },
  ]);

  const totals = await new PrivacyFeed().getPeriodTotals(Date.now());

  Assert.equal(totals.allTimeTotal, 1010, "All-time sums every block");
  Assert.equal(totals.weekTotal, 10, "Week excludes the 400-day-old block");
  Assert.equal(totals.monthTotal, 10, "Month excludes the 400-day-old block");
  Assert.equal(totals.yearTotal, 10, "Year excludes the 400-day-old block");

  await TrackingDBService.clearAll();
});

add_task(async function test_getPeriodTotals_streak_counts_consecutive() {
  await TrackingDBService.clearAll();
  // Today, yesterday, 2 days ago -> streak 3; a gap at day 3 stops it.
  await seedEvents([
    { offsetDays: 0, count: 3 },
    { offsetDays: 1, count: 7 },
    { offsetDays: 2, count: 1 },
    { offsetDays: 4, count: 9 },
  ]);

  const { streakDays } = await new PrivacyFeed().getPeriodTotals(Date.now());
  Assert.equal(streakDays, 3, "Counts consecutive days ending today");

  await TrackingDBService.clearAll();
});

add_task(async function test_message_state_roundtrip() {
  const feed = feedWithPrefs({ [PREF_MESSAGE_STATE]: '{"shownToday":3}' });
  Assert.deepEqual(
    feed.readMessageState(),
    { shownToday: 3 },
    "Parses persisted state"
  );

  const bad = feedWithPrefs({ [PREF_MESSAGE_STATE]: "not json" });
  Assert.deepEqual(bad.readMessageState(), {}, "Falls back to {} on bad JSON");

  feed.writeMessageState({ shownToday: 9 });
  const setPref = feed.store.dispatch
    .getCalls()
    .map(c => c.args[0])
    .find(a => a.type === actionTypes.SET_PREF);
  Assert.equal(setPref.data.name, PREF_MESSAGE_STATE, "Writes the state pref");
  Assert.equal(setPref.data.value, '{"shownToday":9}', "Serializes to JSON");
});

add_task(async function test_getFeatureFlags_returns_booleans() {
  const flags = await new PrivacyFeed().getFeatureFlags();
  for (const key of ["signedIn", "hasLogins", "relayMasks"]) {
    Assert.equal(typeof flags[key], "boolean", `${key} is a boolean`);
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
  // Count broadcasts, not raw dispatches: seeding the celebration baseline
  // also emits a SetPref.
  const broadcasts = () =>
    feed.store.dispatch
      .getCalls()
      .filter(c => c.args[0]?.type === actionTypes.WIDGETS_PRIVACY_UPDATE)
      .length;
  Assert.equal(broadcasts(), 1, "Fetches on enablement PREF_CHANGED");

  // ...but an unrelated pref should not.
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "some.unrelated.pref" },
  });
  Assert.equal(broadcasts(), 1, "Ignores unrelated PREF_CHANGED");

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

// --- Count-up celebration state machine (HNT-2845) -------------------------

const PREF_CELEBRATION_STATE = "widgets.privacy.celebrationState";
const PREF_FORCE_CELEBRATION = "widgets.privacy.forceCelebration";
const PREF_CELEBRATION_THRESHOLD = "widgets.privacy.celebrationThreshold";

// utcDayKey() in PrivacyFeed keys off the UTC date, matching the tracking DB.
function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// resolveCelebration persists through ac.SetPref, so fold each write back into
// the fake store the way the real Prefs feed would.
function celebrationFeed(values = {}) {
  const feed = feedWithPrefs({ ...values });
  const { dispatch } = feed.store;
  feed.store.dispatch = sinon.spy(action => {
    if (action.type === actionTypes.SET_PREF) {
      feed.store.state.Prefs.values[action.data.name] = action.data.value;
    }
    return dispatch(action);
  });
  return feed;
}

function storedCelebrationState(feed) {
  const raw = feed.store.state.Prefs.values[PREF_CELEBRATION_STATE];
  return raw ? JSON.parse(raw) : null;
}

add_task(async function test_celebration_seeds_baseline_without_awarding() {
  const feed = celebrationFeed();

  Assert.equal(feed.resolveCelebration(40), null, "No award on the first run");

  const state = storedCelebrationState(feed);
  Assert.equal(state.date, utcToday(), "Seeds today's UTC date");
  Assert.equal(state.baselineCount, 40, "Seeds the baseline at the live count");
  Assert.equal(state.pending, null, "Nothing pending after seeding");
});

add_task(async function test_celebration_below_threshold_does_not_award() {
  const feed = celebrationFeed({
    [PREF_CELEBRATION_STATE]: JSON.stringify({
      date: utcToday(),
      baselineCount: 40,
      pending: null,
    }),
  });

  Assert.equal(feed.resolveCelebration(49), null, "+9 is below the +10 gate");
  Assert.equal(
    storedCelebrationState(feed).baselineCount,
    40,
    "Baseline is left alone so the climb keeps accumulating"
  );
});

add_task(async function test_celebration_awards_at_threshold() {
  const feed = celebrationFeed({
    [PREF_CELEBRATION_STATE]: JSON.stringify({
      date: utcToday(),
      baselineCount: 40,
      pending: null,
    }),
  });

  const award = feed.resolveCelebration(50);

  Assert.equal(award.fromCount, 40, "Counts up from the old baseline");
  Assert.equal(award.toCount, 50, "Counts up to the live count");
  Assert.ok(!award.forcedTier, "A real award carries no forced tier");
  Assert.equal(
    storedCelebrationState(feed).baselineCount,
    50,
    "Baseline advances so the next +10 is measured from here"
  );
});

add_task(async function test_celebration_respects_threshold_pref() {
  const feed = celebrationFeed({
    [PREF_CELEBRATION_THRESHOLD]: 25,
    [PREF_CELEBRATION_STATE]: JSON.stringify({
      date: utcToday(),
      baselineCount: 0,
      pending: null,
    }),
  });

  Assert.equal(feed.resolveCelebration(24), null, "Below the raised gate");
  Assert.ok(feed.resolveCelebration(25), "Awards once the raised gate is met");
});

add_task(async function test_celebration_reseeds_on_utc_rollover() {
  const feed = celebrationFeed({
    [PREF_CELEBRATION_STATE]: JSON.stringify({
      date: "2000-01-01",
      baselineCount: 500,
      pending: null,
    }),
  });

  Assert.equal(
    feed.resolveCelebration(3),
    null,
    "Yesterday's state can't fire"
  );

  const state = storedCelebrationState(feed);
  Assert.equal(state.date, utcToday(), "Re-dates to today");
  Assert.equal(state.baselineCount, 3, "Re-seeds at the new day's count");
});

add_task(async function test_celebration_reseeds_when_count_goes_backwards() {
  // Cleared history drops the count below the baseline; the rebound back up
  // must not read as a fresh +10.
  const feed = celebrationFeed({
    [PREF_CELEBRATION_STATE]: JSON.stringify({
      date: utcToday(),
      baselineCount: 300,
      pending: null,
    }),
  });

  Assert.equal(feed.resolveCelebration(5), null, "No award on the way down");
  Assert.equal(
    storedCelebrationState(feed).baselineCount,
    5,
    "Re-seeds at the lower count"
  );
});

add_task(async function test_celebration_replays_pending_then_expires_it() {
  const fresh = {
    date: utcToday(),
    baselineCount: 50,
    pending: { awardedAt: Date.now(), fromCount: 40, toCount: 50 },
  };
  const feed = celebrationFeed({
    [PREF_CELEBRATION_STATE]: JSON.stringify(fresh),
  });

  Assert.equal(
    feed.resolveCelebration(50).toCount,
    50,
    "An unplayed award is re-offered to the next tab"
  );

  // Older than the 10 minute window.
  const stale = celebrationFeed({
    [PREF_CELEBRATION_STATE]: JSON.stringify({
      ...fresh,
      pending: { ...fresh.pending, awardedAt: Date.now() - 11 * 60 * 1000 },
    }),
  });

  Assert.equal(stale.resolveCelebration(50), null, "A stale award is dropped");
  Assert.equal(
    storedCelebrationState(stale).pending,
    null,
    "And cleared, so it can't resurface"
  );
});

add_task(async function test_celebration_acknowledgement() {
  const pending = { awardedAt: 1234, fromCount: 40, toCount: 50 };
  const base = {
    date: utcToday(),
    baselineCount: 50,
    pending,
  };

  const matched = celebrationFeed({
    [PREF_CELEBRATION_STATE]: JSON.stringify(base),
  });
  matched.onAction({
    type: actionTypes.WIDGETS_PRIVACY_MARK_CELEBRATED,
    data: 1234,
  });
  Assert.equal(
    storedCelebrationState(matched).pending,
    null,
    "A matching ack clears the pending award"
  );

  // A slow tab acking an award that a newer one already replaced must not
  // clear the newer one.
  const mismatched = celebrationFeed({
    [PREF_CELEBRATION_STATE]: JSON.stringify(base),
  });
  mismatched.onAction({
    type: actionTypes.WIDGETS_PRIVACY_MARK_CELEBRATED,
    data: 9999,
  });
  Assert.deepEqual(
    storedCelebrationState(mismatched).pending,
    pending,
    "A stale ack leaves the current award pending"
  );
});

add_task(async function test_celebration_forced_tier() {
  const feed = celebrationFeed({
    [PREF_FORCE_CELEBRATION]: "cap",
    [PREF_CELEBRATION_STATE]: JSON.stringify({
      date: utcToday(),
      baselineCount: 40,
      pending: null,
    }),
  });

  const forced = feed.resolveCelebration(100);

  Assert.equal(forced.forcedTier, "cap", "Passes the tier through to content");
  Assert.equal(forced.toCount, 100, "Counts up to the live count");
  Assert.equal(forced.fromCount, 75, "Counts up across the debug span");
  Assert.equal(
    storedCelebrationState(feed).baselineCount,
    40,
    "The debug lever leaves the real baseline untouched"
  );
});

add_task(async function test_celebration_forced_tier_clamps_at_zero() {
  const feed = celebrationFeed({ [PREF_FORCE_CELEBRATION]: "brief" });

  Assert.equal(
    feed.resolveCelebration(3).fromCount,
    0,
    "Never counts up from a negative number"
  );
});

add_task(async function test_celebration_survives_malformed_state() {
  // The pref is hand-edited during QA, and `null` is valid JSON that used to
  // throw on property access — either would take the count broadcast down.
  for (const raw of ["{not json", "null", '"a string"', "[]"]) {
    const feed = celebrationFeed({ [PREF_CELEBRATION_STATE]: raw });

    Assert.equal(
      feed.resolveCelebration(40),
      null,
      `Recovers from ${raw} instead of throwing`
    );
    Assert.equal(
      storedCelebrationState(feed).baselineCount,
      40,
      `Re-seeds a usable baseline after ${raw}`
    );
  }
});

// --- Enhanced Tracking Protection off state (Bug 2063525) ------------------

const ETP_PREFS = [
  "network.cookie.cookieBehavior",
  "privacy.fingerprintingProtection",
  "privacy.socialtracking.block_cookies.enabled",
  "privacy.trackingprotection.cryptomining.enabled",
  "privacy.trackingprotection.enabled",
  "privacy.trackingprotection.fingerprinting.enabled",
  "privacy.trackingprotection.socialtracking.enabled",
];

// "ETP off" is Custom with every blocking option unchecked; there is no single
// pref for it. Start from that baseline and let each test turn one back on.
function setEtpAllOff() {
  Services.prefs.setIntPref("network.cookie.cookieBehavior", 0);
  Services.prefs.setBoolPref("privacy.fingerprintingProtection", false);
  Services.prefs.setBoolPref(
    "privacy.socialtracking.block_cookies.enabled",
    false
  );
  Services.prefs.setBoolPref(
    "privacy.trackingprotection.cryptomining.enabled",
    false
  );
  Services.prefs.setBoolPref("privacy.trackingprotection.enabled", false);
  Services.prefs.setBoolPref(
    "privacy.trackingprotection.fingerprinting.enabled",
    false
  );
  Services.prefs.setBoolPref(
    "privacy.trackingprotection.socialtracking.enabled",
    false
  );
}

function clearEtpPrefs() {
  for (const pref of ETP_PREFS) {
    Services.prefs.clearUserPref(pref);
  }
}

// Belt and braces: the tasks below clear up after themselves, but one failing
// mid-task would otherwise leave the profile's prefs rewritten.
registerCleanupFunction(clearEtpPrefs);

add_task(async function test_etp_off_when_nothing_is_blocked() {
  setEtpAllOff();
  Assert.ok(
    new PrivacyFeed().isEtpOff(),
    "Off once every blocking option is unchecked"
  );
  clearEtpPrefs();
});

add_task(async function test_etp_on_by_default() {
  // The default cookie behavior blocks cross-site trackers, so a profile that
  // has never touched these prefs is protected. Cleared on entry rather than
  // trusting the previous task to have tidied up.
  clearEtpPrefs();
  Assert.ok(!new PrivacyFeed().isEtpOff(), "On with the shipped defaults");
});

add_task(async function test_etp_on_when_any_single_option_is_blocking() {
  // Each option alone is enough to keep the count meaningful, so none of them
  // may fall through to the off state.
  const singleOption = [
    () => Services.prefs.setIntPref("network.cookie.cookieBehavior", 5),
    () =>
      Services.prefs.setBoolPref("privacy.trackingprotection.enabled", true),
    () =>
      Services.prefs.setBoolPref(
        "privacy.trackingprotection.cryptomining.enabled",
        true
      ),
    () =>
      Services.prefs.setBoolPref(
        "privacy.trackingprotection.fingerprinting.enabled",
        true
      ),
    () => Services.prefs.setBoolPref("privacy.fingerprintingProtection", true),
  ];

  for (const turnOn of singleOption) {
    setEtpAllOff();
    turnOn();
    Assert.ok(
      !new PrivacyFeed().isEtpOff(),
      "One blocking option keeps ETP on"
    );
  }

  clearEtpPrefs();
});

add_task(async function test_etp_social_tracking_needs_a_blocked_category() {
  // The social cookie pref only counts as blocking when something is actually
  // blocked for it, matching about:protections' socialEnabled check.
  setEtpAllOff();
  Services.prefs.setBoolPref(
    "privacy.socialtracking.block_cookies.enabled",
    true
  );
  Assert.ok(
    new PrivacyFeed().isEtpOff(),
    "Social cookies alone block nothing, so ETP is still off"
  );

  Services.prefs.setBoolPref("privacy.trackingprotection.enabled", true);
  Services.prefs.setBoolPref(
    "privacy.trackingprotection.socialtracking.enabled",
    true
  );
  Assert.ok(
    !new PrivacyFeed().isEtpOff(),
    "Social tracking with tracking content on is blocking"
  );

  clearEtpPrefs();
});

add_task(async function test_broadcasts_etp_off_with_the_counts() {
  // The count keeps its last value while protection is off (those trackers
  // really were blocked earlier today), so the flag is what tells content to
  // swap in the warning card.
  setEtpAllOff();
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

  await feed.updateCounts();

  Assert.ok(broadcastCall(feed).data.etpOff, "Broadcasts etpOff on a refresh");

  sandbox.restore();
  clearEtpPrefs();
});

add_task(async function test_new_tab_broadcast_carries_etp_off() {
  // The scheduler path assembles its own broadcast data, so covering
  // updateCounts() above doesn't cover the broadcast every new tab goes
  // through. Asserting the true case catches a hardcoded flag as well as a
  // missing one.
  setEtpAllOff();
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
  });
  const sandbox = sinon.createSandbox();
  sandbox
    .stub(feed, "fetchTodayCounts")
    .resolves({ trackersToday: 42, sitesToday: 7, lastUpdated: 123 });
  sandbox.stub(feed, "getPeriodTotals").resolves({
    weekTotal: 0,
    monthTotal: 0,
    yearTotal: 0,
    allTimeTotal: 0,
    streakDays: 0,
  });
  sandbox
    .stub(feed, "getFeatureFlags")
    .resolves({ signedIn: false, hasLogins: false, relayMasks: false });
  sandbox.stub(feed, "getProfileCreatedMs").resolves(0);

  const portID = "port-etp";
  await feed.onAction({
    type: actionTypes.NEW_TAB_INIT,
    data: { portID, browser: {} },
    meta: { fromTarget: portID },
  });

  Assert.ok(
    broadcastCall(feed).data.etpOff,
    "The new-tab broadcast carries etpOff alongside the message decision"
  );

  sandbox.restore();
  clearEtpPrefs();
});

// Feed with the ETP observers running and updateCounts() stubbed, for the
// refresh-scheduling tests below. Call feed.uninit() when done.
function observingFeed(sandbox, prefOverrides = {}) {
  const feed = feedWithPrefs({
    [PREF_WIDGETS_ENABLED]: true,
    [PREF_PRIVACY_ENABLED]: true,
    [PREF_SYSTEM_PRIVACY_ENABLED]: true,
    ...prefOverrides,
  });
  const updateCounts = sandbox.stub(feed, "updateCounts").resolves();
  feed.init();
  return { feed, updateCounts };
}

add_task(async function test_etp_pref_change_refreshes_the_widget() {
  // PrefsFeed doesn't forward these prefs, so without the feed's own observers
  // a toggle wouldn't reach open tabs until the next tick.
  setEtpAllOff();
  const sandbox = sinon.createSandbox();
  const { feed, updateCounts } = observingFeed(sandbox);

  // Turning one blocking option back on flips the derived value off -> on.
  Services.prefs.setBoolPref("privacy.trackingprotection.enabled", true);
  Assert.ok(updateCounts.calledOnce, "Turning protection on refreshes");

  feed.uninit();
  Services.prefs.setBoolPref("privacy.trackingprotection.enabled", false);
  Assert.ok(updateCounts.calledOnce, "No refresh once the feed is torn down");

  sandbox.restore();
  clearEtpPrefs();
});

add_task(async function test_etp_pref_change_ignored_when_widget_is_off() {
  // The observers run for the feed's lifetime, not just while the widget is
  // shown, so a toggle with the widget hidden must not fetch or broadcast.
  setEtpAllOff();
  const sandbox = sinon.createSandbox();
  const { feed, updateCounts } = observingFeed(sandbox, {
    [PREF_PRIVACY_ENABLED]: false,
  });

  Services.prefs.setBoolPref("privacy.trackingprotection.enabled", true);
  Assert.ok(updateCounts.notCalled, "No fetch while the widget is hidden");

  // The flip isn't lost: turning the widget back on runs the enablement path,
  // which recomputes the state from the prefs as they now stand.
  feed.store.state.Prefs.values[PREF_PRIVACY_ENABLED] = true;
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: PREF_PRIVACY_ENABLED, value: true },
  });
  Assert.ok(updateCounts.calledOnce, "Picked up when the widget comes back");

  feed.uninit();
  sandbox.restore();
  clearEtpPrefs();
});

add_task(async function test_etp_category_switch_refreshes_once() {
  // Picking a category in about:preferences#privacy rewrites several of these
  // prefs in one go. Only the derived value matters, so that must cost one
  // refresh, not one per write (each is a Places query + tracking DB read).
  setEtpAllOff();
  const sandbox = sinon.createSandbox();
  const { feed, updateCounts } = observingFeed(sandbox);

  // Roughly what switching from "everything unchecked" to Standard writes.
  Services.prefs.setIntPref("network.cookie.cookieBehavior", 5);
  Services.prefs.setBoolPref("privacy.trackingprotection.enabled", true);
  Services.prefs.setBoolPref(
    "privacy.trackingprotection.cryptomining.enabled",
    true
  );
  Services.prefs.setBoolPref(
    "privacy.trackingprotection.fingerprinting.enabled",
    true
  );
  Services.prefs.setBoolPref(
    "privacy.trackingprotection.socialtracking.enabled",
    true
  );

  Assert.equal(updateCounts.callCount, 1, "Five writes, one refresh");

  feed.uninit();
  sandbox.restore();
  clearEtpPrefs();
});

add_task(async function test_etp_write_that_changes_nothing_does_not_refresh() {
  // A write inside a category — e.g. unchecking cryptominers while cookies are
  // still blocked — leaves the widget showing the same card. Starts from the
  // defaults, so clear on entry rather than trusting the previous task.
  clearEtpPrefs();
  const sandbox = sinon.createSandbox();
  const { feed, updateCounts } = observingFeed(sandbox);

  Services.prefs.setBoolPref(
    "privacy.trackingprotection.cryptomining.enabled",
    true
  );
  Services.prefs.setBoolPref(
    "privacy.trackingprotection.cryptomining.enabled",
    false
  );

  Assert.ok(
    updateCounts.notCalled,
    "Protection stayed on throughout, so nothing to refresh"
  );

  feed.uninit();
  sandbox.restore();
  clearEtpPrefs();
});
