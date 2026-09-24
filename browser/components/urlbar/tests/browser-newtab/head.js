/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Globals of a `NewtabSearchbarTestUtils.spawn` task. The eslint rule that
// declares the sandbox's own globals only fires on a literal
// `SpecialPowers.spawn` call.
/* global NewtabSearchbarContentTestUtils, ContentTaskUtils */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/components/urlbar/tests/browser/head-common.js",
  this
);

ChromeUtils.defineLazyGetter(this, "NewtabSearchbarTestUtils", () => {
  const { NewtabSearchbarTestUtils: module } = ChromeUtils.importESModule(
    "resource://testing-common/NewtabSearchbarTestUtils.sys.mjs"
  );
  module.init(this, window);
  return module;
});

registerCleanupFunction(() => NewtabSearchbarTestUtils.formHistory.clear());

/**
 * Replaces the default engine with one that serves no suggestions, for a test
 * that has no use for them. The bar's SAP ignores the suggestion prefs the test
 * profile turns off, so a test left on the app-provided engine can reach that
 * engine's suggestion server for real.
 */
function useEngineWithoutSuggestions() {
  return SearchTestUtils.updateRemoteSettingsConfig([
    { identifier: "engine1" },
  ]);
}

/**
 * Adds a task that runs against about:newtab, with the telemetry, history and
 * form history recorded so far cleared and the tab closed afterwards. The task
 * takes the browser the page is in, and seeds the profile itself, after the
 * page is open and before it queries.
 *
 * @param {Function} taskFn
 *   Called with the browser the page is in.
 */
function add_telemetry_task(taskFn) {
  let func = async () => {
    await Services.fog.testFlushAllChildren();
    Services.fog.testResetFOG();
    await PlacesUtils.history.clear();
    await NewtabSearchbarTestUtils.formHistory.clear();

    let tab = await NewtabSearchbarTestUtils.openNewTabPage();
    try {
      await taskFn(tab.linkedBrowser);
    } finally {
      // A task closing the tab itself is what it set out to test.
      if (tab.isConnected) {
        BrowserTestUtils.removeTab(tab);
      }
    }
  };
  Object.defineProperty(func, "name", { value: taskFn.name });
  add_task(func);
}

/**
 * Starts a session in the bar and waits for its results.
 *
 * @param {MozBrowser} browser
 *   The browser the page is in.
 * @param {string} [value]
 *   The string to search for.
 */
function doSearch(browser, value = "x") {
  return NewtabSearchbarTestUtils.promiseAutocompleteResultPopup({
    browser,
    value,
  });
}

/**
 * Picks the selected result with the keyboard and waits for the load it starts.
 *
 * @param {MozBrowser} browser
 *   The browser the page is in.
 */
async function doEnter(browser) {
  let loaded = BrowserTestUtils.browserLoaded(browser);
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  await loaded;
}
