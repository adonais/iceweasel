"use strict";

/**
 * Bug 2045266: overlapping searches must not inflate the SELECTION_FIND range
 * count. Split from browser_search_category_filter.js to stay under the debug
 * per-file timeout.
 */

async function openSearchWithQuery(query) {
  await openPreferencesViaOpenPreferencesAPI(DEFAULT_PANE, {
    leaveOpen: true,
  });
  let doc = gBrowser.contentDocument;
  let searchInput = doc.getElementById("searchInput");
  searchInput.focus();
  let searchCompletedPromise = BrowserTestUtils.waitForEvent(
    gBrowser.contentWindow,
    "PreferencesSearchCompleted",
    evt => evt.detail == query
  );
  EventUtils.sendString(query);
  await searchCompletedPromise;
  return doc;
}

/**
 * Counts SELECTION_FIND ranges on the top-level document only, since shadow
 * roots have their own selection controllers.
 */
function findRangeCount(doc) {
  let controller = doc.defaultView.docShell
    .QueryInterface(Ci.nsIInterfaceRequestor)
    .getInterface(Ci.nsISelectionDisplay)
    .QueryInterface(Ci.nsISelectionController);
  return controller.getSelection(Ci.nsISelectionController.SELECTION_FIND)
    .rangeCount;
}

/**
 * Waits until findRangeCount holds steady across two animation frames. A stale
 * search can re-add ranges through late l10n awaits.
 */
async function waitForRangeCountStable(win) {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => win.requestAnimationFrame(r));
    let count = findRangeCount(win.document);
    await new Promise(r => win.requestAnimationFrame(r));
    if (count === findRangeCount(win.document)) {
      return;
    }
  }
}

