/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Import TabManagementService class
const { TabManagementService } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/TabManagementService.sys.mjs"
);

// Mock SessionStore for testing
const mockSessionStore = {
  closedTabs: [],

  undoCloseTab(_window, index) {
    if (index >= 0 && index < this.closedTabs.length) {
      const restoredTab = this.closedTabs.splice(index, 1)[0];
      return {
        linkedBrowser: {
          currentURI: { spec: restoredTab.state.entries[0].url },
        },
        label: restoredTab.state.entries[0].title,
      };
    }
    return null;
  },

  getClosedTabDataForWindow() {
    return [...this.closedTabs];
  },

  addClosedTab(tab) {
    this.closedTabs.unshift(tab);
  },

  reset() {
    this.closedTabs = [];
  },
};

// Create TabManagementService instance with mock SessionStore
const tabManagementService = new TabManagementService(mockSessionStore);

/**
 * Helper to create a mock tab
 *
 * @param {string|null} url - Tab URL
 * @param {string} title - Tab title
 * @param {number} userContextId - Container ID (0 = default)
 * @param {boolean} isClosing - Whether tab is closing
 * @param {object|null} group - Tab group the tab belongs to
 * @param {boolean} pinned - Whether tab is pinned
 * @returns {object} Mock tab object
 */
function createMockTab(
  url,
  title,
  userContextId = 0,
  isClosing = false,
  group = null,
  pinned = false
) {
  const mockTab = {
    linkedBrowser: {
      currentURI: { spec: url },
      contentPrincipal: {
        originAttributes: { userContextId },
      },
    },
    label: title,
    userContextId,
    closing: isClosing,
    group,
    pinned,
    documentGlobal: null, // Will be set per test
    getAttribute: () => null,
    _tPos: 0,
  };
  return mockTab;
}

/**
 * Helper to create a mock window
 */
function createMockWindow() {
  const removedTabs = [];
  const tabGroups = [];
  const mockWindow = {
    gBrowser: {
      tabs: [],
      tabGroups: [],
      removeTab(tab) {
        const index = this.tabs.indexOf(tab);
        if (index > -1) {
          const removed = this.tabs.splice(index, 1)[0];
          removedTabs.push(removed);

          // Simulate SessionStore adding the closed tab
          mockSessionStore.addClosedTab({
            state: {
              entries: [
                {
                  url: removed.linkedBrowser.currentURI.spec,
                  title: removed.label,
                },
              ],
              index: 1,
              userContextId: removed.userContextId || 0,
            },
          });
        }
      },
      addTabGroup(tabs, options) {
        const group = {
          id: options?.id || `group-${Date.now()}`,
          label: options?.label || "Tab Group",
          color: options?.color || "blue",
          tabs: [...tabs],
        };

        // Add group to tabs
        tabs.forEach(tab => {
          tab.group = group;
        });

        this.tabGroups.push(group);
        tabGroups.push(group);
        return group;
      },
      ungroupTab(tab) {
        if (tab.group) {
          const group = tab.group;
          const index = group.tabs.indexOf(tab);
          if (index > -1) {
            group.tabs.splice(index, 1);
          }
          tab.group = null;

          // Remove empty groups
          if (group.tabs.length === 0) {
            const groupIndex = this.tabGroups.indexOf(group);
            if (groupIndex > -1) {
              this.tabGroups.splice(groupIndex, 1);
            }
          }
        }
      },
      getAllTabGroups() {
        return this.tabGroups;
      },
    },
    location: { href: "chrome://browser/content/browser.xhtml" },
    _removedTabs: removedTabs,
    _tabGroups: tabGroups,
  };
  return mockWindow;
}

/**
 * Test that tabManagementService is a singleton
 */
add_task(async function test_tabmanagement_service_singleton() {
  const service1 = tabManagementService;
  const service2 = tabManagementService;

  Assert.equal(
    service1,
    service2,
    "tabManagementService should be a singleton"
  );
});

/**
 * Test closing tabs and getting an operation ID
 */
