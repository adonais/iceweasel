/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  actionTypes: "resource://newtab/common/Actions.mjs",
  SportsFeed: "resource://newtab/lib/Widgets/SportsFeed.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

const PREF_SPORTS_ENABLED = "widgets.sportsWidget.enabled";
const PREF_SYSTEM_SPORTS_ENABLED = "widgets.system.sportsWidget.enabled";

function makeFeed({ enabled = true, systemEnabled = true } = {}) {
  const feed = new SportsFeed();
  feed.store = {
    getState() {
      return this.state;
    },
    dispatch: sinon.spy(),
    state: {
      Prefs: {
        values: {
          [PREF_SPORTS_ENABLED]: enabled,
          [PREF_SYSTEM_SPORTS_ENABLED]: systemEnabled,
          "discoverystream.endpoints": "https://merino.services.mozilla.com/",
        },
      },
    },
  };
  return feed;
}

add_task(async function test_construction() {
  const feed = makeFeed();

  info("SportsFeed constructor should create initial values");
  Assert.ok(feed, "Could construct a SportsFeed");
  Assert.ok(!feed.initialized, "SportsFeed is not initialized");
});

add_task(async function test_enabled() {
  info(
    "SportsFeed.enabled returns true when both the user pref and the system pref are on"
  );
  Assert.ok(makeFeed({ enabled: true, systemEnabled: true }).enabled);

  info("SportsFeed.enabled returns false when the user pref is off");
  Assert.ok(!makeFeed({ enabled: false, systemEnabled: true }).enabled);

  info(
    "SportsFeed.enabled returns false when the system pref is off and no trainhop experiment is set"
  );
  Assert.ok(!makeFeed({ enabled: true, systemEnabled: false }).enabled);

  info(
    "SportsFeed.enabled returns true when the system pref is off but the trainhop experiment is set"
  );
  const trainhopFeed = makeFeed({ enabled: true, systemEnabled: false });
  trainhopFeed.store.state.Prefs.values.trainhopConfig = {
    sports: { enabled: true },
  };
  Assert.ok(trainhopFeed.enabled);
});

add_task(async function test_onAction_INIT_when_enabled() {
  const feed = makeFeed({ enabled: true });

  info("SportsFeed.onAction INIT should set initialized when enabled");
  await feed.onAction({ type: actionTypes.INIT });

  Assert.ok(feed.initialized, "feed.initialized should be true after INIT");
});

add_task(async function test_onAction_INIT_when_disabled() {
  const feed = makeFeed({ enabled: false });

  info("SportsFeed.onAction INIT should not initialize when disabled");
  await feed.onAction({ type: actionTypes.INIT });

  Assert.ok(!feed.initialized, "feed.initialized should remain false");
});

add_task(async function test_onAction_PREF_CHANGED_initializes() {
  const feed = makeFeed({ enabled: true });

  info("SportsFeed.onAction PREF_CHANGED should initialize when pref turns on");
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: PREF_SPORTS_ENABLED, value: true },
  });

  Assert.ok(
    feed.initialized,
    "feed.initialized should be true after pref enabled"
  );
});

add_task(
  async function test_onAction_PREF_CHANGED_initializes_on_system_pref() {
    const feed = makeFeed({ enabled: true, systemEnabled: false });
    Assert.ok(!feed.enabled, "feed starts disabled when system pref is off");

    feed.store.state.Prefs.values[PREF_SYSTEM_SPORTS_ENABLED] = true;

    info(
      "SportsFeed.onAction PREF_CHANGED should initialize when the system pref turns on"
    );
    await feed.onAction({
      type: actionTypes.PREF_CHANGED,
      data: { name: PREF_SYSTEM_SPORTS_ENABLED, value: true },
    });

    Assert.ok(
      feed.initialized,
      "feed.initialized should be true after system pref enabled"
    );
  }
);

