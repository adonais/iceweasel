/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The newtab address bar is its own search access point, so its searches are
// recorded under `newtab_searchbar` and against the newtab visit the bar sits
// in.

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  SearchSERPTelemetry:
    "moz-src:///browser/components/search/SearchSERPTelemetry.sys.mjs",
  SearchSERPTelemetryUtils:
    "moz-src:///browser/components/search/SearchSERPTelemetry.sys.mjs",
});

ChromeUtils.defineLazyGetter(this, "SearchUITestUtils", () => {
  let { SearchUITestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/SearchUITestUtils.sys.mjs"
  );
  module.init(this);
  return module;
});

const SUGGEST_URL =
  "https://example.com/browser/browser/components/urlbar/tests/browser-newtab/richSuggestionEngine.sjs";

// A page the SERP telemetry below recognizes, carrying two ad links.
const SERP_URL =
  "https://example.org/browser/browser/components/urlbar/tests/browser-newtab/searchTelemetryAd.html";

const SWITCHER_ENGINE_NAME = "Switcher";

const TEST_PROVIDER_INFO = [
  {
    telemetryId: "example",
    searchPageRegexp: new RegExp(`^${SERP_URL}`),
    queryParamNames: ["s"],
    codeParamName: "abc",
    taggedCodes: ["ff"],
    extraAdServersRegexps: [/^https:\/\/example\.com\/ad/],
    components: [
      {
        type: SearchSERPTelemetryUtils.COMPONENTS.AD_LINK,
        default: true,
      },
    ],
  },
];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.newtabpage.activity-stream.telemetry", true]],
  });
  await SearchTestUtils.installSearchExtension(
    {
      search_url: SERP_URL,
      search_url_get_params: "s={searchTerms}&abc=ff",
      suggest_url: SUGGEST_URL,
      suggest_url_get_params: "query={searchTerms}",
    },
    { setAsDefault: true }
  );
  await SearchTestUtils.installSearchExtension({
    name: SWITCHER_ENGINE_NAME,
    search_url: SERP_URL,
    search_url_get_params: "s={searchTerms}&abc=ff",
  });

  SearchSERPTelemetry.overrideSearchTelemetryForTests(TEST_PROVIDER_INFO);
  registerCleanupFunction(() => {
    SearchSERPTelemetry.overrideSearchTelemetryForTests();
    resetTelemetry();
  });
});

add_task(async function searchIssued() {
  resetTelemetry();
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;
  let visitId = await promiseVisitId(browser);

  let pingSubmitted = promiseSearchIssued({
    newtab_visit_id: visitId,
    search_access_point: "newtab_searchbar",
    telemetry_id: "other-Example",
  });

  await search(browser);
  await pingSubmitted;

  BrowserTestUtils.removeTab(tab);
});

add_task(async function plainQuery() {
  resetTelemetry();
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  await search(browser);

  await assertSAPTelemetry("search_enter");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function pickedSuggestion() {
  resetTelemetry();
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;

  await search(browser, async () => {
    let index =
      await NewtabSearchbarTestUtils.promiseSuggestionsPresent(browser);
    await NewtabSearchbarTestUtils.setSelectedRowIndex(browser, index);
  });

  await assertSAPTelemetry("search_suggestion");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function switcherSearch() {
  resetTelemetry();
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;
  let visitId = await promiseVisitId(browser);

  let pingSubmitted = promiseSearchIssued({
    newtab_visit_id: visitId,
    search_access_point: "newtab_searchbar",
    telemetry_id: `other-${SWITCHER_ENGINE_NAME}`,
  });

  let adImpression = promiseAdImpression();
  await enterSwitcherSearchMode(browser);
  await search(browser);
  await adImpression;

  await assertSAPTelemetry("search_enter", SWITCHER_ENGINE_NAME);
  await assertSerpTelemetry(browser, visitId);
  await pingSubmitted;

  BrowserTestUtils.removeTab(tab);
});

// The SERP a search from the bar loads reports the bar as its source, and its
// ads report the newtab visit the search came from, impressions and clicks
// alike.
add_task(async function serpTelemetry() {
  resetTelemetry();
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;
  let visitId = await promiseVisitId(browser);

  let adImpression = promiseAdImpression();
  await search(browser);
  await adImpression;

  await assertSerpTelemetry(browser, visitId);

  BrowserTestUtils.removeTab(tab);
});

add_task(async function serpTelemetryInNewTab() {
  resetTelemetry();
  let tab = await NewtabSearchbarTestUtils.openNewTabPage();
  let browser = tab.linkedBrowser;
  let visitId = await promiseVisitId(browser);

  let adImpression = promiseAdImpression();
  let serpTab = await searchInNewTab(browser);
  await adImpression;

  Assert.equal(
    browser.currentURI.spec,
    "about:newtab",
    "The newtab page the search came from stayed where it was"
  );
  await assertSAPTelemetry("search_enter");
  assertSearchIssued({
    newtab_visit_id: visitId,
    search_access_point: "newtab_searchbar",
    telemetry_id: "other-Example",
  });
  await assertSerpTelemetry(serpTab.linkedBrowser, visitId);

  BrowserTestUtils.removeTab(serpTab);
  BrowserTestUtils.removeTab(tab);
});

/**
 * Waits for the newtab visit id of the page a browser is showing.
 *
 * @param {MozBrowser} browser
 *   The browser showing the newtab page.
 * @returns {Promise<string>}
 */
function promiseVisitId(browser) {
  return TestUtils.waitForCondition(
    () => AboutNewTab.getVisitId(browser),
    "Waiting for the page's newtab visit id"
  );
}

/**
 * Types into the newtab address bar and waits for its results.
 *
 * @param {MozBrowser} browser
 *   The browser showing the newtab page.
 * @param {Function} [beforePicking]
 *   Called once the results are in, to select a row other than the heuristic.
 */
async function prepareSearch(browser, beforePicking) {
  await NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value: "hello",
  });
  await beforePicking?.();
}

