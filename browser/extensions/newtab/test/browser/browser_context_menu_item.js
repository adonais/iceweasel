"use strict";

// Test that we do not set icons in individual tile and card context menus on
// newtab page.
test_newtab({
  before: setDefaultTopSites,
  test: async function test_contextMenuIcons() {
    const tile = await content.waitForAnyTopSite();
    const contextMenuItems = await content.openContextMenuAndGetOptions(tile);
    let icon = contextMenuItems[0].querySelector(".icon");
    ok(!icon, "icon was not rendered");
  },
});
