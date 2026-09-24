/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const SLOW_PAGE =
  "https://example.org/browser/browser/components/urlbar/tests/browser-UrlbarInput/slow-page.sjs";

add_setup(async function () {
  await PlacesUtils.history.clear();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.autoFill", false],
      ["browser.urlbar.suggest.searches", false],
    ],
  });
});

add_task(async function test_typed_then_selected() {
  // Setup a history to pick up as suggestion.
  let suggestionURL = "https://example.com/typed_then_selected";
  await PlacesTestUtils.addVisits(suggestionURL);
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  // Load slow page.
  let onLoad = BrowserTestUtils.browserLoaded(
    gBrowser.selectedBrowser,
    false,
    SLOW_PAGE
  );
  BrowserTestUtils.startLoadingURIString(gBrowser.selectedBrowser, SLOW_PAGE);

  // Select a history suggestion before loading.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "exam",
    fireInputEvent: true,
  });
  EventUtils.synthesizeKey("KEY_ArrowDown");
  Assert.equal(gURLBar.untrimmedValue, suggestionURL);

  // Wait for the slow page.
  await onLoad;

  Assert.equal(
    gURLBar.untrimmedValue,
    suggestionURL,
    "Input keeps the selected suggestion after the load finished"
  );

  // Pick the suggestion.
  let onPick = BrowserTestUtils.browserLoaded(
    gBrowser.selectedBrowser,
    false,
    suggestionURL
  );
  EventUtils.synthesizeKey("KEY_Enter");
  await onPick;

  Assert.equal(
    gBrowser.selectedBrowser.currentURI.spec,
    suggestionURL,
    "Loaded expected suggestion"
  );

  await PlacesUtils.history.clear();
});

add_task(async function test_selected_without_typing() {
  // Setup a top site to pick up as suggestion.
  let suggestionURL = "https://example.com/without_typing";
  // Visit it enough times to make it a top site.
  for (let i = 0; i < 5; i++) {
    await PlacesTestUtils.addVisits(suggestionURL);
  }
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();
  await updateTopSites(sites => sites?.[0]?.url == suggestionURL);

  // Load slow page.
  let onLoad = BrowserTestUtils.browserLoaded(
    gBrowser.selectedBrowser,
    false,
    SLOW_PAGE
  );
  BrowserTestUtils.startLoadingURIString(gBrowser.selectedBrowser, SLOW_PAGE);

  // Select a top site without typing.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });
  EventUtils.synthesizeKey("KEY_ArrowDown");
  Assert.equal(gURLBar.untrimmedValue, suggestionURL);

  // Wait for the slow page.
  await onLoad;

  Assert.equal(
    gURLBar.untrimmedValue,
    suggestionURL,
    "Input keeps the selected top site after the load finished"
  );

  // Pick the top site.
  let onPick = BrowserTestUtils.browserLoaded(
    gBrowser.selectedBrowser,
    false,
    suggestionURL
  );
  EventUtils.synthesizeKey("KEY_Enter");
  await onPick;

  Assert.equal(
    gBrowser.selectedBrowser.currentURI.spec,
    suggestionURL,
    "Loaded expected top site"
  );

  await PlacesUtils.history.clear();
});
