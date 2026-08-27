/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const CONFIG_DEFAULT_V2 = [
  {
    recordType: "engine",
    identifier: "basic",
    base: {
      name: "basic",
      urls: {
        search: {
          base: "https://example.com",
          searchTermParamName: "q",
        },
        trending: {
          base: "https://example.com/browser/browser/components/search/test/browser/trendingSuggestionEngine.sjs",
          method: "GET",
        },
      },
    },
    variants: [
      {
        environment: { allRegionsAndLocales: true },
      },
    ],
  },
  {
    recordType: "defaultEngines",
    globalDefault: "basic",
    specificDefaults: [],
  },
  {
    recordType: "engineOrders",
    orders: [],
  },
];

const TOP_SITES = [
  "https://example-1.com/",
  "https://example-2.com/",
  "https://example-3.com/",
];

SearchTestUtils.init(this);

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.suggest.searches", true],
      ["browser.urlbar.suggest.recentsearches", true],
      ["browser.urlbar.suggest.topsites", false],
      ["browser.urlbar.recentsearches.featureGate", true],
      // Disable UrlbarProviderSearchTips
      [
        "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features",
        false,
      ],
    ],
  });

  await SearchTestUtils.updateRemoteSettingsConfig(CONFIG_DEFAULT_V2);

  registerCleanupFunction(async () => {
    await UrlbarTestUtils.formHistory.clear();
  });
});

add_task(async () => {
  let tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser: window.gBrowser,
    opening: "data:text/html,",
    waitForStateStop: true,
  });

  info("Perform a search that will be added to search history.");
  let browserLoaded = BrowserTestUtils.browserLoaded(
    window.gBrowser.selectedBrowser,
    false,
    "https://example.com/?q=Bob+Vylan"
  );
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "Bob Vylan",
  });

  await UrlbarTestUtils.promisePopupClose(window, () => {
    EventUtils.synthesizeKey("KEY_Enter", {}, window);
  });
  await browserLoaded;

  info("Now check that is shown in search history.");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });

  Assert.equal(
    UrlbarTestUtils.getResultCount(window),
    1,
    "Previous search shown"
  );
  let { result } = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(result.providerName, "UrlbarProviderRecentSearches");

  await BrowserTestUtils.removeTab(tab);
});

// Ensure that top sites are shown above recent searches, even if trending
// suggestions are disabled.
add_task(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.suggest.trending", false],
      ["browser.urlbar.suggest.topsites", true],
      ["browser.newtabpage.activity-stream.default.sites", TOP_SITES.join(",")],
    ],
  });
  await updateTopSites(sites => sites && sites.length);

  let tab = await BrowserTestUtils.openNewForegroundTab(
    window.gBrowser,
    "data:text/html,"
  );

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });

  let count = UrlbarTestUtils.getResultCount(window);
  let { result } = await UrlbarTestUtils.getDetailsOfResultAt(
    window,
    count - 1
  );
  Assert.equal(result.providerName, "UrlbarProviderRecentSearches");

  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// Test that triggering the help menu of trending suggestions does not
// record that selection as a search.
add_task(async () => {
  await UrlbarTestUtils.formHistory.clear();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.suggest.topsites", false],
      ["browser.urlbar.suggest.trending", true],
      ["browser.urlbar.trending.featureGate", true],
      ["browser.urlbar.trending.requireSearchMode", false],
      ["app.support.baseURL", "https://example.com"],
    ],
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    window.gBrowser,
    "data:text/html,"
  );

  info("Open the urlbar and pick the help menu of a trending result.");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });

  await UrlbarTestUtils.openResultMenuAndClickItem(window, "help", {
    resultIndex: 1,
    openByMouse: true,
  });

  info("Open the urlbar and check that a recent search has not been added.");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });

  let { result } = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.notEqual(
    result.providerName,
    "UrlbarProviderRecentSearches",
    "Click on help URL did not record a search"
  );

  await BrowserTestUtils.removeTab(gBrowser.selectedTab);
  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// Shift+deleting the last remaining suggestion should clear the input rather
// than leaving the removed suggestion's text behind (bug 2032429).
add_task(async function test_removeLastSuggestion_clearsInput() {
  await UrlbarTestUtils.formHistory.clear();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.suggest.topsites", false],
      ["browser.urlbar.suggest.trending", false],
    ],
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    window.gBrowser,
    "data:text/html,"
  );

  info("Seed a single recent search.");
  let browserLoaded = BrowserTestUtils.browserLoaded(
    window.gBrowser.selectedBrowser,
    false,
    "https://example.com/?q=Delete+Me"
  );
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "Delete Me",
  });
  await UrlbarTestUtils.promisePopupClose(window, () => {
    EventUtils.synthesizeKey("KEY_Enter", {}, window);
  });
  await browserLoaded;

  info("Open the empty urlbar with the recent search as the only result.");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });
  Assert.equal(
    UrlbarTestUtils.getResultCount(window),
    1,
    "The recent search is the only result"
  );
  let { result } = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(result.providerName, "UrlbarProviderRecentSearches");

  info("Select and shift+delete the recent search.");
  EventUtils.synthesizeKey("KEY_ArrowDown");
  Assert.equal(UrlbarTestUtils.getSelectedRowIndex(window), 0);
  Assert.equal(gURLBar.value, "Delete Me", "Value reflects the selection");
  EventUtils.synthesizeKey("KEY_Delete", { shiftKey: true });

  await TestUtils.waitForCondition(
    () => UrlbarTestUtils.getResultCount(window) == 0,
    "Waiting for the recent search to be removed"
  );
  Assert.equal(
    gURLBar.value,
    "",
    "The input is cleared after removing the last suggestion"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
