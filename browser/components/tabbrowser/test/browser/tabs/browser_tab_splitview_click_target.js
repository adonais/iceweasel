/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The tabs of a split view sit in a wrapper that is inset from the tab strip,
// but they still have to be selectable from the edge of the strip, like a tab
// outside a split view is (Fitts's law).

/**
 * A point a given distance in from one edge of the tab strip, level with the
 * middle of a tab along the other axis.
 *
 * @param {Window} win
 * @param {MozTabbrowserTab} tab
 * @param {boolean} fromStart
 *   Measure from the top/inline-start edge of the strip rather than the
 *   opposite one.
 * @param {number} distance
 *   Distance in from that edge, in CSS pixels.
 * @returns {{x: number, y: number}}
 */
function pointNearStripEdge(win, tab, fromStart, distance) {
  let { tabContainer } = win.gBrowser;
  let strip = tabContainer.getBoundingClientRect();
  let tabRect = tab.getBoundingClientRect();
  let span = tabContainer.verticalMode ? strip.width : strip.height;
  let offset = fromStart ? distance : span - 1 - distance;
  return tabContainer.verticalMode
    ? { x: strip.left + offset, y: tabRect.top + tabRect.height / 2 }
    : { x: tabRect.left + tabRect.width / 2, y: strip.top + offset };
}

/**
 * How far in from one edge of the tab strip hit testing starts landing on a
 * tab.
 *
 * @param {Window} win
 * @param {MozTabbrowserTab} tab
 * @param {boolean} fromStart
 * @returns {?number}
 *   Distance in CSS pixels, or null if the tab is never hit.
 */
function hitDistanceFromStripEdge(win, tab, fromStart) {
  let { tabContainer } = win.gBrowser;
  let strip = tabContainer.getBoundingClientRect();
  let limit = (tabContainer.verticalMode ? strip.width : strip.height) / 2;
  for (let distance = 0; distance < limit; distance++) {
    let { x, y } = pointNearStripEdge(win, tab, fromStart, distance);
    if (
      win.document.elementFromPoint(x, y)?.closest(".tabbrowser-tab") == tab
    ) {
      return distance;
    }
  }
  return null;
}

/**
 * How far a box stays from one edge of the tab strip.
 *
 * @param {Window} win
 * @param {DOMRect} rect
 * @param {boolean} fromStart
 * @returns {number} Distance in CSS pixels.
 */
function distanceFromStripEdge(win, rect, fromStart) {
  let { tabContainer } = win.gBrowser;
  let strip = tabContainer.getBoundingClientRect();
  if (tabContainer.verticalMode) {
    return fromStart ? rect.left - strip.left : strip.right - rect.right;
  }
  return fromStart ? rect.top - strip.top : strip.bottom - rect.bottom;
}

/**
 * Checks that a tab in a split view can be selected from one edge of the tab
 * strip as close in as a tab outside the split view can, without its
 * background having moved out to that edge as well.
 *
 * @param {Window} win
 * @param {MozTabbrowserTab} tab
 * @param {MozTabbrowserTab} referenceTab
 *   A tab outside the split view.
 * @param {boolean} fromStart
 * @param {string} description
 */
async function checkTabReachesStripEdge(
  win,
  tab,
  referenceTab,
  fromStart,
  description
) {
  let { gBrowser } = win;
  if (gBrowser.selectedTab != referenceTab) {
    await BrowserTestUtils.switchTab(gBrowser, referenceTab);
  }

  let edge = fromStart ? "start" : "end";
  let expected = hitDistanceFromStripEdge(win, referenceTab, fromStart);
  Assert.notStrictEqual(
    expected,
    null,
    `A tab outside the split view is reachable from the ${edge} edge of the tab strip`
  );
  Assert.equal(
    hitDistanceFromStripEdge(win, tab, fromStart),
    expected,
    `${description} is reachable as close to the ${edge} edge of the tab strip as a tab outside the split view`
  );
  Assert.greater(
    distanceFromStripEdge(
      win,
      tab.querySelector(".tab-background").getBoundingClientRect(),
      fromStart
    ),
    expected,
    `${description} keeps its background further from the ${edge} edge of the tab strip than it reaches`
  );

  let { x, y } = pointNearStripEdge(win, tab, fromStart, expected);
  EventUtils.synthesizeMouseAtPoint(x, y, {}, win);
  Assert.ok(
    tab.selected,
    `Clicking the ${edge} edge of the tab strip selects ${description}`
  );
}

async function runTestWithOrientation(verticalTabs) {
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.verticalTabs", verticalTabs]],
  });
  let win = await BrowserTestUtils.openNewBrowserWindow();

  try {
    let { gBrowser } = win;
    Assert.equal(
      gBrowser.tabContainer.verticalMode,
      verticalTabs,
      `The tab strip is ${verticalTabs ? "vertical" : "horizontal"}`
    );

    // The window's initial tab stays out of the split view and serves as the
    // reference for how close to the edge a tab should be reachable.
    let referenceTab = gBrowser.selectedTab;
    let firstTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
    let secondTab = BrowserTestUtils.addTab(gBrowser, "about:blank");

    let splitViewCreated = BrowserTestUtils.waitForEvent(
      gBrowser.tabContainer,
      "SplitViewCreated"
    );
    gBrowser.addTabSplitView([firstTab, secondTab]);
    await splitViewCreated;
    await win.promiseDocumentFlushed(() => {});

    // Side by side in a vertical strip, each tab only borders the strip on
    // its own side. Stacked, or in a horizontal strip, both tabs border both
    // edges.
    let sideBySide =
      verticalTabs &&
      firstTab.getBoundingClientRect().top ==
        secondTab.getBoundingClientRect().top;
    let checks = [
      [firstTab, true],
      [secondTab, false],
    ];
    if (!sideBySide) {
      checks.push([firstTab, false], [secondTab, true]);
    }
    for (let [tab, fromStart] of checks) {
      await checkTabReachesStripEdge(
        win,
        tab,
        referenceTab,
        fromStart,
        `The ${tab == firstTab ? "first" : "second"} tab of the split view`
      );
    }
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
    Services.prefs.clearUserPref("browser.tabs.splitview.hasUsed");
  }
}

add_task(async function test_split_view_click_target_horizontal_tabs() {
  await runTestWithOrientation(false);
});

add_task(async function test_split_view_click_target_vertical_tabs() {
  await runTestWithOrientation(true);
});
