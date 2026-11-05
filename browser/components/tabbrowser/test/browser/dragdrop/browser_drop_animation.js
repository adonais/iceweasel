/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["ui.prefersReducedMotion", 0],
      ["browser.tabs.dragDrop.createGroup.enabled", false],
    ],
  });
  await TestUtils.waitForCondition(
    () => !gReduceMotion,
    "Waiting for the reduced motion setting to be picked up"
  );
  // Pinning the test window's tab suppresses the drag-to-pin drop indicator,
  // which shifts the tab strip during a drag.
  gBrowser.pinTab(gBrowser.tabs[0]);
  registerCleanupFunction(() => gBrowser.unpinTab(gBrowser.tabs[0]));
});

/**
 * Drags `source` far enough over `target` to move after it, then drops it.
 *
 * @param {MozTabbrowserTab} source
 * @param {Element} target
 * @param {Element[]} watchedItems
 *   Tab strip items to report the position of.
 * @param {object} [options]
 * @param {() => Promise<void>} [options.beforeDrop]
 *   Called once the drag has moved `source` over `target`.
 * @returns {Promise<{before: DOMRect[], after: DOMRect[]}>}
 *   Where `watchedItems` appeared right before the drop and in the first
 *   frame after it.
 */
async function dragAfterAndDrop(
  source,
  target,
  watchedItems,
  { beforeDrop } = {}
) {
  let sourceRect = source.getBoundingClientRect();
  let targetRect = target.getBoundingClientRect();
  let moveOverThreshold =
    Services.prefs.getIntPref(
      "browser.tabs.dragDrop.moveOverThresholdPercent"
    ) / 100;
  let overlap = Math.ceil(targetRect.width * moveOverThreshold) + 1;
  let dragEvent = {
    clientX: RTL_UI
      ? targetRect.right - overlap + Math.floor(sourceRect.width / 2)
      : targetRect.left + overlap - Math.floor(sourceRect.width / 2),
    clientY: targetRect.top + targetRect.height / 2,
  };

  EventUtils.startDragSession(window, "move");
  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    source,
    target,
    null,
    "move",
    window,
    window,
    dragEvent
  );
  if (source.multiselected) {
    // Dragover events are ignored until the selected tabs have moved
    // together.
    await TestUtils.waitForCondition(
      () =>
        gBrowser.selectedTabs.every(
          tab => !tab._moveTogetherSelectedTabsData?.animate
        ),
      "Waiting for the selected tabs to move together"
    );
    result = EventUtils.sendDragEvent(
      EventUtils.createDragEventObject(
        "dragover",
        target,
        window,
        dataTransfer,
        dragEvent
      ),
      target,
      window
    );
  }
  await beforeDrop?.();
  let before = watchedItems.map(item => item.getBoundingClientRect());
  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, target);
  EventUtils._getDOMWindowUtils(window).dragSession.endDragSession(true);
  await new Promise(resolve => requestAnimationFrame(resolve));
  let after = watchedItems.map(item => item.getBoundingClientRect());
  return { before, after };
}

/**
 * @param {DOMRect[]} before
 * @param {DOMRect[]} after
 * @param {Element[]} items
 */
function assertNoJump(before, after, items) {
  for (let [i, item] of items.entries()) {
    let name = item.id || item.label || item.className;
    Assert.lessOrEqual(
      Math.abs(after[i].x - before[i].x),
      1,
      `${name} stays where it was on screen when the drop happens`
    );
  }
}

/**
 * @param {Element} item
 */
async function assertSlidesIntoPlace(item) {
  Assert.ok(
    item.hasAttribute("tabdrop-samewindow"),
    "The dropped tab animates into place"
  );
  Assert.notEqual(
    getComputedStyle(item).transform,
    "none",
    "The dropped tab starts off offset from its new position"
  );
  await BrowserTestUtils.waitForMutationCondition(
    item,
    { attributeFilter: ["tabdrop-samewindow"] },
    () => !item.hasAttribute("tabdrop-samewindow")
  );
  Assert.equal(item.style.transform, "", "The dropped tab is in place");
}

async function testDropBetweenTabs() {
  let [tab1, tab2, tab3, tab4] = await Promise.all(
    [1, 2, 3, 4].map(n => addTab(`data:text/plain,tab${n}`))
  );
  let items = [tab1, tab2, tab3, tab4];

  let { before, after } = await dragAfterAndDrop(tab1, tab2, items);

  Assert.deepEqual(
    gBrowser.tabs.slice(1),
    [tab2, tab1, tab3, tab4],
    "The tabs are in their new order as soon as the drop happens"
  );
  Assert.ok(
    !gBrowser.tabContainer.hasAttribute("movingtab"),
    "The drop left moving-tab mode"
  );
  assertNoJump(before, after, items);
  await assertSlidesIntoPlace(tab1);
  let tab1Rect = tab1.getBoundingClientRect();
  let tab2Rect = tab2.getBoundingClientRect();
  Assert.equal(
    RTL_UI ? tab1Rect.right : tab1Rect.left,
    RTL_UI ? tab2Rect.left : tab2Rect.right,
    "The dropped tab ends up next to the tab it was dropped after"
  );

  for (let tab of items) {
    BrowserTestUtils.removeTab(tab);
  }
}

