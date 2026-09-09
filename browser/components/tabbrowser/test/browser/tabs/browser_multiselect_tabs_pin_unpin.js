add_task(async function test() {
  let tab1 = gBrowser.selectedTab;
  let tab2 = await addTab();
  let tab3 = await addTab();

  let menuItemPinTab = document.getElementById("context_pinTab");
  let menuItemUnpinTab = document.getElementById("context_unpinTab");
  let menuItemPinSelectedTabs = document.getElementById(
    "context_pinSelectedTabs"
  );
  let menuItemUnpinSelectedTabs = document.getElementById(
    "context_unpinSelectedTabs"
  );

  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");

  await triggerClickOn(tab2, { ctrlKey: true });

  ok(tab1.multiselected, "Tab1 is multiselected");
  ok(tab2.multiselected, "Tab2 is multiselected");
  ok(!tab3.multiselected, "Tab3 is not multiselected");

  // Check the context menu with a non-multiselected tab
  updateTabContextMenu(tab3);
  ok(!tab3.pinned, "Tab3 is unpinned");
  is(menuItemPinTab.hidden, false, "Pin Tab is visible");
  is(menuItemUnpinTab.hidden, true, "Unpin Tab is hidden");
  is(menuItemPinSelectedTabs.hidden, true, "Pin Selected Tabs is hidden");
  is(menuItemUnpinSelectedTabs.hidden, true, "Unpin Selected Tabs is hidden");

  // Check the context menu with a multiselected and unpinned tab
  await openTabContextMenu(tab2);
  ok(!tab2.pinned, "Tab2 is unpinned");
  is(menuItemPinTab.hidden, true, "Pin Tab is hidden");
  is(menuItemUnpinTab.hidden, true, "Unpin Tab is hidden");
  is(menuItemPinSelectedTabs.hidden, false, "Pin Selected Tabs is visible");
  is(menuItemUnpinSelectedTabs.hidden, true, "Unpin Selected Tabs is hidden");

  let tab1Pinned = BrowserTestUtils.waitForEvent(tab1, "TabPinned");
  let tab2Pinned = BrowserTestUtils.waitForEvent(tab2, "TabPinned");
  await BrowserTestUtils.activateMenuItem(menuItemPinSelectedTabs);
  await tab1Pinned;
  await tab2Pinned;

  ok(tab1.pinned, "Tab1 is pinned");
  ok(tab2.pinned, "Tab2 is pinned");
  ok(!tab3.pinned, "Tab3 is unpinned");
  is(tab1.index, 0, "Tab1 should still be first after pinning");
  is(tab2.index, 1, "Tab2 should still be second after pinning");
  is(tab3.index, 2, "Tab3 should still be third after pinning");

  // Check the context menu with a multiselected and pinned tab
  await openTabContextMenu(tab2);
  ok(tab2.pinned, "Tab2 is pinned");
  is(menuItemPinTab.hidden, true, "Pin Tab is hidden");
  is(menuItemUnpinTab.hidden, true, "Unpin Tab is hidden");
  is(menuItemPinSelectedTabs.hidden, true, "Pin Selected Tabs is hidden");
  is(menuItemUnpinSelectedTabs.hidden, false, "Unpin Selected Tabs is visible");

  let tab1Unpinned = BrowserTestUtils.waitForEvent(tab1, "TabUnpinned");
  let tab2Unpinned = BrowserTestUtils.waitForEvent(tab2, "TabUnpinned");
  await BrowserTestUtils.activateMenuItem(menuItemUnpinSelectedTabs);
  await tab1Unpinned;
  await tab2Unpinned;

  ok(!tab1.pinned, "Tab1 is unpinned");
  ok(!tab2.pinned, "Tab2 is unpinned");
  ok(!tab3.pinned, "Tab3 is unpinned");
  is(tab1.index, 0, "Tab1 should still be first after unpinning");
  is(tab2.index, 1, "Tab2 should still be second after unpinning");
  is(tab3.index, 2, "Tab3 should still be third after unpinning");

  BrowserTestUtils.removeTab(tab2);
  BrowserTestUtils.removeTab(tab3);
});

add_task(async function test_pin_multiselected_tabs_records_source() {
  Services.fog.testResetFOG();

  let tab1 = gBrowser.selectedTab;
  let tab2 = await addTab();
  await triggerClickOn(tab2, { ctrlKey: true });

  let tab1Pinned = BrowserTestUtils.waitForEvent(tab1, "TabPinned");
  let tab2Pinned = BrowserTestUtils.waitForEvent(tab2, "TabPinned");
  await openTabContextMenu(tab2);
  await BrowserTestUtils.activateMenuItem(
    document.getElementById("context_pinSelectedTabs")
  );
  await tab1Pinned;
  await tab2Pinned;

  Assert.deepEqual(
    Glean.pinnedTabs.pin.testGetValue().map(event => event.extra.source),
    ["tab_menu", "tab_menu"],
    "Each pinned tab records the surface it was pinned from"
  );

  gBrowser.unpinTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});
