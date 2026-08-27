/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests that the child controller keeps a superseded query's notifications away
// from the listeners. Over the actor message path the parent is a round trip
// behind, so a query the input has already replaced can still have results and
// an end to report. The view tracks the newer query by then, and acting on the
// older one's end would tear the newer one down: with no results delivered for
// it, `onQueryFinished` closes the view, which cancels the running query.

"use strict";

add_task(async function supersededQueryEndDoesNotCloseTheView() {
  let superseded = await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "example",
  });
  Assert.ok(gURLBar.view.isOpen, "The view is open");

  // Start a query without awaiting it, so the view is between the notifications
  // that reset its per-query state and the ones that fill it again.
  gURLBar.startQuery();

  info("Deliver the superseded query's remaining notifications");
  gURLBar.controller.notify("onQueryResults", superseded);
  gURLBar.controller.notify("onQueryFinished", superseded);

  Assert.ok(gURLBar.view.isOpen, "The view is still open");

  await UrlbarTestUtils.promiseSearchComplete(window);
  Assert.ok(gURLBar.view.isOpen, "The running query populated the view");

  await UrlbarTestUtils.promisePopupClose(window);
});
