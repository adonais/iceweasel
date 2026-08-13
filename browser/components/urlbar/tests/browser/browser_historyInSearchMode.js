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