add_task(async function test_onAction_PREF_CHANGED_initializes_on_trainhop() {
  const feed = makeFeed({ enabled: true, systemEnabled: false });
  Assert.ok(!feed.enabled, "feed starts disabled when system pref is off");

  feed.store.state.Prefs.values.trainhopConfig = {
    sports: { enabled: true },
  };

  info(
    "SportsFeed.onAction PREF_CHANGED should initialize when trainhopConfig turns the experiment on"
  );
  await feed.onAction({
    type: actionTypes.PREF_CHANGED,
    data: { name: "trainhopConfig", value: { sports: { enabled: true } } },
  });

  Assert.ok(
    feed.initialized,
    "feed.initialized should be true after trainhopConfig enabled"
  );
});

add_task(async function test_syncState_broadcasts_widgetState() {
  const feed = makeFeed();
  const getStub = sinon.stub(feed.cache, "get").resolves({
    widgetState: "sports-intro",
  });

  info("syncState should broadcast widgetState from cache to the UI");
  await feed.syncState();

  const [firstCall] = feed.store.dispatch.getCalls();
  Assert.equal(
    firstCall.args[0].type,
    actionTypes.WIDGETS_SPORTS_SET_WIDGET_STATE,
    "dispatches SET_WIDGET_STATE"
  );
  Assert.equal(firstCall.args[0].data, "sports-intro", "with correct state");

  getStub.restore();
});

add_task(async function test_syncState_broadcasts_selectedTeams() {
  const feed = makeFeed();
  const getStub = sinon.stub(feed.cache, "get").resolves({
    selectedTeams: ["CA", "AU"],
  });

  info("syncState should broadcast selectedTeams from cache to the UI");
  await feed.syncState();

  const [firstCall] = feed.store.dispatch.getCalls();
  Assert.equal(
    firstCall.args[0].type,
    actionTypes.WIDGETS_SPORTS_SET_SELECTED_TEAMS,
    "dispatches SET_SELECTED_TEAMS"
  );
  Assert.deepEqual(firstCall.args[0].data, ["CA", "AU"], "with correct teams");

  getStub.restore();
});

add_task(async function test_syncState_broadcasts_cached_teams_and_matches() {
  const feed = makeFeed();
  const cachedTeams = [{ id: "team1", name: "Team 1" }];
  const cachedMatches = [{ id: "match1" }];
  const getStub = sinon.stub(feed.cache, "get").resolves({
    sportsData: { teams: cachedTeams, matches: cachedMatches },
  });

  info("syncState should broadcast cached teams and matches to the UI");
  await feed.syncState();

  const [firstCall] = feed.store.dispatch.getCalls();
  Assert.equal(
    firstCall.args[0].type,
    actionTypes.WIDGETS_SPORTS_WIDGET_SET,
    "dispatches WIDGETS_SPORTS_WIDGET_SET"
  );
  Assert.deepEqual(
    firstCall.args[0].data.teams,
    cachedTeams,
    "with correct cached teams"
  );
  Assert.deepEqual(
    firstCall.args[0].data.matches,
    cachedMatches,
    "with correct cached matches"
  );

  getStub.restore();
});

add_task(async function test_syncState_empty_cache() {
  const feed = makeFeed();
  const getStub = sinon.stub(feed.cache, "get").resolves({});

  info("syncState should not dispatch when cache is empty");
  await feed.syncState();

  Assert.equal(feed.store.dispatch.callCount, 0, "no dispatch on empty cache");

  getStub.restore();
});

add_task(async function test_CHANGE_WIDGET_STATE_saves_and_broadcasts() {
  const feed = makeFeed();
  const setStub = sinon.stub(feed.cache, "set").resolves();

  info("CHANGE_WIDGET_STATE should save to cache and broadcast to the UI");
  await feed.onAction({
    type: actionTypes.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
    data: "sports-intro",
  });

  Assert.ok(setStub.calledOnce, "cache.set called once");
  Assert.equal(setStub.firstCall.args[0], "widgetState");
  Assert.equal(setStub.firstCall.args[1], "sports-intro");

  const [firstDispatch] = feed.store.dispatch.getCalls();
  Assert.equal(
    firstDispatch.args[0].type,
    actionTypes.WIDGETS_SPORTS_SET_WIDGET_STATE,
    "dispatches SET_WIDGET_STATE"
  );
  Assert.equal(firstDispatch.args[0].data, "sports-intro");

  setStub.restore();
});

