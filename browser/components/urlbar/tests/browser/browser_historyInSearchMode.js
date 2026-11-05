/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  UrlbarShared: "chrome://browser/content/urlbar/UrlbarShared.mjs",
});

add_setup(async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.unifiedSearchButton.always", true],
      ["browser.urlbar.unifiedSearchButton.historyInSearchMode", true],
    ],
  });

  let cleanup = await installPersistTestEngines();
  registerCleanupFunction(async function () {
    cleanup();
  });
});

add_task(async function test_history_in_searchmode() {
  registerCleanupFunction(async function () {
    await PlacesUtils.history.clear();
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  await PlacesTestUtils.addVisits(["https://screen.example.com/"]);

  await UrlbarTestUtils.activateSearchModeSwitcherItem(
    window,
    "panel-item[data-engine-name=Example]"
  );

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    waitForFocus,
    value: "screen",
    fireInputEvent: true,
  });

  Assert.equal(
    (await UrlbarTestUtils.getDetailsOfResultAt(window, 1)).source,
    UrlbarShared.RESULT_SOURCE.ACTIONS,
    "First result was matching quickaction"
  );

  Assert.equal(
    (await UrlbarTestUtils.getDetailsOfResultAt(window, 2)).type,
    UrlbarShared.RESULT_TYPE.URL,
    "Second result was matching history item"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_no_history_in_local_searchmode() {
  registerCleanupFunction(async function () {
    await PlacesUtils.history.clear();
    await PlacesUtils.bookmarks.eraseEverything();
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  await PlacesTestUtils.addVisits(["https://screen-history.example.com/"]);
  await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    url: "https://screen-bookmark.example.com/",
    title: "screen bookmark",
  });

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });
  await UrlbarTestUtils.activateSearchModeSwitcherItem(
    window,
    'panel-item[data-restrict="*"]'
  );
  await UrlbarTestUtils.assertSearchMode(window, {
    source: UrlbarShared.RESULT_SOURCE.BOOKMARKS,
    entry: "searchbutton",
  });

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    waitForFocus,
    value: "screen",
    fireInputEvent: true,
  });

  let results = [];
  for (let i = 0; i < UrlbarTestUtils.getResultCount(window); i++) {
    results.push(await UrlbarTestUtils.getDetailsOfResultAt(window, i));
  }
  let urls = results.map(result => result.url);
  Assert.ok(
    urls.includes("https://screen-bookmark.example.com/"),
    "Bookmark result is shown in bookmarks search mode"
  );
  Assert.ok(
    !urls.includes("https://screen-history.example.com/"),
    "History result is not shown in bookmarks search mode"
  );
  // Autofill only autofills bookmarks here, but always reports its results as
  // coming from history, so skip it.
  Assert.ok(
    results.every(
      result =>
        result.result.autofill ||
        result.source != UrlbarShared.RESULT_SOURCE.HISTORY
    ),
    "No results are from history in bookmarks search mode"
  );

  await UrlbarTestUtils.exitSearchMode(window);
  await UrlbarTestUtils.promisePopupClose(window);
  BrowserTestUtils.removeTab(tab);
});
