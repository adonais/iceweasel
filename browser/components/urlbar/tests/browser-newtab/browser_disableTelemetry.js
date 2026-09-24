/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// The newtab search bar carries UrlbarProviderQuickSuggest, so unlike the
// `searchbar` and `handoff` saps it can show the Suggest result that turning
// Suggest off reports on, and record a disable event of its own.

"use strict";

const SUGGEST_KEYWORD = "wikipedia";

const SUGGEST_PREF = "suggest.quicksuggest.all";

ChromeUtils.defineLazyGetter(this, "QuickSuggestTestUtils", () => {
  const { QuickSuggestTestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/QuickSuggestTestUtils.sys.mjs"
  );
  module.init(this);
  return module;
});

add_setup(async function () {
  await SearchTestUtils.installSearchExtension({}, { setAsDefault: true });

  let cleanupQuickSuggest = await QuickSuggestTestUtils.ensureQuickSuggestInit({
    remoteSettingsRecords: [
      {
        collection: QuickSuggestTestUtils.RS_COLLECTION.OTHER,
        type: QuickSuggestTestUtils.RS_TYPE.WIKIPEDIA,
        attachment: [
          QuickSuggestTestUtils.wikipediaRemoteSettings({
            keywords: [SUGGEST_KEYWORD],
          }),
        ],
      },
    ],
  });
  registerCleanupFunction(cleanupQuickSuggest);
});

add_telemetry_task(async function abandonedSession(browser) {
  await doSearch(browser, SUGGEST_KEYWORD);
  await assertSuggestResult(browser);

  await NewtabSearchbarTestUtils.blur(browser);
  await NewtabSearchbarTestUtils.waitForViewClosed(browser);
  await assertAbandonmentTelemetry([{ sap: "newtab_searchbar" }]);

  temporarilyDisableSuggest();

  assertDisableTelemetry([
    { sap: "newtab_searchbar", feature: "suggest", selected_result: "none" },
  ]);
});

add_telemetry_task(async function engagedSession(browser) {
  await doSearch(browser, SUGGEST_KEYWORD);
  await assertSuggestResult(browser);

  await doEnter(browser);
  await assertEngagementTelemetry([{ sap: "newtab_searchbar" }]);

  temporarilyDisableSuggest();

  assertDisableTelemetry([
    {
      sap: "newtab_searchbar",
      feature: "suggest",
      selected_result: "search_engine",
    },
  ]);
});

/**
 * Asserts that the bar is showing a Suggest result, which is what makes a
 * disable event possible.
 *
 * @param {MozBrowser} browser
 *   The browser the page is in.
 */
async function assertSuggestResult(browser) {
  let providers = [];
  let count = await NewtabSearchbarTestUtils.getResultCount(browser);
  for (let i = 0; i < count; i++) {
    let { result } = await NewtabSearchbarTestUtils.getDetailsOfResultAt(
      browser,
      i
    );
    providers.push(result.providerName);
  }

  Assert.ok(
    providers.includes("UrlbarProviderQuickSuggest"),
    `The bar is showing a Suggest result, among ${providers}`
  );
}

/**
 * Turns Suggest off, which records the disable event for the last search, then
 * turns it back on for the next task.
 */
function temporarilyDisableSuggest() {
  UrlbarPrefs.set(SUGGEST_PREF, false);
  UrlbarPrefs.set(SUGGEST_PREF, true);
}
