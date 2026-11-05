/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(async () => {
  await populateHistory();
  registerCleanupFunction(async () => {
    SidebarController.hide();
    await PlacesUtils.history.clear();
    while (gBrowser.tabs.length > 1) {
      BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
    }
  });
});

add_task(async function test_drag_history_entry_to_tab_strip() {
  const { component, contentWindow } = await showHistorySidebar();
  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => !!component.lists.length
  );
  const list = component.lists[0];
  await BrowserTestUtils.waitForMutationCondition(
    list.shadowRoot,
    { subtree: true, childList: true },
    () => !!list.rowEls.length
  );

  const row = component.lists[0].rowEls[0];
  const { url } = row;
  Assert.ok(url, "The history row has a URL.");

  const newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, url, true);
  // Make the drop land on outer edge of tab to open a new tab, not
  // override an existing one.
  EventUtils.synthesizeDrop(
    row.mainEl,
    gBrowser.selectedTab,
    null,
    "link",
    contentWindow,
    window,
    { clientX: 0, clientY: 0, screenX: 0, screenY: 0 }
  );
  const newTab = await newTabPromise;
  Assert.equal(
    newTab.linkedBrowser.currentURI.spec,
    url,
    "Dropping a history entry on the tab strip opens it in a new tab."
  );
  BrowserTestUtils.removeTab(newTab);
});