// Calls searchFunction directly. The second call aborts the first, so the stale
// search returns before reaching searchWithinNode.
add_task(async function overlapping_searches_produce_correct_range_count() {
  const STALE_QUERY = "do";
  const TARGET_QUERY = "downloads";

  // A non-overlapping fresh search gives the expected range count.
  let doc = await openSearchWithQuery(TARGET_QUERY);
  let freshCount = findRangeCount(doc);
  Assert.greater(
    freshCount,
    0,
    "Fresh search for '" + TARGET_QUERY + "' must highlight at least one range"
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);

  // Fire two searches back to back without awaiting the first, so they overlap.
  doc = await openSearchWithQuery("tabs");
  let win = gBrowser.contentWindow;
  let pane = win.gSearchResultsPane;

  pane.searchFunction({ target: { value: STALE_QUERY } });
  await pane.searchFunction({ target: { value: TARGET_QUERY } });

  await waitForRangeCountStable(win);

  let afterOverlap = findRangeCount(gBrowser.contentDocument);
  Assert.equal(
    afterOverlap,
    freshCount,
    "Overlapping searches must not inflate the find-selection range count"
  );

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

const GROUP_SELECTOR =
  "setting-group:not([data-hidden-from-search]):not([hidden]):not([data-hidden-by-setting-group])";

function findPane(doc, paneName) {
  return [
    ...doc.getElementById("mainPrefPane").querySelectorAll("setting-pane"),
  ].find(p => p.name === paneName);
}

function visibleGroupIds(doc, paneName) {
  let pane = findPane(doc, paneName);
  return [...pane.querySelectorAll(GROUP_SELECTOR)]
    .filter(g => !g.classList.contains("visually-hidden"))
    .map(g => g.getAttribute("groupid"))
    .sort();
}

function searchableGroupCount(doc, paneName) {
  return findPane(doc, paneName).querySelectorAll(GROUP_SELECTOR).length;
}

// Bug 2045703: an overlapping search must not fall back to showing a whole
// setting-pane. The typo hides the Backup group. The next "backu" search never
// finishes. The following "backup" search then takes the subQuery fast path and
// skips the hidden group. No group matches, so the pane-level fallback shows
// every group. The searchCompleted gate makes the search run in full instead.
add_task(async function overlapping_subquery_does_not_show_whole_pane() {
  const PANE = DEFAULT_PANE;

  // A fresh, non-overlapping search shows a proper subset of the pane's groups.
  let doc = await openSearchWithQuery("backup");
  let freshVisible = visibleGroupIds(doc, PANE);
  let totalGroups = searchableGroupCount(doc, PANE);
  Assert.greater(
    freshVisible.length,
    0,
    "Fresh 'backup' search shows at least one group in " + PANE
  );
  Assert.less(
    freshVisible.length,
    totalGroups,
    "Fresh 'backup' search does not show the whole " + PANE
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);

  // Type the typo so the Backup group is hidden. Deleting the "p" leaves "backuo",
  // which still matches nothing, so the group stays hidden.
  doc = await openSearchWithQuery("backuop");
  let win = gBrowser.contentWindow;
  let searchInput = doc.getElementById("searchInput");

  searchInput.focus();
  let backuoCompleted = BrowserTestUtils.waitForEvent(
    win,
    "PreferencesSearchCompleted",
    e => e.detail == "backuo"
  );
  EventUtils.synthesizeKey("KEY_Backspace");
  await backuoCompleted;

  // Block the next search ("backu") at its gotoPref await so it never finishes,
  // leaving this.query "backu" and searchCompleted false.
  let releaseStale;
  let staleBlocked = new Promise(r => (releaseStale = r));
  let staleReachedGotoPref;
  let staleEnteredGotoPref = new Promise(r => (staleReachedGotoPref = r));
  let origGotoPref = win.gotoPref;
  let armed = true;
  win.gotoPref = async function (...args) {
    if (armed && args[0] === "paneSearchResults") {
      armed = false;
      staleReachedGotoPref();
      await staleBlocked;
    }
    return origGotoPref(...args);
  };

  try {
    // Delete the "o" so the "backu" search blocks at gotoPref.
    EventUtils.synthesizeKey("KEY_Backspace");
    await staleEnteredGotoPref;

    // Add the "p" so the "backup" search runs to completion while "backu" is
    // still blocked.
    let targetCompleted = BrowserTestUtils.waitForEvent(
      win,
      "PreferencesSearchCompleted",
      e => e.detail == "backup"
    );
    EventUtils.sendString("p");
    await targetCompleted;

    Assert.deepEqual(
      visibleGroupIds(gBrowser.contentDocument, PANE),
      freshVisible,
      "Overlapping subQuery search must match a fresh search, not show the whole " +
        PANE
    );
  } finally {
    win.gotoPref = origGotoPref;
    releaseStale();
  }

  await waitForRangeCountStable(win);
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

// Bug 2045266: same overlap as above, driven through searchInput keystrokes
// instead of searchFunction. A single sendString dispatches all its keystrokes
// synchronously, so only the last query runs. To force an overlap, the test
// types in two bursts and creates a gotoPref hook that blocks the stale search
// until the later one finishes.
add_task(async function str_faithful_select_and_replace_range_count() {
  const STALE_QUERY = "do";
  const TARGET_QUERY = "downloads";
  const REST = TARGET_QUERY.slice(STALE_QUERY.length);

  // A non-overlapping fresh search gives the expected range count.
  let doc = await openSearchWithQuery(TARGET_QUERY);
  let freshCount = findRangeCount(doc);
  Assert.greater(
    freshCount,
    0,
    "Fresh search for '" + TARGET_QUERY + "' must highlight at least one range"
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);

  // Open with a completed search so the field holds a query for the
  // select-and-replace below.
  doc = await openSearchWithQuery("tabs");
  let win = gBrowser.contentWindow;
  let searchInput = doc.getElementById("searchInput");

  // Block the stale search at its first gotoPref await so the later search can
  // run and abort it first.
  let releaseStale;
  let staleBlocked = new Promise(r => (releaseStale = r));
  let staleReachedGotoPref;
  let staleEnteredGotoPref = new Promise(r => (staleReachedGotoPref = r));
  let origGotoPref = win.gotoPref;
  let armed = true;
  win.gotoPref = async function (...args) {
    if (armed && args[0] === "paneSearchResults") {
      armed = false;
      staleReachedGotoPref();
      await staleBlocked;
    }
    return origGotoPref(...args);
  };

  try {
    // STR: select the existing query, then type over it. The first burst sends
    // the stale query, which the hook blocks at gotoPref.
    searchInput.focus();
    searchInput.select();
    EventUtils.sendString(STALE_QUERY);
    await staleEnteredGotoPref;

    // Second burst completes the target query. This search skips the hook and
    // becomes the current search.
    let targetCompleted = BrowserTestUtils.waitForEvent(
      win,
      "PreferencesSearchCompleted",
      e => e.detail == TARGET_QUERY
    );
    EventUtils.sendString(REST);
    await targetCompleted;

    // Let the stale search resume. It must stop on its own without re-adding
    // ranges.
    releaseStale();

    await waitForRangeCountStable(win);

    Assert.equal(
      findRangeCount(gBrowser.contentDocument),
      freshCount,
      "Select-and-replace overlap must not inflate the find-selection range count"
    );
  } finally {
    win.gotoPref = origGotoPref;
    releaseStale();
  }

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
