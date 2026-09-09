/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

requestLongerTimeout(2);

let initialSidebarVisibility = Services.prefs.getStringPref(
  SIDEBAR_VISIBILITY_PREF
);

registerCleanupFunction(() => {
  // sidebar.visibility gets set during startup and should be restored
  // to that value, not the default value
  Services.prefs.setStringPref(
    SIDEBAR_VISIBILITY_PREF,
    initialSidebarVisibility
  );
  Services.prefs.clearUserPref(POSITION_SETTING_PREF);
  Services.prefs.clearUserPref(VERTICAL_TABS_PREF);
});

async function showCustomizePanel(win) {
  await win.SidebarController.show("viewCustomizeSidebar");
  // `.show()` can return before the pane has fired its `load` event if
  // we were already trying to load that same pane in the same browser.
  // This should be fixed in SidebarController, bug 1954987
  if (win.SidebarController.browser.contentDocument.readyState != "complete") {
    await BrowserTestUtils.waitForEvent(
      win.SidebarController.browser,
      "load",
      true
    );
  }
  const document = win.SidebarController.browser.contentDocument;
  let customizeComponent = document.querySelector("sidebar-customize");
  info("Waiting for customize panel children to be present");
  await BrowserTestUtils.waitForMutationCondition(
    customizeComponent.shadowRoot,
    { subTree: true, childList: true },
    () => {
      if (win.SidebarController.sidebarVerticalTabsEnabled) {
        return (
          customizeComponent?.positionInput &&
          customizeComponent?.visibilityInput
        );
      }
      return customizeComponent?.positionInput;
    }
  );

  ok(true, "Customize panel is shown.");
  return customizeComponent;
}

add_task(async function test_customize_sidebar_actions() {
  const customizeComponent = await showCustomizePanel(window);
  const sidebar = document.querySelector("sidebar-main");
  let toolEntrypointsCount = sidebar.toolButtons.length;
  let checkedInputs = Array.from(customizeComponent.toolInputs).filter(
    input => input.checked
  );
  is(
    checkedInputs.length,
    toolEntrypointsCount,
    `${toolEntrypointsCount} inputs to toggle Firefox Tools are shown in the Customize Menu.`
  );
  is(
    customizeComponent.toolInputs.length,
    5,
    "Five default tools are shown in the customize menu"
  );

  for (const toolInput of customizeComponent.toolInputs) {
    let toolDisabledInitialState = !toolInput.checked;
    toolInput.click();
    await TestUtils.waitForCondition(
      () => {
        let toggledTool = SidebarController.toolsAndExtensions.get(
          toolInput.id
        );
        return toggledTool.disabled === !toolDisabledInitialState;
      },
      `The entrypoint for ${toolInput.name} has been ${toolDisabledInitialState ? "enabled" : "disabled"} in the sidebar.`
    );
    toolEntrypointsCount = sidebar.toolButtons.length;
    checkedInputs = Array.from(customizeComponent.toolInputs).filter(
      input => input.checked
    );
    is(
      toolEntrypointsCount,
      checkedInputs.length,
      `The button for the ${toolInput.name} entrypoint has been ${
        toolDisabledInitialState ? "added" : "removed"
      }.`
    );
    toolInput.click();
    await TestUtils.waitForCondition(
      () => {
        let toggledTool = SidebarController.toolsAndExtensions.get(
          toolInput.id
        );
        return toggledTool.disabled === toolDisabledInitialState;
      },
      `The entrypoint for ${toolInput.name} has been ${toolDisabledInitialState ? "disabled" : "enabled"} in the sidebar.`
    );
    toolEntrypointsCount = sidebar.toolButtons.length;
    checkedInputs = Array.from(customizeComponent.toolInputs).filter(
      input => input.checked
    );
    is(
      toolEntrypointsCount,
      checkedInputs.length,
      `The button for the ${toolInput.name} entrypoint has been ${
        toolDisabledInitialState ? "removed" : "added"
      }.`
    );
    // Check ordering
    if (!toolDisabledInitialState) {
      is(
        sidebar.toolButtons[sidebar.toolButtons.length - 1].getAttribute(
          "view"
        ),
        toolInput.id,
        `The button for the ${toolInput.id} entrypoint has been added back to the end of the list of tools/extensions entrypoints`
      );
    }
  }
});

add_task(async function test_customize_not_added_in_menubar() {
  if (document.hasPendingL10nMutations) {
    await BrowserTestUtils.waitForEvent(document, "L10nMutationsFinished");
  }
  let sidebarsMenu = document.getElementById("viewSidebarMenu");
  let menuItems = sidebarsMenu.querySelectorAll("menuitem");
  ok(
    !Array.from(menuItems).find(menuitem =>
      menuitem.getAttribute("label").includes("Customize")
    ),
    "The View > Sidebars menu doesn't include any option for 'customize'."
  );
});