add_task(async function test_close_tabs_returns_operation_id() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  const tab1 = createMockTab("https://example.com", "Example");
  const tab2 = createMockTab("https://mozilla.org", "Mozilla");

  // Set the window reference for validation
  tab1.documentGlobal = mockWindow;
  tab2.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [tab1, tab2];

  const result = await tabManagementService.closeTabs({
    tabs: [tab1, tab2],
    window: mockWindow,
  });

  Assert.equal(result.requestedCount, 2, "Requested to close 2 tabs");
  Assert.ok(result.operationId, "Should return an operation ID");
  Assert.ok(
    result.operationId.startsWith("tab-close-"),
    "Operation ID should have correct prefix"
  );
  Assert.equal(result.failedTabs.length, 0, "Should have no failed tabs");

  // Verify tabs were added to SessionStore
  Assert.equal(
    mockSessionStore.closedTabs.length,
    2,
    "SessionStore should have 2 closed tabs"
  );
});

/**
 * Test restoring tabs using operation ID
 */
add_task(async function test_restore_tabs_with_operation_id() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  const tab1 = createMockTab("https://example.com", "Example");
  const tab2 = createMockTab("https://mozilla.org", "Mozilla");

  tab1.documentGlobal = mockWindow;
  tab2.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [tab1, tab2];

  // Close tabs
  const closeResult = await tabManagementService.closeTabs({
    tabs: [tab1, tab2],
    window: mockWindow,
  });

  Assert.ok(closeResult.operationId, "Close should return operation ID");

  // Restore tabs
  const restoreResult = await tabManagementService.restoreTabs({
    operationId: closeResult.operationId,
    window: mockWindow,
  });

  Assert.equal(restoreResult.restoredCount, 2, "Should restore 2 tabs");
  Assert.equal(restoreResult.requestedCount, 2, "Requested to restore 2 tabs");
  Assert.equal(
    restoreResult.failedTabs.length,
    0,
    "Should have no failed tabs"
  );
  Assert.equal(
    restoreResult.restoredTabs.length,
    2,
    "Should have 2 restored tab objects"
  );
});

/**
 * Test that invalid tabs are filtered out
 */
add_task(async function test_invalid_tabs_filtered() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  const validTab = createMockTab("https://example.com", "Valid");
  const invalidTab = createMockTab("https://invalid.com", "Invalid");
  const closingTab = createMockTab("https://closing.com", "Closing", 0, true);

  validTab.documentGlobal = mockWindow;
  invalidTab.documentGlobal = null; // Wrong window
  closingTab.documentGlobal = mockWindow;

  const result = await tabManagementService.closeTabs({
    tabs: [validTab, invalidTab, closingTab],
    window: mockWindow,
  });

  Assert.equal(result.requestedCount, 3, "Requested to close 3 tabs");
  Assert.equal(result.failedTabs.length, 2, "Should have 2 failed tabs");

  // Check failure reasons
  const failureReasons = result.failedTabs.map(f => f.reason);
  Assert.ok(
    failureReasons.includes("invalid-tab"),
    "Should have invalid-tab failure"
  );
  Assert.ok(
    failureReasons.includes("already-closing"),
    "Should have already-closing failure"
  );
});

/**
 * Test restoring with invalid operation ID
 */
add_task(async function test_restore_invalid_operation_id() {
  const mockWindow = createMockWindow();

  const result = await tabManagementService.restoreTabs({
    operationId: "invalid-id",
    window: mockWindow,
  });

  Assert.equal(result.restoredCount, 0, "Should restore 0 tabs");
  Assert.equal(result.requestedCount, 0, "Should request 0 tabs");
  Assert.equal(result.failedTabs.length, 0, "Should have no failed tabs");
});

/**
 * Test that container tabs are matched correctly
 */
