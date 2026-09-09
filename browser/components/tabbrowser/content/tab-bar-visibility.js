/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var TabBarVisibility = {
  _initialUpdateDone: false,

  update(force = false) {
    let isPopup = !window.toolbar.visible;
    let isTaskbarTab = document.documentElement.hasAttribute("taskbartab");
    let isSingleTabWindow = isPopup || isTaskbarTab;

    let hasVerticalTabs =
      !isSingleTabWindow &&
      Services.prefs.getBoolPref("sidebar.verticalTabs", false);

    // When `gBrowser` has not been initialized, we're opening a new window and
    // assume only a single tab is loading.
    let hasSingleTab = !gBrowser || gBrowser.visibleTabs.length == 1;

    // To prevent tabs being lost, hiding the tabs toolbar should only work
    // when only a single tab is visible or tabs are displayed elsewhere.
    let hideTabsToolbar =
      (isSingleTabWindow && hasSingleTab) || hasVerticalTabs;

    // We only want a non-customized titlebar for popups. It should not be the
    // case, but if a popup window contains more than one tab we re-enable
    // titlebar customization and display tabs.
    CustomTitlebar.allowedBy("non-popup", !(isPopup && hasSingleTab));

    // Update the browser chrome.

    let tabsToolbar = document.getElementById("TabsToolbar");
    let navbar = document.getElementById("nav-bar");

    gNavToolbox.toggleAttribute("tabs-hidden", hideTabsToolbar);
    // Should the nav-bar look and function like a titlebar?
    navbar.classList.toggle(
      "browser-titlebar",
      CustomTitlebar.enabled && hideTabsToolbar
    );

    if (
      hideTabsToolbar == tabsToolbar.collapsed &&
      !force &&
      this._initialUpdateDone
    ) {
      // No further updates needed, `TabsToolbar` already matches the expected
      // visibilty.
      return;
    }
    this._initialUpdateDone = true;

    tabsToolbar.collapsed = hideTabsToolbar;

    // Stylize close menu items based on tab visibility. When a window will only
    // ever have a single tab, only show the option to close the tab, and
    // simplify the text since we don't need to disambiguate from closing the window.
    document.getElementById("menu_closeWindow").hidden = hideTabsToolbar;
    document.l10n.setAttributes(
      document.getElementById("menu_close"),
      hideTabsToolbar
        ? "tabbrowser-menuitem-close"
        : "tabbrowser-menuitem-close-tab"
    );
  },
};
