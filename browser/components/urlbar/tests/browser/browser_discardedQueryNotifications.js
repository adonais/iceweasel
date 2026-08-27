/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that a query whose results the input discarded -- it enters search mode
// from a keyword heuristic result and restarts the query in that mode -- leaves
// the view alone as it ends. The listeners saw none of its results, so its end
// would tell them the query produced nothing: the view would clear its rows
// and, until search mode is applied, close.

"use strict";

add_task(async function discardedQueryEndKeepsTheView() {
  let discarded = await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "example",
  });
  Assert.ok(gURLBar.view.isOpen, "The view is open");
  let resultCount = UrlbarTestUtils.getResultCount(window);
  Assert.greater(resultCount, 0, "The view has rows");

  // Replay the query's lifecycle around the discard: the view resets the state
  // its results would have filled, and then sees nothing of the query until it
  // ends.
  gURLBar.controller.notify("onQueryStarted", discarded);
  gURLBar.controller.discardResults(discarded);

  info("Deliver the discarded query's end");
  gURLBar.controller.notify("onQueryFinished", discarded);

  Assert.ok(gURLBar.view.isOpen, "The view is still open");
  Assert.equal(
    UrlbarTestUtils.getResultCount(window),
    resultCount,
    "The rows are still there"
  );

  await UrlbarTestUtils.promisePopupClose(window);
});