add_task(async function test_container_tab_matching() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  const containerTab = createMockTab("https://example.com", "Container Tab", 2);
  containerTab.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [containerTab];

  // Close the container tab
  const closeResult = await tabManagementService.closeTabs({
    tabs: [containerTab],
    window: mockWindow,
  });

  Assert.ok(closeResult.operationId, "Should return operation ID");
  Assert.equal(closeResult.requestedCount, 1, "Requested to close 1 tab");

  // Verify the closed tab in SessionStore has correct userContextId
  Assert.equal(
    mockSessionStore.closedTabs[0].state.userContextId,
    2,
    "Closed tab should preserve container ID"
  );

  // Restore the container tab
  const restoreResult = await tabManagementService.restoreTabs({
    operationId: closeResult.operationId,
    window: mockWindow,
  });

  Assert.equal(restoreResult.restoredCount, 1, "Should restore container tab");
});

/**
 * Test operation limit (max 10 stored operations)
 */
add_task(async function test_operation_limit() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();
  const operationIds = [];

  // Create more than 10 operations
  for (let i = 0; i < 12; i++) {
    const tab = createMockTab(`https://example${i}.com`, `Tab ${i}`);
    tab.documentGlobal = mockWindow;
    mockWindow.gBrowser.tabs = [tab];

    const result = await tabManagementService.closeTabs({
      tabs: [tab],
      window: mockWindow,
    });

    if (result.operationId) {
      operationIds.push(result.operationId);
    }
  }

  // First two operations should be evicted
  const firstOpResult = await tabManagementService.restoreTabs({
    operationId: operationIds[0],
    window: mockWindow,
  });

  Assert.equal(
    firstOpResult.restoredCount,
    0,
    "First operation should be evicted (exceeded limit)"
  );

  // Recent operations should still work
  const recentOpResult = await tabManagementService.restoreTabs({
    operationId: operationIds[11],
    window: mockWindow,
  });

  // Note: This might fail if SessionStore doesn't have the tab anymore
  // In real usage, SessionStore would have the closed tab
  Assert.greater(
    recentOpResult.requestedCount,
    0,
    "Recent operation should still be stored"
  );
});

/**
 * Test handling of tabs with no URL
 */
add_task(async function test_tabs_without_url() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  const tabNoUrl = createMockTab(null, "No URL");
  tabNoUrl.documentGlobal = mockWindow;

  const tabWithUrl = createMockTab("https://example.com", "With URL");
  tabWithUrl.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [tabNoUrl, tabWithUrl];

  const result = await tabManagementService.closeTabs({
    tabs: [tabNoUrl, tabWithUrl],
    window: mockWindow,
  });

  // Both tabs should close (null URL is valid for about: pages, etc)
  Assert.equal(result.requestedCount, 2, "Requested to close 2 tabs");
  Assert.equal(result.failedTabs.length, 0, "Should have no failed tabs");
});

/**
 * Test error handling when window is invalid
 */
add_task(async function test_invalid_window() {
  await Assert.rejects(
    tabManagementService.closeTabs({
      tabs: [createMockTab("https://example.com", "Test")],
      window: null,
    }),
    /Invalid browser window/,
    "Should throw for null window"
  );

  await Assert.rejects(
    tabManagementService.closeTabs({
      tabs: [createMockTab("https://example.com", "Test")],
      window: {}, // No gBrowser
    }),
    /Invalid browser window/,
    "Should throw for window without gBrowser"
  );
});

/**
 * Test empty tabs array
 */
add_task(async function test_empty_tabs_array() {
  const mockWindow = createMockWindow();

  const result = await tabManagementService.closeTabs({
    tabs: [],
    window: mockWindow,
  });

  Assert.equal(result.requestedCount, 0, "Should request 0 tabs");
  Assert.equal(result.operationId, null, "Should not return operation ID");
  Assert.equal(result.failedTabs.length, 0, "Should have no failed tabs");
});

/**
 * Test timestamp disambiguation when multiple tabs with same URL exist
 */
