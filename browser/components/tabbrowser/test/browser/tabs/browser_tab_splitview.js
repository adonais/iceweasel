/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.verticalTabs", true]],
  });
});

registerCleanupFunction(async function () {
  Services.prefs.clearUserPref("sidebar.revamp");
  Services.prefs.clearUserPref(
    "browser.toolbarbuttons.introduced.sidebar-button"
  );
});

const urlbarButton = document.getElementById("split-view-button");

async function addTabAndLoadBrowser() {
  const tab = BrowserTestUtils.addTab(gBrowser, "https://example.com");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  return tab;
}

async function checkSplitViewPanelVisible(tab, isVisible) {
  const panel = document.getElementById(tab.linkedPanel);
  await BrowserTestUtils.waitForMutationCondition(
    panel,
    { attributes: true },
    () => panel.classList.contains("split-view-panel-active") == isVisible
  );
}

function dragSplitter(deltaX, splitter) {
  AccessibilityUtils.setEnv({ mustHaveAccessibleRule: false });
  EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousedown" });
  EventUtils.synthesizeMouse(splitter, deltaX, 0, { type: "mousemove" });
  EventUtils.synthesizeMouse(splitter, 0, 0, { type: "mouseup" });
  AccessibilityUtils.resetEnv();
}

add_task(async function test_splitViewCreateAndAddTabs() {
  let tab1 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab2 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab3 = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tab4 = BrowserTestUtils.addTab(gBrowser, "about:blank");

  // Add tabs to split view
  let splitview = gBrowser.addTabSplitView([tab1, tab2], { id: "1" });
  let splitview2 = gBrowser.addTabSplitView([tab3, tab4], { id: "2" });
  let tabbrowserTabs = document.getElementById("tabbrowser-tabs");
  await BrowserTestUtils.waitForMutationCondition(
    tabbrowserTabs,
    { childList: true },
    () => tabbrowserTabs.querySelectorAll("tab-split-view-wrapper").length === 2
  );

  Assert.ok(splitview.splitViewId, "Split view has id");
  Assert.equal(splitview.tabs.length, 2, "Split view has 2 tabs");
  Assert.ok(splitview.tabs.includes(tab1), "tab1 is in split view wrapper");
  Assert.ok(splitview.tabs.includes(tab2), "tab2 is in split view wrapper");

  await BrowserTestUtils.waitForMutationCondition(
    splitview2,
    { attributeFilter: ["splitViewId"] },
    () => splitview2.hasAttribute("splitViewId")
  );
  Assert.notEqual(
    splitview.splitViewId,
    splitview2.splitViewId,
    "Split view has different id than split view 2"
  );
  Assert.equal(splitview2.tabs.length, 2, "Split view 2 has 2 tabs");
  Assert.ok(splitview2.tabs.includes(tab3), "tab3 is in split view wrapper");
  Assert.ok(splitview2.tabs.includes(tab4), "tab4 is in split view wrapper");

  Assert.ok(
    !splitview.hasAttribute("hasactivetab"),
    "The split view wrapper has the expected attribute when it does not contain the selected tab"
  );

  // Verify ARIA labels for split view tabs
  const splitViewLeft = gBrowser.tabLocalization.formatValueSync(
    "tabbrowser-tab-label-tab-split-view-left",
    { label: "" }
  );
  const splitViewRight = gBrowser.tabLocalization.formatValueSync(
    "tabbrowser-tab-label-tab-split-view-right",
    { label: "" }
  );
  Assert.ok(
    tab1.getAttribute("aria-label").includes(splitViewLeft),
    "Left tab has the correct ARIA label."
  );
  Assert.ok(
    tab2.getAttribute("aria-label").includes(splitViewRight),
    "Right tab has the correct ARIA label."
  );

  gBrowser.selectTabAtIndex(tab1._tPos);
  await BrowserTestUtils.waitForMutationCondition(
    splitview,
    { attributes: true, attributeFilter: ["hasactivetab"] },
    () => splitview.hasAttribute("hasactivetab")
  );
  Assert.ok(
    splitview.hasAttribute("hasactivetab"),
    "The split view wrapper has the expected attribute when it contains the selected tab"
  );

  // Unsplit tabs
  splitview.unsplitTabs();
  await BrowserTestUtils.waitForMutationCondition(
    tabbrowserTabs,
    { childList: true },
    () => tabbrowserTabs.querySelectorAll("tab-split-view-wrapper").length === 1
  );
  Assert.strictEqual(
    document.querySelectorAll("tab-split-view-wrapper").length,
    1,
    "Tabs have been unsplit from split view"
  );
  Assert.ok(
    !tab1.hasAttribute("aria-label"),
    "ARIA label was removed from the left tab."
  );
  Assert.ok(
    !tab2.hasAttribute("aria-label"),
    "ARIA label was removed from the right tab."
  );

  let tab3Panel = tab3.linkedBrowser.closest(".browserSidebarContainer");
  let tab4Panel = tab4.linkedBrowser.closest(".browserSidebarContainer");

  Assert.ok(
    !tab3Panel.classList.contains("split-view-panel-active") &&
      !tab4Panel.classList.contains("split-view-panel-active"),
    "Split view active classes have been removed from the tab panels"
  );

  // Add tabs back to split view
  splitview = gBrowser.addTabSplitView([tab1, tab2]);

  // Remove split view and close tabs
  splitview.close();
  splitview2.close();
});

