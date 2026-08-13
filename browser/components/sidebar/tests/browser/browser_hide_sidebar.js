/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests for horizontal-tabs "hide-launcher" mode. In this mode the launcher is
// hidden and each panel's header (the sidebar-panel-header Lit element) renders
// a dropdown switcher in place of the title. The toolbar button toggles the
// panel (rather than the launcher) and preserves the last opened panel.

const VIEW_TO_TAG = new Map([
  ["viewHistorySidebar", "sidebar-history"],
  ["viewBookmarksSidebar", "sidebar-bookmarks"],
  ["viewTabsSidebar", "sidebar-syncedtabs"],
]);

async function getPanelHeader(view) {
  const { browser } = SidebarController;
  if (browser.contentDocument.readyState != "complete") {
    await BrowserTestUtils.waitForEvent(browser, "load", true);
  }
  const panel = browser.contentDocument.querySelector(VIEW_TO_TAG.get(view));
  await panel.updateComplete;
  const header = panel.shadowRoot.querySelector("sidebar-panel-header");
  await header.updateComplete;
  return header;
}

async function getPanelSwitcher(view) {
  const header = await getPanelHeader(view);
  const switcher = header.shadowRoot.querySelector("sidebar-panel-switcher");
  await switcher.updateComplete;
  return switcher;
}

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.animation.enabled", false],
      ["sidebar.main.tools", "syncedtabs,history,bookmarks"],
      ["sidebar.updatedBookmarks.enabled", true],
      [VERTICAL_TABS_PREF, false],
    ],
  });
  await SidebarTestUtils.waitForTabstripOrientation(window, "horizontal");
  await SpecialPowers.pushPrefEnv({
    set: [[SIDEBAR_VISIBILITY_PREF, "hide-launcher"]],
  });
  await SidebarController.waitUntilStable();
});

add_task(async function test_launcher_hidden_and_panel_shown() {
  Assert.ok(
    SidebarController.sidebarContainer.hidden,
    "Launcher is hidden in horizontal tabs hide-launcher mode"
  );

  info("Open a panel.");
  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();

  Assert.ok(SidebarController.isOpen, "Panel is open");
  Assert.ok(
    SidebarController.sidebarContainer.hidden,
    "Launcher stays hidden while the panel is open"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(document.getElementById("sidebar-box")),
    "Panel box is visible"
  );

  info("The panel header shows the switcher dropdown in place of the title.");
  const header = await getPanelHeader("viewHistorySidebar");
  const switcher = header.shadowRoot.querySelector("sidebar-panel-switcher");
  const title = header.shadowRoot.querySelector(".sidebar-panel-title");
  Assert.ok(BrowserTestUtils.isVisible(switcher), "Switcher is visible");
  Assert.ok(BrowserTestUtils.isHidden(title), "Plain panel title is hidden");

  SidebarController.hide();
  await SidebarController.waitUntilStable();
});

add_task(async function test_toolbar_button_toggles_panel() {
  const { sidebarContainer, toolbarButton } = SidebarController;

  const toggleAndWait = async expectedOpen => {
    // The button command is dispatched without being awaited, so call the
    // handler directly to await the full toggle.
    await SidebarController.handleToolbarButtonClick();
    await SidebarController.waitUntilStable();
    Assert.equal(
      SidebarController.isOpen,
      expectedOpen,
      `Panel is ${expectedOpen ? "open" : "closed"} after toggling the button.`
    );
    Assert.equal(
      toolbarButton.checked,
      expectedOpen,
      `Toolbar button is ${expectedOpen ? "checked" : "unchecked"}.`
    );
    Assert.deepEqual(
      document.l10n.getAttributes(toolbarButton),
      {
        id: expectedOpen
          ? "sidebar-widget-hide-sidebar2"
          : "sidebar-widget-show-sidebar2",
        args:
          AppConstants.platform === "macosx"
            ? { shortcut: "⌃Z" }
            : { shortcut: "Alt+Ctrl+Z" },
      },
      "Toolbar button has the correct tooltip."
    );
    Assert.ok(sidebarContainer.hidden, "Launcher stays hidden");
  };

  Assert.ok(!SidebarController.isOpen, "No panel is open initially");

  info("Open the panel using the toolbar button.");
  await toggleAndWait(true);

  info("Close the panel using the toolbar button.");
  await toggleAndWait(false);
});

