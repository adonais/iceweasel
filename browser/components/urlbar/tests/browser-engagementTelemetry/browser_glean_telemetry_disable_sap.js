/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test for the following data of disable telemetry.
// - sap

// A search string matching a Suggest result, since the disable event is recorded
// only for a search that showed one.
const SUGGEST_KEYWORD = "wikipedia";

const SUGGEST_PREF = "suggest.quicksuggest.all";

add_setup(async function () {
  await initSapTest();
  const cleanupQuickSuggest = await ensureQuickSuggestInit();
  registerCleanupFunction(async function () {
    await cleanupQuickSuggest();
  });
});

/**
 * Turns Suggest off, which records the disable event for the last search, then
 * turns it back on for the next test.
 */
function disableSuggest() {
  UrlbarPrefs.set(SUGGEST_PREF, false);
  UrlbarPrefs.set(SUGGEST_PREF, true);
}

/**
 * Abandons the current search, then turns Suggest off.
 *
 * The wait for the abandonment is required on the message path, where the
 * abandonment, which carries the disable candidate, is recorded parent-side
 * after a round trip.
 *
 * @param {Window} win
 *   The browser window the search happened in.
 * @param {string} sap
 *   The expected sap of the abandonment.
 */
async function doBlurAndDisableSuggest(win, sap) {
  await doBlur(UrlbarTestUtils, win);
  await assertAbandonmentTelemetry([{ sap }]);
  disableSuggest();
}

/**
 * Asserts that the current search shows no Suggest result, which is what makes a
 * disable event impossible.
 *
 * @param {object} testUtils
 *   The test utils of the input the search happened in.
 * @param {Window} win
 *   The browser window the search happened in.
 */
async function assertNoSuggestResult(testUtils, win) {
  for (let i = 0; i < testUtils.getResultCount(win); i++) {
    const { result } = await testUtils.getDetailsOfResultAt(win, i);
    Assert.notEqual(
      result.providerName,
      "UrlbarProviderQuickSuggest",
      "Result is not a Suggest result"
    );
  }
}

// This doesn't use doUrlbarTest() because the sap is resolved when Suggest is
// turned off, by which point the engagement has loaded another page: starting the
// search from a regular page keeps the expected sap unambiguous.
add_task(async function urlbar() {
  await doTest(async function () {
    const browser = gBrowser.selectedBrowser;
    const url = "https://example.com/";
    BrowserTestUtils.startLoadingURIString(browser, url);
    await BrowserTestUtils.browserLoaded(browser, false, url);

    await openPopup(SUGGEST_KEYWORD);
    await doEnter();
    await assertEngagementTelemetry([{ sap: "urlbar" }]);
    disableSuggest();

    assertDisableTelemetry([{ sap: "urlbar" }]);
  });
});

add_task(async function urlbar_newtab() {
  await doUrlbarNewTabTest({
    input: SUGGEST_KEYWORD,
    trigger: win => doBlurAndDisableSuggest(win, "urlbar_newtab"),
    assert: () => assertDisableTelemetry([{ sap: "urlbar_newtab" }]),
  });
});

// A handoff session searches in engine search mode, which excludes Suggest
// results, so it can never record a disable event.
add_task(async function handoff() {
  await doHandoffTest({
    input: SUGGEST_KEYWORD,
    trigger: async win => {
      await assertNoSuggestResult(UrlbarTestUtils, win);
      await doBlurAndDisableSuggest(win, "handoff");
    },
    assert: () => assertDisableTelemetry([]),
  });
});

add_task(async function urlbar_addonpage() {
  await doUrlbarAddonpageTest({
    input: SUGGEST_KEYWORD,
    trigger: win => doBlurAndDisableSuggest(win, "urlbar_addonpage"),
    assert: () => assertDisableTelemetry([{ sap: "urlbar_addonpage" }]),
  });
});

// The searchbar doesn't have the Suggest provider, so it can never show the
// Suggest result the disable event reports on, and thus never records one.
add_task(async function searchbar() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.search.widget.new", true]],
  });

  await doTest(async function () {
    let cuiTestUtils = new CustomizableUITestUtils(window);
    await cuiTestUtils.addSearchBar();

    try {
      await openPopup(SUGGEST_KEYWORD, SearchbarTestUtils);
      await assertNoSuggestResult(SearchbarTestUtils, window);

      await doEnter();
      await assertEngagementTelemetry([{ sap: "searchbar" }]);
      disableSuggest();

      assertDisableTelemetry([]);
    } finally {
      await cuiTestUtils.removeSearchBar();
    }
  });

  await SpecialPowers.popPrefEnv();
});
