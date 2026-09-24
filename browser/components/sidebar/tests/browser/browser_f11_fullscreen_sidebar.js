/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// This test verifies that the sidebar launcher (tools and vertical tabs) is
// hidden when the nav toolbox is autohidden in F11 fullscreen mode, and
// restored when exiting fullscreen, while sidebar panels (bookmarks, history,
// etc.) stay visible and toggleable like they do with horizontal tabs.
// macOS leaves browser.fullscreen.autohide off by default, so this only runs
// there because the setup below turns it on.

"use strict";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [VERTICAL_TABS_PREF, true],
      ["browser.fullscreen.autohide", true],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
});

registerCleanupFunction(async () => {
  // Only restores the primary test window. Extra windows opened by
  // individual tasks must be closed within those tasks.
  if (window.fullScreen) {
    let onFullscreen = BrowserTestUtils.waitForEvent(window, "fullscreen");
    document.getElementById("View:FullScreen").doCommand();
    await onFullscreen;
  }
});

async function enterFullscreenAndWaitForHiddenToolbox() {
  // Start observing before triggering so we can't miss the notification
  // whether it fires synchronously during fullscreen entry or later.
  let onToolboxHidden = TestUtils.topicObserved(
    "fullscreen-nav-toolbox",
    (subject, data) => data == "hidden"
  );
  let onFullscreen = BrowserTestUtils.waitForEvent(window, "fullscreen");
  document.getElementById("View:FullScreen").doCommand();
  await onFullscreen;
  await SimpleTest.promiseFocus(window);
  await onToolboxHidden;
}

async function showNavToolbox() {
  if (!FullScreen.navToolboxHidden) {
    return;
  }
  // FullScreen's mouse-target rect excludes a band at the top of the content
  // area, and MousePosTracker evaluates the cached pointer position as soon as
  // the toolbox is shown. Park the pointer in that band so a physical mouse
  // resting over the content area can't re-hide the toolbox behind our back
  // (that never happens on CI, where the pointer is never moved).
  EventUtils.synthesizeMouse(document.documentElement, 5, 5, {
    type: "mousemove",
  });
  let onToolboxShown = TestUtils.topicObserved(
    "fullscreen-nav-toolbox",
    (subject, data) => data == "shown"
  );
  FullScreen.showNavToolbox();
  await onToolboxShown;
}

async function hideNavToolbox() {
  if (FullScreen.navToolboxHidden) {
    return;
  }
  let onToolboxHidden = TestUtils.topicObserved(
    "fullscreen-nav-toolbox",
    (subject, data) => data == "hidden"
  );
  FullScreen.hideNavToolbox();
  await onToolboxHidden;
}

async function exitFullscreen() {
  let onFullscreen = BrowserTestUtils.waitForEvent(window, "fullscreen");
  document.getElementById("View:FullScreen").doCommand();
  await onFullscreen;
}

add_task(async function test_f11_fullscreen_hides_sidebar() {
  const { sidebarMain } = SidebarController;
  await SidebarController.promiseInitialized;

  ok(
    BrowserTestUtils.isVisible(sidebarMain),
    "Sidebar main is initially visible"
  );

  const tabbox = document.getElementById("tabbrowser-tabbox");
  ok(
    tabbox.hasAttribute("sidebar-shown"),
    "tabbrowser-tabbox has sidebar-shown attribute initially"
  );

  await enterFullscreenAndWaitForHiddenToolbox();
  ok(window.fullScreen, "Window is in fullscreen mode");

  // Sidebar elements should be collapsed.
  ok(
    document.documentElement.hasAttribute("fullscreenNavToolboxHidden"),
    "Root has fullscreenNavToolboxHidden attribute"
  );
  ok(
    !tabbox.hasAttribute("sidebar-shown"),
    "tabbrowser-tabbox does not have sidebar-shown attribute when toolbox is hidden"
  );

  // Show the nav toolbox.
  await showNavToolbox();

  // Sidebar should be visible again.
  ok(
    !document.documentElement.hasAttribute("fullscreenNavToolboxHidden"),
    "Root attribute is cleared when toolbox is shown"
  );
  ok(
    tabbox.hasAttribute("sidebar-shown"),
    "tabbrowser-tabbox has sidebar-shown attribute when toolbox is shown"
  );

  // Hide the nav toolbox again.
  await hideNavToolbox();

  ok(
    document.documentElement.hasAttribute("fullscreenNavToolboxHidden"),
    "Root attribute is reapplied when toolbox is re-hidden"
  );
  ok(
    !tabbox.hasAttribute("sidebar-shown"),
    "tabbrowser-tabbox loses sidebar-shown when toolbox is re-hidden"
  );

  await exitFullscreen();
  ok(!window.fullScreen, "Window has exited fullscreen mode");

  ok(
    BrowserTestUtils.isVisible(sidebarMain),
    "Sidebar main is visible after exiting fullscreen"
  );
  ok(
    tabbox.hasAttribute("sidebar-shown"),
    "tabbrowser-tabbox has sidebar-shown attribute after exiting fullscreen"
  );
});