add_task(async function test_manage_preferences_navigation() {
  const sidebar = document.querySelector("sidebar-main");
  ok(sidebar, "Sidebar is shown.");
  await sidebar.updateComplete;
  const customizeComponent = await showCustomizePanel(window);
  let manageSettings =
    customizeComponent.shadowRoot.getElementById("manage-settings");
  manageSettings.querySelector("a").scrollIntoView();
  manageSettings.querySelector("a").click();

  await BrowserTestUtils.browserLoaded(
    window.gBrowser,
    false,
    "about:preferences"
  );
  is(
    window.gBrowser.selectedTab.linkedBrowser.currentURI.spec,
    "about:preferences",
    "Manage Settings link navigates to about:preferences."
  );
});

add_task(async function test_customize_position_setting() {
  const panel = await showCustomizePanel(window);
  const sidebarBox = document.getElementById("sidebar-box");
  ok(BrowserTestUtils.isVisible(sidebarBox), "Sidebar panel is visible");

  ok(
    !panel.positionInput.checked,
    "The sidebar positioned on the left by default."
  );
  is(
    sidebarBox.style.order,
    "3",
    "Sidebar box should have an order of 3 when on the left"
  );
  EventUtils.synthesizeMouseAtCenter(
    panel.positionInput,
    {},
    SidebarController.browser.contentWindow
  );
  await panel.updateComplete;
  ok(panel.positionInput.checked, "Sidebar is positioned on the right");

  const newWin = await BrowserTestUtils.openNewBrowserWindow();
  const newPanel = await showCustomizePanel(newWin);
  const newSidebarBox = newWin.document.getElementById("sidebar-box");
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(newSidebarBox),
    "Sidebar panel is visible"
  );
  info("Waiting for position input checked");
  await BrowserTestUtils.waitForMutationCondition(
    newPanel.positionInput,
    { attributes: true, attributeFilter: ["checked"] },
    () => newPanel.positionInput.checked
  );
  ok(newPanel.positionInput.checked, "Position setting persists.");
  is(
    newSidebarBox.style.order,
    "5",
    "Sidebar box should have an order of 5 when on the right"
  );

  await BrowserTestUtils.closeWindow(newWin);
  Services.prefs.clearUserPref(POSITION_SETTING_PREF);
});

