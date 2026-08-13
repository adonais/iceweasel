const PREF_WARN_ON_CLOSE = "browser.tabs.warnOnCloseOtherTabs";

async function openTabMenuFor(tab) {
  let tabMenu = tab.ownerDocument.getElementById("tabContextMenu");

  let tabMenuShown = BrowserTestUtils.waitForEvent(tabMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    tab,
    { type: "contextmenu" },
    tab.documentGlobal
  );
  await tabMenuShown;

  return tabMenu;
}

function checkTabCloseButtonTooltip(
  tab,
  expectedTabCount = 1 /* not multiselected */
) {
  const l10nAttrs = document.l10n.getAttributes(
    tab.querySelector(".tab-close-button")
  );
  Assert.deepEqual(
    l10nAttrs,
    {
      id: "tabbrowser-close-tabs-button",
      args: {
        tabCount: expectedTabCount,
      },
    },
    `Close tab button has an expected accessible name with ${expectedTabCount} tabs (multi) selected.`
  );
}

add_task(async function setPref() {
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_WARN_ON_CLOSE, false]],
  });
});

add_task(async function usingTabCloseButton() {
  let tab1 = await addTab();
  let tab2 = await addTab();
  let tab3 = await addTab();
  let tab4 = await addTab();
  let pinnedTab1 = await addTab();
  let pinnedTab2 = await addTab();

  gBrowser.pinTab(pinnedTab1);
  gBrowser.pinTab(pinnedTab2);

  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");
  checkTabCloseButtonTooltip(tab1);

  await BrowserTestUtils.switchTab(gBrowser, tab1);
  await triggerClickOn(tab2, { ctrlKey: true });
  await triggerClickOn(pinnedTab1, { ctrlKey: true });

  ok(tab1.multiselected, "Tab1 is multiselected");
  checkTabCloseButtonTooltip(tab1, 3);
  ok(tab2.multiselected, "Tab2 is multiselected");
  checkTabCloseButtonTooltip(tab2, 3);
  ok(!tab3.multiselected, "Tab3 is not multiselected");
  checkTabCloseButtonTooltip(tab3);
  ok(!tab4.multiselected, "Tab4 is not multiselected");
  checkTabCloseButtonTooltip(tab4);
  is(gBrowser.multiSelectedTabsCount, 3, "Three multiselected tabs");
  is(gBrowser.selectedTab, tab1, "Tab1 is active");
  ok(pinnedTab1.multiselected, "PinnedTab1 is multiselected");
  checkTabCloseButtonTooltip(pinnedTab1, 3);
  ok(!pinnedTab2.multiselected, "PinnedTab2 is not multiselected");
  checkTabCloseButtonTooltip(pinnedTab2);

  await triggerClickOn(tab3, { ctrlKey: true });
  is(gBrowser.multiSelectedTabsCount, 4, "Four multiselected tabs");
  checkTabCloseButtonTooltip(tab1, 4);
  gBrowser.hideTab(tab3);
  is(
    gBrowser.multiSelectedTabsCount,
    3,
    "Three multiselected tabs after hiding one tab"
  );
  checkTabCloseButtonTooltip(tab1, 3);
  gBrowser.showTab(tab3);
  is(
    gBrowser.multiSelectedTabsCount,
    4,
    "Four multiselected tabs after re-showing hidden tab"
  );
  checkTabCloseButtonTooltip(tab1, 4);
  await triggerClickOn(tab3, { ctrlKey: true });
  is(
    gBrowser.multiSelectedTabsCount,
    3,
    "Three multiselected tabs after ctrl-clicking multiselected tab"
  );
  checkTabCloseButtonTooltip(tab1, 3);

  // Closing a tab which is not multiselected
  let tab4CloseBtn = tab4.closeButton;
  let tab4Closing = BrowserTestUtils.waitForTabClosing(tab4);
  tab4CloseBtn.click();
  await tab4Closing;

  is(gBrowser.selectedTab, tab1, "Tab1 is active");
  ok(tab1.multiselected, "Tab1 is multiselected");
  ok(!tab1.closing, "Tab1 is not closing");
  ok(tab2.multiselected, "Tab2 is multiselected");
  ok(!tab2.closing, "Tab2 is not closing");
  ok(!tab3.multiselected, "Tab3 is not multiselected");
  ok(!tab3.closing, "Tab3 is not closing");
  ok(tab4.closing, "Tab4 is closing");

  ok(pinnedTab1.multiselected, "PinnedTab1 is multiselected");
  ok(!pinnedTab1.closing, "PinnedTab1 is not closing");
  ok(!pinnedTab2.multiselected, "PinnedTab2 is not multiselected");
  ok(!pinnedTab2.closing, "PinnedTab2 is not closing");

  is(gBrowser.multiSelectedTabsCount, 3, "Three multiselected tabs");

  // Closing a selected tab
  let tab2CloseBtn = tab2.closeButton;
  let tab1Closing = BrowserTestUtils.waitForTabClosing(tab1);
  let tab2Closing = BrowserTestUtils.waitForTabClosing(tab2);
  let pinnedTab1Closing = BrowserTestUtils.waitForTabClosing(pinnedTab1);
  tab2CloseBtn.click();
  await tab1Closing;
  await tab2Closing;
  await pinnedTab1Closing;

  ok(tab1.closing, "Tab1 is closing");
  ok(tab2.closing, "Tab2 is closing");
  ok(!tab3.closing, "Tab3 is not closing");
  ok(pinnedTab1.closing, "PinnedTab1 is closing");
  ok(!pinnedTab2.closing, "PinnedTab2 is not closing");
  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");

  BrowserTestUtils.removeTab(tab3);
  BrowserTestUtils.removeTab(pinnedTab2);
});