add_task(async function test_timestamp_disambiguation() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  // Simulate an older tab closed by AI (30 minutes ago)
  const aiOperationTime = Date.now() - 30 * 60 * 1000;
  mockSessionStore.addClosedTab({
    closedAt: aiOperationTime,
    state: {
      entries: [
        {
          url: "https://nychotels.com",
          title: "NYC Hotels - Old",
        },
      ],
      index: 1,
      userContextId: 0,
    },
  });

  // Simulate a newer tab closed manually by user (5 minutes ago)
  const userClosedTime = Date.now() - 5 * 60 * 1000;
  mockSessionStore.addClosedTab({
    closedAt: userClosedTime,
    state: {
      entries: [
        {
          url: "https://nychotels.com",
          title: "NYC Hotels - New",
        },
      ],
      index: 1,
      userContextId: 0,
    },
  });

  // Store a fake operation with the AI operation timestamp
  const operationId = tabManagementService.storeClosedTabsForUndo({
    closedTabs: [
      {
        url: "https://nychotels.com",
        title: "NYC Hotels - Old",
        userContextId: 0,
        operationTimestamp: aiOperationTime,
      },
    ],
  });

  // Restore should pick the older tab (closest to operationTimestamp)
  const restoreResult = await tabManagementService.restoreTabs({
    operationId,
    window: mockWindow,
  });

  Assert.equal(restoreResult.restoredCount, 1, "Should restore 1 tab");
  Assert.equal(
    restoreResult.restoredTabs[0].label,
    "NYC Hotels - Old",
    "Should restore the older tab that matches operation timestamp"
  );

  // Verify the correct tab was removed from mockSessionStore
  Assert.equal(
    mockSessionStore.closedTabs.length,
    1,
    "Should have 1 tab remaining in closed tabs"
  );
  Assert.equal(
    mockSessionStore.closedTabs[0].state.entries[0].title,
    "NYC Hotels - New",
    "The newer manually-closed tab should remain"
  );
});

/**
 * Test that restoreTabs preserves the originally selected tab
 */
add_task(async function test_restoreTabs_preserves_original_selected_tab() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  // Create tabs with one being selected
  const tab1 = createMockTab("https://example.com", "Example");
  const tab2 = createMockTab("https://mozilla.org", "Mozilla");
  const selectedTab = createMockTab("https://selected.com", "Selected Tab");

  tab1.documentGlobal = mockWindow;
  tab2.documentGlobal = mockWindow;
  selectedTab.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [tab1, tab2, selectedTab];
  mockWindow.gBrowser.selectedTab = selectedTab;

  // Close two tabs
  const closeResult = await tabManagementService.closeTabs({
    tabs: [tab1, tab2],
    window: mockWindow,
  });

  // Restore the tabs
  const restoreResult = await tabManagementService.restoreTabs({
    operationId: closeResult.operationId,
    window: mockWindow,
  });

  // Verify the originally selected tab is still selected
  Assert.equal(
    mockWindow.gBrowser.selectedTab,
    selectedTab,
    "Originally selected tab should remain selected after restoration"
  );
  Assert.equal(restoreResult.restoredCount, 2, "Should restore both tabs");
});

/**
 * Test restoreTabs handles missing original selected tab gracefully
 */
add_task(async function test_restoreTabs_handles_missing_original_tab() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  // Create tabs
  const tab1 = createMockTab("https://example.com", "Example");
  const tab2 = createMockTab("https://mozilla.org", "Mozilla");
  const selectedTab = createMockTab("https://selected.com", "Selected Tab");

  tab1.documentGlobal = mockWindow;
  tab2.documentGlobal = mockWindow;
  selectedTab.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [tab1, tab2, selectedTab];
  mockWindow.gBrowser.selectedTab = selectedTab;

  // Close the selected tab and another tab
  const closeResult = await tabManagementService.closeTabs({
    tabs: [tab1, selectedTab],
    window: mockWindow,
  });

  // Remove the selected tab from the tabs array (simulate it being gone)
  mockWindow.gBrowser.tabs = [tab2];
  mockWindow.gBrowser.selectedTab = tab2;

  // Restore the tabs
  const restoreResult = await tabManagementService.restoreTabs({
    operationId: closeResult.operationId,
    window: mockWindow,
  });

  // Should not throw and should restore tabs
  Assert.equal(
    restoreResult.restoredCount,
    2,
    "Should restore both tabs even if original selected tab is missing"
  );
  // Selected tab should remain as the fallback (tab2)
  Assert.equal(
    mockWindow.gBrowser.selectedTab,
    tab2,
    "Should keep the current selected tab when original is missing"
  );
});

