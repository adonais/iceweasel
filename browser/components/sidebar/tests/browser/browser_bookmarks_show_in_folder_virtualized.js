/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Show in Folder has to reveal a bookmark whose row lives in a virtual-list
 * chunk that starts out scrolled out of view, which only happens once a folder
 * holds more items than a single chunk.
 */
"use strict";

const TEST_URL = "https://example.org/";
// Comfortably more than the largest virtual-list chunk, so a folder added
// after the filler lands in a chunk that is never intersected at the initial
// scroll position.
const FILLER_COUNT = 200;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.updatedBookmarks.enabled", true]],
  });
  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
  });
});

function findRow(list, guid) {
  if (!list) {
    return null;
  }
  for (const row of list.rowEls ?? []) {
    if (row.guid === guid) {
      return row;
    }
  }
  for (const details of list.folderEls ?? []) {
    const found = findRow(details.querySelector("sidebar-bookmark-list"), guid);
    if (found) {
      return found;
    }
  }
  return null;
}

async function fillFolder(parentGuid, prefix) {
  await PlacesUtils.bookmarks.insertTree({
    guid: parentGuid,
    children: Array.from({ length: FILLER_COUNT }, (_, i) => ({
      title: `${prefix} ${i}`,
      url: `https://example.com/${prefix}/${i}`,
    })),
  });
}

/**
 * Search for a bookmark, reveal it with Show in Folder, and check that its row
 * ends up rendered, selected and scrolled into view.
 *
 * @param {string} title The title of the bookmark to reveal.
 * @param {string} guid The guid of the bookmark to reveal.
 */
async function revealAndVerify(title, guid) {
  await SidebarTestUtils.showPanel(window, "viewBookmarksSidebar");
  const { contentDocument, contentWindow } = SidebarController.browser;
  const component = contentDocument.querySelector("sidebar-bookmarks");
  await component.updateComplete;

  info(`Search for ${title}.`);
  EventUtils.synthesizeMouseAtCenter(component.searchInput, {}, contentWindow);
  EventUtils.sendString(title, contentWindow);
  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => component.searchResults?.length === 1
  );

  const resultsList = component.bookmarkList;
  await BrowserTestUtils.waitForMutationCondition(
    resultsList.shadowRoot,
    { childList: true, subtree: true },
    () => resultsList.rowEls[0]?.guid === guid
  );

  info("Activate Show in Folder.");
  const contextMenu = SidebarController.currentContextMenu;
  await openAndWaitForContextMenu(
    contextMenu,
    resultsList.rowEls[0].mainEl,
    () => {}
  );
  const promiseHidden = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "hidden"
  );
  contextMenu.activateItem(
    document.getElementById("sidebar-bookmarks-context-show-in-folder")
  );
  await promiseHidden;

  await TestUtils.waitForCondition(
    () => component.searchQuery === "",
    "Search is cleared after Show in Folder."
  );

  const tabList = component.bookmarkList;
  await TestUtils.waitForCondition(
    () => findRow(tabList, guid),
    "The bookmark row renders even though its chunk starts out of view."
  );
  const revealedRow = findRow(tabList, guid);
  await TestUtils.waitForCondition(
    () => revealedRow.selected,
    "The bookmark row is selected after Show in Folder."
  );

  // Scrolling makes further chunks render, which can shift the row's position
  // once their placeholder heights are replaced by real ones.
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => contentWindow.requestAnimationFrame(resolve));
  }

  const scroller = component.shadowRoot.querySelector(
    ".sidebar-panel-scrollable-content"
  );
  const scrollerRect = scroller.getBoundingClientRect();
  const rowRect = revealedRow.getBoundingClientRect();
  Assert.greaterOrEqual(
    Math.round(rowRect.top),
    Math.round(scrollerRect.top),
    "The revealed row is fully below the top of the scrollable area."
  );
  Assert.lessOrEqual(
    Math.round(rowRect.bottom),
    Math.round(scrollerRect.bottom),
    "The revealed row is fully above the bottom of the scrollable area."
  );
}

add_task(async function test_show_in_folder_reveals_virtualized_row() {
  await fillFolder(PlacesUtils.bookmarks.toolbarGuid, "filler");
  const folder = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Outer",
  });
  const bookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: folder.guid,
    url: TEST_URL,
    title: "FindMeVirtualized",
  });

  await revealAndVerify("FindMeVirtualized", bookmark.guid);

  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_show_in_folder_reveals_nested_virtualized_row() {
  // Every level of the path needs its own out-of-view chunk rendered before
  // the next level down can be found.
  await fillFolder(PlacesUtils.bookmarks.toolbarGuid, "outerfiller");
  const outer = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Outer",
  });
  await fillFolder(outer.guid, "innerfiller");
  const inner = await PlacesUtils.bookmarks.insert({
    parentGuid: outer.guid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Inner",
  });
  const bookmark = await PlacesUtils.bookmarks.insert({
    parentGuid: inner.guid,
    url: TEST_URL,
    title: "FindMeNested",
  });

  await revealAndVerify("FindMeNested", bookmark.guid);

  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});
