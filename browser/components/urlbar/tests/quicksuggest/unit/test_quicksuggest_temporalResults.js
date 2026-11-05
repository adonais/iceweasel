/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests temporal search suggestion results in the zero prefix view.

const QUERIES = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];

let gEngine;
let gFeature;

add_setup(async function () {
  gEngine = await addTestSuggestionsEngine();
  let oldDefaultEngine = SearchService.defaultEngine;
  await SearchService.setDefault(
    gEngine,
    SearchService.CHANGE_REASON.ADDON_INSTALL
  );

  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    remoteSettingsRecords: [makeRemoteSettingsRecord()],
    prefs: [["temporal.featureGate", true]],
  });
  gFeature = QuickSuggest.getFeature("TemporalSuggestions");
  // Always pick the first remaining query so results are deterministic.
  let randomStub = sinon.stub(gFeature, "_random").returns(0);

  UrlbarPrefs.set("suggest.searches", true);
  UrlbarPrefs.set("suggest.topsites", false);
  UrlbarTestUtils.stubNowZonedDateTime("2026-11-15T12:00[America/New_York]");

  registerCleanupFunction(async () => {
    UrlbarPrefs.clear("suggest.searches");
    UrlbarPrefs.clear("suggest.topsites");
    UrlbarTestUtils.stubNowZonedDateTime(null);
    gFeature._reset();
    randomStub.restore();
    await SearchService.setDefault(
      oldDefaultEngine,
      SearchService.CHANGE_REASON.ADDON_INSTALL
    );
  });
});

function makeData(query, overrides = {}) {
  return {
    group: "test-group",
    title: "Test group",
    type: "seasonal",
    startDate: "2026-11-12",
    endDate: "2026-11-27",
    engines: [gEngine.id],
    query,
    ...overrides,
  };
}

function makeRemoteSettingsRecord(overrides = {}) {
  return {
    type: "dynamic-suggestions",
    suggestion_type: "temporal",
    attachment: QUERIES.map(query => ({
      keywords: [""],
      dismissal_key: query,
      data: makeData(query, overrides),
    })),
  };
}

async function setRecords(overrides = {}) {
  await QuickSuggestTestUtils.setRemoteSettingsRecords([
    makeRemoteSettingsRecord(overrides),
  ]);
}

function newController() {
  let controller = UrlbarTestUtils.mockChildController();
  controller.setView({
    visibleResults: [],
    controller: {
      removeResult() {},
    },
    clearTopSitesCache() {},
  });
  return controller;
}

function makeExpectedResult(query) {
  let result = makeSearchResult(createContext("", { isPrivate: false }), {
    suggestion: query,
    query: null,
    engineName: gEngine.name,
    engineIconUri: UrlbarShared.ICON.SEARCH_GLASS,
    providerName: UrlbarProviderQuickSuggest.name,
  });
  delete result.payload.lowerCaseSuggestion;
  delete result.payload.trending;
  result.suggestedIndex = -1;
  result.isSuggestedIndexRelativeToGroup = true;
  Object.assign(result.payload, {
    source: "rust",
    provider: "Dynamic",
    suggestionType: "temporal",
    telemetryType: "temporal",
    isSponsored: false,
  });
  return result;
}

/**
 * Does a query and checks that it returns temporal results for the expected
 * queries.
 *
 * @param {string[]} expectedQueries
 *   The expected queries in pick order. Each result has a suggested index of
 *   -1, so they're shown in reverse pick order.
 * @param {object} [options]
 * @param {string} [options.searchString]
 * @param {object} [options.properties]
 *   Additional properties for the query context.
 */
async function checkQuery(
  expectedQueries,
  { searchString = "", properties = {} } = {}
) {
  await check_results({
    context: createContext(searchString, {
      providers: [UrlbarProviderQuickSuggest.name, "UrlbarProviderTopSites"],
      isPrivate: false,
      ...properties,
    }),
    matches: expectedQueries.map(makeExpectedResult).reverse(),
  });
}

// A zero prefix query returns `temporal.rowCount` temporal search results.
add_task(async function results() {
  gFeature._reset();
  await checkQuery(["q1", "q2", "q3"]);

  gFeature._reset();
  UrlbarPrefs.set("temporal.rowCount", 5);
  await checkQuery(["q1", "q2", "q3", "q4", "q5"]);
  UrlbarPrefs.clear("temporal.rowCount");
});

// Each zero prefix query picks queries other than the ones picked by the
// previous queries until every query has been picked, and then picking starts
// over.
add_task(async function rotation() {
  gFeature._reset();
  await checkQuery(["q1", "q2", "q3"]);
  await checkQuery(["q4", "q5", "q6"]);
  await checkQuery(["q7", "q1", "q2"]);
});