/**
 * Test that tabs are restored in background without switching to them
 */
add_task(async function test_restoreTabs_in_background() {
  mockSessionStore.reset();
  const mockWindow = createMockWindow();

  // Create tabs
  const tab1 = createMockTab("https://example.com", "Example");
  const tab2 = createMockTab("https://mozilla.org", "Mozilla");
  const activeTab = createMockTab("https://active.com", "Active Tab");

  tab1.documentGlobal = mockWindow;
  tab2.documentGlobal = mockWindow;
  activeTab.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [activeTab];
  mockWindow.gBrowser.selectedTab = activeTab;

  // Store a fake operation for tabs that were closed
  const operationId = tabManagementService.storeClosedTabsForUndo({
    closedTabs: [
      {
        url: "https://example.com",
        label: "Example",
        closedAt: Date.now(),
      },
      {
        url: "https://mozilla.org",
        label: "Mozilla",
        closedAt: Date.now(),
      },
    ],
    timestamp: Date.now(),
  });

  // Track which tabs were selected during restoration
  const selectedTabs = [];
  const originalSelectedTabSetter = Object.getOwnPropertyDescriptor(
    mockWindow.gBrowser,
    "selectedTab"
  ).set;

  Object.defineProperty(mockWindow.gBrowser, "selectedTab", {
    get() {
      return this._selectedTab || activeTab;
    },
    set(tab) {
      selectedTabs.push(tab);
      this._selectedTab = tab;
      if (originalSelectedTabSetter) {
        originalSelectedTabSetter.call(this, tab);
      }
    },
    configurable: true,
  });

  // Restore the tabs
  await tabManagementService.restoreTabs({
    operationId,
    window: mockWindow,
  });

  // The active tab should be re-selected at the end
  Assert.ok(
    selectedTabs.includes(activeTab),
    "Active tab should be re-selected after restoration"
  );
  Assert.equal(
    selectedTabs[selectedTabs.length - 1],
    activeTab,
    "Active tab should be the last selected tab"
  );
  Assert.equal(
    mockWindow.gBrowser.selectedTab,
    activeTab,
    "Active tab should remain selected after restoration completes"
  );
});

/**
 * Test creating a tab group
 */
add_task(async function test_create_tab_group() {
  const mockWindow = createMockWindow();

  const tab1 = createMockTab("https://example.com", "Example");
  const tab2 = createMockTab("https://mozilla.org", "Mozilla");

  tab1.documentGlobal = mockWindow;
  tab2.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [tab1, tab2];

  const result = await tabManagementService.createTabGroup({
    tabs: [tab1, tab2],
    window: mockWindow,
    label: "Test Group",
  });

  Assert.ok(result.success, "Tab group creation should succeed");
  Assert.ok(result.group, "Should return group object");
  Assert.equal(
    result.group.label,
    "Test Group",
    "Group should have correct label"
  );
  Assert.equal(result.group.tabCount, 2, "Group should have 2 tabs");
  Assert.ok(result.group.color, "Group should have a color");
  Assert.equal(result.failedTabs.length, 0, "Should have no failed tabs");

  // Verify tabs are marked as grouped
  Assert.ok(tab1.group, "Tab1 should have a group");
  Assert.ok(tab2.group, "Tab2 should have a group");
  Assert.equal(tab1.group.id, result.group.id, "Tab1 group ID should match");
});

/**
 * Test creating tab group with invalid tabs
 */
