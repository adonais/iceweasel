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

  describe("creating groups", () => {
    it("shows the button, lists suggestions, and creates all groups", async () => {
      win = await openGroupingWindowWithTabs();

      const button = win.document.getElementById(
        "smartwindow-group-tabs-button"
      );
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isVisible(button),
        "Group tabs button is visible on a content tab with the pref on"
      );

      const panel = await openPanelWithSuggestions(win);

      await TestUtils.waitForCondition(
        () => button.getAttribute("aria-expanded") === "true",
        "Button is marked expanded while the panel is open"
      );

      const createAll = panel.querySelector(".swgt-create-all");
      Assert.ok(createAll, "'Create all suggested groups' row exists");

      const groupsBefore = win.gBrowser.tabGroups.length;
      createAll.click();
      await TestUtils.waitForCondition(
        () => win.gBrowser.tabGroups.length === groupsBefore + 2,
        "Clicking 'Create all suggested groups' created both groups"
      );

      await TestUtils.waitForCondition(
        () => !panel.querySelectorAll(".swgt-suggestion").length,
        "The created suggestions leave the list"
      );
      Assert.ok(
        win.document.getElementById("smartwindow-group-tabs-panel"),
        "Panel stays open after creating groups"
      );
      Assert.equal(
        button.getAttribute("aria-expanded"),
        "true",
        "Button is still marked expanded"
      );
    });

    it("does not suggest a name the user's groups already use", async () => {
      win = await openGroupingWindowWithTabs();
      const tab = BrowserTestUtils.addTab(
        win.gBrowser,
        "https://example.com/grouped"
      );
      win.gBrowser.addTabGroup([tab], { label: "Test Group" });

      const panel = await openPanelWithSuggestions(win);
      Assert.deepEqual(
        [...panel.querySelectorAll(".swgt-suggestion .swgt-row-label")].map(
          el => el.textContent
        ),
        ["Test Group 2", "Test Group 3"],
        "Both suggestions are named apart from the existing group and from each other"
      );
    });

    it("opens the panel when the button is clicked", async () => {
      win = await openGroupingWindowWithTabs();

      const button = win.document.getElementById(
        "smartwindow-group-tabs-button"
      );
      await TestUtils.waitForCondition(() =>
        BrowserTestUtils.isVisible(button)
      );

      EventUtils.synthesizeMouseAtCenter(button, {}, win);
      await TestUtils.waitForCondition(
        () => win.document.getElementById("smartwindow-group-tabs-panel"),
        "Clicking the button opens the panel"
      );
      await TestUtils.waitForCondition(
        () => button.getAttribute("aria-expanded") === "true",
        "The clicked button is marked expanded"
      );
      await closePanel(win);
    });

    it("records the clustering pipeline, and asks again when reopened", async () => {
      win = await openGroupingWindowWithTabs();
      const tabs = String(win.gBrowser.tabs.length);

      await openPanelWithSuggestions(win);

      const opened = Glean.smartWindow.autoTabGroupMenuOpened.testGetValue();
      Assert.equal(opened?.length, 1, "One 'menu opened' event recorded");
      Assert.equal(opened[0].extra.source, "button", "Opened by the button");
      Assert.equal(opened[0].extra.tabs, tabs, "Recorded the open tab count");

      const requested =
        Glean.smartWindow.autoTabGroupingRequested.testGetValue();
      Assert.equal(requested?.length, 1, "One 'requested' event recorded");
      Assert.equal(
        requested[0].extra.tabs,
        tabs,
        "Recorded the open tab count"
      );

      const started = Glean.smartWindow.autoTabGroupingStarted.testGetValue();
      Assert.equal(started?.length, 1, "One 'started' event recorded");
      Assert.greater(
        Number(started[0].extra.total_length),
        0,
        "Reported how much tab-title text the model was given"
      );

      const completed =
        Glean.smartWindow.autoTabGroupingCompleted.testGetValue();
      Assert.equal(completed?.length, 1, "One 'completed' event recorded");
      Assert.equal(completed[0].extra.success, "true", "Clustering succeeded");
      Assert.equal(completed[0].extra.groups, "2", "Suggested two groups");
      Assert.equal(
        completed[0].extra.grouped_tabs,
        "4",
        "Placed four tabs into those groups"
      );
      Assert.greater(
        Number(completed[0].extra.total_length),
        0,
        "Reported how much tab-title text ended up in the suggestions"
      );

      const suggested = Glean.smartWindow.autoTabGroupSuggested.testGetValue();
      Assert.equal(suggested?.length, 2, "One event per suggested group");
      Assert.ok(
        suggested.every(e => e.extra.grouped_tabs === "2"),
        "Each suggested group holds two tabs"
      );
      Assert.equal(
        new Set(suggested.map(e => e.extra.grouped_id)).size,
        2,
        "The two groups are told apart by grouped_id"
      );

      const displayed =
        Glean.smartWindow.autoTabGroupWindowDisplay.testGetValue();
      Assert.equal(displayed?.length, 1, "One 'window display' event recorded");
      Assert.equal(
        displayed[0].extra.suggested_groups,
        "2",
        "Showed both suggestions"
      );
      Assert.equal(displayed[0].extra.groups, "0", "Nothing created yet");
      Assert.equal(
        displayed[0].extra.waited_out,
        "false",
        "Clustering finished before the panel stopped waiting"
      );

      await closePanel(win);
      await openPanelWithSuggestions(win);
      Assert.equal(
        Glean.smartWindow.autoTabGroupingRequested.testGetValue().length,
        2,
        "Reopening the panel asks for suggestions again"
      );
    });

    it("records accepting every suggestion at once", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);
      const suggestedIds = Glean.smartWindow.autoTabGroupSuggested
        .testGetValue()
        .map(e => e.extra.grouped_id);

      const groupsBefore = win.gBrowser.tabGroups.length;
      panel.querySelector(".swgt-create-all").click();
      await TestUtils.waitForCondition(
        () => win.gBrowser.tabGroups.length === groupsBefore + 2,
        "Both groups created"
      );

      const accepted = Glean.smartWindow.autoTabGroupAccepted.testGetValue();
      Assert.equal(accepted?.length, 2, "One 'accepted' event per group");
      Assert.ok(
        accepted.every(e => e.extra.source === "collective_accept"),
        "Both are recorded as a collective accept"
      );
      Assert.deepEqual(
        accepted.map(e => e.extra.grouped_id),
        suggestedIds,
        "Accepting reports the same grouped_id the suggestion did"
      );

      const completed = Glean.smartWindow.autoTabGroupCompleted.testGetValue();
      Assert.equal(completed?.length, 2, "One 'completed' event per group");
      Assert.ok(
        completed.every(e => e.extra.success === "true"),
        "Both groups were created successfully"
      );
      Assert.ok(
        completed.every(e => e.extra.grouped_tabs === "2"),
        "Each created group holds two tabs"
      );
    });

    it("creates one group at a time and keeps the panel open", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);

      const groupsBefore = win.gBrowser.tabGroups.length;
      panel.querySelector(".swgt-suggestion").click();
      await TestUtils.waitForCondition(
        () => win.gBrowser.tabGroups.length === groupsBefore + 1,
        "Clicking one suggestion created one group"
      );

      const remaining = await TestUtils.waitForCondition(() => {
        const rows = panel.querySelectorAll(".swgt-suggestion");
        return rows.length === 1 ? rows[0] : null;
      }, "The other suggestion is still offered");
      Assert.ok(
        !panel.querySelector(".swgt-create-all"),
        "With one suggestion left, its own row is the only way to create it"
      );
      Assert.ok(
        win.document.getElementById("smartwindow-group-tabs-panel"),
        "Panel stays open so the next group can be created"
      );
      Assert.equal(
        panel.querySelectorAll(".swgt-recent-row").length,
        1,
        "The created group is listed under 'Just created'"
      );
      await TestUtils.waitForCondition(
        () => win.document.activeElement === remaining,
        "Focus moves to the suggestion that took its place"
      );

      remaining.click();
      await TestUtils.waitForCondition(
        () => win.gBrowser.tabGroups.length === groupsBefore + 2,
        "The second suggestion created the second group without reopening"
      );
      const accepted = Glean.smartWindow.autoTabGroupAccepted.testGetValue();
      Assert.equal(accepted?.length, 2, "Two 'accepted' events recorded");
      Assert.ok(
        accepted.every(e => e.extra.source === "individual_accept"),
        "Both are recorded as individual accepts"
      );
    });

    it("lists created groups under 'Just created' and ungroups them all", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);

      const groupsBefore = win.gBrowser.tabGroups.length;
      const tabsBefore = win.gBrowser.tabs.length;
      panel.querySelector(".swgt-create-all").click();
      await TestUtils.waitForCondition(
        () => win.gBrowser.tabGroups.length === groupsBefore + 2,
        "Both groups created"
      );
      await TestUtils.waitForCondition(
        () => panel.querySelectorAll(".swgt-recent-row").length === 2,
        "Both created groups are listed under 'Just created'"
      );
      const groupIcons = [
        ...panel.querySelectorAll(".swgt-recent-row .swgt-group-icon"),
      ];
      Assert.ok(
        groupIcons.every(icon =>
          icon.src.endsWith("tabbrowser/tab-group-chicklet.svg")
        ),
        "Created groups are marked with the shared tab group chicklet"
      );
      Assert.deepEqual(
        groupIcons
          .map(icon =>
            icon.style.getPropertyValue("--tab-group-background-color")
          )
          .sort(),
        win.gBrowser.tabGroups.map(g => `var(--tab-group-${g.color})`).sort(),
        "Each chicklet is tinted with its own group's color"
      );
      Assert.ok(
        panel.querySelector(".swgt-ungroup"),
        "'Ungroup' footer is shown"
      );
      Assert.equal(
        panel
          .querySelector(".swgt-note .swgt-message")
          .getAttribute("data-l10n-id"),
        "smartwindow-group-tabs-all-sorted",
        "Having created groups, the panel credits the work even with tabs left ungrouped"
      );

      const ungroup = panel.querySelector(".swgt-ungroup");
      ungroup.focus();
      Assert.equal(
        win.document.activeElement,
        ungroup,
        "The 'Ungroup' row can take focus"
      );
      ungroup.click();
      await TestUtils.waitForCondition(
        () => win.gBrowser.tabGroups.length === groupsBefore,
        "Ungroup reverses every created group"
      );
      Assert.equal(
        win.gBrowser.tabs.length,
        tabsBefore,
        "Ungroup keeps the tabs open"
      );
      const requested =
        Glean.smartWindow.autoTabUngroupRequested.testGetValue();
      Assert.equal(requested?.length, 2, "One 'ungroup requested' per group");
      Assert.ok(
        requested.every(e => e.extra.source === "collective_ungroup"),
        "Both are recorded as a collective ungroup"
      );
      const ungrouped =
        Glean.smartWindow.autoTabUngroupCompleted.testGetValue();
      Assert.equal(ungrouped?.length, 2, "One 'ungroup completed' per group");
      Assert.ok(
        ungrouped.every(e => e.extra.success === "true"),
        "Both groups were ungrouped successfully"
      );
      Assert.deepEqual(
        ungrouped.map(e => e.extra.grouped_id),
        requested.map(e => e.extra.grouped_id),
        "Ungrouping reports the grouped_id the group was suggested under"
      );
      await TestUtils.waitForCondition(
        () => !panel.querySelectorAll(".swgt-recent-row").length,
        "The 'Just created' list is cleared"
      );
      await TestUtils.waitForCondition(
        () => win.document.activeElement === panel.querySelector(".swgt-card"),
        "Focus lands on the card once the 'Ungroup' row it was on is gone"
      );
    });

    it("switches to a group from its 'Just created' row", async () => {
      win = await openGroupingWindowWithTabs();
      const panel = await openPanelWithSuggestions(win);

      panel.querySelector(".swgt-suggestion").click();
      const row = await TestUtils.waitForCondition(
        () => panel.querySelector(".swgt-recent-row"),
        "The created group is listed under 'Just created'"
      );
      const entry = AutoTabGrouping._getState(win).recent[0];

      Assert.ok(
        [...panel.querySelectorAll(".swgt-row")].includes(row),
        "The row is one of the rows the arrow keys move through"
      );
      const accService = Cc["@mozilla.org/accessibilityService;1"].getService(
        Ci.nsIAccessibilityService
      );
      await TestUtils.waitForCondition(
        () => accService.getAccessibleFor(row)?.name === entry.label,
        "The row is announced by the name of the group it made"
      );

      row.focus();
      Assert.equal(
        win.document.activeElement,
        row,
        "The row takes keyboard focus"
      );
      EventUtils.synthesizeKey("KEY_Enter", {}, win);
      await TestUtils.waitForCondition(
        () => !win.document.getElementById("smartwindow-group-tabs-panel"),
        "Choosing the group closes the panel"
      );
      Assert.equal(
        win.gBrowser.selectedTab.group,
        entry.group,
        "The group's first tab is selected"
      );
    });

    it("only lists groups created while the panel was open", async () => {
      win = await openGroupingWindowWithTabs();
      let panel = await openPanelWithSuggestions(win);

      panel.querySelector(".swgt-create-all").click();
      await TestUtils.waitForCondition(
        () => panel.querySelectorAll(".swgt-recent-row").length === 2,
        "Both created groups are listed under 'Just created'"
      );

      await closePanel(win);
      panel = await openPanel(win);
      const card = panel.querySelector(".swgt-card");
      await card.updateComplete;

      Assert.ok(
        card.querySelector(".swgt-header"),
        "The reopened card rendered"
      );
      Assert.deepEqual(card.recent, [], "The 'Just created' list starts empty");
      Assert.ok(
        !card.querySelector(
          '[data-l10n-id="smartwindow-group-tabs-just-created-heading"]'
        ),
        "The 'Just created' heading is gone"
      );
      Assert.ok(
        !card.querySelector(".swgt-recent-row"),
        "None of the groups made last time are listed"
      );
      Assert.ok(
        !card.querySelector(".swgt-ungroup"),
        "The 'Ungroup' row is gone with them"
      );
      Assert.equal(
        win.gBrowser.tabGroups.length,
        2,
        "The groups themselves are left alone"
      );
    });
  });

  describe("when there is nothing left to suggest", () => {
    it("credits work done this time and forgets it the next", async () => {
      win = await openGroupingWindowWithTabs();
      let panel = await openPanelWithSuggestions(win);
      const noteId = () =>
        panel
          .querySelector(".swgt-note .swgt-message")
          ?.getAttribute("data-l10n-id");

      panel.querySelector(".swgt-create-all").click();
      await TestUtils.waitForCondition(
        () => panel.querySelectorAll(".swgt-recent-row").length === 2,
        "Both created groups are listed under 'Just created'"
      );
      Assert.equal(
        noteId(),
        "smartwindow-group-tabs-all-sorted",
        "Groups created this time earn the 'nice work' note"
      );

      await closePanel(win);
      panel = await openPanel(win);
      await TestUtils.waitForCondition(
        () => noteId() === "smartwindow-group-tabs-empty",
        "Reopened with nothing created, the panel just says it has no suggestions"
      );
    });
  });
});
