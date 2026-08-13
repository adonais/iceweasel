/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests the smartbar-specific muxer's result groups composition logic.

"use strict";

const MAX_RESULTS_PREF = "browser.urlbar.smartbar.maxResults";
const SHOW_SEARCH_SUGGESTIONS_FIRST_PREF =
  "browser.urlbar.smartbar.showSearchSuggestionsFirst";

// The flex and index assertions below assume this `smartbar.maxResults`, so
// you'll need to update them if you change it.
const MAX_RESULTS = 7;

function makeHistoryResults(count) {
  let results = [];
  for (let i = 0; i < count; i++) {
    results.push(
      new UrlbarResult({
        type: UrlbarShared.RESULT_TYPE.URL,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
        payload: { url: "http://example.com/history/" + i },
      })
    );
  }
  return results;
}

function makeRemoteSuggestionResults(count) {
  let results = [];
  for (let i = 0; i < count; i++) {
    results.push(
      new UrlbarResult({
        type: UrlbarShared.RESULT_TYPE.SEARCH,
        source: UrlbarShared.RESULT_SOURCE.SEARCH,
        payload: {
          engine: "test",
          query: "foo",
          suggestion: "foo " + i,
          lowerCaseSuggestion: "foo " + i,
        },
      })
    );
  }
  return results;
}

async function smartbarResults(results) {
  let provider = registerBasicTestProvider(results);
  let context = createContext("foo", {
    sapName: "smartbar",
    providers: [provider.name],
    maxResults: UrlbarPrefs.get("smartbar.maxResults"),
  });
  let controller = UrlbarTestUtils.newMockController();
  await ProvidersManager.getInstanceForSap("urlbar").startQuery(
    context,
    controller
  );
  return context.results;
}

add_task(async function test_maxResults() {
  Services.prefs.setIntPref(MAX_RESULTS_PREF, MAX_RESULTS);
  let results = await smartbarResults([
    ...makeRemoteSuggestionResults(10),
    ...makeHistoryResults(10),
  ]);
  Assert.lessOrEqual(
    results.length,
    MAX_RESULTS,
    "No more than smartbar.maxResults results are returned"
  );

  Services.prefs.setIntPref(MAX_RESULTS_PREF, 4);
  results = await smartbarResults([
    ...makeRemoteSuggestionResults(10),
    ...makeHistoryResults(10),
  ]);
  Assert.lessOrEqual(
    results.length,
    4,
    "A lowered smartbar.maxResults is respected"
  );

  Services.prefs.clearUserPref(MAX_RESULTS_PREF);
});

add_task(async function test_group_order() {
  Services.prefs.setIntPref(MAX_RESULTS_PREF, MAX_RESULTS);

  for (let showSearchSuggestionsFirst of [true, false]) {
    Services.prefs.setBoolPref(
      SHOW_SEARCH_SUGGESTIONS_FIRST_PREF,
      showSearchSuggestionsFirst
    );

    let results = await smartbarResults([
      ...makeRemoteSuggestionResults(10),
      ...makeHistoryResults(10),
    ]);
    let firstSuggestionIndex = results.findIndex(
      result => result.type === UrlbarShared.RESULT_TYPE.SEARCH
    );
    let firstHistoryIndex = results.findIndex(
      result => result.type === UrlbarShared.RESULT_TYPE.URL
    );
    if (showSearchSuggestionsFirst) {
      Assert.equal(
        firstSuggestionIndex,
        0,
        "Search suggestions are shown first"
      );
      Assert.equal(
        firstHistoryIndex,
        5,
        "General results are shown after the search branch"
      );
    } else {
      Assert.equal(firstHistoryIndex, 0, "General results are shown first");
      Assert.equal(
        firstSuggestionIndex,
        2,
        "Search suggestions are shown after the general branch"
      );
    }
  }

  Services.prefs.clearUserPref(SHOW_SEARCH_SUGGESTIONS_FIRST_PREF);
  Services.prefs.clearUserPref(MAX_RESULTS_PREF);
});

add_task(async function test_search_group_ratio() {
  Services.prefs.setIntPref(MAX_RESULTS_PREF, MAX_RESULTS);

  for (let showSearchSuggestionsFirst of [true, false]) {
    Services.prefs.setBoolPref(
      SHOW_SEARCH_SUGGESTIONS_FIRST_PREF,
      showSearchSuggestionsFirst
    );

    let results = await smartbarResults([
      ...makeRemoteSuggestionResults(10),
      ...makeHistoryResults(10),
    ]);
    let suggestionCount = results.filter(
      result => result.type === UrlbarShared.RESULT_TYPE.SEARCH
    ).length;
    let historyCount = results.filter(
      result => result.type === UrlbarShared.RESULT_TYPE.URL
    ).length;
    // Search suggestions always get the larger share of results regardless of
    // their group position: The ratio is 2:1 in favor of the search branch.
    Assert.equal(
      suggestionCount,
      5,
      "Search suggestions get the larger share of results"
    );
    Assert.equal(
      historyCount,
      2,
      "General results get the smaller share of results"
    );
  }

  Services.prefs.clearUserPref(SHOW_SEARCH_SUGGESTIONS_FIRST_PREF);
  Services.prefs.clearUserPref(MAX_RESULTS_PREF);
});
