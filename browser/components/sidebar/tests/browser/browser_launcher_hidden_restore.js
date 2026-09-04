/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let sidebarLauncher;

add_setup(async () => {
  await SidebarController.waitUntilStable();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.animation.enabled", false],
      // These tests cover the vertical-tabs "hide-sidebar" behavior, where the
      // launcher is hidden but becomes visible while a panel is open and
      // restores to hidden once the panel closes. (In horizontal tabs
      // "hide-sidebar" the launcher stays hidden and the panel is shown on its
      // own; that mode is covered by browser_hide_sidebar.js.)
      // Note: "visibility" in the context of the sidebar launcher refers to the
      // pref-controlled behavior of when and how the launcher shows/hides, not
      // if it is currently showing or hiding.
      [VERTICAL_TABS_PREF, true],
      [SIDEBAR_VISIBILITY_PREF, "hide-sidebar"],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
  await SidebarController.waitUntilStable();
  sidebarLauncher = SidebarController.sidebarContainer;
});

add_task(async function test_launcher_hidden_restored_after_panel_close() {
  // When the launcher is initially hidden, after opening and closing a panel it
  // should restore to hidden.
  await SidebarTestUtils.ensureLauncherHidden(window);

  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();
  Assert.ok(
    !SidebarController.sidebarContainer.hidden,
    "Launcher is visible while panel is open"
  );

  // close the panel
  SidebarController.hide();
  await waitForElementHidden(sidebarLauncher);
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher is hidden again after panel close"
  );
});

add_task(
  async function test_launcher_visible_stays_visible_after_panel_close() {
    // If the launcher was initially visible, after opening and closing a panel it
    // should restore to visible.
    await SidebarTestUtils.ensureLauncherVisible(window);

    await SidebarController.show("viewHistorySidebar");
    await SidebarController.waitUntilStable();

    SidebarController.hide();
    await SidebarController.waitUntilStable();
    Assert.ok(
      !sidebarLauncher.hidden,
      "Launcher stays visible after panel close when it was visible before"
    );
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
  Assert.equal(
    SidebarController.sidebarRevampVisibility,
    "hide-sidebar",
    "These cases only make sense in hide-sidebar mode"
  );
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
});

add_task(
  async function test_launcher_hidden_restored_after_panel_switch_and_close() {
    // When the launcher is initially hidden, after opening a couple of sidebar panels
    // then closing the panel, it should restore to hidden.
    await SidebarTestUtils.ensureLauncherHidden(window);

    await SidebarController.show("viewHistorySidebar");
    await SidebarController.waitUntilStable();

    await SidebarController.show("viewBookmarksSidebar");
    await SidebarController.waitUntilStable();

    SidebarController.hide();
    await waitForElementHidden(sidebarLauncher);
    Assert.ok(
      sidebarLauncher.hidden,
      "Launcher is hidden again after switching panels and closing"
    );
  }
);

add_task(async function test_launcher_hidden_restored_via_toggle() {
  // When the launcher is initially hidden, after toggling a sidebar panel
  // open then closed, it should restore to hidden.
  await SidebarTestUtils.ensureLauncherHidden(window);

  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();

  SidebarController.toggle("viewHistorySidebar");
  await waitForElementHidden(sidebarLauncher);
  Assert.ok(
    sidebarLauncher.hidden,
    "Launcher is hidden again after toggling panel off"
  );
});

add_task(
  async function test_horizontal_hide_on_close_launcher_restored_after_panel_close() {
    // Regression test for bug 2052334: in horizontal-tabs "hide-on-close" mode,
    // a launcher the user has hidden must return to hidden after a panel is
    // opened and then closed.
    await SpecialPowers.pushPrefEnv({
      set: [
        [VERTICAL_TABS_PREF, false],
        [SIDEBAR_VISIBILITY_PREF, "hide-on-close"],
      ],
    });
    await SidebarTestUtils.waitForTabstripOrientation(window, "horizontal");
    await SidebarController.waitUntilStable();

    await SidebarTestUtils.ensureLauncherHidden(window);

    await SidebarTestUtils.showPanel(window, "viewHistorySidebar");
    await SidebarController.waitUntilStable();
    Assert.ok(
      !SidebarController.sidebarContainer.hidden,
      "Launcher is visible while panel is open"
    );

    SidebarTestUtils.closePanel(window);
    await waitForElementHidden(SidebarController.sidebarContainer);
    Assert.ok(
      SidebarController.sidebarContainer.hidden,
      "Launcher is hidden again after panel close in hide-on-close mode"
    );

    await SpecialPowers.popPrefEnv();
    await SidebarController.waitUntilStable();
  }
);

add_task(async function test_visibility_mode_change_while_panel_open() {
  // When the launcher is initially hidden, if the visibility pref changes to something
  // that isn't hide-sidebar, it should remain visible regardless of the origin state.
  await SidebarTestUtils.ensureLauncherHidden(window);

  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();

  await SpecialPowers.pushPrefEnv({
    set: [[SIDEBAR_VISIBILITY_PREF, "always-show"]],
  });
  await SidebarController.waitUntilStable();

  SidebarController.hide();
  await SidebarController.waitUntilStable();
  Assert.ok(
    !sidebarLauncher.hidden,
    "Launcher stays visible when visibility changed to always-show while panel was open"
  );

  await SpecialPowers.popPrefEnv();
});