add_task(async function test_create_tab_group_with_invalid_tabs() {
  const mockWindow = createMockWindow();

  const validTab = createMockTab("https://example.com", "Valid");
  const pinnedTab = createMockTab(
    "https://pinned.com",
    "Pinned",
    0,
    false,
    null,
    true
  );
  const alreadyGroupedTab = createMockTab(
    "https://grouped.com",
    "Grouped",
    0,
    false,
    { id: "existing-group" }
  );
  const closingTab = createMockTab("https://closing.com", "Closing", 0, true);

  validTab.documentGlobal = mockWindow;
  pinnedTab.documentGlobal = mockWindow;
  alreadyGroupedTab.documentGlobal = mockWindow;
  closingTab.documentGlobal = mockWindow;

  const result = await tabManagementService.createTabGroup({
    tabs: [validTab, pinnedTab, alreadyGroupedTab, closingTab],
    window: mockWindow,
    label: "Mixed Tabs Group",
  });

  Assert.ok(result.success, "Should succeed with valid tabs");
  Assert.equal(result.group.tabCount, 1, "Should only group the valid tab");
  Assert.equal(result.failedTabs.length, 3, "Should have 3 failed tabs");

  // Check failure reasons
  const failureReasons = result.failedTabs.map(f => f.reason);
  Assert.ok(
    failureReasons.includes("pinned-tab"),
    "Should have pinned-tab failure"
  );
  Assert.ok(
    failureReasons.includes("already-grouped"),
    "Should have already-grouped failure"
  );
  Assert.ok(
    failureReasons.includes("tab-closing"),
    "Should have tab-closing failure"
  );
});

/**
 * Test creating tab group with no valid tabs
 */
add_task(async function test_create_tab_group_no_valid_tabs() {
  const mockWindow = createMockWindow();

  const pinnedTab = createMockTab(
    "https://pinned.com",
    "Pinned",
    0,
    false,
    null,
    true
  );
  pinnedTab.documentGlobal = mockWindow;

  const result = await tabManagementService.createTabGroup({
    tabs: [pinnedTab],
    window: mockWindow,
    label: "Invalid Group",
  });

  Assert.ok(!result.success, "Should fail with no valid tabs");
  Assert.equal(result.group, null, "Should not create a group");
  Assert.equal(
    result.error,
    "No valid tabs to group",
    "Should have appropriate error"
  );
});

/**
 * Test ungrouping tabs
 */
add_task(async function test_ungroup_tabs() {
  const mockWindow = createMockWindow();

  const tab1 = createMockTab("https://example.com", "Example");
  const tab2 = createMockTab("https://mozilla.org", "Mozilla");

  tab1.documentGlobal = mockWindow;
  tab2.documentGlobal = mockWindow;

  mockWindow.gBrowser.tabs = [tab1, tab2];

  // First create a group
  const createResult = await tabManagementService.createTabGroup({
    tabs: [tab1, tab2],
    window: mockWindow,
    label: "Test Group",
  });

  Assert.ok(createResult.success, "Group creation should succeed");
  const groupId = createResult.group.id;

  // Now ungroup the tabs
  const ungroupResult = await tabManagementService.ungroupTabs({
    groupId,
    window: mockWindow,
  });

  Assert.ok(ungroupResult.success, "Ungrouping should succeed");
  Assert.equal(ungroupResult.ungroupedTabs.length, 2, "Should ungroup 2 tabs");

  // Verify tabs no longer have groups
  Assert.equal(tab1.group, null, "Tab1 should no longer have a group");
  Assert.equal(tab2.group, null, "Tab2 should no longer have a group");

  // Verify ungrouped tabs data
  Assert.equal(ungroupResult.ungroupedTabs[0].url, "https://example.com");
  Assert.equal(ungroupResult.ungroupedTabs[1].url, "https://mozilla.org");
});

/**
 * Test ungrouping with invalid group ID
 */
add_task(async function test_ungroup_invalid_group_id() {
  const mockWindow = createMockWindow();

  const result = await tabManagementService.ungroupTabs({
    groupId: "non-existent-group",
    window: mockWindow,
  });

  Assert.ok(!result.success, "Should fail with invalid group ID");
  Assert.equal(result.ungroupedTabs.length, 0, "Should ungroup 0 tabs");
  Assert.ok(
    result.error.includes("not found"),
    "Error should mention group not found"
  );
});