add_task(async function test_CHANGE_WIDGET_STATE_follow_state_skips_cache() {
  const feed = makeFeed();
  const setStub = sinon.stub(feed.cache, "set").resolves();

  info(
    "CHANGE_WIDGET_STATE with the follow state should skip saving but still broadcast"
  );
  await feed.onAction({
    type: actionTypes.WIDGETS_SPORTS_CHANGE_WIDGET_STATE,
    data: "sports-follow-state",
  });

  Assert.ok(
    setStub.notCalled,
    "cache.set should not be called for follow state"
  );

  const [firstDispatch] = feed.store.dispatch.getCalls();
  Assert.equal(
    firstDispatch.args[0].type,
    actionTypes.WIDGETS_SPORTS_SET_WIDGET_STATE,
    "still dispatches SET_WIDGET_STATE"
  );
  Assert.equal(firstDispatch.args[0].data, "sports-follow-state");

  setStub.restore();
});

add_task(async function test_CHANGE_SELECTED_TEAMS_saves_and_broadcasts() {
  const feed = makeFeed();
  const setStub = sinon.stub(feed.cache, "set").resolves();

  info("CHANGE_SELECTED_TEAMS should save to cache and broadcast to the UI");
  await feed.onAction({
    type: actionTypes.WIDGETS_SPORTS_CHANGE_SELECTED_TEAMS,
    data: ["CA", "AU"],
  });

  Assert.ok(setStub.calledOnce, "cache.set called once");
  Assert.equal(setStub.firstCall.args[0], "selectedTeams");
  Assert.deepEqual(setStub.firstCall.args[1], ["CA", "AU"]);

  const [firstDispatch] = feed.store.dispatch.getCalls();
  Assert.equal(
    firstDispatch.args[0].type,
    actionTypes.WIDGETS_SPORTS_SET_SELECTED_TEAMS,
    "dispatches SET_SELECTED_TEAMS"
  );
  Assert.deepEqual(firstDispatch.args[0].data, ["CA", "AU"]);

  setStub.restore();
});

add_task(async function test_fetchSportsData_dispatches_teams_and_matches() {
  const feed = makeFeed();
  const mockTeamsResponse = { teams: [{ id: "team1", name: "Team 1" }] };
  const mockMatches = [{ id: "match1", teams: ["team1", "team2"] }];

  sinon.stub(feed.merino, "fetchSportsTeams").resolves(mockTeamsResponse);
  sinon.stub(feed.merino, "fetchSportsMatches").resolves(mockMatches);

  feed.store.state.Prefs.values["sports.worldCup.teamsEndpoint"] =
    "https://merino.services.mozilla.com/api/v1/wcs/teams";
  feed.store.state.Prefs.values["sports.worldCup.matchesEndpoint"] =
    "https://merino.services.mozilla.com/api/v1/wcs/matches";

  info(
    "fetchSportsData should dispatch WIDGETS_SPORTS_WIDGET_SET with teams and matches"
  );
  await feed.fetchSportsData();

  Assert.ok(feed.store.dispatch.calledOnce, "dispatch called once");
  const [dispatchedAction] = feed.store.dispatch.firstCall.args;
  Assert.equal(
    dispatchedAction.type,
    actionTypes.WIDGETS_SPORTS_WIDGET_SET,
    "dispatches WIDGETS_SPORTS_WIDGET_SET"
  );
  Assert.deepEqual(
    dispatchedAction.data.teams,
    mockTeamsResponse.teams,
    "with correct teams"
  );
  Assert.deepEqual(
    dispatchedAction.data.matches,
    mockMatches,
    "with correct matches"
  );
});

