/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { SidebarState } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sidebar/SidebarState.sys.mjs"
);

const mockElement = {
  setAttribute(name, value) {
    this[name] = value;
  },
  style: { width: "200px" },
  toggleAttribute: sinon.stub(),
};
const mockLitElement = Object.assign(mockElement, {
  requestUpdate: sinon.stub(),
});

const mockGlobal = {
  document: { getElementById: () => mockElement },
  gBrowser: { tabContainer: mockElement },
};
const mockController = {
  _box: mockElement,
  _enableLauncherDragging: sinon.stub(),
  _disableLauncherDragging: sinon.stub(),
  hide: sinon.stub(),
  launcherSplitter: { toggleAttribute: sinon.stub() },
  showInitially: sinon.stub(),
  sidebarContainer: { documentGlobal: mockGlobal },
  sidebarMain: mockLitElement,
  sidebarRevampEnabled: true,
  sidebarRevampVisibility: "always-show",
  sidebars: new Set(["viewBookmarksSidebar"]),
  updateToolbarButton: sinon.stub(),
  SidebarManager: { hasSidebarLauncherBeenVisible: false },
  requestMaxWidthUpdate: sinon.stub(),
};

add_task(async function test_load_legacy_session_restore_data() {
  const sidebarState = new SidebarState(mockController);

  sidebarState.loadCurrentState({
    width: "300px",
    command: "viewBookmarksSidebar",
    expanded: true,
    hidden: false,
  });

  const props = sidebarState.getProperties();
  Assert.equal(props.panelWidth, 300, "The panel was resized.");
  Assert.equal(props.launcherExpanded, true, "The launcher is expanded.");
  Assert.equal(props.launcherVisible, true, "The launcher is visible.");
  Assert.ok(
    mockController.showInitially.calledWith("viewBookmarksSidebar"),
    "Bookmarks panel was shown."
  );
});

add_task(async function test_load_prerevamp_session_restore_data() {
  const sidebarState = new SidebarState(mockController);

  sidebarState.loadCurrentState({
    command: "viewBookmarksSidebar",
  });

  const props = sidebarState.getProperties();
  Assert.ok(props.panelOpen, "The panel is marked as open.");
  Assert.equal(props.launcherVisible, true, "The launcher is visible.");
  Assert.equal(props.command, "viewBookmarksSidebar", "The command matches.");
  Assert.ok(
    mockController.showInitially.calledWith("viewBookmarksSidebar"),
    "Bookmarks panel was shown."
  );
});

add_task(async function test_load_per_state_pinned_tabs_and_tools_heights() {
  const sidebarState = new SidebarState(mockController);

  sidebarState.loadCurrentState({
    pinnedTabsHeight: 287,
    expandedPinnedTabsHeight: 82,
    collapsedPinnedTabsHeight: 200,
    toolsHeight: 120,
    expandedToolsHeight: 60,
    collapsedToolsHeight: 90,
  });

  const props = sidebarState.getProperties();
  Assert.equal(
    props.expandedPinnedTabsHeight,
    82,
    "The expanded pinned tabs height was restored."
  );
  Assert.equal(
    props.collapsedPinnedTabsHeight,
    200,
    "The collapsed pinned tabs height was not clobbered by pinnedTabsHeight."
  );
  Assert.equal(props.pinnedTabsHeight, 287, "The pinned tabs height is kept.");
  Assert.equal(
    props.expandedToolsHeight,
    60,
    "The expanded tools height was restored."
  );
  Assert.equal(
    props.collapsedToolsHeight,
    90,
    "The collapsed tools height was not clobbered by toolsHeight."
  );
  Assert.equal(props.toolsHeight, 120, "The tools height is kept.");
});

add_task(async function test_load_hidden_panel_state() {
  const sidebarState = new SidebarState(mockController);

  sidebarState.loadCurrentState({
    command: "viewBookmarksSidebar",
    panelOpen: false,
    launcherVisible: true,
  });

  const props = sidebarState.getProperties();
  Assert.ok(!props.panelOpen, "The panel is marked as closed.");
  Assert.equal(props.launcherVisible, true, "The launcher is visible.");
  Assert.equal(props.command, "viewBookmarksSidebar", "The command matches.");
});
