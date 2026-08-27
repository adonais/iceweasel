/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [SIDEBAR_VISIBILITY_PREF, "always-show"],
      [POSITION_SETTING_PREF, true],
      [VERTICAL_TABS_PREF, true],
    ],
  });
  await SidebarController.updateUIState({
    launcherExpanded: false,
    launcherVisible: true,
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
});

registerCleanupFunction(async () => {
  await SpecialPowers.popPrefEnv();
});

async function dragLauncher(deltaX, shouldExpand) {
  AccessibilityUtils.setEnv({ mustHaveAccessibleRule: false });

  // Let the launcher splitter stabilize before attempting a drag-and-drop.
  await waitForRepaint();

  info(`Drag the launcher by ${deltaX} px.`);
  const { sidebarMain, _launcherSplitter: splitter } = SidebarController;
  EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousedown" });
  await mouseMoveInChunksHorizontal(splitter, deltaX, 10);
  await waitForRepaint();
  EventUtils.synthesizeMouse(splitter, 0, 0, { type: "mouseup" });

  info(`The sidebar should be ${shouldExpand ? "expanded" : "collapsed"}.`);
  await BrowserTestUtils.waitForMutationCondition(
    sidebarMain,
    { attributeFilter: ["expanded"] },
    () => sidebarMain.hasAttribute("expanded") == shouldExpand
  );

  AccessibilityUtils.resetEnv();
}

async function dragPinnedTabs(deltaY) {
  AccessibilityUtils.setEnv({ mustHaveAccessibleRule: false });

  // Let the pinned tabs splitter stabilize before attempting a drag-and-drop.
  await waitForRepaint();

  info(`Drag the launcher by ${deltaY} px.`);
  const { _pinnedTabsSplitter: splitter } = SidebarController;
  EventUtils.synthesizeMouseAtCenter(splitter, { type: "mousedown" });
  await mouseMoveInChunksVertical(splitter, deltaY, 10);
  EventUtils.synthesizeMouse(splitter, 0, 0, { type: "mouseup" });

  info(`The pinned tabs container has been expanded.`);

  AccessibilityUtils.resetEnv();
}

async function mouseMoveInChunksHorizontal(el, deltaX, numberOfChunks) {
  let chunkIndex = 0;
  const chunkSize = deltaX / numberOfChunks;
  const finished = Promise.withResolvers();

  function synthesizeMouseMove() {
    // mousemove by a single chunk. Queue up the next chunk if necessary.
    EventUtils.synthesizeMouse(el, chunkSize, 0, { type: "mousemove" });
    if (++chunkIndex === numberOfChunks) {
      finished.resolve();
    } else {
      requestAnimationFrame(synthesizeMouseMove);
    }
  }

  await waitForRepaint();
  requestAnimationFrame(synthesizeMouseMove);
  await finished.promise;
}

async function mouseMoveInChunksVertical(el, deltaY, numberOfChunks) {
  let chunkIndex = 0;
  const chunkSize = deltaY / numberOfChunks;
  const finished = Promise.withResolvers();

  function synthesizeMouseMove() {
    info(`chunkSize: ${chunkSize}`);
    // mousemove by a single chunk. Queue up the next chunk if necessary.
    EventUtils.synthesizeMouse(el, 0, chunkSize, { type: "mousemove" });
    if (++chunkIndex === numberOfChunks) {
      finished.resolve();
    } else {
      requestAnimationFrame(synthesizeMouseMove);
    }
  }

  await waitForRepaint();
  requestAnimationFrame(synthesizeMouseMove);
  await finished.promise;
}

function getLauncherWidth({ SidebarController } = window) {
  return SidebarController.sidebarContainer.style.width;
}

function getPinnedTabsHeight({ SidebarController } = window) {
  return SidebarController._pinnedTabsContainer.clientHeight;
}

function isPinnedTabsGrid(wrapper) {
  const { display, gridTemplateColumns } = window.getComputedStyle(wrapper);
  const { SidebarController } = window;
  info(
    `pinned tabs layout: display=${display} columns=${gridTemplateColumns}` +
      ` orient=${SidebarController._pinnedTabsContainer.getAttribute("orient")}` +
      ` expand-on-hover=${document.documentElement.hasAttribute(
        "sidebar-expand-on-hover"
      )}` +
      ` launcher=${
        SidebarController.sidebarContainer.getBoundingClientRect().width
      }`
  );
  return (
    display == "grid" &&
    gridTemplateColumns.split(" ").filter(Boolean).length > 1
  );
}