// Regression test for Bug 2064638: the launcher is gone while the chrome is
// collapsed, so reaching for the vertical tabs at the screen edge has to bring
// it back - and the rect that hides the chrome again has to exclude the
// launcher from that first read, or moving onto the tabs sends it all away.
add_task(async function test_launcher_edge_reveals_sidebar() {
  await SidebarTestUtils.ensureLauncherVisible(window);
  const { sidebarMain } = SidebarController;
  // Settle the launcher first: entering fullscreen mid-animation would capture
  // the rect below against a launcher that is not its full width yet.
  await SidebarController.waitUntilStable();

  await enterFullscreenAndWaitForHiddenToolbox();

  const onToolboxShown = TestUtils.topicObserved(
    "fullscreen-nav-toolbox",
    (subject, data) => data == "shown"
  );
  EventUtils.synthesizeMouse(
    document.documentElement,
    0,
    Math.round(window.innerHeight / 2),
    { type: "mousemove" },
    window
  );
  await onToolboxShown;
  Assert.greater(
    FullScreen.getMouseTargetRect().left,
    0,
    "Mouse target rect excludes the launcher as soon as the toolbox is shown"
  );

  await SidebarController.waitUntilStable();
  ok(BrowserTestUtils.isVisible(sidebarMain), "Sidebar main is revealed");

  await EventUtils.synthesizeMouseAtCenter(
    sidebarMain,
    { type: "mousemove" },
    window
  );
  await new Promise(resolve => requestAnimationFrame(resolve));
  ok(!FullScreen.navToolboxHidden, "Nav toolbox stays shown over the launcher");

  // The launcher can be moved to the other side while the chrome is collapsed,
  // and the watched edge has to follow it there.
  await hideNavToolbox();
  const watchedEdge = () =>
    FullScreen._launcherEdgeListener.getMouseTargetRect().left;
  Assert.equal(watchedEdge(), 0, "The launcher's edge is watched");
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.position_start", false]],
  });
  await window.promiseDocumentFlushed(() => {});
  Assert.greater(watchedEdge(), 0, "Watched edge follows the launcher");
  await SpecialPowers.popPrefEnv();

  await exitFullscreen();
});

// Regression test for Bug 2064638: the macOS menubar sliding down reveals the
// chrome with the pointer already in the content, and sends an update for every
// frame of the slide. Moving in the content still has to put the chrome away,
// later frames must not pull it back, and while the shift holds the toolbox
// over the launcher the tabs have to make room.
add_task(async function test_menubar_reveal_with_pointer_in_content() {
  await SidebarTestUtils.ensureLauncherVisible(window);
  await enterFullscreenAndWaitForHiddenToolbox();

  const moveTo = (x, y) =>
    EventUtils.synthesizeMouse(
      document.documentElement,
      x,
      y,
      { type: "mousemove" },
      window
    );
  const contentX = Math.round(window.innerWidth / 2);
  const contentY = Math.round(window.innerHeight / 2);
  moveTo(contentX, contentY);

  const onShown = TestUtils.topicObserved(
    "fullscreen-nav-toolbox",
    (subject, data) => data == "shown"
  );
  FullScreen.shiftMacToolbarDown(10);
  await onShown;
  Assert.equal(
    getComputedStyle(document.getElementById("vertical-tabs"))
      .paddingBlockStart,
    "10px",
    "Vertical tabs make room for the shifted toolbar"
  );

  const onHidden = TestUtils.topicObserved(
    "fullscreen-nav-toolbox",
    (subject, data) => data == "hidden"
  );
  moveTo(contentX + 5, contentY + 5);
  await onHidden;
  Assert.equal(
    gNavToolbox.style.translate,
    "",
    "Collapsed toolbar drops the menubar's shift"
  );

  const { width } = gBrowser.tabpanels.getBoundingClientRect();
  FullScreen.shiftMacToolbarDown(20);
  await new Promise(resolve => requestAnimationFrame(resolve));
  ok(
    FullScreen.navToolboxHidden,
    "A later frame of the same reveal leaves the chrome alone"
  );
  Assert.equal(
    gBrowser.tabpanels.getBoundingClientRect().width,
    width,
    "Content does not move"
  );

  FullScreen.shiftMacToolbarDown(0);
  await exitFullscreen();
});

