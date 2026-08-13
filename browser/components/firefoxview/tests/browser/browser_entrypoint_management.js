/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_removing_button_should_close_tab() {
  await withFirefoxView({}, async browser => {
    let win = browser.documentGlobal;
    let tab = browser.getTabBrowser().getTabForBrowser(browser);
    let button = win.document.getElementById("firefox-view-button");
    await win.gCustomizeMode.removeFromArea(button, "toolbar-context-menu");
    ok(!tab.isConnected, "Tab should have been removed.");
    isnot(win.gBrowser.selectedTab, tab, "A different tab should be selected.");
  });
  CustomizableUI.reset();
});

add_task(async function test_button_moved() {
  await withFirefoxView({}, async browser => {
    let { FirefoxViewHandler } = browser.documentGlobal;
    CustomizableUI.addWidgetToArea(
      "firefox-view-button",
      CustomizableUI.AREA_NAVBAR,
      0
    );
    is(
      FirefoxViewHandler.button.closest("toolbar").id,
      "nav-bar",
      "Button is in the navigation toolbar"
    );
  });
  await withFirefoxView({}, async browser => {
    let { FirefoxViewHandler } = browser.documentGlobal;
    is(
      FirefoxViewHandler.button.closest("toolbar").id,
      "nav-bar",
      "Button remains in the navigation toolbar"
    );
  });
  CustomizableUI.reset();
});
