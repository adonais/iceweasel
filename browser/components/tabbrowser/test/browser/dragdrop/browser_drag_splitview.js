/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let currentReduceMotionOverride;

add_setup(() => {
  currentReduceMotionOverride = gReduceMotionOverride;
  // Disable tab animations
  gReduceMotionOverride = true;
});

add_task(async function test_drag_splitview_tab() {
  let [tab1, tab2, tab3] = await Promise.all(
    Array.from({ length: 3 }).map((_, index) =>
      addTab(`data:text/plain,tab${index + 1}`)
    )
  );

  const startingTab = gBrowser.tabs[0];
  let splitview = gBrowser.addTabSplitView([tab2, tab3]);
  Assert.equal(splitview.tabs.length, 2, "Split view has 2 tabs");

  Assert.deepEqual(
    gBrowser.tabs,
    [startingTab, tab1, tab2, tab3],
    "confirm tabs' starting order"
  );
  try {
    info("Drag a splitview tab");
    await customDragAndDrop(tab3, tab1, null, waitForTabMove(tab3));

    Assert.deepEqual(
      gBrowser.tabs,
      [startingTab, tab2, tab3, tab1],
      "Confirm that tab3 and tab2 in a splitview move together before tab1"
    );

    info("Drag a tab in between a splitview");
    await customDragAndDrop(tab1, tab2, null, waitForTabMove(tab1));

    Assert.deepEqual(
      gBrowser.tabs,
      [startingTab, tab1, tab2, tab3],
      "Confirm that tab1 cannot be dragged in between splitview tabs"
    );

    let group = gBrowser.addTabGroup([tab1, splitview]);
    Assert.equal(group.tabs.length, 3, "group has 3 tabs");

    Assert.deepEqual(
      gBrowser.tabs,
      [startingTab, tab1, tab2, tab3],
      "Confirm that splitview tabs can be reordered within a tab group"
    );
    // ensure we drag before tab 1, not after
    let event = getDragEvent();
    info("Drag splitview tabs within a tab group");
    await customDragAndDrop(tab2, tab1, null, null, event);

    Assert.deepEqual(
      gBrowser.tabs,
      [startingTab, tab2, tab3, tab1],
      "Confirm that splitview tabs can be reordered within a tab group"
    );
  } finally {
    BrowserTestUtils.removeTab(tab1);
    BrowserTestUtils.removeTab(tab2);
    BrowserTestUtils.removeTab(tab3);
  }
});

add_task(async function test_dragging_splitview_second_window() {
  let win2 = await BrowserTestUtils.openNewBrowserWindow();
  let [tab1, tab2] = await Promise.all(
    Array.from({ length: 2 }).map((_, index) =>
      addTab(`data:text/plain,tab${index + 1}`)
    )
  );

  let splitview = window.gBrowser.addTabSplitView([tab1, tab2]);
  Assert.equal(splitview.tabs.length, 2, "Split view has 2 tabs");

  let secondWindowTab1 = win2.gBrowser.tabs[0];
  let secondWindowTab2 = BrowserTestUtils.addTab(
    win2.gBrowser,
    "data:text/plain,tab4"
  );

  is(win2.gBrowser.tabs.length, 2, "win2 contains 2 tabs");

  let awaitCloseEvent = BrowserTestUtils.waitForEvent(tab1, "TabClose");
  let awaitOpenEvent = BrowserTestUtils.waitForEvent(win2, "TabOpen");

  let effect = EventUtils.synthesizeDrop(
    tab1,
    secondWindowTab1,
    [[{ type: TAB_DROP_TYPE, data: tab1 }]],
    null,
    window,
    win2
  );
  is(effect, "move", "Tabs should be moved from win1 to win2.");

  let closeEvent = await awaitCloseEvent;
  let openEvent = await awaitOpenEvent;

  is(openEvent.detail.adoptedTab, tab1, "New tab adopted old tab");

  is(
    closeEvent.detail.adoptedBy,
    openEvent.target,
    "Old tab adopted by new tab"
  );

  is(
    win2.gBrowser.tabs.length,
    4,
    "win2 contains 2 new tabs, for a total of 4"
  );

  let [secondWindowTab3, secondWindowTab4] = win2.gBrowser.tabs.slice(1, 3);

  Assert.deepEqual(
    win2.gBrowser.tabs,
    [secondWindowTab1, secondWindowTab3, secondWindowTab4, secondWindowTab2],
    "Two new tabs were inserted in the correct position in the second window"
  );

  ok(
    secondWindowTab3.splitview && secondWindowTab4.splitview,
    "Two new tabs in second window are splitview tabs"
  );

  await BrowserTestUtils.closeWindow(win2);
});