/**
 * Searches from the newtab address bar and waits for the load.
 *
 * @param {MozBrowser} browser
 *   The browser showing the newtab page.
 * @param {Function} [beforePicking]
 *   Called once the results are in, to select a row other than the heuristic.
 */
async function search(browser, beforePicking) {
  await prepareSearch(browser, beforePicking);

  let loaded = BrowserTestUtils.browserLoaded(browser);
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  await loaded;
}

/**
 * Searches from the newtab address bar with the modifier that opens the search
 * in a new tab, and waits for that tab to load.
 *
 * @param {MozBrowser} browser
 *   The browser showing the newtab page.
 * @returns {Promise<MozTabbrowserTab>}
 *   The tab the search opened.
 */
async function searchInNewTab(browser) {
  await prepareSearch(browser);

  let opened = BrowserTestUtils.waitForNewTab(
    gBrowser,
    url => url.startsWith(SERP_URL),
    true
  );
  await BrowserTestUtils.synthesizeKey("KEY_Enter", { altKey: true }, browser);
  return opened;
}

/**
 * Enter search mode for the tests engine.
 *
 * @param {MozBrowser} browser
 *   The browser showing the newtab page.
 */
function enterSwitcherSearchMode(browser) {
  return NewtabSearchbarTestUtils.spawn(
    browser,
    [SWITCHER_ENGINE_NAME],
    async engineName => {
      let utils = NewtabSearchbarContentTestUtils;
      await utils.activateSearchModeSwitcherItem(
        content,
        `panel-item[data-engine-name="${engineName}"]`
      );
      await utils.assertSearchMode(content, {
        engineName,
        entry: "searchbutton",
        isGeneralPurposeEngine: false,
      });
    }
  );
}

/**
 * Asserts the search access point telemetry of one search.
 *
 * @param {string} action
 *   The navigation metric's label for how the search was made.
 * @param {string} [engineName]
 *   The engine the search was made with.
 */
async function assertSAPTelemetry(action, engineName = "Example") {
  await SearchUITestUtils.assertSAPTelemetry({
    engineName,
    source: "newtab_searchbar",
    count: 1,
  });
  Assert.equal(
    Glean.browserEngagementNavigation.newtabSearchbar[action].testGetValue(),
    1,
    `The search was counted as ${action} under the SAP's navigation metric`
  );
}

/**
 * Asserts the `newtab.search.issued` record of one search. The newtab ping is
 * only submitted once the visit ends, so this reads the record while the page
 * the search came from is still open.
 *
 * @param {object} expected
 *   The extras the record is expected to carry.
 */
function assertSearchIssued(expected) {
  let records = Glean.newtabSearch.issued.testGetValue("newtab") ?? [];
  Assert.equal(records.length, 1, "One search was issued");
  Assert.deepEqual(
    records[0].extra,
    expected,
    "The search was recorded against the newtab visit"
  );
}

/**
 * As {@link assertSearchIssued}, for a search that ends the newtab visit and so
 * has to be read off the ping the visit submits.
 *
 * @param {object} expected
 *   The extras the record is expected to carry.
 * @returns {Promise<void>}
 *   Resolved once the ping carrying the search has been submitted.
 */
function promiseSearchIssued(expected) {
  return new Promise(resolve => {
    GleanPings.newtab.testBeforeNextSubmit(() => {
      assertSearchIssued(expected);
      resolve();
    });
  });
}

/**
 * @returns {Promise<any>}
 *   Resolved once a SERP has reported the ads it shows.
 */
function promiseAdImpression() {
  return TestUtils.topicObserved("reported-page-with-ad-impressions");
}

/**
 * Asserts that a loaded SERP reports the bar as its source, and that its ads
 * report the newtab visit the search came from, impressions and clicks alike.
 *
 * @param {MozBrowser} browser
 *   The browser showing the SERP.
 * @param {string} visitId
 *   The newtab visit the search was made from.
 */
async function assertSerpTelemetry(browser, visitId) {
  let expectedAdExtra = {
    newtab_visit_id: visitId,
    search_access_point: "newtab_searchbar",
    is_follow_on: "false",
    is_tagged: "true",
    telemetry_id: "example",
  };

  let impressions = Glean.serp.impression.testGetValue() ?? [];
  Assert.equal(impressions.length, 1, "The SERP reported one impression");
  Assert.equal(
    impressions[0].extra.source,
    "newtab_searchbar",
    "The impression carries the bar as its source"
  );

  let adImpressions = Glean.newtabSearchAd.impression.testGetValue() ?? [];
  Assert.equal(adImpressions.length, 1, "The ads reported one impression");
  Assert.deepEqual(
    adImpressions[0].extra,
    expectedAdExtra,
    "The ad impression was recorded against the newtab visit"
  );

  let loaded = BrowserTestUtils.waitForLocationChange(gBrowser);
  BrowserTestUtils.synthesizeMouseAtCenter("#ad1", {}, browser);
  await loaded;

  let adClicks = await TestUtils.waitForCondition(
    () => Glean.newtabSearchAd.click.testGetValue(),
    "Waiting for the ad click to be recorded"
  );
  Assert.equal(adClicks.length, 1, "The ad reported one click");
  Assert.deepEqual(
    adClicks[0].extra,
    expectedAdExtra,
    "The ad click was recorded against the newtab visit"
  );
}

function resetTelemetry() {
  TelemetryTestUtils.getAndClearKeyedHistogram("SEARCH_COUNTS");
  Services.fog.testResetFOG();
}