add_task(async function usingTabContextMenu() {
  let tab1 = await addTab();
  let tab2 = await addTab();
  let tab3 = await addTab();
  let tab4 = await addTab();
  let pinnedTab1 = await addTab();
  let pinnedTab2 = await addTab();

  gBrowser.pinTab(pinnedTab1);
  gBrowser.pinTab(pinnedTab2);

  let menuItemCloseTab = document.getElementById("context_closeTab");
  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");

  await BrowserTestUtils.switchTab(gBrowser, tab1);
  await triggerClickOn(tab2, { ctrlKey: true });
  await triggerClickOn(pinnedTab1, { ctrlKey: true });

  ok(tab1.multiselected, "Tab1 is multiselected");
  ok(tab2.multiselected, "Tab2 is multiselected");
  ok(!tab3.multiselected, "Tab3 is not multiselected");
  ok(!tab4.multiselected, "Tab4 is not multiselected");
  ok(pinnedTab1.multiselected, "PinnedTab1 is multiselected");
  ok(!pinnedTab2.multiselected, "PinnedTab2 is not multiselected");
  is(gBrowser.multiSelectedTabsCount, 3, "Three multiselected tabs");

  // Check the context menu with a non-multiselected unpinned tab
  updateTabContextMenu(tab4);
  let { args } = document.l10n.getAttributes(menuItemCloseTab);
  is(args.tabCount, 1, "Close Tab item lists a single tab");

  // Check the context menu with a non-multiselected pinned tab
  updateTabContextMenu(pinnedTab2);
  ({ args } = document.l10n.getAttributes(menuItemCloseTab));
  is(args.tabCount, 1, "Close Tab item lists a single tab");

  // Check the context menu with a multiselected tab. We have to actually open
  // it (not just call `updateTabContextMenu`) in order for
  // `TabContextMenu.contextTab` to stay non-null when we click an item.
  let menu = await openTabMenuFor(tab2);
  ({ args } = document.l10n.getAttributes(menuItemCloseTab));
  is(args.tabCount, 3, "Close Tab item lists more than one tab");

  let tab1Closing = BrowserTestUtils.waitForTabClosing(tab1);
  let tab2Closing = BrowserTestUtils.waitForTabClosing(tab2);
  let pinnedTab1Closing = BrowserTestUtils.waitForTabClosing(pinnedTab1);
  menu.activateItem(menuItemCloseTab);
  await tab1Closing;
  await tab2Closing;
  await pinnedTab1Closing;

  ok(tab1.closing, "Tab1 is closing");
  ok(tab2.closing, "Tab2 is closing");
  ok(!tab3.closing, "Tab3 is not closing");
  ok(!tab4.closing, "Tab4 is not closing");
  ok(pinnedTab1.closing, "PinnedTab1 is closing");
  ok(!pinnedTab2.closing, "PinnedTab2 is not closing");
  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");

  BrowserTestUtils.removeTab(tab3);
  BrowserTestUtils.removeTab(tab4);
  BrowserTestUtils.removeTab(pinnedTab2);
});

