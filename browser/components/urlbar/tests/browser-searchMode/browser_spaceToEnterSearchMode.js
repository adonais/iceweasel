/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests typing a search alias followed by a space to enter search mode, with no
 * results.
 */

"use strict";

const TEST_ENGINE_BASENAME = "searchSuggestionEngine.xml";

let gEngine;

add_setup(async function () {
  // Clear history so that using the alias of our test engine doesn't
  // inadvertently return any history results due to bug 1658646.
  await PlacesUtils.history.clear();

  gEngine = await SearchTestUtils.installOpenSearchEngine({
    url: getRootDirectory(gTestPath) + TEST_ENGINE_BASENAME,
  });
  gEngine.alias = "@test";
});

add_task(async function spaceToEnterSearchMode() {
  await doTest();
});

// A result can arrive while the engine store is still initializing. Entering
// search mode then has to wait for the engine, and the search that follows must
// not run ahead of that wait.
add_task(async function spaceToEnterSearchModeBeforeEngineStoreInit() {
  await doTest({ engineStoreInitialized: false });
});

/**
 * Types the test engine's alias followed by a space and checks that the search
 * runs in the search mode the space enters.
 *
 * @param {object} [options]
 *   Options object.
 * @param {boolean} [options.engineStoreInitialized]
 *   Whether the engine store has finished initializing by the time the space is
 *   typed. The store initializes on its own schedule once the window has loaded,
 *   so this is forced either way rather than left to whichever state the new
 *   window happens to be in.
 */
async function doTest({ engineStoreInitialized = true } = {}) {
  // Start in a new window so the view has a blank slate.
  let win = await BrowserTestUtils.openNewBrowserWindow();

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window: win,
    value: gEngine.alias,
  });

  let { engineStore } = win.gURLBar.controller;
  if (engineStoreInitialized) {
    await engineStore.init();
  } else {
    engineStore.initialized = false;
  }

  // We need to wait for two searches: The first enters search mode, the
  // second does the search in search mode.
  let searchPromise = UrlbarTestUtils.promiseSearchComplete(win);
  EventUtils.synthesizeKey(" ", {}, win);
  await searchPromise;

  Assert.equal(UrlbarTestUtils.getResultCount(win), 0, "Zero results");
  Assert.ok(
    win.gURLBar.hasAttribute("noresults"),
    "Panel has no results, therefore should have noresults attribute"
  );
  await UrlbarTestUtils.assertSearchMode(win, {
    engineName: gEngine.name,
    entry: "typed",
  });

  await UrlbarTestUtils.exitSearchMode(win, { backspace: true });
  await UrlbarTestUtils.promisePopupClose(win);
  await BrowserTestUtils.closeWindow(win);
}
