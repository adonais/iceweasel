/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Dragging a tab group label collapses the group, so dropping it has to expand
 * it again -- unless the group was already collapsed before the drag, which
 * means the user collapsed it and it has to stay that way.
 */

// The tab group animations take their time under load.
const RESTORE_TRIES = 300;

/**
 * @param {Window} win
 * @param {number} count
 * @returns {Promise<MozTabbrowserTab[]>}
 */
async function addTabsTo(win, count) {
  let tabs = [];
  for (let i = 0; i < count; i++) {
    tabs.push(
      BrowserTestUtils.addTab(win.gBrowser, "about:blank", {
        skipAnimation: true,
      })
    );
  }
  await TestUtils.waitForCondition(
    () => tabs.every(tab => tab._fullyOpen),
    "Tabs are fully open"
  );
  return tabs;
}

/**
 * Drags a tab group's label and drops it where it started.
 *
 * @param {Window} win
 * @param {MozTabbrowserTabGroup} group
 */
async function dragAndDropLabel(win, group) {
  let collapsedByUser = group.collapsed;
  let label = group.labelElement;
  EventUtils.startDragSession(win, "move");
  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    label,
    label,
    null,
    "move",
    win,
    win,
    {}
  );
  await TestUtils.waitForCondition(
    () => group.collapsed,
    "Tab group is collapsed for the drag"
  );
  Assert.equal(
    group.collapsedByDrag,
    !collapsedByUser,
    "Tab group knows whether the drag is what collapsed it"
  );

  // Dropping synthesizes a mouseup on the label, which the tab group would take
  // for a click and toggle itself on.
  group.addEventListener("click", event => event.stopPropagation(), {
    capture: true,
    once: true,
  });
  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, label, win);
  win.windowUtils.dragSession.endDragSession(true);
  await TestUtils.waitForCondition(
    () =>
      !win.gBrowser.tabContainer.hasAttribute("movingtab") &&
      !group.collapsedByDrag,
    "Drag is over and the tab group is done being restored",
    100,
    RESTORE_TRIES
  );
}

// A tab group that is the only thing in the tab strip is what regressed in bug
// 1969163: the drop moved nothing, so nothing expanded the group again and the
// active tab stayed hidden inside it.
add_task(async function test_group_alone_in_tab_strip_expands_on_drop() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  await addTabsTo(win, 2);
  let group = win.gBrowser.addTabGroup([...win.gBrowser.tabs], {
    insertBefore: win.gBrowser.tabs[0],
  });
  Assert.ok(
    win.gBrowser.tabs.every(tab => tab.group == group),
    "Tab group holds every tab in the window"
  );
  Assert.ok(
    group.tabs.includes(win.gBrowser.selectedTab),
    "Active tab is in the tab group"
  );

  await dragAndDropLabel(win, group);

  Assert.ok(!group.collapsed, "Tab group expanded again after the drop");
  Assert.ok(
    !BrowserTestUtils.isHidden(win.gBrowser.selectedTab),
    "Active tab is visible again"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_group_collapsed_by_user_stays_collapsed() {
  let win = await BrowserTestUtils.openNewBrowserWindow();
  let groupedTabs = await addTabsTo(win, 2);
  let group = win.gBrowser.addTabGroup(groupedTabs, {
    insertBefore: groupedTabs[0],
  });
  await TabGroupTestUtils.toggleCollapsed(group, true);
  Assert.ok(
    !group.tabs.includes(win.gBrowser.selectedTab),
    "Active tab is outside of the tab group"
  );

  await dragAndDropLabel(win, group);

  Assert.ok(group.collapsed, "Tab group the user collapsed stayed collapsed");

  await BrowserTestUtils.closeWindow(win);
});