add_task(async function closeAllMultiselectedMiddleClick() {
  let tab1 = await addTab();
  let tab2 = await addTab();
  let tab3 = await addTab();
  let tab4 = await addTab();
  let tab5 = await addTab();
  let pinnedTab1 = await addTab();

  gBrowser.pinTab(pinnedTab1);

  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");

  // Close currently selected tab1
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  let tab1Closing = BrowserTestUtils.waitForTabClosing(tab1);
  await triggerMiddleClickOn(tab1);
  await tab1Closing;

  // Close a not currently selected tab2
  await BrowserTestUtils.switchTab(gBrowser, tab3);
  let tab2Closing = BrowserTestUtils.waitForTabClosing(tab2);
  await triggerMiddleClickOn(tab2);
  await tab2Closing;

  // Close the not multiselected middle clicked pinnedTab1
  await triggerClickOn(tab4, { ctrlKey: true });
  await triggerClickOn(tab5, { ctrlKey: true });
  ok(tab3.multiselected, "Tab3 is multiselected");
  ok(tab4.multiselected, "Tab4 is multiselected");
  ok(tab5.multiselected, "Tab5 is multiselected");
  ok(!pinnedTab1.multiselected, "PinnedTab1 is not multiselected");
  is(gBrowser.multiSelectedTabsCount, 3, "Three multiselected tabs");

  let pinnedTab1Closing = BrowserTestUtils.waitForTabClosing(pinnedTab1);
  await triggerMiddleClickOn(pinnedTab1);
  await pinnedTab1Closing;

  // Close multiselected tabs(3, 4, 5)
  ok(tab3.multiselected, "Tab3 is multiselected");
  ok(tab4.multiselected, "Tab4 is multiselected");
  ok(tab5.multiselected, "Tab5 is multiselected");
  is(gBrowser.multiSelectedTabsCount, 3, "Three multiselected tabs");

  let tab3Closing = BrowserTestUtils.waitForTabClosing(tab3);
  let tab4Closing = BrowserTestUtils.waitForTabClosing(tab4);
  let tab5Closing = BrowserTestUtils.waitForTabClosing(tab5);
  await triggerMiddleClickOn(tab5);
  await tab3Closing;
  await tab4Closing;
  await tab5Closing;
});

