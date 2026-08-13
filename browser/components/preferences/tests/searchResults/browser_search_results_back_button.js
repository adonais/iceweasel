/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests that the Back button in the search results header is visible
 * whenever a search is active (both with and without results), and that
 * activating it clears the search, returns to the previously focused
 * category, and moves keyboard focus back to the search input.
 */

const RESULTS_QUERY = "privacy";
const NO_RESULTS_QUERY = "zzznothingtofindzzz";

/**
 * Waits for `el` to become `doc.activeElement`. Uses `focusin` rather than
 * `focus` because both `moz-input-search` and `moz-button` host their real
 * focusable element inside a shadow root: the non-composed `focus` event
 * stays trapped there, while `focusin` is composed and bubbles out. The
 * check-first guard makes the helper safe when the element is already focused.
 */
async function promiseFocused(el, msg) {
  let doc = el.ownerDocument;
  if (doc.activeElement !== el) {
    await BrowserTestUtils.waitForEvent(el, "focusin");
  }
  is(doc.activeElement, el, msg);
}

async function openSearchWithQuery(query) {
  await openPreferencesViaOpenPreferencesAPI(DEFAULT_PANE, {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  let searchCompletedPromise = BrowserTestUtils.waitForEvent(
    gBrowser.contentWindow,
    "PreferencesSearchCompleted",
    evt => evt.detail == query
  );
  doc.getElementById("searchInput").focus();
  EventUtils.sendString(query);
  await searchCompletedPromise;
  return doc;
}

add_task(async function back_button_visible_with_results() {
  let doc = await openSearchWithQuery(RESULTS_QUERY);
  let win = gBrowser.contentWindow;
  let searchInput = doc.getElementById("searchInput");

  let srHeader = doc.getElementById("header-searchResults");
  is_element_visible(srHeader, "Search results header is visible");

  let backButton = doc.getElementById("search-results-back-button");
  is_element_visible(
    backButton,
    "Back button is visible when results are found"
  );

  // The fix for this bug is that the Back button must NOT inherit tabindex=-1
  // from the allownoselection nav mechanism. moz-button uses delegatesFocus so
  // the host's .tabIndex is always -1; Tab-reachability is the correct signal.
  searchInput.focus();
  EventUtils.synthesizeKey("VK_TAB", {}, win);
  await promiseFocused(
    backButton,
    "Tab from search input reaches the back button"
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

/**
 * Back button is visible in the search results header even when no results
 * are found. This is the worst-case accessibility scenario: no result rows
 * to tab through, so the Back button is the only keyboard escape route.
 */
add_task(async function back_button_visible_with_no_results() {
  let doc = await openSearchWithQuery(NO_RESULTS_QUERY);

  let srHeader = doc.getElementById("header-searchResults");
  is_element_visible(
    srHeader,
    "Search results header is visible even with no results"
  );

  let backButton = doc.getElementById("search-results-back-button");
  is_element_visible(
    backButton,
    "Back button is visible when there are no results"
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function back_button_clears_search_and_focuses_search_input() {
  let doc = await openSearchWithQuery(RESULTS_QUERY);

  let srHeader = doc.getElementById("header-searchResults");
  let searchInput = doc.getElementById("searchInput");
  let backButton = doc.getElementById("search-results-back-button");
  let categories = doc.getElementById("categories");

  let searchCompletedPromise = BrowserTestUtils.waitForEvent(
    gBrowser.contentWindow,
    "PreferencesSearchCompleted",
    evt => evt.detail == ""
  );

  synthesizeClick(backButton);
  await searchCompletedPromise;

  is(searchInput.value, "", "Search input is cleared after Back");
  is_element_hidden(srHeader, "Search results header is hidden after Back");

  await promiseFocused(
    searchInput,
    "Focus returns to the search input after Back"
  );
  is(
    categories.currentView,
    DEFAULT_PANE,
    `Nav returns to the default pane (${DEFAULT_PANE}) after Back`
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function clearing_search_input_focuses_search_input() {
  let doc = await openSearchWithQuery(RESULTS_QUERY);
  let win = gBrowser.contentWindow;

  let searchInput = doc.getElementById("searchInput");

  let searchCompletedPromise = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == ""
  );

  searchInput.focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, win);
  EventUtils.synthesizeKey("KEY_Delete", {}, win);
  await searchCompletedPromise;

  await promiseFocused(
    searchInput,
    "Focus stays on the search input after clearing the query"
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function back_returns_to_non_default_category() {
  await openPreferencesViaOpenPreferencesAPI(DEFAULT_PANE, { leaveOpen: true });
  let doc = gBrowser.contentDocument;
  let win = gBrowser.contentWindow;
  let categories = doc.getElementById("categories");
  let searchInput = doc.getElementById("searchInput");
  let backButton = doc.getElementById("search-results-back-button");

  const OTHER_PANE = "panePrivacy";
  await win.gotoPref(OTHER_PANE);
  is(categories.currentView, OTHER_PANE, "Selected a non-default category");

  let resultsShown = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == RESULTS_QUERY
  );
  searchInput.focus();
  EventUtils.sendString(RESULTS_QUERY);
  await resultsShown;

  let backDone = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == ""
  );

  synthesizeClick(backButton);
  await backDone;

  await promiseFocused(
    searchInput,
    "Focus returns to the search input after Back"
  );
  is(
    categories.currentView,
    OTHER_PANE,
    "Back returns to the originally selected category, not the default"
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function back_button_keyboard_navigation_no_results() {
  await openPreferencesViaOpenPreferencesAPI(DEFAULT_PANE, { leaveOpen: true });
  let doc = gBrowser.contentDocument;
  let win = gBrowser.contentWindow;
  let categories = doc.getElementById("categories");
  let searchInput = doc.getElementById("searchInput");
  let srHeader = doc.getElementById("header-searchResults");
  let backButton = doc.getElementById("search-results-back-button");

  const OTHER_PANE = "panePrivacy";
  await win.gotoPref(OTHER_PANE);
  is(categories.currentView, OTHER_PANE, "Selected a non-default category");

  let resultsShown = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == NO_RESULTS_QUERY
  );
  searchInput.focus();
  EventUtils.sendString(NO_RESULTS_QUERY);
  await resultsShown;

  // Tab from search input to back button (no result rows present).
  EventUtils.synthesizeKey("VK_TAB", {}, win);
  await promiseFocused(backButton, "Focus moves to the back button via Tab");

  let backDone = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    evt => evt.detail == ""
  );

  EventUtils.synthesizeKey(" ", {}, win);
  await backDone;

  is(searchInput.value, "", "Search input is cleared after keyboard Back");
  await promiseFocused(
    searchInput,
    "Focus returns to the search input after keyboard Back"
  );
  is_element_hidden(
    srHeader,
    "Search results header is hidden after keyboard Back"
  );
  is(
    categories.currentView,
    OTHER_PANE,
    "Back returns to the originally selected category, not the default"
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
