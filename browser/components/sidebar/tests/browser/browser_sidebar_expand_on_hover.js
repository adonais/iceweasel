/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const novaEnabled = Services.prefs.getBoolPref("browser.nova.enabled", false);

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      [VERTICAL_TABS_PREF, true],
      ["sidebar.expandOnHover", true],
    ],
  });
});
registerCleanupFunction(async () => {
  await SpecialPowers.popPrefEnv();
  cleanUpExtraTabs();
});

async function mouseOverSidebarToExpand() {
  // Disable non-test mouse events
  window.windowUtils.disableNonTestMouseEvents(true);

  EventUtils.synthesizeMouse(SidebarController.sidebarContainer, 1, 150, {
    type: "mousemove",
  });

  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarContainer,
    { attributes: true },
    async () => {
      await SidebarController.waitUntilStable();
      return (
        SidebarController.sidebarContainer.hasAttribute(
          "sidebar-launcher-expanded"
        ) &&
        SidebarController.sidebarMain.expanded &&
        SidebarController._state.launcherExpanded &&
        window.getComputedStyle(SidebarController.sidebarContainer).position ===
          "absolute"
      );
    },
    { msg: "The sidebar launcher is expanded" }
  );

  info("The sidebar launcher is expanded on mouse over");

  window.windowUtils.disableNonTestMouseEvents(false);
}

async function mouseOutSidebarToCollapse() {
  // Disable non-test mouse events
  window.windowUtils.disableNonTestMouseEvents(true);

  EventUtils.synthesizeMouseAtCenter(SidebarController.contentArea, {
    type: "mousemove",
  });

  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarContainer,
    { attributes: true },
    async () => {
      await SidebarController.waitUntilStable();
      return (
        !SidebarController.sidebarContainer.hasAttribute(
          "sidebar-launcher-expanded"
        ) &&
        !SidebarController.sidebarMain.expanded &&
        !SidebarController._state.launcherExpanded &&
        (novaEnabled ||
          window.getComputedStyle(SidebarController.sidebarContainer)
            .position === "relative")
      );
    },
    { msg: "The sidebar launcher is collapsed" }
  );

  info("The sidebar launcher is collapsed on mouse out");

  window.windowUtils.disableNonTestMouseEvents(false);
}

add_task(async function test_enable_expand_on_hover() {
  await SidebarController.show("viewCustomizeSidebar");
  let rootEl = document.documentElement;
  let browserEl = document.getElementById("browser");
  const panel =
    SidebarController.browser.contentDocument.querySelector(
      "sidebar-customize"
    );
  const sidebarBox = document.getElementById("sidebar-box");
  await BrowserTestUtils.waitForMutationCondition(
    browserEl,
    { childList: true, subtree: true },
    () =>
      BrowserTestUtils.isVisible(sidebarBox) &&
      panel.expandOnHoverInput?.shadowRoot.querySelector("input"),
    { msg: "Sidebar panel is visible and input is displayed" }
  );

  info("Sidebar panel is visible and input is displayed");

  // The click below toggles expand-on-hover, so it must start disabled; assert
  // that to fail fast instead of timing out if a previous test leaked it on.
  ok(
    !panel.expandOnHoverInput.checked,
    "Expand-on-hover should be disabled before this test enables it"
  );

  // Enable expand on hover
  panel.expandOnHoverInput.click();
  EventUtils.synthesizeMouseAtCenter(SidebarController.contentArea, {
    type: "mousemove",
  });
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarContainer,
    { attributes: true },
    () =>
      rootEl.hasAttribute("sidebar-expand-on-hover") &&
      !SidebarController.sidebarContainer.hasAttribute(
        "sidebar-launcher-expanded"
      ) &&
      !SidebarController._state.launcherExpanded &&
      SidebarController.sidebarRevampVisibility === "expand-on-hover" &&
      (novaEnabled ||
        window.getComputedStyle(SidebarController.sidebarContainer).position ===
          "relative") &&
      panel.expandOnHoverInput.checked,
    { msg: "Expand on hover has been enabled" }
  );

  info("Expand on hover has been enabled");

  ok(
    rootEl.hasAttribute("sidebar-expand-on-hover"),
    "#browser element has sidebar-expand-on-hover attribute"
  );

  await mouseOverSidebarToExpand();
  await mouseOutSidebarToCollapse();
  await SidebarController.waitUntilStable();

  panel.positionInput.click();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarContainer,
    { attributes: true },
    () =>
      SidebarController.sidebarContainer.hasAttribute("sidebar-positionend"),
    { msg: "The sidebar is positioned on the right" }
  );

  await mouseOverSidebarToExpand();
  await mouseOutSidebarToCollapse();

  // Move the sidebar back to the left
  panel.positionInput.click();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarContainer,
    { attributes: true },
    () =>
      !SidebarController.sidebarContainer.hasAttribute("sidebar-positionend"),
    { msg: "The sidebar is positioned on the left" }
  );

  await mouseOutSidebarToCollapse();
  panel.expandOnHoverInput.click();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarContainer,
    { attributes: true },
    () =>
      !rootEl.hasAttribute("sidebar-expand-on-hover") &&
      SidebarController.sidebarRevampVisibility !== "expand-on-hover" &&
      window.getComputedStyle(SidebarController.sidebarContainer).position !==
        "relative" &&
      !panel.expandOnHoverInput.checked,
    { msg: "Expand on hover has been disabled" }
  );
});

