/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async function setup() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.scotchBonnet.enableOverride", true]],
  });
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(gURLBar.querySelector(".searchmode-switcher")),
    "search mode switcher button is visible"
  );

  registerCleanupFunction(async () => {
    await cleanUp();
  });
});

add_task(async function test_opened() {
  await cleanUp();

  info("Open search mode switcher popup");
  let popup = await UrlbarTestUtils.openSearchModeSwitcher(window);
  Assert.equal(Glean.urlbarUnifiedsearchbutton.opened.testGetValue(), 1);

  info("Close search mode switcher popup");
  popup.hide();

  info("Open search mode switcher popup again");
  popup = await UrlbarTestUtils.openSearchModeSwitcher(window);
  Assert.equal(Glean.urlbarUnifiedsearchbutton.opened.testGetValue(), 2);

  info("Close search mode switcher popup again");
  popup.hide();
});

add_task(async function test_picked_search_engines() {
  await cleanUp();

  info("Open a new tab");
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  info("Start search engine tests");
  await testSearchEngine("Google", "builtin_search", 1);
  await testSearchEngine("Google", "builtin_search", 2);
  await testSearchEngine("DuckDuckGo", "builtin_search", 3);
  await testSearchEngine("BOOKMARK", "local_search", 1);
  await testSearchEngine("OPENPAGE", "local_search", 2);
  await testSearchEngine("DuckDuckGo", "builtin_search", 4);
  await testSearchEngine("BOOKMARK", "local_search", 3);
  await testSearchEngine("OPENPAGE", "local_search", 4);
  await testSearchEngine("DuckDuckGo", "builtin_search", 5);

  info("Add opensearch search engine");
  await loadUri(
    "http://mochi.test:8888/browser/browser/components/search/test/browser/opensearch.html"
  );
  info("Ensure to show Unified Search Button");
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    waitForFocus: true,
    value: "",
    fireInputEvent: true,
  });

  info("Test with addon search engine");
  let addPromise = SearchTestUtils.promiseEngine("Foo");
  // This will install then engine under the name Foo.
  await testSearchEngine("engine1", "addon_search", 1);
  await addPromise;
  await testSearchEngine("Foo", "addon_search", 2);
  await testSearchEngine("DuckDuckGo", "builtin_search", 6);
  await testSearchEngine("BOOKMARK", "local_search", 5);

  info("Clean up");
  await removeAddonSearchEngine("Foo");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_picked_settings() {
  await cleanUp();
  Assert.equal(
    Glean.urlbarUnifiedsearchbutton.picked.settings.testGetValue(),
    null
  );

  info("Open a new tab");
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  let popup = await UrlbarTestUtils.openSearchModeSwitcher(window);
  let popupHidden = UrlbarTestUtils.searchModeSwitcherPopupClosed(window);
  let pageLoaded = BrowserTestUtils.browserLoaded(window);
  popup
    .querySelector(".searchmode-switcher-panel-search-settings-button")
    .button.click();
  await Promise.all([pageLoaded, popupHidden]);
  Assert.equal(
    Glean.urlbarUnifiedsearchbutton.picked.settings.testGetValue(),
    1
  );

  BrowserTestUtils.removeTab(tab);
});

async function testSearchEngine(engineOrRestrict, telemetry, expected) {
  info(
    `Test search engine for ${JSON.stringify({ label: engineOrRestrict, telemetry, expected })}`
  );
  let popup = await UrlbarTestUtils.openSearchModeSwitcher(window);

  let popupHidden = UrlbarTestUtils.searchModeSwitcherPopupClosed(window);

  if (Object.keys(UrlbarTokenizer.RESTRICT).includes(engineOrRestrict)) {
    let restrict = UrlbarTokenizer.RESTRICT[engineOrRestrict];
    popup
      .querySelector(`panel-item[data-restrict="${restrict}"]`)
      .button.click();
  } else {
    popup
      .querySelector(`panel-item[data-engine-name="${engineOrRestrict}"]`)
      .button.click();
  }

  await popupHidden;

  Assert.equal(
    Glean.urlbarUnifiedsearchbutton.picked[telemetry].testGetValue(),
    expected
  );

  gURLBar.querySelector(".searchmode-switcher-close").click();
  await UrlbarTestUtils.assertSearchMode(window, null);
}

async function loadUri(uri) {
  let loaded = BrowserTestUtils.browserLoaded(
    gBrowser.selectedBrowser,
    false,
    uri
  );
  BrowserTestUtils.startLoadingURIString(gBrowser.selectedBrowser, uri);
  await loaded;
}

async function removeAddonSearchEngine(name) {
  let promiseEngineRemoved = SearchTestUtils.promiseSearchNotification(
    SearchUtils.MODIFIED_TYPE.REMOVED,
    SearchUtils.TOPIC_ENGINE_MODIFIED
  );
  let settingsWritten = SearchTestUtils.promiseSearchNotification(
    "write-settings-to-disk-complete"
  );
  let engine = SearchService.getEngineByName(name);
  await Promise.all([
    SearchService.removeEngine(engine),
    promiseEngineRemoved,
    settingsWritten,
  ]);
}

async function cleanUp() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
  Assert.equal(Glean.urlbarUnifiedsearchbutton.opened.testGetValue(), null);
}
