/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const { SidebarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SidebarTestUtils.sys.mjs"
);

add_setup(async () => {
  SidebarTestUtils.init(this);
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.revamp", true]],
  });
});

registerCleanupFunction(async () => {
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_close_bookmarks_panel() {
  let sidebarBox = document.getElementById("sidebar-box");
  let sidebar = document.getElementById("sidebar");
  ok(sidebarBox.hidden, "The sidebar should be hidden");

  await SidebarTestUtils.showPanel(window, "viewBookmarksSidebar");
  ok(!sidebarBox.hidden, "The sidebar is shown");

  sidebar.contentDocument.getElementById("sidebar-panel-close").click();
  ok(sidebarBox.hidden, "The sidebar should be hidden");
});

add_task(async function test_switch_from_legacy_bookmarks_panel() {
  // Bug 2076296 - Ensure that the revamped sidebar switcher works for legacy bookmarks.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.updatedBookmarks.enabled", false],
      ["sidebar.visibility", "hide-launcher"],
      ["sidebar.verticalTabs", false],
      ["sidebar.main.tools", "bookmarks,history"],
    ],
  });

  await SidebarTestUtils.showPanel(window, "viewBookmarksSidebar");
  const sidebar = document.getElementById("sidebar");
  const switcher = sidebar.contentDocument.querySelector(
    "sidebar-panel-switcher"
  );
  await switcher.updateComplete;
  Assert.ok(BrowserTestUtils.isVisible(switcher), "Panel switcher is visible");

  const listShown = BrowserTestUtils.waitForEvent(switcher.panelList, "shown");
  EventUtils.synthesizeMouseAtCenter(
    switcher.button,
    {},
    sidebar.contentWindow
  );
  await listShown;
  await switcher.updateComplete;

  const { label } = (await SidebarController.getRevampSwitcherItems()).find(
    ({ view }) => view === "viewHistorySidebar"
  );
  const historyItem = [...switcher.panelItems].find(({ textContent }) =>
    textContent.includes(label)
  );
  Assert.ok(historyItem, "History is available in the switcher");
  const sidebarShown = BrowserTestUtils.waitForEvent(window, "SidebarShown");
  EventUtils.synthesizeMouseAtCenter(historyItem, {}, sidebar.contentWindow);
  await sidebarShown;
  Assert.equal(
    SidebarController.currentID,
    "viewHistorySidebar",
    "History panel opened from the legacy Bookmarks switcher"
  );

  SidebarTestUtils.closePanel(window);
  await SpecialPowers.popPrefEnv();
});
