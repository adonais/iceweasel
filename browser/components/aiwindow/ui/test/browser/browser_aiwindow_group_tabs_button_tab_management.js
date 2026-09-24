/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* import-globals-from head_aiwindow_group_tabs_button.js */

"use strict";

Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head_aiwindow_group_tabs_button.js",
  this
);

describe("Auto Tab Grouping toolbar button", () => {
  let win, mockEngineManager;

  beforeEach(() => {
    mockEngineManager = setupAutoTabGroupingTest();
  });

  afterEach(async () => {
    await cleanupAutoTabGroupingTest(win, mockEngineManager);
    win = null;
  });

  describe("closing duplicate tabs", () => {
    it("hides the row when there is nothing to close", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);

      Assert.ok(
        !panel.querySelector(".swgt-close-duplicates"),
        "No 'Close Duplicate Tabs' row while every tab is unique"
      );
    });

    it("closes the duplicates and leaves one of each tab", async () => {
      await SpecialPowers.pushPrefEnv({
        set: [
          ["browser.smartwindow.autoTabGrouping.enabled", true],
          // Skip the one-time "we'll close duplicate tabs" confirmation.
          ["browser.tabs.haveShownCloseAllDuplicateTabsWarning", true],
        ],
      });
      win = await openAIWindow();
      await navigateToContent(win);
      await addWebTabs(win);
      await addWebTabs(win, ["a", "b"]);
      const tabsBefore = win.gBrowser.tabs.length;

      const panel = await openPanelWithSuggestions(win);
      const row = await TestUtils.waitForCondition(
        () => panel.querySelector(".swgt-close-duplicates"),
        "The 'Close Duplicate Tabs' row appears once duplicates exist"
      );

      const duplicates = win.gBrowser.getAllDuplicateTabsToClose().length;
      Assert.equal(duplicates, 2, "The two added tabs are the duplicates");
      Assert.equal(
        JSON.parse(row.getAttribute("data-l10n-args")).tabCount,
        duplicates,
        "The row is told how many tabs activating it closes"
      );
      const accService = Cc["@mozilla.org/accessibilityService;1"].getService(
        Ci.nsIAccessibilityService
      );
      await TestUtils.waitForCondition(
        () => accService.getAccessibleFor(row)?.name?.includes(`${duplicates}`),
        "The row's label reports that count"
      );

      const hintShown = BrowserTestUtils.waitForEvent(
        win.document,
        "popupshown",
        true,
        event => event.target.id === "confirmation-hint"
      );
      row.click();
      const { target: hint } = await hintShown;
      Assert.equal(
        hint.anchorNode?.id,
        "smartwindow-group-tabs-button",
        "The hint points at our button, not the All Tabs button which may be absent"
      );
      await TestUtils.waitForCondition(
        () => win.gBrowser.tabs.length === tabsBefore - 2,
        "Both duplicate tabs are closed"
      );
      const urls = win.gBrowser.tabs.map(t => t.linkedBrowser.currentURI.spec);
      Assert.equal(
        new Set(urls).size,
        urls.length,
        "Every remaining tab is at a distinct URL"
      );

      const requested =
        Glean.smartWindow.closeDuplicateTabsRequested.testGetValue();
      Assert.equal(requested?.length, 1, "One 'requested' event recorded");
      Assert.equal(
        requested[0].extra.tabs,
        String(tabsBefore),
        "Recorded the tab count from before the duplicates were closed"
      );

      const started =
        Glean.smartWindow.closeDuplicateTabsStarted.testGetValue();
      Assert.equal(started?.length, 1, "One 'started' event recorded");
      Assert.greater(
        Number(started[0].extra.total_length),
        0,
        "Reported how much tab-title text was searched"
      );

      const completed =
        Glean.smartWindow.closeDuplicateTabsCompleted.testGetValue();
      Assert.equal(completed?.length, 1, "One 'completed' event recorded");
      Assert.equal(completed[0].extra.success, "true", "The search succeeded");
      Assert.equal(
        completed[0].extra.duplicate_tabs,
        "2",
        "Found both duplicates"
      );

      const closed = Glean.smartWindow.duplicateTabsClosed.testGetValue();
      Assert.equal(closed?.length, 1, "One 'closed' event recorded");
      Assert.equal(closed[0].extra.duplicate_tabs, "2", "Closed both");
      Assert.equal(closed[0].extra.success, "true", "Closing succeeded");
    });

    // Open the panel on a window holding duplicates, and preview them.
    async function openDuplicatesFlyout() {
      win = await openGroupingWindowWithTabs();
      // Three copies of /a and two of /b, so three tabs would close.
      await addWebTabs(win, ["a", "b"]);
      await addWebTabs(win, ["a"]);

      const panel = await openPanelWithSuggestions(win);
      const row = await TestUtils.waitForCondition(
        () => panel.querySelector(".swgt-close-duplicates"),
        "The 'Close Duplicate Tabs' row appears once duplicates exist"
      );
      row.dispatchEvent(new win.MouseEvent("mouseenter"));
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel?.state === "open",
        "Pointing at the row opens its preview"
      );
      await panel._flyoutPanel._flyoutEl.updateComplete;
      return {
        panel,
        row,
        tabRows: [...panel._flyoutPanel.querySelectorAll(".swgt-flyout-tab")],
      };
    }

    it("previews the tabs it would close and switches to the one clicked", async () => {
      const { panel, row, tabRows } = await openDuplicatesFlyout();

      Assert.equal(
        win.gBrowser.getAllDuplicateTabsToClose().length,
        3,
        "Three tabs would close: two extra copies of /a and one of /b"
      );
      Assert.equal(
        tabRows.length,
        3,
        "One row per tab, listing each copy that would close"
      );
      Assert.equal(
        row.getAttribute("aria-expanded"),
        "true",
        "The row reports the list it opened"
      );
      Assert.ok(
        row.classList.contains("is-active"),
        "The row stays highlighted while its preview is up"
      );

      const tabsBefore = win.gBrowser.tabs.length;
      const previewed = panel._duplicateTabs[1];
      tabRows[1].click();
      await TestUtils.waitForCondition(
        () => !win.document.getElementById("smartwindow-group-tabs-panel"),
        "Selecting a tab closes the panel"
      );
      Assert.equal(
        win.gBrowser.selectedTab,
        previewed,
        "The clicked duplicate is selected"
      );
      Assert.equal(
        win.gBrowser.tabs.length,
        tabsBefore,
        "Looking at a duplicate does not close anything"
      );
    });

    it("keeps the preview through the keyboard and the pointer", async () => {
      const { panel, row, tabRows } = await openDuplicatesFlyout();

      row.focus();
      EventUtils.synthesizeKey("KEY_ArrowRight", {}, win);
      await TestUtils.waitForCondition(
        () => win.document.activeElement === tabRows[0],
        "The forward arrow moves focus into the preview"
      );
      EventUtils.synthesizeKey("KEY_ArrowLeft", {}, win);
      await TestUtils.waitForCondition(
        () =>
          win.document.activeElement === row &&
          panel._flyoutPanel.state === "closed",
        "The back arrow closes it again and returns focus to the row"
      );

      // Sliding over from a suggestion swaps what the flyout lists rather than
      // closing it on the way.
      const suggestion = panel.querySelector(".swgt-suggestion");
      suggestion.dispatchEvent(new win.MouseEvent("mouseenter"));
      await TestUtils.waitForCondition(
        () =>
          panel._flyoutPanel._flyoutEl.suggestion &&
          panel._flyoutPanel.state !== "closed",
        "The suggestion took the flyout over"
      );
      row.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
      row.dispatchEvent(new win.MouseEvent("mouseenter"));
      Assert.notEqual(
        panel._flyoutPanel.state,
        "closed",
        "The flyout never closed on the way back"
      );
      Assert.equal(
        panel._flyoutPanel._flyoutEl.duplicates.length,
        3,
        "It lists the duplicates again"
      );

      panel
        .querySelector(".swgt-create-all")
        .dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel.state === "closed",
        "Moving onto a row with no preview of its own closes it"
      );
    });
  });

  describe("viewing existing tab groups", () => {
    // Create the first suggested group, which is what makes the row appear,
    // and hand back the row with a suggestion still listed above it.
    async function showRow(panel) {
      panel.querySelector(".swgt-suggestion").click();
      return TestUtils.waitForCondition(
        () => panel.querySelector(".swgt-view-tab-groups"),
        "The row appears once the created group exists"
      );
    }

    it("offers the row once groups exist and switches to the one clicked", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);

      Assert.equal(
        win.gBrowser.getAllTabGroups().length,
        0,
        "No tab group exists yet"
      );
      Assert.ok(
        !panel.querySelector(".swgt-view-tab-groups"),
        "No 'View Tab Groups' row while the user has no groups"
      );

      panel.querySelector(".swgt-create-all").click();
      const row = await TestUtils.waitForCondition(
        () => panel.querySelector(".swgt-view-tab-groups"),
        "The row appears once the created groups exist"
      );
      Assert.equal(
        row.querySelector(".swgt-row-label").getAttribute("data-l10n-id"),
        "smartwindow-group-tabs-view-tab-groups",
        "The row's label is localized via Fluent"
      );

      row.click();
      const list = await TestUtils.waitForCondition(
        () => panel._flyoutPanel?.querySelector("tab-groups-list"),
        "Activating the row opens the tab groups list"
      );
      Assert.equal(
        panel._flyoutPanel
          .querySelector(".swgt-flyout-list")
          .getAttribute("data-l10n-id"),
        "smartwindow-group-tabs-groups-list",
        "The list's accessible name is localized via Fluent"
      );
      Assert.equal(
        row.getAttribute("aria-expanded"),
        "true",
        "The row reports its list as expanded"
      );
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel.contains(win.document.activeElement),
        "Activating the row moves focus into the list"
      );

      // Reopening must rebuild the list, so groups created in between show up.
      AutoTabGrouping._hideFlyout(panel);
      row.click();
      const groupRows = await TestUtils.waitForCondition(() => {
        const rebuilt = panel._flyoutPanel.querySelector("tab-groups-list");
        const rows = rebuilt?.querySelectorAll(".tab-group-row");
        return rebuilt !== list && rows?.length === 2 ? [...rows] : null;
      }, "Reopening builds a fresh list of both groups");

      const group = win.gBrowser.getTabGroupById(
        groupRows[1].dataset.tabGroupId
      );
      Assert.ok(group, "Each row names a tab group");
      groupRows[1].click();
      await TestUtils.waitForCondition(
        () => !win.document.getElementById("smartwindow-group-tabs-panel"),
        "Selecting a group closes the panel"
      );
      Assert.equal(
        win.gBrowser.selectedTab.group,
        group,
        "The clicked group's tab is selected"
      );
    });

    it("takes focus when the list replaces an open suggestion flyout", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);
      const row = await showRow(panel);

      const suggestion = panel.querySelector(".swgt-suggestion");
      suggestion.dispatchEvent(new win.MouseEvent("mouseenter"));
      await TestUtils.waitForCondition(
        () =>
          panel._flyoutPanel?.state === "open" &&
          panel._flyoutPanel.querySelector(".swgt-flyout-tab"),
        "The remaining suggestion's flyout is open"
      );

      row.click();
      await TestUtils.waitForCondition(
        () => win.document.activeElement?.classList.contains("tab-group-row"),
        "Focus lands in the tab groups list, not on the render it replaced"
      );
    });

    it("opens the list on hover and hands it on with the pointer", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);
      const row = await showRow(panel);

      row.dispatchEvent(new win.MouseEvent("mouseenter"));
      await TestUtils.waitForCondition(
        () =>
          panel._flyoutPanel?.state === "open" &&
          panel._flyoutPanel.querySelector("tab-groups-list"),
        "Pointing at the row is enough to open the tab groups list"
      );
      Assert.ok(
        !panel._flyoutPanel.contains(win.document.activeElement),
        "Hovering leaves focus where it was, as the suggestions do"
      );

      const suggestion = panel.querySelector(".swgt-suggestion");
      row.dispatchEvent(new win.MouseEvent("mouseleave"));
      suggestion.dispatchEvent(
        new win.MouseEvent("mouseover", { bubbles: true })
      );
      suggestion.dispatchEvent(new win.MouseEvent("mouseenter"));
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel.querySelector(".swgt-flyout-tab"),
        "Moving on to a suggestion replaces the list with its tabs"
      );
      Assert.equal(
        row.getAttribute("aria-expanded"),
        "false",
        "The row no longer reports a list as expanded"
      );

      suggestion.dispatchEvent(new win.MouseEvent("mouseleave"));
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel.state === "closed",
        "Leaving the rows behind closes the flyout"
      );
    });

    it("lets the pointer take over the list a click opened", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);
      const row = await showRow(panel);

      row.click();
      await TestUtils.waitForCondition(
        () => win.document.activeElement?.classList.contains("tab-group-row"),
        "Clicking the row moves focus into the list"
      );

      const suggestion = panel.querySelector(".swgt-suggestion");
      suggestion.dispatchEvent(
        new win.MouseEvent("mouseover", { bubbles: true })
      );
      suggestion.dispatchEvent(new win.MouseEvent("mouseenter"));
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel.querySelector(".swgt-flyout-tab"),
        "The suggestion's tabs replace the list the click opened"
      );
      await TestUtils.waitForCondition(
        () => win.document.activeElement?.classList.contains("swgt-flyout-tab"),
        "Focus moves onto the tabs, since the list it was on is gone"
      );
      Assert.equal(
        panel._hideTimer,
        0,
        "The flyout the pointer took over is not left waiting to hide"
      );
    });

    it("closes the list when the window is left behind", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);
      const row = await showRow(panel);

      row.click();
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel?.state === "open",
        "The list is open"
      );

      win.dispatchEvent(new win.Event("deactivate"));
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel.state === "closed",
        "Switching away from the window closes the list"
      );
      Assert.ok(
        win.document.getElementById("smartwindow-group-tabs-panel"),
        "The panel itself is left open"
      );
    });

    it("stays open and up to date when a group is deleted from the list", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);

      panel.querySelector(".swgt-create-all").click();
      const row = await TestUtils.waitForCondition(
        () => panel.querySelector(".swgt-view-tab-groups"),
        "The row appears once the created groups exist"
      );
      row.click();
      const groupRows = await TestUtils.waitForCondition(() => {
        const rows = panel._flyoutPanel?.querySelectorAll(".tab-group-row");
        return rows?.length === 2 ? [...rows] : null;
      }, "The list is open on both groups");
      const group = win.gBrowser.getTabGroupById(
        groupRows[0].dataset.tabGroupId
      );

      const contextMenu = win.document.getElementById(
        "open-tab-group-context-menu"
      );
      // A trusted contextmenu must be a PointerEvent (MouseEvent.cpp asserts
      // on it in debug builds).
      groupRows[0].dispatchEvent(
        new win.PointerEvent("contextmenu", { bubbles: true, cancelable: true })
      );
      await TestUtils.waitForCondition(
        () => contextMenu.state === "open",
        "The group's context menu opens"
      );
      contextMenu.dispatchEvent(
        new win.MouseEvent("mousedown", {
          bubbles: true,
        })
      );
      Assert.ok(
        win.document.getElementById("smartwindow-group-tabs-panel"),
        "Clicking in the menu the row raised is not a click outside the panel"
      );

      contextMenu.activateItem(
        win.document.getElementById("open-tab-group-context-menu_delete")
      );
      await TestUtils.waitForCondition(
        () => !win.gBrowser.getTabGroupById(group.id),
        "The group is deleted"
      );

      Assert.ok(
        win.document.getElementById("smartwindow-group-tabs-panel"),
        "Deleting a group leaves the panel open"
      );
      await TestUtils.waitForCondition(
        () =>
          panel._flyoutPanel.state === "open" &&
          panel._flyoutPanel.querySelectorAll(".tab-group-row").length === 1,
        "The list stays open, without the group that is gone"
      );
      await TestUtils.waitForCondition(
        () => panel.querySelectorAll(".swgt-recent-row").length === 1,
        "'Just created' drops it too"
      );
      await TestUtils.waitForCondition(
        () => win.document.activeElement?.classList.contains("tab-group-row"),
        "Focus lands back on the list the deleted row was in"
      );
    });

    it("leaves focus alone when the deletion did not take it", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);

      panel.querySelector(".swgt-create-all").click();
      const row = await TestUtils.waitForCondition(
        () => panel.querySelector(".swgt-view-tab-groups"),
        "The row appears once the created groups exist"
      );
      row.click();
      const groupRows = await TestUtils.waitForCondition(() => {
        const rows = panel._flyoutPanel?.querySelectorAll(".tab-group-row");
        return rows?.length === 2 ? [...rows] : null;
      }, "The list is open on both groups");
      // Deleting a group closes its tabs, and closing the selected tab moves
      // focus on its own; take the group that leaves the selection alone.
      const group = groupRows
        .map(r => win.gBrowser.getTabGroupById(r.dataset.tabGroupId))
        .find(g => !g.tabs.includes(win.gBrowser.selectedTab));

      // The click hands focus into the list once the flyout finishes
      // opening; let it land before putting focus back on the row.
      await TestUtils.waitForCondition(
        () => panel._flyoutPanel.contains(win.document.activeElement),
        "The click's focus hand-off into the list has settled"
      );

      // The user is on a row of the main panel when the group goes away on
      // its own, with no context menu in between to drop their focus.
      row.focus();
      Assert.equal(win.document.activeElement, row, "The panel row has focus");

      win.gBrowser.removeTabGroup(group);
      await TestUtils.waitForCondition(
        () =>
          panel._flyoutPanel.state === "open" &&
          panel._flyoutPanel.querySelectorAll(".tab-group-row").length === 1,
        "The list refreshes to the remaining group"
      );
      Assert.equal(
        win.document.activeElement,
        row,
        "Focus stays on the row the user was on"
      );
    });

    it("stops watching for group changes when the window closes", async () => {
      const observers = () =>
        [
          ...Services.obs.enumerateObservers(
            "browser-tabgroup-removed-from-dom"
          ),
        ].length;

      win = await openGroupingWindowWithTabs();
      const beforePanel = observers();
      await openPanelWithSuggestions(win);
      Assert.equal(
        observers(),
        beforePanel + 1,
        "The open panel watches for group changes"
      );

      await BrowserTestUtils.closeWindow(win);
      win = null;
      Assert.equal(
        observers(),
        beforePanel,
        "Closing the window with the panel open stops the watching"
      );
    });
  });
});
