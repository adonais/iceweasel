/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CANONIZE_MODIFIERS =
  AppConstants.platform == "macosx" ? { metaKey: true } : { ctrlKey: true };

let searchbar = document.getElementById("searchbar-new");
let defaultEngine;

add_setup(async function () {
  await SearchTestUtils.updateRemoteSettingsConfig([{ identifier: "engine" }]);
  defaultEngine = Services.search.defaultEngine;
});

add_task(async function test_simple() {
  // This pref should not affect the searchbar.
  SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.openintab", true]],
  });

  let searchTerm = "test";
  searchbar.focus();
  EventUtils.sendString(searchTerm);
  EventUtils.synthesizeKey("KEY_Enter");
  await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);

  let expectedUrl = defaultEngine.getSubmission(searchTerm).uri.spec;
  Assert.equal(gBrowser.currentURI.spec, expectedUrl, "Search successful");
  Assert.equal(searchbar.value, searchTerm, "Search term was persisted");

  searchbar.value = "";
  SpecialPowers.popPrefEnv();
});

add_task(async function test_no_canonization() {
  let searchTerm = "test2";
  searchbar.focus();
  EventUtils.sendString(searchTerm);
  EventUtils.synthesizeKey("KEY_Enter", CANONIZE_MODIFIERS);
  await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);

  let expectedUrl = defaultEngine.getSubmission(searchTerm).uri.spec;
  Assert.equal(gBrowser.currentURI.spec, expectedUrl, "Search successful");
  Assert.equal(searchbar.value, searchTerm, "Search term was persisted");
  searchbar.value = "";
});

add_task(async function test_newtab_alt() {
  let searchTerm = "test3";
  let expectedUrl = defaultEngine.getSubmission(searchTerm).uri.spec;

  searchbar.focus();
  EventUtils.sendString(searchTerm);

  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser);
  EventUtils.synthesizeKey("KEY_Enter", { altKey: true });
  let newTab = await newTabPromise;
  let newBrowser = gBrowser.getBrowserForTab(newTab);

  Assert.equal(gBrowser.selectedBrowser, newBrowser, "Opened in foreground");
  Assert.equal(newBrowser.currentURI.spec, expectedUrl, "Search successful");
  Assert.equal(searchbar.value, searchTerm, "Search term was persisted");

  searchbar.value = "";
  BrowserTestUtils.removeTab(newTab);
});

add_task(async function test_newtab_pref() {
  SpecialPowers.pushPrefEnv({
    set: [["browser.search.openintab", true]],
  });
  let searchTerm = "test4";
  let expectedUrl = defaultEngine.getSubmission(searchTerm).uri.spec;

  searchbar.focus();
  EventUtils.sendString(searchTerm);

  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser);
  EventUtils.synthesizeKey("KEY_Enter");
  let newTab = await newTabPromise;
  let newBrowser = gBrowser.getBrowserForTab(newTab);

  Assert.equal(gBrowser.selectedBrowser, newBrowser, "Opened in foreground");
  Assert.equal(newBrowser.currentURI.spec, expectedUrl, "Search successful");
  Assert.equal(searchbar.value, searchTerm, "Search term was persisted");

  searchbar.value = "";
  BrowserTestUtils.removeTab(newTab);
  SpecialPowers.popPrefEnv();
});