add_task(async function test_expand_on_hover_context_menu() {
  await SidebarController.toggleExpandOnHover(true);
  await SidebarController.waitUntilStable();
  await mouseOverSidebarToExpand();
  await SidebarController.waitUntilStable();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarContainer,
    { attributes: true },
    () => SidebarController._state.launcherExpanded,
    { msg: "The launcher is expanded" }
  );

  const toolbarContextMenu = document.getElementById("toolbar-context-menu");
  await openAndWaitForContextMenu(
    toolbarContextMenu,
    SidebarController.sidebarMain,
    () => {
      ok(
        !document.getElementById("toolbar-context-customize-sidebar").hidden,
        "The sidebar context menu is loaded"
      );
      ok(
        SidebarController._state.launcherExpanded,
        "The sidebar launcher is still expanded with the context menu open"
      );
    }
  );
  toolbarContextMenu.hidePopup();
  await mouseOutSidebarToCollapse();
  await SidebarController.toggleExpandOnHover(false);
  await SidebarController.waitUntilStable();
});

add_task(async function test_expand_on_hover_pinned_tabs() {
  await SidebarController.toggleExpandOnHover(true);
  await SidebarController.waitUntilStable();

  info("Open 2 new tabs.");
  for (let i = 0; i < 2; i++) {
    await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `data:text/html,<title>${i + 1}</title>`
    );
    gBrowser.pinTab(gBrowser.selectedTab);
  }
  is(gBrowser.tabs.length, 3, "Tabstrip now has three tabs");
  gBrowser.selectedTab.toggleMuteAudio();
  let pinnedTabs = gBrowser.visibleTabs.filter(tab => tab.pinned);
  let inlineMuteButton =
    gBrowser.selectedTab.querySelector(".tab-audio-button");
  let muteButtonComputedStyle = window.getComputedStyle(inlineMuteButton);
  let pinnedTabOriginalWidth = pinnedTabs[0].clientWidth;
  await mouseOverSidebarToExpand();
  await SidebarController.waitUntilStable();
  await BrowserTestUtils.waitForMutationCondition(
    SidebarController.sidebarContainer,
    { attributes: true },
    () =>
      SidebarController._state.launcherExpanded &&
      SidebarController.sidebarMain.hasAttribute("expanded"),
    { msg: "The launcher is expanded" }
  );
  let pinnedTabsContainer = document.getElementById("pinned-tabs-container");
  let verticalTabsWidth = pinnedTabsContainer.clientWidth;
  Assert.greater(
    Math.round(parseInt(verticalTabsWidth)),
    Math.round(parseInt(pinnedTabOriginalWidth)),
    "The pinned tabs are full width when expanded"
  );

  is(
    muteButtonComputedStyle.display,
    "none",
    "The expanded pinned tab is not showing the inline audio button."
  );

  await mouseOutSidebarToCollapse();
  await SidebarController.toggleExpandOnHover(false);
  await SidebarController.waitUntilStable();
});

