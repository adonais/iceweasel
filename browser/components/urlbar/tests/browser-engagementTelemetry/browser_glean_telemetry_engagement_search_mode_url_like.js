/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests for the urlbar.searchmode.url_like_query rate metric (bug 2042945).
// The denominator counts search-mode engagements whose heuristic result is a
// search result (i.e. where changing the behavior to navigate instead of
// search could actually take effect). The numerator counts those whose
// typed string parses as a URL via URIFixup. Local search modes (bookmarks,
// history, tabs, actions) have no heuristic search result and so should not
// be recorded.

add_setup(async function () {
  await initSearchModeTest();
  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
    await PlacesUtils.history.clear();
  });
});

function assertUrlLikeQuery(expected, message) {
  Assert.deepEqual(
    Glean.urlbarSearchmode.urlLikeQuery.testGetValue(),
    expected,
    message
  );
}

add_task(async function url_like_query_in_search_mode() {
  await doTest(async () => {
    await openPopup("example.com");
    await UrlbarTestUtils.enterSearchMode(window);
    await doEnter();
    assertUrlLikeQuery(
      { numerator: 1, denominator: 1 },
      "URL-like search-mode engagement should increase numerator and denominator"
    );
  });
});

add_task(async function plain_query_in_search_mode() {
  await doTest(async () => {
    await openPopup("hello world");
    await UrlbarTestUtils.enterSearchMode(window);
    await doEnter();
    assertUrlLikeQuery(
      { numerator: 0, denominator: 1 },
      "Search-mode engagement should increase denominator only"
    );
  });
});

add_task(async function url_like_query_in_local_search_mode() {
  await doTest(async () => {
    await PlacesUtils.bookmarks.insert({
      parentGuid: PlacesUtils.bookmarks.unfiledGuid,
      url: "https://example.com/",
      title: "example",
    });
    await openPopup("example.com");
    await UrlbarTestUtils.enterSearchMode(window, {
      source: UrlbarShared.RESULT_SOURCE.BOOKMARKS,
    });
    await selectRowByURL("https://example.com/");
    await doEnter();
    assertUrlLikeQuery(
      null,
      "Engagement in a local search mode should not record the rate, since there is no heuristic search result to redirect"
    );
  });
});

add_task(async function engagement_outside_search_mode() {
  await doTest(async () => {
    await openPopup("example.com");
    await doEnter();
    assertUrlLikeQuery(
      null,
      "Engagement outside search mode should not touch rate"
    );
  });
});
