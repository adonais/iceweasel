/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";
const PB_INDICATOR_SELECTOR = ".private-browsing-indicator-with-label";

// The private browsing indicator lives in two possible spots:
// - Inside #TabsToolbar (shown with icon + label, for horizontal tabs)
// - Inside #nav-bar (shown with icon only, for vertical tabs)
//
// These tests make sure at least one copy is always visible in a
// private window, no matter the tabs/titlebar/menubar layout.

add_task(async function test_indicator_horizontal_tabs() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["sidebar.verticalTabs", false],
    ],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  const tabsToolbarIndicator = win.document.querySelector(
    `#TabsToolbar ${PB_INDICATOR_SELECTOR}`
  );
  const navBarIndicator = win.document.querySelector(
    `#nav-bar ${PB_INDICATOR_SELECTOR}`
  );

  ok(
    BrowserTestUtils.isVisible(tabsToolbarIndicator),
    "Indicator should be visible in TabsToolbar with horizontal tabs"
  );
  ok(
    BrowserTestUtils.isHidden(navBarIndicator),
    "Indicator in nav-bar should be hidden with horizontal tabs"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_indicator_vertical_tabs() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.revamp", true],
      ["sidebar.verticalTabs", true],
    ],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  const tabsToolbarIndicator = win.document.querySelector(
    `#TabsToolbar ${PB_INDICATOR_SELECTOR}`
  );
  const navBarIndicator = win.document.querySelector(
    `#nav-bar ${PB_INDICATOR_SELECTOR}`
  );

  ok(
    BrowserTestUtils.isHidden(tabsToolbarIndicator),
    "Indicator in TabsToolbar should be hidden with vertical tabs"
  );
  ok(
    BrowserTestUtils.isVisible(navBarIndicator),
    "Indicator should be visible in nav-bar with vertical tabs"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_indicator_tabs_in_titlebar() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.inTitlebar", 1]],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  const tabsToolbarIndicator = win.document.querySelector(
    `#TabsToolbar ${PB_INDICATOR_SELECTOR}`
  );
  const navBarIndicator = win.document.querySelector(
    `#nav-bar ${PB_INDICATOR_SELECTOR}`
  );

  ok(
    BrowserTestUtils.isVisible(tabsToolbarIndicator) ||
      BrowserTestUtils.isVisible(navBarIndicator),
    "At least one indicator copy should be visible with tabs in titlebar"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_indicator_with_menubar_shown() {
  CustomizableUI.setToolbarVisibility("toolbar-menubar", true);

  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  const tabsToolbarIndicator = win.document.querySelector(
    `#TabsToolbar ${PB_INDICATOR_SELECTOR}`
  );
  const navBarIndicator = win.document.querySelector(
    `#nav-bar ${PB_INDICATOR_SELECTOR}`
  );

  ok(
    BrowserTestUtils.isVisible(tabsToolbarIndicator) ||
      BrowserTestUtils.isVisible(navBarIndicator),
    "At least one indicator copy should be visible with the menu bar shown"
  );

  await BrowserTestUtils.closeWindow(win);
  CustomizableUI.setToolbarVisibility("toolbar-menubar", false);
});

add_task(async function test_indicator_not_shown_in_normal_window() {
  const win = await BrowserTestUtils.openNewBrowserWindow();

  const indicators = win.document.querySelectorAll(PB_INDICATOR_SELECTOR);

  for (const indicator of indicators) {
    ok(
      BrowserTestUtils.isHidden(indicator),
      "Indicator should never be visible in a normal (non-private) window"
    );
  }

  await BrowserTestUtils.closeWindow(win);
});
