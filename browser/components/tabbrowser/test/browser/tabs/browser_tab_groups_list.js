/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { TabStateFlusher } = ChromeUtils.importESModule(
  "resource:///modules/sessionstore/TabStateFlusher.sys.mjs"
);
const { CustomizableUITestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/CustomizableUITestUtils.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.groups.enabled", true],
      ["browser.tabs.groups.alternateMenu", true],
    ],
  });
  TabGroupTestUtils.forgetSavedTabGroups();
});

async function createTestGroup(options = {}) {
  let win = options.targetWin ?? window;
  let tab = await addTabTo(win.gBrowser, "data:text/plain,tab", {
    skipAnimation: true,
  });
  await TabStateFlusher.flush(tab.linkedBrowser);
  return win.gBrowser.addTabGroup([tab], options);
}

async function openTabGroupsSubView(win = window) {
  await new CustomizableUITestUtils(win).openMainMenu();
  let subView = win.PanelMultiView.getViewNode(
    win.document,
    "appMenu-tabGroupsListView"
  );
  let viewShown = BrowserTestUtils.waitForEvent(subView, "ViewShown");
  win.PanelMultiView.getViewNode(
    win.document,
    "appMenu-tab-groups-button"
  ).click();
  await viewShown;
  await subView.querySelector("tab-groups-list").updateComplete;
  return subView;
}

async function closeAppMenu(win = window) {
  await new CustomizableUITestUtils(win).hideMainMenu();
}

add_task(async function test_prefChangeControlsVisibility() {
  info("Test that button is visible when pref is true");
  const button = PanelMultiView.getViewNode(
    document,
    "appMenu-tab-groups-button"
  );
  Assert.ok(!button.hidden, "Button is initially visible");

  info("Test that button is hidden when pref is changed to false");
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.groups.alternateMenu", false]],
  });
  Assert.ok(button.hidden, "Button is hidden after pref set to false");

  info("Test that button is restored when pref is toggled back");
  await SpecialPowers.popPrefEnv();
  Assert.ok(!button.hidden, "Button is visible after pref restored to true");
});

add_task(async function test_buttonOpensSubView() {
  await new CustomizableUITestUtils(window).openMainMenu();
  let subView = PanelMultiView.getViewNode(
    document,
    "appMenu-tabGroupsListView"
  );

  info("Test that clicking the button opens the tab groups subview");
  let viewShown = BrowserTestUtils.waitForEvent(subView, "ViewShown");
  PanelMultiView.getViewNode(document, "appMenu-tab-groups-button").click();
  let event = await viewShown;
  Assert.equal(
    event.target,
    subView,
    "Tab groups subview was shown after clicking button"
  );
  await closeAppMenu();
});

add_task(async function test_rendersOpenGroups() {
  let group1 = await createTestGroup({ label: "Group 1" });
  let group2 = await createTestGroup({ label: "Group 2" });

  let subView = await openTabGroupsSubView();

  let rows = subView.querySelectorAll(".tab-group-row:not([data-saved])");
  Assert.equal(rows.length, 2, "Two open group rows");
  let labels = Array.from(rows).map(
    r => r.querySelector(".tab-group-row-label").textContent
  );
  Assert.ok(labels.includes("Group 1"), "First group is listed");
  Assert.ok(labels.includes("Group 2"), "Second group is listed");

  await closeAppMenu();
  await removeTabGroup(group1);
  await removeTabGroup(group2);
  TabGroupTestUtils.forgetSavedTabGroups();
});

add_task(async function test_rendersSavedGroups() {
  let group = await createTestGroup({ label: "Saved Group" });
  await TabGroupTestUtils.saveAndCloseTabGroup(group);

  let subView = await openTabGroupsSubView();
  let savedRows = subView.querySelectorAll(".tab-group-row[data-saved]");
  Assert.equal(savedRows.length, 1, "One saved group row");

  await closeAppMenu();
  TabGroupTestUtils.forgetSavedTabGroups();
});

add_task(async function test_emptyState() {
  let subView = await openTabGroupsSubView();
  Assert.ok(
    subView.querySelector(".tab-groups-list-empty-state"),
    "Empty state element is rendered"
  );
  Assert.equal(
    subView.querySelectorAll(".tab-group-row").length,
    0,
    "No group rows rendered in empty state"
  );
  await closeAppMenu();
});

