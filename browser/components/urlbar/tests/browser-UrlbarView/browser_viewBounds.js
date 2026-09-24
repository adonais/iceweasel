/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// In a window too short to show all rows of the view, the view should appear
// below the input and its overflow should scroll.

"use strict";

// The rows come from history.
const VISIT_COUNT = 40;
const SEARCH_STRING = "example.com/page";
const WINDOW_WIDTH = 600;
const WINDOW_HEIGHT = 450;
const RESULT_COUNTS = [3, 4, 5, 6, 7, 8, 9, 10, 12, 14, VISIT_COUNT + 1];

add_setup(async function () {
  await PlacesTestUtils.addVisits(
    Array.from({ length: VISIT_COUNT }, (_, i) => ({
      uri: `https://example.com/page${i}`,
      transition: PlacesUtils.history.TRANSITION_TYPED,
    }))
  );
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();
  registerCleanupFunction(() => PlacesUtils.history.clear());
});

add_task(async function staysBelowTheInput() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let resized = BrowserTestUtils.waitForEvent(
    win,
    "resize",
    false,
    () => win.innerHeight <= WINDOW_HEIGHT
  );
  win.resizeTo(WINDOW_WIDTH, WINDOW_HEIGHT);
  await resized;

  let input = win.gURLBar.querySelector(".urlbar-input-container");
  let view = win.gURLBar.panel;
  let scroller;

  for (let count of RESULT_COUNTS) {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.urlbar.maxRichResults", count]],
    });
    await UrlbarTestUtils.promisePopupClose(win);
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window: win,
      value: SEARCH_STRING,
    });

    scroller = view.querySelector(".urlbarView-results");
    let background = view.querySelector(".urlbarView-background");
    let where = `with room for ${count} results`;

    // The view's negative block margin puts its border box over the input's
    // bottom edge, so it is the margin box that has to clear the input.
    let marginBlockStart = parseFloat(
      win.getComputedStyle(view).marginBlockStart
    );
    Assert.greaterOrEqual(
      Math.round(view.getBoundingClientRect().top - marginBlockStart),
      Math.round(input.getBoundingClientRect().bottom),
      `The view's margin box starts at the input's bottom edge ${where}`
    );

    // The joint background reaches past the view's border box, so it is the
    // bottom edge that has to fit.
    Assert.lessOrEqual(
      Math.round(background.getBoundingClientRect().bottom),
      Math.round(win.innerHeight),
      `The open view fits inside the window ${where}`
    );

    await SpecialPowers.popPrefEnv();
  }

  // The last count is more results than the window can hold, so they scroll.
  Assert.greater(
    scroller.scrollHeight,
    scroller.clientHeight,
    "The results overflow the scrollport"
  );

  // A row's favicon badge is positioned against the row, so it keeps its offset
  // however far the results have scrolled. A containing block outside the
  // scrollport would leave it behind.
  let badge = view.querySelector(
    ".urlbarView-row:not([hidden]) .urlbarView-type-icon"
  );
  let row = badge.closest(".urlbarView-row");
  let badgeOffset = () =>
    Math.round(
      badge.getBoundingClientRect().top - row.getBoundingClientRect().top
    );
  let offsetAtTop = badgeOffset();
  for (let scrollTop of [40, 100, scroller.scrollHeight]) {
    scroller.scrollTop = scrollTop;
    await win.promiseDocumentFlushed(() => {});
    Assert.equal(
      badgeOffset(),
      offsetAtTop,
      `The badge keeps its offset in the row at scrollTop ${scroller.scrollTop}`
    );
  }

  await BrowserTestUtils.closeWindow(win);
});