add_task(async function test_fetchSportsData_reads_endpoint_prefs() {
  const feed = makeFeed();
  const teamsEndpoint = "https://merino.services.mozilla.com/api/v1/wcs/teams";
  const matchesEndpoint =
    "https://merino.services.mozilla.com/api/v1/wcs/matches";

  feed.store.state.Prefs.values["sports.worldCup.teamsEndpoint"] =
    teamsEndpoint;
  feed.store.state.Prefs.values["sports.worldCup.matchesEndpoint"] =
    matchesEndpoint;

  const teamsStub = sinon.stub(feed.merino, "fetchSportsTeams").resolves([]);
  const matchesStub = sinon
    .stub(feed.merino, "fetchSportsMatches")
    .resolves([]);

  info("fetchSportsData should pass the endpoint prefs to the merino client");
  await feed.fetchSportsData();

  Assert.ok(
    teamsStub.calledWith({ source: "newtab", endpointUrl: teamsEndpoint }),
    "fetchSportsTeams called with correct endpoint"
  );
  Assert.ok(
    matchesStub.calledWith({ source: "newtab", endpointUrl: matchesEndpoint }),
    "fetchSportsMatches called with correct endpoint"
  );
});

add_task(
  async function test_fetchSportsData_prefers_trainhopConfig_endpoints() {
    const feed = makeFeed();
    const trainhopTeamsEndpoint = "https://trainhop.example.com/teams";
    const trainhopMatchesEndpoint = "https://trainhop.example.com/matches";

    feed.store.state.Prefs.values["discoverystream.endpoints"] =
      "https://merino.services.mozilla.com/,https://trainhop.example.com/";
    feed.store.state.Prefs.values["sports.worldCup.teamsEndpoint"] =
      "https://pref.example.com/teams";
    feed.store.state.Prefs.values["sports.worldCup.matchesEndpoint"] =
      "https://pref.example.com/matches";
    feed.store.state.Prefs.values.trainhopConfig = {
      sports: {
        teamsEndpoint: trainhopTeamsEndpoint,
        matchesEndpoint: trainhopMatchesEndpoint,
      },
    };

    const teamsStub = sinon.stub(feed.merino, "fetchSportsTeams").resolves([]);
    const matchesStub = sinon
      .stub(feed.merino, "fetchSportsMatches")
      .resolves([]);

    info(
      "fetchSportsData should prefer trainhopConfig endpoints over pref endpoints"
    );
    await feed.fetchSportsData();

    Assert.ok(
      teamsStub.calledWith({
        source: "newtab",
        endpointUrl: trainhopTeamsEndpoint,
      }),
      "fetchSportsTeams called with trainhopConfig endpoint"
    );
    Assert.ok(
      matchesStub.calledWith({
        source: "newtab",
        endpointUrl: trainhopMatchesEndpoint,
      }),
      "fetchSportsMatches called with trainhopConfig endpoint"
    );
  }
);

add_task(async function test_fetchSportsData_handles_null_responses() {
  const feed = makeFeed();

  sinon.stub(feed.merino, "fetchSportsTeams").resolves(null);
  sinon.stub(feed.merino, "fetchSportsMatches").resolves(null);

  info(
    "fetchSportsData should dispatch empty arrays when endpoints return null"
  );
  await feed.fetchSportsData();

  const [dispatchedAction] = feed.store.dispatch.firstCall.args;
  Assert.deepEqual(
    dispatchedAction.data.teams,
    [],
    "teams falls back to empty array"
  );
  Assert.deepEqual(
    dispatchedAction.data.matches,
    [],
    "matches falls back to empty array"
  );
});

add_task(async function test_fetchSportsData_caches_teams_and_matches() {
  const feed = makeFeed();
  const mockTeamsResponse = { teams: [{ id: "team1", name: "Team 1" }] };
  const mockMatches = [{ id: "match1" }];

  sinon.stub(feed.merino, "fetchSportsTeams").resolves(mockTeamsResponse);
  sinon.stub(feed.merino, "fetchSportsMatches").resolves(mockMatches);

  feed.store.state.Prefs.values["sports.worldCup.teamsEndpoint"] =
    "https://merino.services.mozilla.com/api/v1/wcs/teams";
  feed.store.state.Prefs.values["sports.worldCup.matchesEndpoint"] =
    "https://merino.services.mozilla.com/api/v1/wcs/matches";

  const setStub = sinon.stub(feed.cache, "set").resolves();

  info("fetchSportsData should save fetched teams and matches to cache");
  await feed.fetchSportsData();

  Assert.ok(
    setStub.calledWith("sportsData", {
      teams: mockTeamsResponse.teams,
      matches: mockMatches,
    }),
    "caches teams and matches together under sportsData key"
  );

  setStub.restore();
});

