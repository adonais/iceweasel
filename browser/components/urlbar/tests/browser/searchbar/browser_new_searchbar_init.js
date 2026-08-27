/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests whether the new and old searchbars get initialized/uninitialized
 * when enabled/disabled.
 */

add_task(async function () {
  SpecialPowers.pushPrefEnv({
    set: [["browser.search.widget.new", false]],
  });
  info("Opening new window (browser.search.widget.new=false).");
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let newSearchbar = win.document.querySelector("#searchbar-new");
  let oldSearchbar = win.document.querySelector("#searchbar");
  Assert.ok(!newSearchbar.controller, "New searchbar wasn't initialized");
  Assert.ok(!!oldSearchbar.firstChild, "Old searchbar was initialized");

  info("Enabling new searchbar.");
  SpecialPowers.popPrefEnv();
  await TestUtils.waitForTick();
  Assert.ok(!!newSearchbar.controller, "New searchbar was initialized");
  Assert.ok(!oldSearchbar.firstChild, "Old searchbar was uninitialized");
  await BrowserTestUtils.closeWindow(win);

  info("Opening new window (browser.search.widget.new=true).");
  win = await BrowserTestUtils.openNewBrowserWindow();
  newSearchbar = win.document.querySelector("#searchbar-new");
  oldSearchbar = win.document.querySelector("#searchbar");
  Assert.ok(!!newSearchbar.controller, "New searchbar was initialized");
  Assert.ok(!oldSearchbar.firstChild, "Old searchbar wasn't initialized");

  info("Disabling new searchbar.");
  let spy = sinon.spy(newSearchbar, "_removeObservers");
  SpecialPowers.pushPrefEnv({
    set: [["browser.search.widget.new", false]],
  });
  await TestUtils.waitForTick();
  Assert.ok(spy.calledOnce, "New searchbar was uninitialized");
  Assert.ok(!!oldSearchbar.firstChild, "Old searchbar was initialized");

  sinon.restore();
  await BrowserTestUtils.closeWindow(win);
  SpecialPowers.popPrefEnv();
});

/**
 * Tests that the search mode switcher stops observing engine changes while the
 * searchbar is disconnected, and observes them again once it's reconnected.
 */
add_task(async function searchModeSwitcherObservers() {
  await SearchTestUtils.updateRemoteSettingsConfig([
    { identifier: "engine1" },
    { identifier: "engine2" },
  ]);
  let engine1 = SearchService.defaultEngine;
  let engine2 = SearchService.getEngineById("engine2");

  let searchbar = document.getElementById("searchbar-new");
  let engineStore = searchbar.controller.engineStore;

  gCUITestUtils.removeSearchBar();
  Assert.ok(!searchbar.isConnected, "Searchbar was disconnected");

  let spy = sinon.spy(searchbar.searchModeSwitcher, "updateSearchIcon");
  await SearchService.setDefault(engine2, SearchService.CHANGE_REASON.UNKNOWN);
  await TestUtils.waitForCondition(
    () => engineStore.default.id == engine2.id,
    "Waiting for the engine store to pick up the new default engine"
  );
  Assert.ok(spy.notCalled, "Search icon wasn't updated while disconnected");

  await gCUITestUtils.addSearchBar();
  spy.resetHistory();

  await SearchService.setDefault(engine1, SearchService.CHANGE_REASON.UNKNOWN);
  await TestUtils.waitForCondition(
    () => spy.called,
    "Waiting for the search icon to be updated again"
  );

  sinon.restore();
});