add_task(async function test_customize_visibility_setting() {
  await SpecialPowers.pushPrefEnv({
    set: [[VERTICAL_TABS_PREF, true]],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");

  const deferredPrefChange = Promise.withResolvers();
  const prefObserver = () => deferredPrefChange.resolve();
  Services.prefs.addObserver(SIDEBAR_VISIBILITY_PREF, prefObserver);
  registerCleanupFunction(() =>
    Services.prefs.removeObserver(SIDEBAR_VISIBILITY_PREF, prefObserver)
  );

  const panel = await showCustomizePanel(window);
  ok(!panel.visibilityInput.checked, "Always show is enabled by default.");
  ok(
    !SidebarController.sidebarContainer.hidden,
    "Launcher is shown by default."
  );
  panel.visibilityInput.click();
  await panel.updateComplete;
  ok(panel.visibilityInput.checked, "Hide sidebar is enabled.");
  ok(
    SidebarController.sidebarContainer.hidden,
    "Launcher is hidden by default."
  );
  SidebarController.hide();
  await deferredPrefChange.promise;
  const newPrefValue = Services.prefs.getStringPref(SIDEBAR_VISIBILITY_PREF);
  is(newPrefValue, "hide-sidebar", "Visibility preference updated.");

  const newWin = await BrowserTestUtils.openNewBrowserWindow();
  ok(
    newWin.SidebarController.sidebarContainer.hidden,
    "Launcher is hidden by default in new window."
  );
  const newPanel = await showCustomizePanel(newWin);
  info("Waiting for visibility input checked");
  await BrowserTestUtils.waitForMutationCondition(
    newPanel.visibilityInput,
    { attributes: true, attributeFilter: ["checked"] },
    () => newPanel.visibilityInput.checked
  );
  ok(newPanel.visibilityInput.checked, "Visibility setting persists.");

  await BrowserTestUtils.closeWindow(newWin);

  Services.prefs.clearUserPref(SIDEBAR_VISIBILITY_PREF);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_vertical_tabs_setting() {
  const panel = await showCustomizePanel(window);
  ok(
    !panel.verticalTabsInput.checked,
    "Horizontal tabs is enabled by default."
  );
  panel.verticalTabsInput.click();
  await panel.updateComplete;
  ok(panel.verticalTabsInput.checked, "Vertical tabs is enabled.");
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");

  const newPrefValue = Services.prefs.getBoolPref(VERTICAL_TABS_PREF);
  is(newPrefValue, true, "Vertical tabs pref updated.");

  const newWin = await BrowserTestUtils.openNewBrowserWindow();
  await SidebarTestUtils.waitForTabstripOrientation(newWin, "vertical");
  const newPanel = await showCustomizePanel(newWin);
  info("Waiting for vertical tabs input checked");
  await BrowserTestUtils.waitForMutationCondition(
    newPanel.verticalTabsInput,
    { attributes: true, attributeFilter: ["checked"] },
    () => newPanel.verticalTabsInput.checked
  );
  ok(newPanel.verticalTabsInput.checked, "Vertical tabs setting persists.");

  await BrowserTestUtils.closeWindow(newWin);

  Services.prefs.clearUserPref(VERTICAL_TABS_PREF);
});

add_task(async function test_open_tools_from_sidebar_horizontal() {
  await SpecialPowers.pushPrefEnv({
    set: [[VERTICAL_TABS_PREF, false]],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "horizontal");

  const panel = await showCustomizePanel(window);
  const input = panel.openToolsFromSidebarInput;
  ok(input, "Open tools from sidebar checkbox is shown.");
  ok(
    input.checked,
    "Open tools from sidebar is checked by default for horizontal tabs."
  );
  ok(
    !input.disabled,
    "Open tools from sidebar is customizable for horizontal tabs."
  );

  info("Uncheck to turn on the panel switcher dropdown.");
  input.click();
  await panel.updateComplete;
  ok(!input.checked, "Open tools from sidebar is unchecked.");
  is(
    Services.prefs.getStringPref(SIDEBAR_VISIBILITY_PREF),
    "hide-launcher",
    "Unchecking turns on the panel switcher dropdown (hide-launcher)."
  );

  // Let the launcher's overflow IntersectionObserver run while the
  // launcher is hidden and ensure we aren't left with a sidebar
  // with unexpectedly hidden buttons
  const { sidebarMain } = window.SidebarController;
  await sidebarMain.updateComplete;
  await waitForRepaint();
  for (const button of sidebarMain.toolButtons) {
    isnot(
      button.style.visibility,
      "hidden",
      `Tool button ${button.getAttribute("view")} isn't hidden while the ` +
        `launcher is hidden.`
    );
  }

  input.click();
  await panel.updateComplete;
  ok(input.checked, "Open tools from sidebar is checked again.");
  is(
    Services.prefs.getStringPref(SIDEBAR_VISIBILITY_PREF),
    "hide-on-close",
    "Checking 'Open tools from sidebar' option places tool buttons back in the launcher."
  );

  await sidebarMain.updateComplete;
  await waitForRepaint();
  ok(sidebarMain.toolButtons.length, "Launcher still has tool buttons.");
  for (const button of sidebarMain.toolButtons) {
    is(
      window.getComputedStyle(button).visibility,
      "visible",
      `Tool button ${button.getAttribute("view")} is visible in the launcher.`
    );
  }

  Services.prefs.clearUserPref(SIDEBAR_VISIBILITY_PREF);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_open_tools_from_sidebar_vertical_disabled() {
  await SpecialPowers.pushPrefEnv({
    set: [[VERTICAL_TABS_PREF, false]],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "horizontal");

  const panel = await showCustomizePanel(window);
  ok(!panel.verticalTabsInput.checked, "Horizontal tabs to start.");
  ok(
    !panel.openToolsFromSidebarInput.disabled,
    "Open tools from sidebar is enabled with horizontal tabs."
  );

  info("Enable vertical tabs.");
  panel.verticalTabsInput.click();
  await SidebarTestUtils.waitForTabstripOrientation(window, "vertical");
  await TestUtils.waitForCondition(
    () => panel.openToolsFromSidebarInput?.disabled,
    "Open tools from sidebar becomes disabled when vertical tabs is enabled."
  );
  ok(
    panel.openToolsFromSidebarInput.checked,
    "Open tools from sidebar is shown checked with vertical tabs."
  );
  ok(
    panel.openToolsFromSidebarInput.disabled,
    "Open tools from sidebar is disabled with vertical tabs."
  );

  Services.prefs.clearUserPref(VERTICAL_TABS_PREF);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_open_tools_from_sidebar_vertical_initial_load() {
  // Regression test for bug 2052275: when the customize panel is opened for the
  // first time while vertical tabs are already enabled, "Open tools from
  // sidebar" must be disabled without first toggling the vertical tabs option.
  await SpecialPowers.pushPrefEnv({
    set: [[VERTICAL_TABS_PREF, true]],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow();
  await SidebarTestUtils.waitForTabstripOrientation(win, "vertical");

  const panel = await showCustomizePanel(win);
  ok(panel.verticalTabsInput.checked, "Vertical tabs enabled on initial load.");
  ok(
    panel.openToolsFromSidebarInput.checked,
    "Open tools from sidebar is shown checked with vertical tabs."
  );
  ok(
    panel.openToolsFromSidebarInput.disabled,
    "Open tools from sidebar is disabled on initial load with vertical tabs."
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_keyboard_navigation_away_from_settings_link() {
  const panel = await showCustomizePanel(window);
  const manageSettingsLink = panel.shadowRoot.querySelector(
    "#manage-settings a[href='about:preferences']"
  );
  manageSettingsLink.focus();

  Assert.equal(
    panel.shadowRoot.activeElement,
    manageSettingsLink,
    "Settings link is focused"
  );
  EventUtils.synthesizeKey("KEY_Tab", { shiftKey: true }, window);
  await panel.updateComplete;

  Assert.notEqual(
    panel.shadowRoot.activeElement,
    manageSettingsLink,
    "Settings link is not focused"
  );
});

add_task(async function test_settings_synchronized_across_windows() {
  const panel = await showCustomizePanel(window);
  const { contentWindow } = SidebarController.browser;
  const newWindow = await BrowserTestUtils.openNewBrowserWindow();
  const newPanel = await showCustomizePanel(newWindow);

  info("Update vertical tabs settings.");
  EventUtils.synthesizeMouseAtCenter(
    panel.verticalTabsInput,
    {},
    contentWindow
  );
  await newPanel.updateComplete;
  ok(
    newPanel.verticalTabsInput.checked,
    "New window shows the vertical tabs setting."
  );

  info("Update visibility settings.");
  EventUtils.synthesizeMouseAtCenter(panel.visibilityInput, {}, contentWindow);
  await newPanel.updateComplete;
  ok(
    newPanel.visibilityInput.checked,
    "New window shows the updated visibility setting."
  );

  info("Update position settings.");
  EventUtils.synthesizeMouseAtCenter(panel.positionInput, {}, contentWindow);
  await newPanel.updateComplete;
  ok(
    newPanel.positionInput.checked,
    "New window shows the updated position setting."
  );

  SidebarController.hide();
  await BrowserTestUtils.closeWindow(newWindow);
});

add_task(async function test_open_tabs_hover_preview_setting() {
  // The preceding task leaves vertical tabs on and the sidebar moved, which
  // shifts the Tools list down the panel. Start from a known layout so the
  // synthesized clicks land on the checkbox.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.openTabsPanel.enabled", true],
      [VERTICAL_TABS_PREF, false],
      [SIDEBAR_VISIBILITY_PREF, "always-show"],
      [POSITION_SETTING_PREF, true],
    ],
  });

  const panel = await showCustomizePanel(window);
  const { contentWindow } = SidebarController.browser;
  await BrowserTestUtils.waitForMutationCondition(
    panel.shadowRoot,
    { subtree: true, childList: true },
    () => panel.hoverPreviewInput
  );
  ok(
    panel.hoverPreviewInput.checked,
    "The hover preview setting is on by default."
  );

  panel.hoverPreviewInput.scrollIntoView({ block: "center" });
  EventUtils.synthesizeMouseAtCenter(
    panel.hoverPreviewInput,
    {},
    contentWindow
  );
  await TestUtils.waitForCondition(
    () => !Services.prefs.getBoolPref(HOVER_PREVIEW_PREF),
    "Waiting for the hover preview to be turned off."
  );
  ok(
    !Services.prefs.getBoolPref(HOVER_PREVIEW_PREF),
    "Unchecking the setting turns the hover preview off."
  );

  panel.hoverPreviewInput.scrollIntoView({ block: "center" });
  EventUtils.synthesizeMouseAtCenter(
    panel.hoverPreviewInput,
    {},
    contentWindow
  );
  await TestUtils.waitForCondition(
    () => Services.prefs.getBoolPref(HOVER_PREVIEW_PREF),
    "Waiting for the hover preview to be turned back on."
  );
  ok(
    Services.prefs.getBoolPref(HOVER_PREVIEW_PREF),
    "Checking it again turns the hover preview back on."
  );

  SidebarController.hide();
  Services.prefs.clearUserPref(HOVER_PREVIEW_PREF);
  await SpecialPowers.popPrefEnv();
});
