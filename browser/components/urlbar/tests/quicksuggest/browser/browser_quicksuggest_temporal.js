/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests temporal search suggestions in the zero prefix view.

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  SearchUITestUtils: "resource://testing-common/SearchUITestUtils.sys.mjs",
});

SearchUITestUtils.init(this);

const QUERIES = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"];
const TOP_SITES = [
  "https://example-1.com/",
  "https://example-2.com/",
  "https://example-3.com/",
];
const OTHER_ENGINE_NAME = "TemporalOther";

let gEngine;
let gFeature;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.suggest.searches", true],
      ["browser.urlbar.suggest.recentsearches", false],
      ["browser.search.suggest.enabled", true],
      ["browser.urlbar.suggest.topsites", true],
      ["browser.newtabpage.activity-stream.default.sites", TOP_SITES.join(",")],
    ],
  });
  await updateTopSites(sites => sites?.length);

  await SearchTestUtils.installSearchExtension(
    {
      name: "TemporalTest",
      search_url: "https://example.com/",
      search_url_get_params: "q={searchTerms}",
    },
    { setAsDefault: true }
  );
  gEngine = SearchService.defaultEngine;
  await SearchTestUtils.installSearchExtension({
    name: OTHER_ENGINE_NAME,
    search_url: "https://example.org/",
  });

  UrlbarTestUtils.stubNowZonedDateTime("2026-11-15T12:00[America/New_York]");

  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    remoteSettingsRecords: [
      {
        type: "dynamic-suggestions",
        suggestion_type: "temporal",
        attachment: QUERIES.map(query => ({
          keywords: [""],
          dismissal_key: query,
          data: {
            group: "test-group",
            title: "Test group",
            type: "seasonal",
            startDate: "2026-11-12",
            endDate: "2026-11-27",
            engines: [gEngine.id],
            query,
          },
        })),
      },
    ],
    prefs: [["temporal.featureGate", true]],
  });
  gFeature = QuickSuggest.getFeature("TemporalSuggestions");

  registerCleanupFunction(async () => {
    gFeature._reset();
    UrlbarTestUtils.stubNowZonedDateTime(null);
    await PlacesUtils.history.clear();
  });
});

async function openZeroPrefix(win = window) {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window: win,
    value: "",
    fireInputEvent: true,
  });
}

async function closeView(win = window) {
  await UrlbarTestUtils.promisePopupClose(win, () => win.gURLBar.blur());
}

/**
 * @param {Window} [win]
 * @returns {Promise<object[]>}
 *   The details of the temporal rows in the view.
 */
async function getTemporalRows(win = window) {
  let rows = [];
  let count = UrlbarTestUtils.getResultCount(win);
  for (let i = 0; i < count; i++) {
    let details = await UrlbarTestUtils.getDetailsOfResultAt(win, i);
    if (QuickSuggest.getFeatureByResult(details.result) == gFeature) {
      rows.push({ ...details, index: i });
    }
  }
  return rows;
}

async function getTemporalQueries(win = window) {
  return (await getTemporalRows(win)).map(r => r.result.payload.suggestion);
}

// Three temporal rows appear after the top sites, using the search glass icon.
add_task(async function rowsBelowTopSites() {
  gFeature._reset();
  await openZeroPrefix();
  let rows = await getTemporalRows();
  Assert.equal(rows.length, 3, "Three temporal rows");

  let firstIndex = rows[0].index;
  Assert.greater(firstIndex, 0, "Temporal rows come after other rows");
  for (let i = 0; i < firstIndex; i++) {
    let details = await UrlbarTestUtils.getDetailsOfResultAt(window, i);
    Assert.equal(
      details.result.providerName,
      "UrlbarProviderTopSites",
      `Row ${i} is a top site`
    );
  }
  for (let row of rows) {
    Assert.equal(
      row.image,
      UrlbarShared.ICON.SEARCH_GLASS,
      "Temporal rows use the search glass icon"
    );
  }
  await closeView();
});

// Temporal rows are hidden while typing, and refocusing rotates to a different
// set of queries.
add_task(async function rotation() {
  gFeature._reset();
  await openZeroPrefix();
  let first = await getTemporalQueries();
  Assert.equal(first.length, 3, "Three temporal rows");

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "x",
    fireInputEvent: true,
  });
  Assert.deepEqual(await getTemporalQueries(), [], "No rows while typing");
  await closeView();

  await openZeroPrefix();
  let second = await getTemporalQueries();
  Assert.equal(second.length, 3, "Three temporal rows after refocus");
  Assert.ok(
    second.every(q => !first.includes(q)),
    "Refocusing rotates to a different set"
  );
  await closeView();
});

// No temporal rows are shown in private windows.
add_task(async function privateWindow() {
  gFeature._reset();
  let win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  await openZeroPrefix(win);
  Assert.deepEqual(
    await getTemporalQueries(win),
    [],
    "No rows in a private window"
  );
  await closeView(win);
  await BrowserTestUtils.closeWindow(win);
});

// No temporal rows are shown in search mode.
add_task(async function searchMode() {
  gFeature._reset();
  await openZeroPrefix();
  let searchPromise = UrlbarTestUtils.promiseSearchComplete(window);
  await UrlbarTestUtils.activateSearchModeSwitcherItem(
    window,
    `panel-item[data-engine-name="${OTHER_ENGINE_NAME}"]`
  );
  await searchPromise;
  Assert.equal(
    gURLBar.searchMode?.engineName,
    OTHER_ENGINE_NAME,
    "In search mode"
  );
  Assert.deepEqual(await getTemporalQueries(), [], "No rows in search mode");
  await UrlbarTestUtils.exitSearchMode(window);
  await closeView();
});

// Picking a temporal row searches for its query with the default engine and
// records SAP telemetry.
add_task(async function pick() {
  gFeature._reset();
  TelemetryTestUtils.getAndClearKeyedHistogram("SEARCH_COUNTS");
  Services.fog.testResetFOG();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );

  await openZeroPrefix();
  let rows = await getTemporalRows();
  let query = rows[0].result.payload.suggestion;
  let expectedUrl = gEngine.getSubmission(query).uri.spec;

  let loadPromise = BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    expectedUrl
  );
  EventUtils.synthesizeMouseAtCenter(rows[0].element.row, {});
  await loadPromise;
  Assert.equal(
    tab.linkedBrowser.currentURI.spec,
    expectedUrl,
    "Picking a row loads the same URL as searching for the query"
  );

  await SearchUITestUtils.assertSAPTelemetry({
    engineName: gEngine.name,
    source: "urlbar",
    count: 1,
  });

  BrowserTestUtils.removeTab(tab);
});