add_task(
  async function test_expand_on_hover_persists_through_vertical_tabs_toggle() {
    await SpecialPowers.pushPrefEnv({
      set: [
        [VERTICAL_TABS_PREF, true],
        ["sidebar.visibility", "expand-on-hover"],
      ],
    });
    is(
      SidebarController.sidebarRevampVisibility,
      "expand-on-hover",
      "Expand on hover is enabled before toggling vertical tabs"
    );
    await SpecialPowers.pushPrefEnv({ set: [[VERTICAL_TABS_PREF, false]] });
    await SpecialPowers.pushPrefEnv({ set: [[VERTICAL_TABS_PREF, true]] });
    is(
      SidebarController.sidebarRevampVisibility,
      "expand-on-hover",
      "Expand on hover is restored after re-enabling vertical tabs"
    );
    await SpecialPowers.popPrefEnv();
    await SpecialPowers.popPrefEnv();
    await SpecialPowers.popPrefEnv();
  }
);

/* bug2023350: Prior to the fix for this bug, the sidebar could get stuck open
 * if it received a popupshowing event without ever receiving the corresponding
 * popuphidden event (mainly on Linux).
 */

async function waitForLauncherExpandedState(isExpanded, message) {
  await TestUtils.waitForCondition(async () => {
    await SidebarController.waitUntilStable();
    return SidebarController._state.launcherExpanded === isExpanded;
  }, message);
}

// Test that the sidebar is capable from recovering from this failure scenario
// by artificially forcing a popupshown event without firing a corresponding
// popuphidden.
add_task(
  async function test_bug2023350_expand_on_hover_recovers_from_leaked_popup() {
    await SidebarController.toggleExpandOnHover(true);
    await SidebarController.waitUntilStable();
    window.windowUtils.disableNonTestMouseEvents(true);

    EventUtils.synthesizeMouse(SidebarController.sidebarContainer, 1, 150, {
      type: "mousemove",
    });
    await waitForLauncherExpandedState(true, "Launcher expands on hover");

    // Deliver "popupshown" for a menupopup but never deliver the corresponding "popuphidden".
    const menupopup = document.getElementById("toolbar-context-menu");
    menupopup.dispatchEvent(new Event("popupshown", { bubbles: true }));

    EventUtils.synthesizeMouseAtCenter(SidebarController.contentArea, {
      type: "mousemove",
    });
    await waitForLauncherExpandedState(
      false,
      "Launcher collapses despite a leaked popup-suppression source"
    );

    ok(
      !SidebarController._state.launcherExpanded,
      "Launcher recovered and collapsed after a leaked popupshown"
    );

    window.windowUtils.disableNonTestMouseEvents(false);
    await SidebarController.toggleExpandOnHover(false);
    await SidebarController.waitUntilStable();
  }
);

// Verify that opening a real context menu while the launcher is open does not
// affect the behaviour of the sidebar, and that it continues to work correctly
// after the context menu is closed.
add_task(
  async function test_bug2023350_expand_on_hover_keeps_hover_tracking_during_popup() {
    await SidebarController.toggleExpandOnHover(true);
    await SidebarController.waitUntilStable();
    window.windowUtils.disableNonTestMouseEvents(true);

    EventUtils.synthesizeMouse(SidebarController.sidebarContainer, 1, 150, {
      type: "mousemove",
    });
    await waitForLauncherExpandedState(true, "Launcher expands on hover");

    const toolbarContextMenu = document.getElementById("toolbar-context-menu");
    await openAndWaitForContextMenu(
      toolbarContextMenu,
      SidebarController.sidebarMain,
      () => {
        ok(
          MousePosTracker._listeners.has(SidebarController),
          "Hover tracking stays registered while a context menu is open"
        );
        ok(
          SidebarController._state.launcherExpanded,
          "Launcher stays expanded while the context menu is open"
        );
      }
    );

    const menuHidden = BrowserTestUtils.waitForPopupEvent(
      toolbarContextMenu,
      "hidden"
    );
    toolbarContextMenu.hidePopup();
    await menuHidden;

    EventUtils.synthesizeMouseAtCenter(SidebarController.contentArea, {
      type: "mousemove",
    });
    await waitForLauncherExpandedState(
      false,
      "Launcher collapses after the popup closes"
    );

    EventUtils.synthesizeMouse(SidebarController.sidebarContainer, 1, 150, {
      type: "mousemove",
    });
    await waitForLauncherExpandedState(true, "Launcher expands again on hover");

    EventUtils.synthesizeMouseAtCenter(SidebarController.contentArea, {
      type: "mousemove",
    });
    await waitForLauncherExpandedState(
      false,
      "Launcher collapses again on leave"
    );

    window.windowUtils.disableNonTestMouseEvents(false);
    await SidebarController.toggleExpandOnHover(false);
    await SidebarController.waitUntilStable();
  }
);

