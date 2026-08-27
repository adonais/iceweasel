/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// How far the tab strip's content overflows its scrollport, in tabs.
const OVERFLOW_TABS = 5;

/**
 * Drags the label of a tab group in an overflowing tab strip, which collapses
 * the group, and asserts that the tabs outside of the group stay where they
 * are, both while dragging and after dropping.
 *
 * @param {object} options
 * @param {number} options.groupSize
 *   How many tabs to put in the tab group. Collapsing more than OVERFLOW_TABS
 *   tabs frees up enough space for the tab strip to stop overflowing.
 * @param {boolean} [options.vertical]
 */
async function dragTabGroupLabelInOverflowingTabStrip({
  groupSize,
  vertical = false,
}) {
  if (vertical) {
    await SpecialPowers.pushPrefEnv({ set: [["sidebar.verticalTabs", true]] });
    await TestUtils.waitForCondition(
      () => gBrowser.tabContainer.verticalMode,
      "Tab strip is vertical"
    );
  }

  let tabContainer = gBrowser.tabContainer;
  let arrowScrollbox = tabContainer.arrowScrollbox;
  let smoothScroll = arrowScrollbox.smoothScroll;
  arrowScrollbox.smoothScroll = false;

  await BrowserTestUtils.overflowTabs(registerCleanupFunction, window, {
    overflowAtStart: false,
    overflowBy: OVERFLOW_TABS,
  });

  let tabs = [...gBrowser.tabs];
  let firstGroupedTabIndex = Math.floor(tabs.length / 2);
  let groupedTabs = tabs.slice(
    firstGroupedTabIndex,
    firstGroupedTabIndex + groupSize
  );
  let group = gBrowser.addTabGroup(groupedTabs, {
    insertBefore: groupedTabs[0],
  });
  await TestUtils.waitForTick();
  Assert.ok(
    tabContainer.overflowing,
    "Tab strip is overflowing with the tab group expanded"
  );

  // Scroll away from the start of the tab strip: the scroll position can only
  // be clamped if there is something to clamp.
  arrowScrollbox.scrollByPixels(200, true);
  await window.promiseDocumentFlushed(() => {});
  Assert.greater(arrowScrollbox.scrollPosition, 0, "Tab strip is scrolled");

  let referenceTab = tabs[firstGroupedTabIndex - 1];
  gBrowser.selectedTab = referenceTab;
  await window.promiseDocumentFlushed(() => {});

  let position = element => {
    let rect = window.windowUtils.getBoundsWithoutFlushing(element);
    return vertical ? rect.top : rect.left;
  };
  let referenceTabPosition = position(referenceTab);
  let scrollPosition = arrowScrollbox.scrollPosition;

  let label = group.labelElement;
  EventUtils.startDragSession(window, "move");
  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    label,
    label,
    null,
    "move",
    window,
    window,
    {}
  );

  let collapsed = BrowserTestUtils.waitForEvent(
    group,
    "TabGroupAnimationComplete"
  );
  await TestUtils.waitForCondition(
    () => group.collapsed,
    "Tab group collapsed as part of the drag"
  );
  await collapsed;
  await window.promiseDocumentFlushed(() => {});

  Assert.equal(
    position(referenceTab),
    referenceTabPosition,
    "Tab outside of the collapsed tab group stayed put"
  );
  Assert.equal(
    arrowScrollbox.scrollPosition,
    scrollPosition,
    "Scroll position was preserved"
  );

  let expanded = BrowserTestUtils.waitForEvent(
    group,
    "TabGroupAnimationComplete"
  );
  // Dropping synthesizes a mouseup on the label, which the tab group would take
  // for a click and toggle itself on. Whether that lands on the label or on its
  // container comes down to how the collapsed label is laid out, so let it hit
  // either and go nowhere.
  group.addEventListener("click", event => event.stopPropagation(), {
    capture: true,
    once: true,
  });
  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, label);
  window.windowUtils.dragSession.endDragSession(true);
  await TestUtils.waitForCondition(
    () => !tabContainer.hasAttribute("movingtab") && !group.collapsed,
    "Drag is over and the tab group expanded again"
  );
  await expanded;
  await window.promiseDocumentFlushed(() => {});

  Assert.equal(
    position(referenceTab),
    referenceTabPosition,
    "Tab outside of the tab group stayed put after the drop"
  );
  Assert.equal(
    arrowScrollbox.scrollPosition,
    scrollPosition,
    "Scroll position was preserved after the drop"
  );

  await removeTabGroup(group);
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  await TestUtils.waitForCondition(
    () => !tabContainer.overflowing,
    "Tab strip stopped overflowing"
  );
  arrowScrollbox.smoothScroll = smoothScroll;
  if (vertical) {
    await SpecialPowers.popPrefEnv();
  }
}

add_task(async function test_collapsing_small_group_keeps_tabs_in_place() {
  await dragTabGroupLabelInOverflowingTabStrip({ groupSize: 3 });
});

add_task(async function test_collapsing_large_group_keeps_tabs_in_place() {
  // Enough tabs that the tab strip would stop overflowing.
  await dragTabGroupLabelInOverflowingTabStrip({
    groupSize: OVERFLOW_TABS * 2,
  });
});

add_task(async function test_collapsing_group_keeps_tabs_in_place_vertical() {
  await dragTabGroupLabelInOverflowingTabStrip({
    groupSize: 3,
    vertical: true,
  });
});