add_task(async function test_clickOpenGroupActivatesGroup() {
  let group = await createTestGroup({ label: "Select Me" });
  gBrowser.selectedTab = gBrowser.tabs[0];

  let subView = await openTabGroupsSubView();

  let panel = document.getElementById("appMenu-popup");
  let panelHidden = BrowserTestUtils.waitForPopupEvent(panel, "hidden");
  subView.querySelector(".tab-group-row:not([data-saved])").click();
  await panelHidden;

  Assert.equal(
    gBrowser.selectedTab.group?.id,
    group.id,
    "Tab in the clicked group is selected"
  );

  await removeTabGroup(group);
});

add_task(async function test_clickSavedGroupRestoresGroup() {
  let group = await createTestGroup({ id: "restore-me", label: "Restore Me" });
  await TabGroupTestUtils.saveAndCloseTabGroup(group);
  Assert.ok(!gBrowser.getTabGroupById("restore-me"), "Group is saved/closed");

  let subView = await openTabGroupsSubView();

  let panel = document.getElementById("appMenu-popup");
  let panelHidden = BrowserTestUtils.waitForPopupEvent(panel, "hidden");
  let groupRestored = BrowserTestUtils.waitForEvent(
    window,
    "SSWindowStateReady"
  );
  subView.querySelector(".tab-group-row[data-saved]").click();
  await Promise.all([panelHidden, groupRestored]);

  let restoredGroup = gBrowser.getTabGroupById("restore-me");
  Assert.equal(
    restoredGroup.name,
    "Restore Me",
    "Restored group has correct name"
  );

  await removeTabGroup(restoredGroup);
  TabGroupTestUtils.forgetSavedTabGroups();
});

add_task(async function test_privateWindowGroups() {
  let normalGroup = await createTestGroup({ label: "Normal Group" });

  let privateWin = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  await createTestGroup({
    label: "Private Group",
    targetWin: privateWin,
  });

  let normalSubView = await openTabGroupsSubView();
  let normalLabels = Array.from(
    normalSubView.querySelectorAll(".tab-group-row-label")
  ).map(el => el.textContent);
  Assert.ok(
    normalLabels.includes("Normal Group"),
    "Normal group is listed in normal window"
  );
  Assert.ok(
    !normalLabels.includes("Private Group"),
    "Private group is not listed in normal window"
  );
  await closeAppMenu();

  let privateSubView = await openTabGroupsSubView(privateWin);
  let privateLabels = Array.from(
    privateSubView.querySelectorAll(".tab-group-row-label")
  ).map(el => el.textContent);
  Assert.ok(
    privateLabels.includes("Private Group"),
    "Private group is listed in private window"
  );
  Assert.ok(
    !privateLabels.includes("Normal Group"),
    "Normal group is not listed in private window"
  );
  await closeAppMenu(privateWin);

  await removeTabGroup(normalGroup);
  await BrowserTestUtils.closeWindow(privateWin);
  TabGroupTestUtils.forgetSavedTabGroups();
});

add_task(async function test_contextMenus() {
  let openGroup = await createTestGroup({ label: "Context Open" });
  let savedGroup = await createTestGroup({ label: "Context Saved" });
  await TabGroupTestUtils.saveAndCloseTabGroup(savedGroup);

  let subView = await openTabGroupsSubView();

  let openRow = subView.querySelector(".tab-group-row:not([data-saved])");
  let openContextMenu = document.getElementById("open-tab-group-context-menu");
  let menuShown = BrowserTestUtils.waitForPopupEvent(openContextMenu, "shown");
  EventUtils.synthesizeMouseAtCenter(
    openRow,
    { type: "contextmenu", button: 2 },
    window
  );
  await menuShown;
  Assert.strictEqual(
    openContextMenu.state,
    "open",
    "open-tab-group-context-menu opened"
  );
  await closeContextMenu(openContextMenu);

  let savedRow = subView.querySelector(".tab-group-row[data-saved]");
  let savedContextMenu = document.getElementById(
    "saved-tab-group-context-menu"
  );
  menuShown = BrowserTestUtils.waitForPopupEvent(savedContextMenu, "shown");
  EventUtils.synthesizeMouseAtCenter(
    savedRow,
    { type: "contextmenu", button: 2 },
    window
  );
  await menuShown;
  Assert.strictEqual(
    savedContextMenu.state,
    "open",
    "saved-tab-group-context-menu opened"
  );

  await closeContextMenu(savedContextMenu);
  await closeAppMenu();
  await removeTabGroup(openGroup);
  TabGroupTestUtils.forgetSavedTabGroups();
});