const UI_DENSITY_PREF = "browser.uidensity";

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(UI_DENSITY_PREF);
  gUIDensity.update();
});

function getReservedLauncherWidth() {
  return parseFloat(
    document
      .getElementById("browser")
      .style.getPropertyValue("--sidebar-launcher-collapsed-width")
  );
}

async function setDensity(mode) {
  if (mode === null) {
    Services.prefs.clearUserPref(UI_DENSITY_PREF);
  } else {
    Services.prefs.setIntPref(UI_DENSITY_PREF, mode);
  }
  await SidebarController.waitUntilStable();
  await new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
}

function launcherReservationIsExact() {
  return (
    Math.abs(
      getReservedLauncherWidth() -
        SidebarController.sidebarContainer.getBoundingClientRect().width
    ) <= 1
  );
}

async function assertLauncherReservationExact(label) {
  await TestUtils.waitForCondition(
    launcherReservationIsExact,
    `${label}: reserved launcher width converges on the launcher's actual width`
  );
  const reserved = getReservedLauncherWidth();
  const actual =
    SidebarController.sidebarContainer.getBoundingClientRect().width;
  Assert.lessOrEqual(
    Math.abs(reserved - actual),
    1,
    `${label}: reserved launcher width (${reserved}) matches the launcher (${actual})`
  );
}

add_task(async function test_collapsed_width_tracks_uidensity() {
  await SidebarTestUtils.showPanel(window, "viewCustomizeSidebar");
  await SidebarController.toggleExpandOnHover(true);
  await SidebarController.waitUntilStable();

  await setDensity(gUIDensity.MODE_COMPACT);
  is(
    document.documentElement.getAttribute("uidensity"),
    "compact",
    "Compact density is applied"
  );
  await assertLauncherReservationExact("compact density");

  await setDensity(null);
  ok(
    !document.documentElement.hasAttribute("uidensity"),
    "Normal density is applied"
  );
  await assertLauncherReservationExact("back to normal density");

  await setDensity(gUIDensity.MODE_COMPACT);
  await assertLauncherReservationExact("compact density again");

  await setDensity(null);
  await SidebarController.toggleExpandOnHover(false);
  SidebarController.hide();
  await SidebarController.waitUntilStable();
});

add_task(async function test_density_change_leaves_expanded_launcher_alone() {
  await SidebarController.show("viewCustomizeSidebar");
  await SidebarController.toggleExpandOnHover(true);
  await SidebarController.waitUntilStable();

  SidebarController._state.launcherExpanded = true;
  await SidebarController.waitUntilStable();
  const reservedWhileExpanded = getReservedLauncherWidth();

  await setDensity(gUIDensity.MODE_COMPACT);
  is(
    getReservedLauncherWidth(),
    reservedWhileExpanded,
    "Reserved width is left alone while the launcher is expanded"
  );

  SidebarController._state.launcherExpanded = false;
  await SidebarController.waitUntilStable();
  await assertLauncherReservationExact("after collapsing in the new density");

  await setDensity(null);
  await SidebarController.toggleExpandOnHover(false);
  SidebarController.hide();
  await SidebarController.waitUntilStable();
});

// The collapsed launcher relies on the tools list shrinking away so that only
// the overflow chevron remains in view. See bug 2049659.
add_task(async function test_overflow_chevron_visible_while_collapsed() {
  await SpecialPowers.pushPrefEnv({
    set: [[SIDEBAR_VISIBILITY_PREF, "expand-on-hover"]],
  });

  const main = SidebarController.sidebarMain;
  main.expanded = false;
  await main.updateComplete;
  await waitForRepaint();

  Assert.ok(
    main.shouldShowOverflowButton,
    "The collapsed launcher shows the overflow chevron."
  );

  // isVisible() only reports CSS visibility, so it stays true for a button its
  // container has clipped out of view. Compare geometry instead.
  const wrapper = main.buttonsWrapper.getBoundingClientRect();
  const chevron = main.moreToolsButton.getBoundingClientRect();

  Assert.greater(chevron.height, 0, "The chevron has been laid out.");
  Assert.lessOrEqual(
    Math.round(chevron.bottom),
    Math.round(wrapper.bottom),
    "The chevron is not clipped below the buttons wrapper."
  );
  Assert.greaterOrEqual(
    Math.round(chevron.top),
    Math.round(wrapper.top),
    "The chevron is not clipped above the buttons wrapper."
  );

  await SpecialPowers.popPrefEnv();
});
