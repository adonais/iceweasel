/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let sidebarLauncher;

// These tests cover the two visibility modes where the launcher is the user's
// to show or hide: vertical-tabs "hide-sidebar" and horizontal-tabs
// "hide-on-close". In both, the launcher is hidden until the user reveals it
// with the toolbar button, and opening, switching or closing a panel never
// changes whether it is showing. (Horizontal-tabs "hide-launcher", where the
// launcher can never show at all, is covered by browser_hide_sidebar.js.)
//
// Note: "visibility" in the context of the sidebar launcher refers to the
// pref-controlled behavior of when and how the launcher shows/hides, not if it
// is currently showing or hiding.
//
// Each task sets the mode it exercises, so no task depends on the mode a
// previous one left behind.
async function pushVisibility(visibility, verticalTabs = true) {
  await SpecialPowers.pushPrefEnv({
    set: [
      [VERTICAL_TABS_PREF, verticalTabs],
      [SIDEBAR_VISIBILITY_PREF, visibility],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(
    window,
    verticalTabs ? "vertical" : "horizontal"
  );
  await SidebarController.waitUntilStable();
  Assert.equal(
    SidebarController.sidebarRevampVisibility,
    visibility,
    `Visibility is ${visibility} for this task`
  );
}

add_setup(async () => {
  await SidebarController.waitUntilStable();
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.animation.enabled", false]],
  });
  sidebarLauncher = SidebarController.sidebarContainer;
});

add_task(async function test_launcher_stays_hidden_while_panel_open() {
  // A hidden launcher is the user's choice, so opening a panel must not reveal
  // it unless it was already open, and closing that panel must leave it alone.
  await pushVisibility("hide-sidebar");
  await SidebarTestUtils.ensureLauncherHidden(window);

  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();
  Assert.ok(SidebarController.isOpen, "Panel is open");
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher stays hidden while panel is open"
  );

  // close the panel
  SidebarController.hide();
  await waitForElementHidden(sidebarLauncher);
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher is still hidden after panel close"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(
  async function test_launcher_visible_stays_visible_after_panel_close() {
    // If the launcher was initially visible, after opening and closing a panel it
    // should restore to visible.
    await pushVisibility("hide-sidebar");
    await SidebarTestUtils.ensureLauncherVisible(window);

    await SidebarController.show("viewHistorySidebar");
    await SidebarController.waitUntilStable();
    Assert.ok(
      !sidebarLauncher.hidden,
      "Launcher stays visible while panel is open"
    );

    SidebarController.hide();
    await SidebarController.waitUntilStable();
    Assert.ok(
      !sidebarLauncher.hidden,
      "Launcher stays visible after panel close when it was visible before"
    );

    await SpecialPowers.popPrefEnv();
  }
);

add_task(async function test_restored_launcher_visibility_wins() {
  // Regression test for bug 2065431: in "hide-sidebar" mode, loading state with
  // no panel open used to force the launcher hidden unconditionally, discarding
  // the visibility that session store (or an adopted window) had just handed us.
  // A launcher the user revealed with the toolbar button was therefore hidden
  // again on every restart. Restored visibility now wins, and the mode's default
  // only applies when there was no restored visibility to go on.
  //
  // updateUIState is what session restore and window adoption call, so passing
  // state to it directly is how we exercise those paths without a restart. The
  // end-to-end restart case is covered by
  // tests/marionette/test_default_launcher_visible.py.
  await pushVisibility("hide-sidebar");
  await SidebarTestUtils.ensureLauncherHidden(window);

  // Restored visible: what the user revealed survives, rather than the mode
  // default clobbering it. This is the regression itself.
  await SidebarController.updateUIState({
    launcherVisible: true,
    launcherExpanded: true,
    command: "",
    panelOpen: false,
  });
  await SidebarController.waitUntilStable();
  Assert.ok(
    !sidebarLauncher.hidden,
    "Restored visible launcher stays visible in hide-sidebar mode"
  );

  // Restored hidden: the fix must not over-correct into always showing the
  // launcher once some state has been restored.
  await SidebarController.updateUIState({
    launcherVisible: false,
    command: "",
    panelOpen: false,
  });
  await SidebarController.waitUntilStable();
  Assert.ok(
    sidebarLauncher.hidden,
    "Restored hidden launcher is still honored"
  );

  // No launcherVisible in the restored state at all (e.g. a profile that
  // predates it being saved): the mode's default of hidden still applies, even
  // though the launcher happens to be visible right now.
  await SidebarTestUtils.ensureLauncherVisible(window);
  await SidebarController.updateUIState({ command: "", panelOpen: false });
  await SidebarController.waitUntilStable();
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher falls back to hidden when nothing was restored"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_launcher_hidden_across_panel_switch_and_close() {
  // Switching between panels is not a reason to reveal a hidden launcher
  // either, nor is closing the panel afterwards.
  await pushVisibility("hide-sidebar");
  await SidebarTestUtils.ensureLauncherHidden(window);

  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();

  await SidebarController.show("viewBookmarksSidebar");
  await SidebarController.waitUntilStable();
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher stays hidden after switching panels"
  );

  SidebarController.hide();
  await waitForElementHidden(sidebarLauncher);
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher is still hidden after switching panels and closing"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_launcher_hidden_across_toggle() {
  // Same for a panel toggled open and closed by keyboard shortcut, which is
  // what SidebarController.toggle stands in for here.
  await pushVisibility("hide-sidebar");
  await SidebarTestUtils.ensureLauncherHidden(window);

  await SidebarController.toggle("viewHistorySidebar");
  await SidebarController.waitUntilStable();
  Assert.ok(SidebarController.isOpen, "Panel is open");
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher stays hidden when a panel is toggled open"
  );

  SidebarController.toggle("viewHistorySidebar");
  await waitForElementHidden(sidebarLauncher);
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher is still hidden after toggling panel off"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(
  async function test_horizontal_hide_on_close_launcher_hidden_with_panel() {
    // Regression test for bug 2052334: in horizontal-tabs "hide-on-close" mode,
    // a launcher the user has hidden stays hidden while a panel is opened and
    // closed, exactly as in vertical-tabs "hide-sidebar".
    await pushVisibility("hide-on-close", false);

    await SidebarTestUtils.ensureLauncherHidden(window);

    await SidebarTestUtils.showPanel(window, "viewHistorySidebar");
    await SidebarController.waitUntilStable();
    Assert.ok(
      sidebarLauncher.hidden,
      "Launcher stays hidden while panel is open in hide-on-close mode"
    );

    SidebarTestUtils.closePanel(window);
    await waitForElementHidden(sidebarLauncher);
    Assert.ok(
      sidebarLauncher.hidden,
      "Launcher is still hidden after panel close in hide-on-close mode"
    );

    await SpecialPowers.popPrefEnv();
    await SidebarController.waitUntilStable();
  }
);