add_task(async function test_drag_expand_and_collapse() {
  await dragLauncher(200, true);
  ok(getLauncherWidth(), "Launcher width set.");

  await dragLauncher(-200, false);
  ok(!getLauncherWidth(), "Launcher width unset.");
});

add_task(async function test_drag_show_and_hide() {
  await SpecialPowers.pushPrefEnv({
    set: [[SIDEBAR_VISIBILITY_PREF, "hide-sidebar"]],
  });
  // In "hide-sidebar" mode the launcher starts hidden with no panel open, so
  // show it via the toolbar button (as a user would) to get a visible, expanded
  // launcher before dragging it closed.
  if (!SidebarController._state.launcherVisible) {
    await SidebarController.handleToolbarButtonClick();
  }
  await SidebarController.waitUntilStable();

  await dragLauncher(-200, false);
  ok(SidebarController.sidebarContainer.hidden, "Sidebar is hidden.");

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_custom_width_persists() {
  await SidebarController.updateUIState({
    launcherExpanded: false,
    launcherVisible: true,
  });
  await dragLauncher(200, true);
  const customWidth = getLauncherWidth();

  info("Collapse the sidebar using toolbar button.");
  EventUtils.synthesizeMouseAtCenter(SidebarController.toolbarButton, {});
  await SidebarController.sidebarMain.updateComplete;

  info("Expand the sidebar using toolbar button.");
  EventUtils.synthesizeMouseAtCenter(SidebarController.toolbarButton, {});
  await SidebarController.sidebarMain.updateComplete;
  Assert.equal(
    customWidth,
    getLauncherWidth(),
    "Sidebar expands to the previously stored custom width."
  );

  info("Open a new window.");
  const win = await BrowserTestUtils.openNewBrowserWindow();
  await win.SidebarController.promiseInitialized;
  Assert.equal(
    customWidth,
    getLauncherWidth(win),
    "Sidebar expands to the custom width set from the original window."
  );
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_drag_show_and_hide_for_horizontal_tabs() {
  await SidebarController.updateUIState({
    launcherExpanded: false,
    launcherVisible: true,
  });

  await dragLauncher(-200, false);
  ok(!SidebarController.sidebarContainer.hidden, "Sidebar is not hidden.");
  ok(!SidebarController.sidebarContainer.expanded, "Sidebar is not expanded.");
});

add_task(async function test_resize_after_toggling_revamp() {
  await SidebarController.updateUIState({
    launcherExpanded: true,
  });

  info("Disable and then re-enable sidebar and vertical tabs.");
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", false],
      [VERTICAL_TABS_PREF, false],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "horizontal");
  await SpecialPowers.popPrefEnv();
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");

  info("Resize the vertical tab strip.");
  const originalWidth = getLauncherWidth();
  await dragLauncher(200, true);
  const newWidth = getLauncherWidth();
  Assert.greater(
    parseInt(newWidth),
    parseInt(originalWidth),
    "Vertical tab strip was resized."
  );

  await dragLauncher(-200, true);
});

add_task(async function test_resize_of_pinned_tabs() {
  await SidebarController.updateUIState({
    launcherExpanded: true,
  });

  info("Open 10 new tabs using the new tab button.");
  for (let i = 0; i < 10; i++) {
    await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `data:text/html,<title>${i + 1}</title>`
    );
    gBrowser.pinTab(gBrowser.selectedTab);
  }
  await SidebarController.waitUntilStable();
  await dragPinnedTabs(-200, true);
  await SidebarController.waitUntilStable();
  info("Resize the pinned tabs container.");
  const originalHeight = getPinnedTabsHeight();
  await dragPinnedTabs(200, true);
  await SidebarController.waitUntilStable();
  const newHeight = getPinnedTabsHeight();
  info(`original: ${originalHeight}, new: ${newHeight}`);
  Assert.greater(
    parseInt(newHeight),
    parseInt(originalHeight),
    "Pinned tabs container was resized."
  );

  for (let tab of [...gBrowser.tabs]) {
    if (tab.pinned) {
      gBrowser.unpinTab(tab);
    }
  }
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function test_stale_pinned_tabs_height_clamped_on_restore() {
  await SidebarController.updateUIState({
    launcherExpanded: true,
  });

  info("Open and pin a few tabs.");
  for (let i = 0; i < 3; i++) {
    await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `data:text/html,<title>${i + 1}</title>`
    );
    gBrowser.pinTab(gBrowser.selectedTab);
  }
  await SidebarController.waitUntilStable();

  const container = SidebarController._pinnedTabsContainer;
  const contentHeight =
    SidebarController._pinnedTabsItemsWrapper.getBoundingClientRect().height;
  Assert.greater(contentHeight, 0, "Pinned tabs have a measurable height.");

  // Simulate a persisted height that is larger than the current content, as
  // happens when the height was saved at a narrower sidebar width and then the
  // sidebar was widened without re-dragging the pinned tabs splitter.
  const staleHeight = Math.round(contentHeight + 200);
  info(`Apply a stale persisted height of ${staleHeight}px on restore.`);
  SidebarController._state.expandedPinnedTabsHeight = staleHeight;
  SidebarController._state.updatePinnedTabsHeight();
  await SidebarController.waitUntilStable();

  const appliedHeight = container.getBoundingClientRect().height;
  info(
    `content: ${contentHeight}, stale: ${staleHeight}, applied: ${appliedHeight}`
  );
  Assert.less(
    appliedHeight,
    staleHeight,
    "The stale, oversized persisted height is not applied verbatim."
  );
  Assert.less(
    appliedHeight - contentHeight,
    50,
    "Pinned tabs container is clamped to its content height, leaving no gap."
  );

  SidebarController._state.expandedPinnedTabsHeight = undefined;
  for (let tab of [...gBrowser.tabs]) {
    if (tab.pinned) {
      gBrowser.unpinTab(tab);
    }
  }
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(
  async function test_pinned_tabs_height_reclamped_on_visibility_change() {
    info("Pin enough tabs that a single column is much taller than a grid.");
    for (let i = 0; i < 7; i++) {
      await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        `data:text/html,<title>${i + 1}</title>`
      );
      gBrowser.pinTab(gBrowser.selectedTab);
    }

    await SpecialPowers.pushPrefEnv({
      set: [[SIDEBAR_VISIBILITY_PREF, "expand-on-hover"]],
    });
    await SidebarController.waitUntilStable();

    const container = SidebarController._pinnedTabsContainer;
    const wrapper = SidebarController._pinnedTabsItemsWrapper;
    const columnHeight = Math.round(wrapper.getBoundingClientRect().height);
    Assert.greater(columnHeight, 0, "Pinned tabs have a measurable height.");

    // Restore the state that a session save leaves behind for an expand-on-hover
    // user: the launcher sits collapsed at rest, so `pinnedTabsHeight` holds the
    // collapsed height while the expanded height is persisted separately.
    info(`Restore a persisted pinned tabs height of ${columnHeight}px.`);
    await SidebarController._state.loadCurrentState({
      launcherVisible: true,
      pinnedTabsHeight: columnHeight,
      expandedPinnedTabsHeight: columnHeight,
      collapsedPinnedTabsHeight: columnHeight,
    });
    await SidebarController.waitUntilStable();

    // The pinned tabs only form a grid once the launcher fits a second ~48px
    // column, and the resizing tasks above can leave it at the 100px minimum,
    // depending on where their synthesized drag landed.
    SidebarController._state.expandedLauncherWidth = 300;

    info(
      "Leave expand-on-hover, which restyles the pinned tabs as an icon grid."
    );
    await SpecialPowers.pushPrefEnv({
      set: [[SIDEBAR_VISIBILITY_PREF, "always-show"]],
    });
    await SidebarController.waitUntilStable();

    await BrowserTestUtils.waitForMutationCondition(
      SidebarController.sidebarMain,
      { attributeFilter: ["expanded"] },
      () => SidebarController.sidebarMain.hasAttribute("expanded"),
      "The launcher is expanded."
    );
    await TestUtils.waitForCondition(
      () => isPinnedTabsGrid(wrapper),
      "The pinned tabs lay out as a grid of more than one column."
    );

    await TestUtils.waitForCondition(() => {
      const gridHeight = wrapper.getBoundingClientRect().height;
      return gridHeight > 0 && gridHeight < columnHeight;
    }, "Pinned tabs are laid out as a grid, which is shorter than one column.");

    await TestUtils.waitForCondition(() => {
      const gap =
        container.getBoundingClientRect().height -
        wrapper.getBoundingClientRect().height;
      info(`Gap between the pinned tabs container and its contents: ${gap}`);
      return gap < 5;
    }, "Pinned tabs container is re-clamped to its contents, leaving no gap.");

    await SpecialPowers.popPrefEnv();
    await SpecialPowers.popPrefEnv();
    SidebarController._state.expandedPinnedTabsHeight = undefined;
    SidebarController._state.collapsedPinnedTabsHeight = undefined;
    for (let tab of [...gBrowser.tabs]) {
      if (tab.pinned) {
        gBrowser.unpinTab(tab);
      }
    }
    while (gBrowser.tabs.length > 1) {
      BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
    }
  }
);

add_task(async function test_pinned_tabs_height_survives_zero_measurement() {
  info("Pin a few tabs and persist a height for them.");
  for (let i = 0; i < 3; i++) {
    await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `data:text/html,<title>${i + 1}</title>`
    );
    gBrowser.pinTab(gBrowser.selectedTab);
  }
  await SidebarController.waitUntilStable();

  const container = SidebarController._pinnedTabsContainer;
  const contentHeight =
    SidebarController._pinnedTabsItemsWrapper.getBoundingClientRect().height;
  Assert.greater(contentHeight, 0, "Pinned tabs have a measurable height.");
  const staleHeight = Math.round(contentHeight + 200);
  SidebarController._state.expandedPinnedTabsHeight = staleHeight;
  SidebarController._state.collapsedPinnedTabsHeight = staleHeight;

  info("Update the height while the tab strip has no layout of its own.");
  const verticalTabs = document.getElementById("vertical-tabs");
  verticalTabs.hidden = true;
  Assert.equal(
    container.getBoundingClientRect().height,
    0,
    "The pinned tabs measure zero while the strip is hidden."
  );
  SidebarController.updatePinnedTabsHeightOnResize();
  verticalTabs.hidden = false;

  Assert.notEqual(
    container.style.height,
    "0px",
    "The pinned tabs container isn't collapsed by an unmeasurable strip."
  );
  Assert.greater(
    container.getBoundingClientRect().height,
    0,
    "Pinned tabs are visible again once the strip is back."
  );
  Assert.less(
    container.getBoundingClientRect().height -
      SidebarController._pinnedTabsItemsWrapper.getBoundingClientRect().height,
    5,
    "The stale height isn't applied unclamped either, leaving no gap."
  );

  SidebarController._state.expandedPinnedTabsHeight = undefined;
  SidebarController._state.collapsedPinnedTabsHeight = undefined;
  for (let tab of [...gBrowser.tabs]) {
    if (tab.pinned) {
      gBrowser.unpinTab(tab);
    }
  }
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function test_no_pinned_tabs_height_with_horizontal_tabs() {
  info("Pin a few tabs and persist a height for them.");
  for (let i = 0; i < 3; i++) {
    await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `data:text/html,<title>${i + 1}</title>`
    );
    gBrowser.pinTab(gBrowser.selectedTab);
  }
  await SidebarController.waitUntilStable();

  const container = SidebarController._pinnedTabsContainer;
  SidebarController._state.expandedPinnedTabsHeight = 300;
  SidebarController._state.collapsedPinnedTabsHeight = 300;

  await SpecialPowers.pushPrefEnv({ set: [[VERTICAL_TABS_PREF, false]] });
  await SidebarTestUtils.waitForTabstripOrientation(window, "horizontal");
  await SidebarController.waitUntilStable();

  SidebarController.updatePinnedTabsHeightOnResize();
  Assert.equal(
    container.style.height,
    "",
    "Horizontal tabs take no height from the persisted pinned tabs height."
  );
  Assert.greater(
    container.getBoundingClientRect().height,
    0,
    "Pinned tabs are visible in the horizontal tab strip."
  );

  await SpecialPowers.popPrefEnv();
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
  SidebarController._state.expandedPinnedTabsHeight = undefined;
  SidebarController._state.collapsedPinnedTabsHeight = undefined;
  for (let tab of [...gBrowser.tabs]) {
    if (tab.pinned) {
      gBrowser.unpinTab(tab);
    }
  }
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});