add_task(async function usingKeyboard() {
  // Use initial tab to have final part of test have only pinned tabs
  let pinnedTab1 = gBrowser.selectedTab;
  let pinnedTab2 = await addTab();
  let unpinnedTab1 = await addTab();
  let unpinnedTab2 = await addTab();

  gBrowser.pinTab(pinnedTab1);
  gBrowser.pinTab(pinnedTab2);

  // Select two pinned tabs and an unpinned tab
  await triggerClickOn(pinnedTab2, { ctrlKey: true });
  await triggerClickOn(unpinnedTab1, { ctrlKey: true });

  ok(pinnedTab1.multiselected, "PinnedTab1 is multiselected");
  ok(pinnedTab2.multiselected, "PinnedTab2 is multiselected");
  ok(unpinnedTab1.multiselected, "UnpinnedTab1 is multiselected");
  ok(!unpinnedTab2.multiselected, "UnpinnedTab2 is not multiselected");
  is(gBrowser.multiSelectedTabsCount, 3, "Three multiselected tabs");
  is(gBrowser.selectedTab, pinnedTab1, "PinnedTab1 is active");

  // Closing two pinned tabs and one unpinned tab
  let unpinnedTab1Closing = BrowserTestUtils.waitForTabClosing(unpinnedTab1);
  EventUtils.synthesizeKey("w", { accelKey: true });
  await unpinnedTab1Closing;

  ok(!pinnedTab1.closing, "PinnedTab1 is not closing");
  ok(!pinnedTab2.closing, "PinnedTab2 is not closing");
  ok(unpinnedTab1.closing, "UnpinnedTab1 is closing");
  ok(!unpinnedTab2.closing, "UnpinnedTab2 is not closing");

  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");
  is(
    gBrowser.tabContainer.selectedIndex,
    gBrowser.pinnedTabCount,
    "Selected index is correct"
  );

  // Select pinned tabs only
  await BrowserTestUtils.switchTab(gBrowser, pinnedTab1);
  await triggerClickOn(pinnedTab2, { ctrlKey: true });

  ok(pinnedTab1.multiselected, "PinnedTab1 is multiselected");
  ok(pinnedTab2.multiselected, "PinnedTab2 is multiselected");
  ok(!unpinnedTab2.multiselected, "UnpinnedTab2 is not multiselected");
  is(gBrowser.multiSelectedTabsCount, 2, "Two multiselected tabs");
  is(gBrowser.selectedTab, pinnedTab1, "PinnedTab1 is active");

  // Closing only pinned tabs, with an unpinned tab open
  EventUtils.synthesizeKey("w", { accelKey: true });

  ok(!pinnedTab1.closing, "PinnedTab1 is not closing");
  ok(!pinnedTab2.closing, "PinnedTab2 is not closing");
  ok(!unpinnedTab2.closing, "UnpinnedTab2 is not closing");

  // Should behave like closing a single pinned tab (go to first unpinned tab)
  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");
  ok(!gBrowser.selectedTab.pinned, "End on an unpinned tab");
  is(
    gBrowser.tabContainer.selectedIndex,
    gBrowser.pinnedTabCount,
    "Selected index is correct"
  );

  // Select pinned tabs only
  await BrowserTestUtils.switchTab(gBrowser, pinnedTab1);
  await triggerClickOn(pinnedTab2, { ctrlKey: true });

  ok(pinnedTab1.multiselected, "PinnedTab1 is multiselected");
  ok(pinnedTab2.multiselected, "PinnedTab2 is multiselected");
  is(gBrowser.multiSelectedTabsCount, 2, "Two multiselected tabs");
  is(gBrowser.selectedTab, pinnedTab1, "PinnedTab1 is active");

  // Closing only pinned tabs, with an unpinned tab open
  EventUtils.synthesizeKey("w", { accelKey: true });

  ok(!pinnedTab1.closing, "PinnedTab1 is not closing");
  ok(!pinnedTab2.closing, "PinnedTab2 is not closing");
  ok(!unpinnedTab2.closing, "UnpinnedTab2 is not closing");

  // Should behave like closing a single pinned tab (go to first unpinned tab)
  ok(!gBrowser.selectedTab.pinned, "End on an unpinned tab");
  is(
    gBrowser.tabContainer.selectedIndex,
    gBrowser.pinnedTabCount,
    "Selected index is correct"
  );

  // Closing last remaining unpinned tab to have only pinned tabs
  BrowserTestUtils.removeTab(unpinnedTab2);

  // Select only pinned tabs
  await BrowserTestUtils.switchTab(gBrowser, pinnedTab1);
  await triggerClickOn(pinnedTab2, { ctrlKey: true });

  ok(pinnedTab1.multiselected, "PinnedTab1 is multiselected");
  ok(pinnedTab2.multiselected, "PinnedTab2 is multiselected");
  is(gBrowser.multiSelectedTabsCount, 2, "Two multiselected tabs");
  is(gBrowser.selectedTab, pinnedTab1, "PinnedTab1 is active");

  // Closing only pinned tabs, with no unpinned tab open
  EventUtils.synthesizeKey("w", { accelKey: true });

  ok(!pinnedTab1.closing, "PinnedTab1 is not closing");
  ok(!pinnedTab2.closing, "PinnedTab2 is not closing");

  // Should behave like closing a single pinned tab (clear selection and stay on active tab)
  is(gBrowser.multiSelectedTabsCount, 0, "Zero multiselected tabs");
  is(gBrowser.tabContainer.selectedIndex, 0, "Selected index is correct");
  is(gBrowser.selectedTab, pinnedTab1, "PinnedTab1 is active");

  // To end test as started with one tab open
  gBrowser.unpinTab(pinnedTab1);
  BrowserTestUtils.removeTab(pinnedTab2);
});