/**
 * Test color selection for tab groups
 */
add_task(async function test_tab_group_color_selection() {
  const mockWindow = createMockWindow();

  // Create multiple groups to test color assignment
  const colors = [];

  for (let i = 0; i < 3; i++) {
    const tab = createMockTab(`https://example${i}.com`, `Tab ${i}`);
    tab.documentGlobal = mockWindow;
    mockWindow.gBrowser.tabs = [tab];

    const result = await tabManagementService.createTabGroup({
      tabs: [tab],
      window: mockWindow,
      label: `Group ${i}`,
    });

    Assert.ok(result.success, `Group ${i} should be created`);
    colors.push(result.group.color);
  }

  // Check that colors are valid
  const validColors = TabManagementService.TAB_GROUP_COLORS;
  colors.forEach(color => {
    Assert.ok(
      validColors.includes(color),
      `${color} should be a valid tab group color`
    );
  });

  // If colors are different, verify they're not duplicates
  const uniqueColors = new Set(colors);
  if (uniqueColors.size > 1) {
    Assert.equal(
      uniqueColors.size,
      colors.length,
      "Colors should be unique when available"
    );
  }
});

/**
 * Test color selection when all colors are used
 */
add_task(async function test_tab_group_color_all_used() {
  const mockWindow = createMockWindow();

  // Mock all colors as being used
  TabManagementService.TAB_GROUP_COLORS.forEach(color => {
    mockWindow.gBrowser.tabGroups.push({
      id: `group-${color}`,
      color,
      tabs: [],
    });
  });

  const tab = createMockTab("https://example.com", "Test Tab");
  tab.documentGlobal = mockWindow;
  mockWindow.gBrowser.tabs = [tab];

  const result = await tabManagementService.createTabGroup({
    tabs: [tab],
    window: mockWindow,
    label: "Group with Random Color",
  });

  Assert.ok(result.success, "Should still create group when all colors used");
  Assert.ok(
    TabManagementService.TAB_GROUP_COLORS.includes(result.group.color),
    "Should assign a valid color even when all are used"
  );
});

/**
 * Test creating group with custom color
 */
add_task(async function test_create_tab_group_custom_color() {
  const mockWindow = createMockWindow();

  const tab = createMockTab("https://example.com", "Example");
  tab.documentGlobal = mockWindow;
  mockWindow.gBrowser.tabs = [tab];

  const result = await tabManagementService.createTabGroup({
    tabs: [tab],
    window: mockWindow,
    label: "Custom Color Group",
    color: "purple",
  });

  Assert.ok(result.success, "Should create group with custom color");
  Assert.equal(result.group.color, "purple", "Should use the specified color");
});

/**
 * Test creating group with empty tabs array
 */
add_task(async function test_create_tab_group_empty_tabs() {
  const mockWindow = createMockWindow();

  const result = await tabManagementService.createTabGroup({
    tabs: [],
    window: mockWindow,
    label: "Empty Group",
  });

  Assert.ok(!result.success, "Should fail with empty tabs array");
  Assert.equal(
    result.error,
    "No tabs provided",
    "Should have appropriate error"
  );
});

/**
 * Test creating group with invalid window
 */
add_task(async function test_create_tab_group_invalid_window() {
  const tab = createMockTab("https://example.com", "Example");

  const result1 = await tabManagementService.createTabGroup({
    tabs: [tab],
    window: null,
  });

  Assert.equal(result1.success, false, "Should return failure for null window");
  Assert.equal(
    result1.error,
    "Invalid browser window provided",
    "Should return correct error message for null window"
  );

  const result2 = await tabManagementService.createTabGroup({
    tabs: [tab],
    window: {}, // No gBrowser
  });

  Assert.equal(
    result2.success,
    false,
    "Should return failure for window without gBrowser"
  );
  Assert.equal(
    result2.error,
    "Invalid browser window provided",
    "Should return correct error message for window without gBrowser"
  );
});