add_task(async function test_keyboard_shortcut_preserves_state() {
  info("Open the bookmarks panel with the toolbar button.");
  await SidebarController.show("viewBookmarksSidebar");
  await SidebarController.waitUntilStable();
  Assert.ok(SidebarController.isOpen, "Panel is open");

  info("Toggling the same panel (as a keyboard shortcut does) closes it.");
  await SidebarController.toggle("viewBookmarksSidebar");
  await SidebarController.waitUntilStable();
  Assert.ok(!SidebarController.isOpen, "Panel is closed");
  Assert.ok(
    SidebarController.sidebarContainer.hidden,
    "Launcher stays hidden after the keyboard shortcut closes the panel"
  );

  info("Toggling again re-opens the preserved panel.");
  await SidebarController.toggle("viewBookmarksSidebar");
  await SidebarController.waitUntilStable();
  Assert.equal(
    SidebarController.currentID,
    "viewBookmarksSidebar",
    "The previously opened panel was preserved"
  );

  SidebarController.hide();
  await SidebarController.waitUntilStable();
});

add_task(async function test_switcher_dropdown_switches_panel() {
  info("Open the history panel.");
  await SidebarController.show("viewHistorySidebar");
  await SidebarController.waitUntilStable();

  const switcher = await getPanelSwitcher("viewHistorySidebar");
  const switcherButton = switcher.shadowRoot.querySelector(".switcher-button");
  const panelList = switcher.shadowRoot.querySelector("panel-list");

  info("Open the panel switcher dropdown.");
  await SimpleTest.promiseFocus(window);
  const shown = BrowserTestUtils.waitForEvent(panelList, "shown");
  switcherButton.click();
  await shown;
  await switcher.updateComplete;

  const items = [...switcher.shadowRoot.querySelectorAll("panel-item")];
  Assert.greater(items.length, 1, "Switcher lists multiple panels");

  const checkedItem = items.find(item => item.hasAttribute("checked"));
  Assert.equal(
    checkedItem?.textContent.trim(),
    switcher.label,
    "The current panel is checked in the switcher"
  );

  const bookmarksItem = await getPanelItemForView(
    items,
    "viewBookmarksSidebar"
  );
  Assert.ok(bookmarksItem, "Bookmarks panel is listed in the switcher");

  info("Switch to the bookmarks panel from the dropdown.");
  bookmarksItem.click();
  await TestUtils.waitForCondition(
    () => SidebarController.currentID === "viewBookmarksSidebar",
    "Waiting for the bookmarks panel to open"
  );

  Assert.equal(
    SidebarController.currentID,
    "viewBookmarksSidebar",
    "Switcher switched to the bookmarks panel"
  );
  Assert.ok(
    SidebarController.sidebarContainer.hidden,
    "Launcher stays hidden after switching panels"
  );

  SidebarController.hide();
  await SidebarController.waitUntilStable();
});

async function getPanelItemForView(items, view) {
  const switcherItems = await SidebarController.getRevampSwitcherItems();
  const target = switcherItems.find(item => item.view === view);
  return items.find(item => item.textContent.trim() === target?.label);
}

add_task(async function test_close_button_preserves_panel() {
  info("Open the bookmarks panel.");
  await SidebarController.show("viewBookmarksSidebar");
  await SidebarController.waitUntilStable();
  Assert.ok(SidebarController.isOpen, "Panel is open");

  info("Close the panel using the header close button.");
  const header = await getPanelHeader("viewBookmarksSidebar");
  header.closeButton.click();
  await SidebarController.waitUntilStable();
  Assert.ok(!SidebarController.isOpen, "Panel is closed via the close button");
  Assert.ok(
    SidebarController.sidebarContainer.hidden,
    "Launcher stays hidden after closing the panel"
  );

  info("The last panel is preserved: the toolbar button re-opens it.");
  document.getElementById("sidebar-button").doCommand();
  await SidebarController.waitUntilStable();
  Assert.ok(
    SidebarController.isOpen,
    "Panel re-opened with the toolbar button"
  );
  Assert.equal(
    SidebarController.currentID,
    "viewBookmarksSidebar",
    "The previously opened panel was preserved"
  );

  SidebarController.hide();
  await SidebarController.waitUntilStable();
});
