/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

requestLongerTimeout(2);

/**
 * When no setting-group matches, a pane should still surface if the query
 * matches its page header title.
 */
add_task(async function test_fallback_matches_pane_header() {
  const UNIQUE_HEADING = "zzqqtestpaneheadertext";

  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });
  let doc = gBrowser.selectedBrowser.contentDocument;

  let pane = doc.querySelector("setting-pane");
  await pane.updateComplete;
  let header = pane.pageHeaderEl;

  doc.l10n.disconnectRoot(header);
  header.removeAttribute("data-l10n-id");
  header.heading = UNIQUE_HEADING;
  await header.updateComplete;

  await runSearchInput(UNIQUE_HEADING);
  let noResultsEl = doc.getElementById("no-results-message");
  is_element_hidden(
    noResultsEl,
    "Pane surfaces when query matches its page header title"
  );
  ok(
    !pane.classList.contains("visually-hidden"),
    "Pane is shown in search results"
  );

  gBrowser.removeCurrentTab();
});

/**
 * When no setting-group matches, the fallback should not re-search the
 * whole setting-pane.
 */
add_task(async function test_fallback_does_not_re_search_pane() {
  const NOMATCH = "zzqqnothingmatchesthisquerystring";

  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });
  let doc = gBrowser.selectedBrowser.contentDocument;
  let win = doc.documentGlobal;

  let originalSearch = win.gSearchResultsPane.searchWithinNode;
  let calledNodes = [];
  win.gSearchResultsPane.searchWithinNode = function (node, ...rest) {
    calledNodes.push(node);
    return originalSearch.call(this, node, ...rest);
  };

  try {
    await runSearchInput(NOMATCH);
    let paneCalls = calledNodes.filter(n => n.localName === "setting-pane");
    is(
      paneCalls.length,
      0,
      "Fallback never re-searches the setting-pane itself"
    );
  } finally {
    win.gSearchResultsPane.searchWithinNode = originalSearch;
  }

  gBrowser.removeCurrentTab();
});
