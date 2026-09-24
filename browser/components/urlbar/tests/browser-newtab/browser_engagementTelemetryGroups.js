/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The newtab search bar queries its own set of providers, so the result
// composition it reports matches neither the `urlbar` sap's nor the `searchbar`
// sap's. The providers it doesn't carry contribute no rows: a visited page and a
// top site are both invisible to it.

"use strict";

const SUGGEST_ENGINE_URL =
  "chrome://mochitests/content/browser/browser/components/urlbar/tests/browser/searchSuggestionEngine.xml";

add_setup(async function () {
  await SearchTestUtils.installOpenSearchEngine({
    url: SUGGEST_ENGINE_URL,
    setAsDefault: true,
  });
});

add_telemetry_task(async function searchSuggestions(browser) {
  await doSearch(browser, "foo");
  await doEnter(browser);

  await assertEngagementTelemetry([
    {
      groups: "heuristic,search_suggest,search_suggest",
      results: "search_engine,search_suggest,search_suggest",
      n_results: 3,
    },
  ]);
});

add_telemetry_task(async function searchHistory(browser) {
  await NewtabSearchbarTestUtils.formHistory.add(["foofoo", "foobar"]);

  await doSearch(browser, "foo");
  await doEnter(browser);

  await assertEngagementTelemetry([
    {
      groups: "heuristic,search_history,search_history",
      results: "search_engine,search_history,search_history",
      n_results: 3,
    },
  ]);
});

add_telemetry_task(async function recentSearch(browser) {
  await addRecentSearch();

  await doSearch(browser, "");
  await NewtabSearchbarTestUtils.setSelectedRowIndex(browser, 0);
  await doEnter(browser);

  await assertEngagementTelemetry([
    {
      groups: "recent_search",
      results: "recent_search",
      n_results: 1,
    },
  ]);
});

// UrlbarProviderPlaces is not one of the bar's providers, so a visited page
// contributes none of the `general` rows the address bar would show for the
// same string.
add_telemetry_task(async function noHistoryResults(browser) {
  // `browser.urlbar.suggest.searches` covers the address bar alone, so this is
  // the pref that leaves the bar's heuristic row on its own.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.autoFill", false],
      ["browser.search.suggest.enabled", false],
    ],
  });
  await PlacesTestUtils.addVisits("https://example.com/test");

  await doSearch(browser, "exa");
  await doEnter(browser);

  await assertEngagementTelemetry([
    {
      groups: "heuristic",
      results: "search_engine",
      n_results: 1,
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

// Nor is UrlbarProviderTopSites, so the zero-prefix view is the recent searches
// alone where the address bar's leads with the top sites.
add_telemetry_task(async function noTopSiteResults(browser) {
  await addTopSites("https://example.com/");
  await addRecentSearch();

  await doSearch(browser, "");
  await NewtabSearchbarTestUtils.setSelectedRowIndex(browser, 0);
  await doEnter(browser);

  await assertEngagementTelemetry([
    {
      groups: "recent_search",
      results: "recent_search",
      n_results: 1,
    },
  ]);
});

/**
 * Adds the form history entry the recent searches provider shows, which is one
 * recorded against the default engine.
 */
function addRecentSearch() {
  return NewtabSearchbarTestUtils.formHistory.add([
    { value: "foofoo", source: SearchService.defaultEngine.name },
  ]);
}
