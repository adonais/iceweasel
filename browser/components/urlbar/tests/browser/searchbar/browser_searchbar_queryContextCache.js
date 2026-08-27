/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that the view doesn't reuse results that were fetched for another page.
// The search bar keeps its value across tabs, so unlike in the address bar the
// same search string is commonly reused on a different page, while the results
// for it are not the same: the contextual search action offers the engine of
// the page the user is on.

"use strict";

// Only one of the two pages has a search engine of its own.
const PAGE_WITH_ENGINE = "https://example.org/";
const PAGE_WITHOUT_ENGINE = "https://example.com/";
const ENGINE_NAME = "Engine Of Example Org";
const SEARCH_STRING = "kitten";

let searchbar;

add_setup(async function () {
  searchbar = document.getElementById("searchbar-new");
  await SpecialPowers.pushPrefEnv({
    set: [["browser.search.suggest.enabled", false]],
  });
  await SearchTestUtils.installSearchExtension({
    name: ENGINE_NAME,
    search_url: PAGE_WITH_ENGINE,
  });
});

add_task(async function tabSwitch() {
  let tabWithEngine = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    PAGE_WITH_ENGINE
  );
  let tabWithoutEngine = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    PAGE_WITHOUT_ENGINE
  );

  // Search on the tab whose page has no engine, then close the view, keeping
  // the search string.
  await SearchbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: SEARCH_STRING,
  });
  Assert.ok(
    !hasContextualSearchAction(),
    "No contextual search action for a page without an engine"
  );
  await SearchbarTestUtils.promisePopupClose(window);

  let cache = searchbar.view.queryContextCache;
  Assert.ok(
    cache.get(SEARCH_STRING, PAGE_WITHOUT_ENGINE),
    "A context is cached for the page without an engine"
  );
  Assert.ok(
    !cache.get(SEARCH_STRING, PAGE_WITH_ENGINE),
    "No context is cached for the page with an engine"
  );

  // Switch to the tab whose page has an engine and click the search bar. The
  // view shouldn't open synchronously since the results it would show were
  // fetched for the other page.
  await blurAndSwitchTab(tabWithEngine);
  EventUtils.synthesizeMouseAtCenter(searchbar.inputField, {});
  Assert.ok(
    !searchbar.view.isOpen,
    "View doesn't open with the other page's results"
  );
  await SearchbarTestUtils.promiseSearchComplete(window);
  Assert.ok(
    hasContextualSearchAction(),
    "Contextual search action for the page with an engine"
  );
  await SearchbarTestUtils.promisePopupClose(window);

  // Switch back to the page without an engine. Its context is still cached, so
  // the view opens synchronously, and with that page's results.
  await blurAndSwitchTab(tabWithoutEngine);
  EventUtils.synthesizeMouseAtCenter(searchbar.inputField, {});
  Assert.ok(searchbar.view.isOpen, "View opens with the cached results");
  Assert.ok(
    !hasContextualSearchAction(),
    "Cached results are the ones fetched for the page without an engine"
  );
  await SearchbarTestUtils.promiseSearchComplete(window);
  await SearchbarTestUtils.promisePopupClose(window);

  searchbar.handleRevert();
  BrowserTestUtils.removeTab(tabWithEngine);
  BrowserTestUtils.removeTab(tabWithoutEngine);
});

/**
 * @returns {boolean}
 *   Whether the view currently shows an action offering the engine of the page
 *   the user is on.
 */
function hasContextualSearchAction() {
  let rows = SearchbarTestUtils.getResultsContainer(window).children;
  return Array.from(rows).some(row =>
    row.result?.payload.actionsResults?.some(
      action => action.l10nArgs?.engine == ENGINE_NAME
    )
  );
}

async function blurAndSwitchTab(tab) {
  // Blur the search bar so that switching tabs doesn't reopen the view, which
  // would start a query before we get to click the search bar.
  searchbar.blur();
  await BrowserTestUtils.switchTab(gBrowser, tab);
  Assert.ok(!searchbar.view.isOpen, "Sanity check: view is closed");
  Assert.equal(
    searchbar.value,
    SEARCH_STRING,
    "Sanity check: search bar kept its value"
  );
}