// No results are returned when there's a search string, in private windows,
// when a pref disables the feature, or when no group is eligible.
add_task(async function notShown() {
  for (let [searchString, properties] of [
    ["foo", {}],
    [" ", {}],
    ["", { isPrivate: true }],
  ]) {
    info(`Checking: ${JSON.stringify({ searchString, properties })}`);
    gFeature._reset();
    await checkQuery([], { searchString, properties });
  }

  for (let [pref, value] of [
    ["temporal.featureGate", false],
    ["suggest.temporal", false],
    ["suggest.temporal.seasonal", false],
    ["suggest.searches", false],
    ["browser.search.suggest.enabled", false],
  ]) {
    gFeature._reset();
    info(`Checking ${pref} = ${value}`);
    UrlbarPrefs.set(pref, value);
    await checkQuery([]);
    UrlbarPrefs.clear(pref);
  }
  UrlbarPrefs.set("temporal.featureGate", true);
  UrlbarPrefs.set("suggest.searches", true);
  await QuickSuggestTestUtils.forceSync();
  gFeature._reset();
  await checkQuery(["q1", "q2", "q3"]);

  info("Engine mismatch");
  await setRecords({ engines: ["google"] });
  await checkQuery([]);

  info("Group not started");
  await setRecords({ startDate: "2026-11-20" });
  await checkQuery([]);

  info("No records");
  await QuickSuggestTestUtils.setRemoteSettingsRecords([]);
  await checkQuery([]);

  await setRecords();
});

// Calls `makeResult()` for a temporal suggestion with the given context.
function makeResultForContext(context) {
  return gFeature.makeResult(context, {
    engine: gEngine.name,
    data: makeData("q1"),
  });
}

// `makeResult()` returns a result for a zero prefix query context.
add_task(async function makeResult() {
  let context = createContext("", { isPrivate: false });
  Assert.ok(await makeResultForContext(context), "Returns a result");
});

// `makeResult()` returns null when the search string is only whitespace.
add_task(async function makeResult_whitespace() {
  let context = createContext(" ", { isPrivate: false });
  Assert.equal(await makeResultForContext(context), null);
});

// `makeResult()` returns null outside the urlbar SAP.
add_task(async function makeResult_smartbar() {
  let context = createContext("", { isPrivate: false, sapName: "smartbar" });
  Assert.equal(await makeResultForContext(context), null);
});

// `makeResult()` returns a result in search mode for the default engine.
add_task(async function makeResult_searchMode_default() {
  let context = createContext("", {
    isPrivate: false,
    searchMode: { engineName: gEngine.name },
  });
  Assert.ok(await makeResultForContext(context), "Returns a result");
});

// `makeResult()` returns null in search mode for other engines.
add_task(async function makeResult_searchMode_nonDefault() {
  let context = createContext("", {
    isPrivate: false,
    searchMode: { engineName: "Other engine" },
  });
  Assert.equal(await makeResultForContext(context), null);
});

// `makeResult()` returns null in a local search mode.
add_task(async function makeResult_searchMode_local() {
  let context = createContext("", {
    isPrivate: false,
    searchMode: { source: UrlbarShared.RESULT_SOURCE.BOOKMARKS },
  });
  Assert.equal(await makeResultForContext(context), null);
});

// `makeResult()` returns a result when results are restricted to search.
add_task(async function makeResult_restrictSource() {
  let context = createContext("", { isPrivate: false });
  context.restrictSource = UrlbarShared.RESULT_SOURCE.SEARCH;
  Assert.ok(await makeResultForContext(context), "Returns a result");
});

// `makeResult()` returns a result when the query has the search restriction
// token.
add_task(async function makeResult_restrictToken() {
  let context = createContext("", { isPrivate: false });
  context.restrictToken = { value: "?" };
  Assert.ok(await makeResultForContext(context), "Returns a result");
});

// The dismiss command dismisses the query, which is then filtered out by the
// Rust component, and the remaining queries are still shown.
add_task(async function dismissal() {
  gFeature._reset();
  UrlbarPrefs.set("temporal.rowCount", QUERIES.length);
  let context = createContext("", {
    providers: [UrlbarProviderQuickSuggest.name, "UrlbarProviderTopSites"],
    isPrivate: false,
  });
  await newController().startQuery(context);
  let result = context.results.find(r => r.payload.suggestion == "q1");
  Assert.ok(result, "q1 is shown before dismissal");
  Assert.deepEqual(
    gFeature.getResultCommands(result).map(c => c.name),
    ["dismiss"],
    "Result commands"
  );

  let changedPromise = TestUtils.topicObserved(
    "quicksuggest-dismissals-changed"
  );
  triggerCommand({
    feature: gFeature,
    command: "dismiss",
    result,
    expectedCountsByCall: { removeResult: 1 },
  });
  await changedPromise;
  Assert.ok(await QuickSuggest.isResultDismissed(result), "q1 is dismissed");

  gFeature._reset();
  await checkQuery(QUERIES.filter(q => q != "q1"));

  await QuickSuggest.clearDismissedSuggestions();
  UrlbarPrefs.clear("temporal.rowCount");
});

// The group is shown from the start of its first local day through the end of
// its last local day.
add_task(async function dateBoundaries() {
  for (let [now, expected] of [
    ["2026-11-11T23:59[America/New_York]", []],
    ["2026-11-12T00:00[America/New_York]", ["q1", "q2", "q3"]],
    ["2026-11-27T23:59[America/New_York]", ["q1", "q2", "q3"]],
    ["2026-11-28T00:00[America/New_York]", []],
  ]) {
    info(`Checking now: ${now}`);
    gFeature._reset();
    UrlbarTestUtils.stubNowZonedDateTime(now);
    await checkQuery(expected);
  }
  UrlbarTestUtils.stubNowZonedDateTime("2026-11-15T12:00[America/New_York]");
});