add_task(async function test_split_view_panels() {
  const tab1 = await addTabAndLoadBrowser();
  const tab2 = await addTabAndLoadBrowser();
  const originalTab = gBrowser.selectedTab;
  await BrowserTestUtils.switchTab(gBrowser, tab1);

  info("Activate split view.");
  const splitView = gBrowser.addTabSplitView([tab1, tab2]);
  for (const tab of splitView.tabs) {
    await checkSplitViewPanelVisible(tab, true);
  }
  await BrowserTestUtils.waitForMutationCondition(
    urlbarButton,
    { attributes: true, attributeFilter: ["hidden"] },
    () => BrowserTestUtils.isVisible(urlbarButton)
  );

  info("Open split view menu.");
  const menu = document.getElementById("split-view-menu");
  const promiseMenuShown = BrowserTestUtils.waitForPopupEvent(menu, "shown");
  EventUtils.synthesizeMouseAtCenter(urlbarButton, {});
  await promiseMenuShown;
  menu.hidePopup();

  info("Select tabs using tab panels.");
  await SimpleTest.promiseFocus(tab1.linkedBrowser);
  let panel = document.getElementById(tab1.linkedPanel);
  Assert.ok(
    panel.classList.contains("deck-selected"),
    "First panel is selected."
  );
  await BrowserTestUtils.waitForMutationCondition(
    urlbarButton,
    { attributes: true, attributeFilter: ["data-active-index"] },
    () => urlbarButton.dataset.activeIndex == "0"
  );

  await SimpleTest.promiseFocus(tab2.linkedBrowser);
  panel = document.getElementById(tab2.linkedPanel);
  Assert.ok(
    panel.classList.contains("deck-selected"),
    "Second panel is selected."
  );
  await BrowserTestUtils.waitForMutationCondition(
    urlbarButton,
    { attributes: true },
    () => urlbarButton.dataset.activeIndex == "1"
  );

  info("Switch to a non-split view tab.");
  await BrowserTestUtils.switchTab(gBrowser, originalTab);
  for (const tab of splitView.tabs) {
    await checkSplitViewPanelVisible(tab, false);
  }

  info("Switch back to a split view tab.");
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  for (const tab of splitView.tabs) {
    await checkSplitViewPanelVisible(tab, true);
  }

  info("Remove the split view, keeping tabs intact.");
  splitView.unsplitTabs();
  await checkSplitViewPanelVisible(tab1, false);
  await checkSplitViewPanelVisible(tab2, false);
  await BrowserTestUtils.waitForMutationCondition(
    urlbarButton,
    { attributes: true },
    () => BrowserTestUtils.isHidden(urlbarButton)
  );

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

add_task(async function test_split_view_preserves_multiple_pairings() {
  info("Create four tabs for two split view pairings.");
  const tab1 = await addTabAndLoadBrowser();
  const tab2 = await addTabAndLoadBrowser();
  const tab3 = await addTabAndLoadBrowser();
  const tab4 = await addTabAndLoadBrowser();

  info("Create two split views (Tab 1 + Tab 2) & (Tab 3 + Tab 4).");
  const splitView1 = gBrowser.addTabSplitView([tab1, tab2]);
  const splitView2 = gBrowser.addTabSplitView([tab3, tab4]);

  info("Switch to Tab 1 to activate the first split view.");
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  await checkSplitViewPanelVisible(tab1, true);
  await checkSplitViewPanelVisible(tab2, true);
  await checkSplitViewPanelVisible(tab3, false);
  await checkSplitViewPanelVisible(tab4, false);

  info("Switch to Tab 3 to activate the second split view.");
  await BrowserTestUtils.switchTab(gBrowser, tab3);
  await checkSplitViewPanelVisible(tab1, false);
  await checkSplitViewPanelVisible(tab2, false);
  await checkSplitViewPanelVisible(tab3, true);
  await checkSplitViewPanelVisible(tab4, true);

  info("Switch back to the first split view.");
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  await checkSplitViewPanelVisible(tab1, true);
  await checkSplitViewPanelVisible(tab2, true);
  await checkSplitViewPanelVisible(tab3, false);
  await checkSplitViewPanelVisible(tab4, false);

  splitView1.close();
  splitView2.close();
});

add_task(async function test_resize_split_view_panels() {
  const tab1 = await addTabAndLoadBrowser();
  const tab2 = await addTabAndLoadBrowser();
  const originalTab = gBrowser.selectedTab;
  await BrowserTestUtils.switchTab(gBrowser, tab1);

  info("Activate split view.");
  const splitView = gBrowser.addTabSplitView([tab1, tab2]);
  const { tabpanels } = gBrowser;
  await BrowserTestUtils.waitForMutationCondition(
    tabpanels,
    { childList: true },
    () => tabpanels.querySelector(".split-view-splitter")
  );
  await BrowserTestUtils.waitForMutationCondition(
    tabpanels.splitViewSplitter,
    { attributes: true },
    () => BrowserTestUtils.isVisible(tabpanels.splitViewSplitter)
  );

  info("Resize split view panels.");
  const leftPanel = document.getElementById(tab1.linkedPanel);
  const rightPanel = document.getElementById(tab2.linkedPanel);
  const originalLeftWidth = leftPanel.getBoundingClientRect().width;
  const originalRightWidth = rightPanel.getBoundingClientRect().width;
  dragSplitter(-100, tabpanels.splitViewSplitter);
  Assert.less(
    leftPanel.getBoundingClientRect().width,
    originalLeftWidth,
    "Left panel is smaller."
  );
  Assert.greater(
    rightPanel.getBoundingClientRect().width,
    originalRightWidth,
    "Right panel is larger."
  );

  info("Ensure that custom width persists after switching tabs.");
  await BrowserTestUtils.switchTab(gBrowser, originalTab);
  await BrowserTestUtils.switchTab(gBrowser, tab1);
  Assert.less(
    leftPanel.getBoundingClientRect().width,
    originalLeftWidth,
    "Left panel is smaller."
  );
  Assert.greater(
    rightPanel.getBoundingClientRect().width,
    originalRightWidth,
    "Right panel is larger."
  );

  info("Separate split view panels to remove the custom width.");
  splitView.unsplitTabs();
  for (const panel of [leftPanel, rightPanel]) {
    await BrowserTestUtils.waitForMutationCondition(
      panel,
      { attributeFilter: ["width"] },
      () => !panel.hasAttribute("width")
    );
  }

  BrowserTestUtils.removeTab(tab1);
  BrowserTestUtils.removeTab(tab2);
});

add_task(async function test_click_findbar_to_select_panel() {
  const tab1 = await addTabAndLoadBrowser();
  const tab2 = await addTabAndLoadBrowser();
  const panel1 = document.getElementById(tab1.linkedPanel);
  const panel2 = document.getElementById(tab2.linkedPanel);
  await BrowserTestUtils.switchTab(gBrowser, tab1);

  info("Activate split view with the first panel selected.");
  const splitView = gBrowser.addTabSplitView([tab1, tab2]);
  await SimpleTest.promiseFocus(tab1.linkedBrowser);
  Assert.ok(
    panel1.classList.contains("deck-selected"),
    "First panel is selected."
  );

  info("Activate Find in Page within the second panel.");
  const findbar = await gBrowser.getFindBar(tab2);
  const promiseFindbarOpen = BrowserTestUtils.waitForEvent(
    findbar,
    "findbaropen"
  );
  findbar.open();
  await promiseFindbarOpen;

  info("Select the second panel by clicking the find bar.");
  EventUtils.synthesizeMouseAtCenter(findbar.getElement("findbar-textbox"), {});
  await BrowserTestUtils.waitForMutationCondition(
    panel2,
    { attributeFilter: ["class"] },
    () => panel2.classList.contains("deck-selected")
  );

  splitView.close();
});
