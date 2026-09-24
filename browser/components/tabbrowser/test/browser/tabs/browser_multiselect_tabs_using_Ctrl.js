add_task(async function click() {
  const initialFocusedTab = await addTab();
  await BrowserTestUtils.switchTab(gBrowser, initialFocusedTab);
  const tab = await addTab();

  await triggerClickOn(tab, { ctrlKey: true });
  ok(tab.multiselected, "Tab should be (multi) selected after click");
  isnot(gBrowser.selectedTab, tab, "Multi-selected tab is not focused");
  is(gBrowser.selectedTab, initialFocusedTab, "Focused tab doesn't change");

  await triggerClickOn(tab, { ctrlKey: true });
  ok(!tab.multiselected, "Tab is not (multi) selected anymore");
  is(
    gBrowser.selectedTab,
    initialFocusedTab,
    "Focused tab still doesn't change"
  );

  BrowserTestUtils.removeTab(initialFocusedTab);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function clearSelection() {
  const tab1 = await addTab();
  const tab2 = await addTab();
  const tab3 = await addTab();

  await BrowserTestUtils.switchTab(gBrowser, tab1);
  info("We multi-select tab2 with ctrl key down");
  await triggerClickOn(tab2, { ctrlKey: true });

  ok(tab1.multiselected, "Tab1 is (multi) selected");
  ok(tab2.multiselected, "Tab2 is (multi) selected");
  is(gBrowser.multiSelectedTabsCount, 2, "Two tabs (multi) selected");
  isnot(tab3, gBrowser.selectedTab, "Tab3 doesn't have focus");

  info("We select tab3 with Ctrl key up");
  await triggerClickOn(tab3, { ctrlKey: false });

  ok(!tab1.multiselected, "Tab1 is not (multi) selected");
  ok(!tab2.multiselected, "Tab2 is not (multi) selected");
  is(gBrowser.multiSelectedTabsCount, 0, "Multi-selection is cleared");
  is(tab3, gBrowser.selectedTab, "Tab3 has focus");

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
  BrowserTestUtils.removeTab(tab3);
});

add_task(async function selectedTabs() {
  const tab1 = await addTab();
  const tab2 = await addTab();
  const tab3 = await addTab();
  const tabs = [tab1, tab2, tab3];

  info("Switching to tab1");
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  info("We multi-select tab3 with ctrl key down");
  await triggerClickOn(tab3, { ctrlKey: true });

  Assert.deepEqual(
    gBrowser.selectedTabs.map(tab => tab.index),
    [1, 3],
    "selectedTabs returned in sorted order"
  );

  info("Switching to tab3");
  await BrowserTestUtils.switchTab(gBrowser, tab3);
  info("We multi-select tab2 with ctrl key down");
  await triggerClickOn(tab2, { ctrlKey: true });
  info("We multi-select tab1 with ctrl key down");
  await triggerClickOn(tab1, { ctrlKey: true });

  Assert.deepEqual(
    gBrowser.selectedTabs.map(tab => tab.index),
    [1, 2, 3],
    "selectedTabs returned in sorted order"
  );

  for (const tab of tabs) {
    BrowserTestUtils.removeTab(tab);
  }
});
