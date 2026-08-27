"use strict";

/**
 * Tests that a content-initiated window.close() on a window's last tab honors
 * browser.tabs.closeWindowWithLastTab.
 */

add_task(async function contentCloseLastTab() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.closeWindowWithLastTab", false],
      ["dom.allow_scripts_to_close_windows", true],
    ],
  });

  let win = await BrowserTestUtils.openNewBrowserWindow();
  BrowserTestUtils.startLoadingURIString(
    win.gBrowser.selectedBrowser,
    "https://example.com/"
  );
  await BrowserTestUtils.browserLoaded(win.gBrowser.selectedBrowser);

  is(win.gBrowser.tabs.length, 1, "one tab in the new window");

  let newTabOpened = BrowserTestUtils.waitForEvent(
    win.gBrowser.tabContainer,
    "TabOpen"
  );
  SpecialPowers.spawn(win.gBrowser.selectedBrowser, [], () => {
    content.window.close();
  });
  await newTabOpened;

  ok(!win.closed, "window stays open");
  is(win.gBrowser.tabs.length, 1, "the tab was replaced by an empty one");

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

/**
 * A popup window has no tab strip, so it must close itself from content
 * regardless of the pref.
 */
add_task(async function contentClosePopupWindow() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.closeWindowWithLastTab", false],
      ["dom.disable_open_during_load", false],
      ["browser.link.open_newwindow.restriction", 2],
    ],
  });

  let popupPromise = BrowserTestUtils.waitForNewWindow();
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
    content.window.open(
      "https://example.com/",
      "_blank",
      "width=300,height=300"
    );
  });
  let popup = await popupPromise;
  ok(!popup.toolbar.visible, "opened an actual popup window");

  let closed = BrowserTestUtils.domWindowClosed(popup);
  SpecialPowers.spawn(popup.gBrowser.selectedBrowser, [], () => {
    content.window.close();
  });
  await closed;

  ok(popup.closed, "popup window closed itself");

  await SpecialPowers.popPrefEnv();
});

/**
 * A page that opens popups as tabs and closes them from its own unload
 * handler must not take the window down with it.
 */
add_task(async function popupTabsClosedByOpenerUnload() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.closeWindowWithLastTab", false],
      ["browser.link.open_newwindow.restriction", 0],
      ["dom.disable_open_during_load", false],
    ],
  });

  let win = await BrowserTestUtils.openNewBrowserWindow();
  BrowserTestUtils.startLoadingURIString(
    win.gBrowser.selectedBrowser,
    "https://example.com/"
  );
  await BrowserTestUtils.browserLoaded(win.gBrowser.selectedBrowser);

  let openerTab = win.gBrowser.selectedTab;
  let popupTabOpened = BrowserTestUtils.waitForNewTab(win.gBrowser);
  await SpecialPowers.spawn(openerTab.linkedBrowser, [], () => {
    let child = content.window.open("https://example.com/?child", "_blank");
    content.window.addEventListener("unload", () => child.close());
  });
  await popupTabOpened;

  is(win.gBrowser.tabs.length, 2, "opener tab plus popup tab");

  let newTabOpened = BrowserTestUtils.waitForEvent(
    win.gBrowser.tabContainer,
    "TabOpen"
  );
  win.gBrowser.removeTab(openerTab);
  await newTabOpened;

  ok(!win.closed, "window stays open");
  is(win.gBrowser.tabs.length, 1, "the tabs were replaced by an empty one");

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});