add_task(async function test_visibility_mode_change_while_panel_open() {
  // When the launcher is initially hidden, if the visibility pref changes to something
  // that isn't hide-sidebar, it should remain visible regardless of the origin state.
  await pushVisibility("hide-sidebar");
  await SidebarTestUtils.ensureLauncherHidden(window);

  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();

  await pushVisibility("always-show");

  SidebarController.hide();
  await SidebarController.waitUntilStable();
  Assert.ok(
    !sidebarLauncher.hidden,
    "Launcher stays visible when visibility changed to always-show while panel was open"
  );

  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_mode_switch_to_hide_sidebar_while_panel_open() {
  // Bug 2066086: switching to "hide-sidebar" from a mode where the
  // launcher was visible hides the launcher and leaves the panel open, and the
  // launcher must then stay hidden - both when that panel is closed and when a
  // later panel is opened. Picking the setting in the customize panel is
  // exactly this sequence, since that panel is the one left open.
  await pushVisibility("always-show");
  await SidebarTestUtils.ensureLauncherVisible(window);

  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();

  await pushVisibility("hide-sidebar");
  await waitForElementHidden(sidebarLauncher);
  Assert.ok(
    SidebarController.isOpen,
    "Panel stays open across the mode switch"
  );
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher hides when the mode changes to hide-sidebar"
  );

  SidebarController.hide();
  await SidebarController.waitUntilStable();
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher is still hidden after closing the panel that was open"
  );

  await SidebarController.toggle("viewBookmarksSidebar");
  await SidebarController.waitUntilStable();
  Assert.ok(SidebarController.isOpen, "A later panel opens");
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher is still hidden when a later panel is opened"
  );

  SidebarTestUtils.closePanel(window);
  await SidebarController.waitUntilStable();
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});