async function testDropPastTabGroupLabel() {
  let [tab1, groupedTab1, groupedTab2, tab2] = await Promise.all(
    [1, 2, 3, 4].map(n => addTab(`data:text/plain,tab${n}`))
  );
  let group = gBrowser.addTabGroup([groupedTab1, groupedTab2], {
    insertBefore: groupedTab1,
    label: "A group label wider than a tab would be",
  });
  let labelContainer = group.labelElement.closest(".tab-group-label-container");
  let items = [tab1, labelContainer, groupedTab1, groupedTab2, tab2];

  let { before, after } = await dragAfterAndDrop(tab1, groupedTab1, items);

  Assert.deepEqual(
    group.tabs,
    [groupedTab1, tab1, groupedTab2],
    "The tab moved into the group"
  );
  assertNoJump(before, after, items);
  await assertSlidesIntoPlace(tab1);

  await TabGroupTestUtils.removeTabGroup(group);
  BrowserTestUtils.removeTab(tab2);
}

add_task(function test_drop_between_tabs_ltr() {
  return runAndCleanup("ltr", testDropBetweenTabs);
});

add_task(function test_drop_between_tabs_rtl() {
  return runAndCleanup("rtl", testDropBetweenTabs);
});

add_task(function test_drop_past_tab_group_label_ltr() {
  return runAndCleanup("ltr", testDropPastTabGroupLabel);
});

add_task(function test_drop_past_tab_group_label_rtl() {
  return runAndCleanup("rtl", testDropPastTabGroupLabel);
});

/**
 * @param {object} options
 * @param {object} options.overflowParams
 *   What to pass to BrowserTestUtils.overflowTabs.
 * @param {boolean} options.underflowsWhileDragging
 *   Whether the tab strip stops overflowing once the selected tabs have moved
 *   together.
 */
async function testDropScrollsSelectedTabIntoView({
  overflowParams,
  underflowsWhileDragging,
}) {
  // BrowserTestUtils.overflowTabs sizes the tabs it opens from the selected
  // tab, which mustn't be pinned.
  gBrowser.selectedTab = await addTab();
  await BrowserTestUtils.overflowTabs(registerCleanupFunction, window, {
    overflowAtStart: false,
    ...overflowParams,
  });
  let { arrowScrollbox } = gBrowser.tabContainer;
  if (underflowsWhileDragging) {
    // Dragging three tabs takes two tab widths out of the scrolled content,
    // so overflowing by at most one tab width makes the tab strip underflow.
    let tabWidth = gBrowser.tabs.at(-1).getBoundingClientRect().width;
    while (
      arrowScrollbox.scrollSize - arrowScrollbox.scrollClientSize >
      tabWidth
    ) {
      BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
    }
  }
  let isInView = tab => {
    let tabRect = tab.getBoundingClientRect();
    let scrollRect = arrowScrollbox.scrollClientRect;
    return tabRect.left >= scrollRect.left && tabRect.right <= scrollRect.right;
  };
  let tabsInView = gBrowser.visibleTabs.filter(
    tab => !tab.pinned && isInView(tab)
  );
  let [tab1, tab2, tab3] = tabsInView;
  let target = tabsInView.at(-1).nextElementSibling;
  Assert.ok(!isInView(target), "The drop target is partly out of view");
  await BrowserTestUtils.switchTab(gBrowser, tab3);
  await triggerClickOn(tab1, { ctrlKey: true });
  await triggerClickOn(tab2, { ctrlKey: true });
  Assert.deepEqual(
    gBrowser.selectedTabs,
    [tab1, tab2, tab3],
    "The tabs to drag are multiselected"
  );

  let { before, after } = await dragAfterAndDrop(tab3, target, [tab3], {
    async beforeDrop() {
      if (underflowsWhileDragging) {
        await BrowserTestUtils.waitForMutationCondition(
          arrowScrollbox,
          { attributeFilter: ["overflowing"] },
          () => !arrowScrollbox.hasAttribute("overflowing"),
          { msg: "The tab strip underflows while dragging" }
        );
      }
    },
  });

  let tab1Index = gBrowser.tabs.indexOf(tab1);
  Assert.greater(
    tab1Index,
    gBrowser.tabs.indexOf(target),
    "The selected tabs moved past the drop target"
  );
  Assert.deepEqual(
    gBrowser.tabs.slice(tab1Index, tab1Index + 3),
    [tab1, tab2, tab3],
    "The selected tabs stay together"
  );
  assertNoJump(before, after, [tab3]);
  await assertSlidesIntoPlace(tab3);
  Assert.ok(isInView(tab3), "The selected tab is in view after the drop");

  gBrowser.clearMultiSelectedTabs();
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
}

add_task(function test_drop_scrolls_selected_tab_into_view() {
  return testDropScrollsSelectedTabIntoView({
    overflowParams: { overflowTabFactor: 3 },
    underflowsWhileDragging: false,
  });
});

add_task(function test_drop_after_underflow_scrolls_selected_tab_into_view() {
  return testDropScrollsSelectedTabIntoView({
    overflowParams: { overflowTabFactor: 0.5, overflowBy: 0.5 },
    underflowsWhileDragging: true,
  });
});
