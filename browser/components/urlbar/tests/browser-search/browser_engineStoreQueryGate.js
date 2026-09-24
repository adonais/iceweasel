/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that the paths which can produce a result wait for the content-side
 * engine store, so no result reaches the result-handling paths while the store
 * is still empty.
 */

"use strict";

/**
 * Puts the window's engine store back into its pre-init state and holds init
 * open, so the paths under test have something to wait for. The store
 * initializes on its own schedule once the window has loaded, so it's pinned
 * rather than left to whichever state the new window happens to be in. Its
 * engines are taken away along with the flag: the store has them by the time a
 * test can pin it, and a store that reports itself uninitialized while still
 * answering lookups wouldn't exercise anything.
 *
 * @param {Window} win
 *   The browser window whose store to pin.
 * @returns {Promise<Function>}
 *   Resolves with a function that restores the store and lets init finish.
 */
async function pinUninitializedEngineStore(win) {
  let { engineStore } = win.gURLBar.controller;
  await engineStore.init();

  let { promise, resolve } = Promise.withResolvers();
  let realInit = engineStore.init;
  engineStore.initialized = false;
  engineStore.init = () => promise;
  Object.defineProperty(engineStore, "default", {
    configurable: true,
    get: () => null,
  });
  engineStore.getEngineByName = () => undefined;

  return () => {
    delete engineStore.default;
    delete engineStore.getEngineByName;
    engineStore.initialized = true;
    engineStore.init = realInit;
    resolve();
  };
}

/**
 * Waits long enough that work dispatched without waiting for the engine store
 * would have reported back, on both transports: the icon lookup is a parent
 * round trip over the message path and a microtask without it.
 *
 * @param {Window} win
 *   The browser window to flush.
 * @param {string} engineId
 *   An engine id to look the icon up for, from before the store was pinned.
 */
async function flushParentRoundTrip(win, engineId) {
  await win.gURLBar.parentController.getEngineIconURL(engineId);
  await TestUtils.waitForTick();
}

add_task(async function queryWaitsForEngineStore() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let { engineStore } = win.gURLBar.controller;
  await engineStore.init();
  let engineId = engineStore.default.id;

  let letInitFinish = await pinUninitializedEngineStore(win);

  let started = false;
  let results = false;
  let listener = {
    onQueryStarted: () => (started = true),
    onQueryResults: () => (results = true),
  };
  win.gURLBar.controller.addListener(listener);

  await UrlbarTestUtils.inputIntoURLBar(win, "test");
  let queryPromise = win.gURLBar.lastQueryContextPromise;

  await flushParentRoundTrip(win, engineId);
  Assert.ok(!started, "Query didn't start while the engine store was empty");
  Assert.ok(!results, "No results while the engine store was empty");

  letInitFinish();
  await queryPromise;

  Assert.ok(started, "Query started once the engine store was ready");
  Assert.ok(results, "Results arrived once the engine store was ready");

  win.gURLBar.controller.removeListener(listener);
  await UrlbarTestUtils.promisePopupClose(win);
  await BrowserTestUtils.closeWindow(win);
});

// A query cancelled while it's held back must not be dispatched once the store
// is ready. Only the held-back query is affected: a cancel says nothing about
// the results of a query already running, which the view cancels for reasons of
// its own.
add_task(async function cancelWhileWaitingForEngineStore() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let { engineStore } = win.gURLBar.controller;
  await engineStore.init();
  let engineId = engineStore.default.id;

  let letInitFinish = await pinUninitializedEngineStore(win);

  let started = false;
  let listener = { onQueryStarted: () => (started = true) };
  win.gURLBar.controller.addListener(listener);

  await UrlbarTestUtils.inputIntoURLBar(win, "test");
  let queryPromise = win.gURLBar.lastQueryContextPromise;
  win.gURLBar.controller.cancelQuery();

  letInitFinish();
  await queryPromise;
  await flushParentRoundTrip(win, engineId);

  Assert.ok(
    !started,
    "Cancelled query wasn't dispatched once the store was up"
  );

  win.gURLBar.controller.removeListener(listener);
  await UrlbarTestUtils.promisePopupClose(win);
  await BrowserTestUtils.closeWindow(win);
});

// The store never being populated must not wedge the input: a failed search
// service is a permanent state, and queries still have to run without it.
add_task(async function failedEngineStoreDoesntBlockQueries() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let { engineStore } = win.gURLBar.controller;
  await engineStore.init();

  engineStore.initialized = false;
  engineStore.failed = true;
  engineStore.init = () => Promise.reject(new Error("Search service failed"));

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window: win,
    value: "test",
  });
  Assert.greater(
    UrlbarTestUtils.getResultCount(win),
    0,
    "Query ran with a failed engine store"
  );

  await UrlbarTestUtils.promisePopupClose(win);
  await BrowserTestUtils.closeWindow(win);
});

// The search restrict token enters search mode with the default engine, and
// `search` runs before any query has waited for the store.
add_task(async function searchRestrictTokenWaitsForEngineStore() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let { engineStore } = win.gURLBar.controller;
  await engineStore.init();
  let defaultEngineName = engineStore.default.name;

  let letInitFinish = await pinUninitializedEngineStore(win);

  win.gURLBar.search(UrlbarShared.RESTRICT_TOKENS.SEARCH + " test", {
    searchModeEntry: "typed",
  });
  letInitFinish();

  await TestUtils.waitForCondition(
    () => win.gURLBar.searchMode,
    "Waiting for search mode to be entered"
  );
  Assert.equal(
    win.gURLBar.searchMode.engineName,
    defaultEngineName,
    "Entered search mode with the default engine"
  );
  Assert.equal(win.gURLBar.value, "test", "Restrict token was stripped");

  await UrlbarTestUtils.exitSearchMode(win);
  await UrlbarTestUtils.promisePopupClose(win);
  await BrowserTestUtils.closeWindow(win);
});

// Paste-and-go suppresses the query, so the result it picks comes straight from
// the parent and has to wait for the store on its own.
add_task(async function fallbackNavigationWaitsForEngineStore() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let { engineStore } = win.gURLBar.controller;
  await engineStore.init();
  let engineId = engineStore.default.id;

  let letInitFinish = await pinUninitializedEngineStore(win);

  let resolved = false;
  let navigationPromise = win.gURLBar.controller
    .resolveFallbackNavigation({
      searchString: "test",
      where: "current",
      searchMode: null,
      browserId: win.gBrowser.selectedBrowser.browserId,
    })
    .then(details => {
      resolved = true;
      return details;
    });

  await flushParentRoundTrip(win, engineId);
  Assert.ok(!resolved, "Fallback navigation waited for the engine store");

  letInitFinish();
  await navigationPromise;
  Assert.ok(resolved, "Fallback navigation resolved once the store was ready");

  await BrowserTestUtils.closeWindow(win);
});