add_task(async function test_fetchSportsData_blocks_disallowed_endpoints() {
  const feed = makeFeed();
  feed.store.state.Prefs.values["discoverystream.endpoints"] =
    "https://allowed.example.com/";
  feed.store.state.Prefs.values["sports.worldCup.teamsEndpoint"] =
    "https://merino.services.mozilla.com/api/v1/wcs/teams";
  feed.store.state.Prefs.values["sports.worldCup.matchesEndpoint"] =
    "https://merino.services.mozilla.com/api/v1/wcs/matches";

  const teamsStub = sinon.stub(feed.merino, "fetchSportsTeams").resolves([]);
  const matchesStub = sinon
    .stub(feed.merino, "fetchSportsMatches")
    .resolves([]);

  info(
    "fetchSportsData should not fetch or dispatch when endpoints are not in the allowlist"
  );
  await feed.fetchSportsData();

  Assert.ok(teamsStub.notCalled, "fetchSportsTeams should not be called");
  Assert.ok(matchesStub.notCalled, "fetchSportsMatches should not be called");
  Assert.ok(
    feed.store.dispatch.notCalled,
    "dispatch should not be called for disallowed endpoints"
  );
});

add_task(async function test_init_calls_syncState_and_fetchSportsData() {
  const feed = makeFeed();
  sinon.stub(feed.cache, "get").resolves({});
  sinon.stub(feed.merino, "fetchSportsTeams").resolves([]);
  sinon.stub(feed.merino, "fetchSportsMatches").resolves([]);

  const syncStateSpy = sinon.spy(feed, "syncState");
  const fetchSportsDataSpy = sinon.spy(feed, "fetchSportsData");

  info("init() should call both syncState and fetchSportsData");
  await feed.init();

  Assert.ok(syncStateSpy.calledOnce, "syncState was called");
  Assert.ok(fetchSportsDataSpy.calledOnce, "fetchSportsData was called");
});
add_task(async function test_syncState_broadcasts_matchesTab() {
  const feed = makeFeed();
  const getStub = sinon.stub(feed.cache, "get").resolves({
    matchesTab: "results",
  });

  info("syncState should broadcast matchesTab from cache to the UI");
  await feed.syncState();

  const [firstCall] = feed.store.dispatch.getCalls();
  Assert.equal(
    firstCall.args[0].type,
    actionTypes.WIDGETS_SPORTS_SET_MATCHES_TAB,
    "dispatches SET_MATCHES_TAB"
  );
  Assert.equal(firstCall.args[0].data, "results", "with correct tab");

  getStub.restore();
});

add_task(async function test_CHANGE_MATCHES_TAB_saves_and_broadcasts() {
  const feed = makeFeed();
  const setStub = sinon.stub(feed.cache, "set").resolves();

  info("CHANGE_MATCHES_TAB should save to cache and broadcast to the UI");
  await feed.onAction({
    type: actionTypes.WIDGETS_SPORTS_CHANGE_MATCHES_TAB,
    data: "results",
  });

  Assert.ok(setStub.calledOnce, "cache.set called once");
  Assert.equal(setStub.firstCall.args[0], "matchesTab");
  Assert.equal(setStub.firstCall.args[1], "results");

  const [firstDispatch] = feed.store.dispatch.getCalls();
  Assert.equal(
    firstDispatch.args[0].type,
    actionTypes.WIDGETS_SPORTS_SET_MATCHES_TAB,
    "dispatches SET_MATCHES_TAB"
  );
  Assert.equal(firstDispatch.args[0].data, "results");

  setStub.restore();
});
