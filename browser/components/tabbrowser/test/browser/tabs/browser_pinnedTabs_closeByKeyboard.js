/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function testState() {
  function elemAttr(id, attr) {
    return document.getElementById(id).getAttribute(attr);
  }

  is(
    elemAttr("key_close", "disabled"),
    null,
    "key_closed should always be enabled"
  );
  is(
    elemAttr("menu_close", "key"),
    "key_close",
    "menu_close should always have key_close set"
  );
}

add_task(async function pinned_tabs_close_by_keyboard() {
  let unpinnedTab = gBrowser.selectedTab;
  ok(!unpinnedTab.pinned, "We should have started with a regular tab selected");

  testState(false);

  let pinnedTab = BrowserTestUtils.addTab(gBrowser);
  gBrowser.pinTab(pinnedTab);

  // Just pinning the tab shouldn't change the key state.
  testState(false);

  // Test key state after selecting a tab.
  gBrowser.selectedTab = pinnedTab;
  testState(true);

  gBrowser.selectedTab = unpinnedTab;
  testState(false);

  gBrowser.selectedTab = pinnedTab;
  testState(true);

  // Test the key state after un/pinning the tab.
  gBrowser.unpinTab(pinnedTab);
  testState(false);

  gBrowser.pinTab(pinnedTab);
  testState(true);

  // Test that accel+w in a pinned tab selects the next tab.
  let pinnedTab2 = BrowserTestUtils.addTab(gBrowser);
  gBrowser.pinTab(pinnedTab2);
  gBrowser.selectedTab = pinnedTab;

  EventUtils.synthesizeKey("w", { accelKey: true });
  is(gBrowser.tabs.length, 3, "accel+w in a pinned tab didn't close it");
  is(
    gBrowser.selectedTab,
    unpinnedTab,
    "accel+w in a pinned tab selected the first unpinned tab"
  );

  // Test the key state after removing the tab.
  gBrowser.removeTab(pinnedTab);
  gBrowser.removeTab(pinnedTab2);
  testState(false);
});

add_task(async function pinned_tabs_close_next_to_tab_group() {
  let unpinnedTab = gBrowser.selectedTab;

  let pinnedTab = BrowserTestUtils.addTab(gBrowser);
  gBrowser.pinTab(pinnedTab);

  let groupedTab1 = BrowserTestUtils.addTab(gBrowser);
  let groupedTab2 = BrowserTestUtils.addTab(gBrowser);
  let group = gBrowser.addTabGroup([groupedTab1, groupedTab2], {
    insertBefore: unpinnedTab,
  });
  group.collapsed = true;

  gBrowser.selectedTab = pinnedTab;

  EventUtils.synthesizeKey("w", { accelKey: true });
  is(gBrowser.tabs.length, 4, "accel+w in a pinned tab didn't close it");
  is(
    gBrowser.selectedTab,
    unpinnedTab,
    "accel+w in a pinned tab skipped the collapsed tab group and selected the next visible tab"
  );

  group.collapsed = false;
  await removeTabGroup(group);
  gBrowser.removeTab(pinnedTab);
});
