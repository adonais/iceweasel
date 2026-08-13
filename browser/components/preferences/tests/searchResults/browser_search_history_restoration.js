/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Verify that the active search query is restored when navigating
 * back into the search-results history entry, and cleared again when
 * navigating forward to a non-results pane.
 */
add_task(async function search_state_restored_via_history() {
  await openPreferencesViaOpenPreferencesAPI(DEFAULT_PANE, { leaveOpen: true });
  let win = gBrowser.contentWindow;
  let doc = gBrowser.contentDocument;

  let query = "permission";
  let searchInput = doc.getElementById("searchInput");
  searchInput.focus();
  let searchCompleted = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == query
  );
  EventUtils.sendString(query);
  await searchCompleted;

  let srHeader = doc.getElementById("header-searchResults");
  is_element_visible(srHeader, "Search results header is visible after search");
  is(
    win.history.state?.searchQuery,
    query,
    "Active query is stashed on the history entry"
  );

  let privacyShown = waitForPaneChange("privacy", win);
  await win.gotoPref("privacy");
  await privacyShown;
  is(
    searchInput.value,
    "",
    "Search input is cleared when leaving the results pane"
  );
  is_element_hidden(srHeader, "Search results header hides on other panes");

  let searchShown = waitForPaneChange("searchResults", win);
  let searchRestored = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == query
  );
  win.history.go(-1);
  await searchShown;
  await searchRestored;

  is(searchInput.value, query, "Search input value is restored");
  is(
    win.gSearchResultsPane.query,
    query,
    "Search results pane query state is restored"
  );
  is_element_visible(
    srHeader,
    "Search results header is visible again after back"
  );

  privacyShown = waitForPaneChange("privacy", win);
  win.history.go(1);
  await privacyShown;
  is(
    searchInput.value,
    "",
    "Search input is cleared again when navigating forward off results"
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

/**
 * Verify that the sub-pane back arrow returns to search results when
 * the sub-pane was entered from a search.
 */
add_task(async function subpane_back_from_search_restores_query() {
  if (!SRD_PREF_VALUE) {
    info("Skipping: sub-panes only exist when settings redesign is enabled");
    return;
  }

  await openPreferencesViaOpenPreferencesAPI(DEFAULT_PANE, { leaveOpen: true });
  let win = gBrowser.contentWindow;
  let doc = gBrowser.contentDocument;

  let query = "dns";
  let searchInput = doc.getElementById("searchInput");
  searchInput.focus();
  let searchCompleted = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == query
  );
  EventUtils.sendString(query, win);
  await searchCompleted;

  let subPaneShown = waitForPaneChange("dnsOverHttps", win);
  win.gotoPref("dnsOverHttps");
  await subPaneShown;

  is(
    win.history.state?.previousCategory,
    "searchResults",
    "Sub-pane entered from search records searchResults as previous"
  );

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-pane[data-category="paneDnsOverHttps"]')
  );
  let subPane = doc.querySelector(
    'setting-pane[data-category="paneDnsOverHttps"]'
  );
  await subPane.updateComplete;

  let searchShown = waitForPaneChange("searchResults", win);
  let searchRestored = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == query
  );
  EventUtils.synthesizeMouseAtCenter(
    subPane.pageHeaderEl.backButtonEl,
    {},
    win
  );
  await searchShown;
  await searchRestored;

  is(searchInput.value, query, "Search input restored after sub-pane back");
  is_element_visible(
    doc.getElementById("header-searchResults"),
    "Search results header visible after sub-pane back"
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