// Regression test for Bug 2052706: while the mouse is over the sidebar, the
// nav toolbox (and thus the sidebar) must not autohide. The autohide is
// triggered when the mouse enters FullScreen's mouse-target rect, so that rect
// must exclude the sidebar.
add_task(async function test_mouse_target_rect_excludes_sidebar() {
  const { sidebarMain } = SidebarController;
  await SidebarController.promiseInitialized;

  await enterFullscreenAndWaitForHiddenToolbox();

  const tabbox = document.getElementById("tabbrowser-tabbox");

  // Show the nav toolbox so the sidebar reappears and the mouse-target rect is
  // recomputed against the un-collapsed layout.
  await showNavToolbox();

  ok(BrowserTestUtils.isVisible(sidebarMain), "Sidebar main is visible");

  // The sidebar reveals with an animation; wait for it to settle so the layout
  // is stable before checking geometry. The mouse-target rect updates
  // asynchronously (via promiseDocumentFlushed), so force a fresh measurement
  // now that the layout has settled and await it before reading the rect.
  await SidebarController.waitUntilStable();
  await FullScreen._updateMouseTargetRect();

  const sidebarRect = sidebarMain.getBoundingClientRect();
  const targetRect = FullScreen.getMouseTargetRect();

  // The sidebar can be at the start (left) or end (right) of the content, so
  // the target rect must not overlap it on whichever side it sits.
  ok(
    targetRect.left >= sidebarRect.right ||
      targetRect.right <= sidebarRect.left,
    `Mouse target rect (left=${targetRect.left}, right=${targetRect.right}) ` +
      `excludes the sidebar (left=${sidebarRect.left}, right=${sidebarRect.right})`
  );

  // Moving the mouse over the center of the sidebar must not hide the toolbox.
  await EventUtils.synthesizeMouseAtCenter(
    sidebarMain,
    { type: "mousemove" },
    window
  );
  await new Promise(resolve => requestAnimationFrame(resolve));

  ok(
    !FullScreen.navToolboxHidden,
    "Nav toolbox stays shown while the mouse is over the sidebar"
  );
  ok(
    tabbox.hasAttribute("sidebar-shown"),
    "tabbrowser-tabbox keeps sidebar-shown while the mouse is over the sidebar"
  );

  await exitFullscreen();
});

// Regression test for Bug 2052706: getMouseTargetRect() must return a defined
// rect synchronously as soon as the toolbox is shown. MousePosTracker.addListener
// reads it immediately, so an undefined value (from the async recompute not yet
// having resolved) would throw on the first reveal. Do not settle the layout or
// force a recompute here: this checks the synchronous seed specifically.
add_task(async function test_mouse_target_rect_has_initial_value() {
  await SidebarController.promiseInitialized;

  await enterFullscreenAndWaitForHiddenToolbox();

  await showNavToolbox();

  const targetRect = FullScreen.getMouseTargetRect();
  ok(
    targetRect,
    "Mouse target rect is defined right after the toolbox is shown"
  );
  ok(
    Number.isFinite(targetRect?.left) && Number.isFinite(targetRect?.right),
    "Mouse target rect has finite bounds on the first reveal"
  );

  await exitFullscreen();
});

// Regression test for Bug 2052711: sidebar panels (bookmarks, history, etc.)
// must stay visible and appear when toggled in F11 fullscreen, like they do
// with horizontal tabs. Only the sidebar launcher (vertical tabs / tools) hides
// with the nav toolbox.
add_task(async function test_f11_keeps_panel_sidebar_visible() {
  await SidebarTestUtils.ensureLauncherVisible(window);

  const sidebarPanel = document.getElementById("sidebar-box");
  const sidebarLauncher = SidebarController.sidebarContainer;

  await enterFullscreenAndWaitForHiddenToolbox();
  ok(
    document.documentElement.hasAttribute("fullscreenNavToolboxHidden"),
    "Nav toolbox is hidden in fullscreen"
  );

  // The launcher is hidden with `content-visibility`, not `visibility`, so its
  // computed visibility stays "visible" (bug 2054085). Its contents are skipped
  // and it takes no space.
  Assert.equal(
    getComputedStyle(sidebarLauncher).contentVisibility,
    "hidden",
    "Sidebar launcher's contents are skipped when the nav toolbox is hidden"
  );
  Assert.equal(
    sidebarLauncher.getBoundingClientRect().width,
    0,
    "Sidebar launcher takes no space when the nav toolbox is hidden"
  );

  await SidebarTestUtils.showPanel(window, "viewBookmarksSidebar");
  ok(SidebarController.isOpen, "Bookmarks panel opened in fullscreen");
  ok(
    BrowserTestUtils.isVisible(sidebarPanel),
    "Sidebar panel is visible in fullscreen when the toolbox is hidden"
  );

  await exitFullscreen();
  ok(
    BrowserTestUtils.isVisible(sidebarPanel),
    "Sidebar panel is still visible after exiting fullscreen"
  );

  SidebarTestUtils.closePanel(window);
});

add_task(async function test_exit_fullscreen_restores_sidebar() {
  await SidebarController.promiseInitialized;

  const tabbox = document.getElementById("tabbrowser-tabbox");

  await enterFullscreenAndWaitForHiddenToolbox();

  ok(
    document.documentElement.hasAttribute("fullscreenNavToolboxHidden"),
    "Root has fullscreenNavToolboxHidden attribute in fullscreen"
  );

  // Exit fullscreen directly without showing toolbox first.
  await exitFullscreen();
  ok(!window.fullScreen, "Window has exited fullscreen mode");

  ok(
    !document.documentElement.hasAttribute("fullscreenNavToolboxHidden"),
    "Root attribute is cleared after exiting fullscreen"
  );
  ok(
    tabbox.hasAttribute("sidebar-shown"),
    "tabbrowser-tabbox has sidebar-shown attribute after exiting fullscreen"
  );
});
