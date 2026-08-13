/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

let innerFolderGuid;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["sidebar.updatedBookmarks.enabled", true]],
  });

  const toolbarItems = await PlacesUtils.bookmarks.insertTree({
    guid: PlacesUtils.bookmarks.toolbarGuid,
    children: [
      { url: "https://example.com/outer-a", title: "Outer Bookmark A" },
      { url: "https://example.com/outer-b", title: "Outer Bookmark B" },
      {
        type: PlacesUtils.bookmarks.TYPE_FOLDER,
        title: "Inner Folder",
        children: [
          { url: "https://example.com/inner-a", title: "Inner Bookmark A" },
          { url: "https://example.com/inner-b", title: "Inner Bookmark B" },
        ],
      },
    ],
  });
  innerFolderGuid = toolbarItems.find(
    ({ type }) => type === PlacesUtils.bookmarks.TYPE_FOLDER
  ).guid;

  await PlacesUtils.bookmarks.insert({
    url: "https://example.com/menu",
    title: "Menu Bookmark",
    parentGuid: PlacesUtils.bookmarks.menuGuid,
  });

  await SidebarTestUtils.waitForInitialized(window);
});

registerCleanupFunction(async () => {
  await PlacesUtils.bookmarks.eraseEverything();
});

/**
 * Return the element matching the given folder guid.
 *
 * @param {object} component
 * @param {SidebarBookmarkList} component.bookmarkList
 * @param {string} guid
 * @returns {HTMLDetailsElement} The folder element
 */
async function getRootFolderEl({ bookmarkList }, guid) {
  return BrowserTestUtils.waitForMutationCondition(
    bookmarkList.shadowRoot,
    { childList: true, subtree: true },
    () => [...bookmarkList.folderEls].find(folder => folder.guid === guid)
  );
}

/**
 * Count the number of descendents within the folder.
 *
 * @param {string} guid - The folder guid
 * @returns {number} The number of descendents
 */
async function descendentCount(guid) {
  const tree = await PlacesUtils.promiseBookmarksTree(guid);
  let count = 0;
  if (tree.children) {
    for (const child of tree.children) {
      count += child.children ? await descendentCount(child.guid) : 1;
    }
  }
  return count;
}

function checkPlaceUrlForBookmark(bookmark, expectedTargetGuid) {
  Assert.equal(
    bookmark.type,
    PlacesUtils.bookmarks.TYPE_BOOKMARK,
    "Pasted item is a bookmark row, not a folder."
  );
  Assert.equal(
    bookmark.url.toString(),
    `place:parent=${expectedTargetGuid}`,
    "Pasted bookmark links to the expected folder."
  );
}

const editItem = document.getElementById(
  "sidebar-bookmarks-context-edit-bookmark"
);
const deleteItem = document.getElementById(
  "sidebar-bookmarks-context-delete-bookmark"
);
const cutItem = document.getElementById("sidebar-bookmarks-context-cut");

add_task(async function test_destructive_actions_disabled_for_root_folders() {
  const { component } = await showBookmarksSidebar();
  const toolbarFolder = await getRootFolderEl(
    component,
    PlacesUtils.bookmarks.toolbarGuid
  );
  const summary = toolbarFolder.querySelector("summary");

  const contextMenu = SidebarController.currentContextMenu;
  await openAndWaitForContextMenu(contextMenu, summary);

  Assert.ok(
    editItem.disabled,
    "Edit is disabled on the Bookmarks Toolbar root."
  );
  Assert.ok(
    deleteItem.disabled,
    "Delete is disabled on the Bookmarks Toolbar root."
  );
  Assert.ok(cutItem.disabled, "Cut is disabled on the Bookmarks Toolbar root.");

  contextMenu.hidePopup();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_destructive_actions_enabled_for_normal_folders() {
  const { component } = await showBookmarksSidebar();
  const nestedList = await expandToolbarFolder(component.bookmarkList);
  const innerFolder = await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => [...nestedList.folderEls].find(({ guid }) => guid === innerFolderGuid)
  );
  const summary = innerFolder.querySelector("summary");

  const contextMenu = SidebarController.currentContextMenu;
  await openAndWaitForContextMenu(contextMenu, summary);

  Assert.ok(!editItem.disabled, "Edit is enabled on a non-root folder.");
  Assert.ok(!deleteItem.disabled, "Delete is enabled on a non-root folder.");
  Assert.ok(!cutItem.disabled, "Cut is enabled on a non-root folder.");

  contextMenu.hidePopup();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_drag_root_creates_symbolic_link() {
  const { component, contentWindow } = await showBookmarksSidebar();
  const menuItemCount = await descendentCount(PlacesUtils.bookmarks.menuGuid);

  info("Drag Bookmarks Toolbar into the Menu folder.");
  const toolbarFolder = await getRootFolderEl(
    component,
    PlacesUtils.bookmarks.toolbarGuid
  );
  const menuFolder = await getRootFolderEl(
    component,
    PlacesUtils.bookmarks.menuGuid
  );
  const toolbarFolderHeader = toolbarFolder.querySelector("summary");
  const menuFolderHeader = menuFolder.querySelector("summary");

  const promiseAdded = PlacesTestUtils.waitForNotification(
    "bookmark-added",
    events =>
      events.some(
        ({ parentGuid }) => parentGuid === PlacesUtils.bookmarks.menuGuid
      )
  );
  const rect = menuFolderHeader.getBoundingClientRect();
  EventUtils.synthesizeDrop(
    toolbarFolderHeader,
    menuFolderHeader,
    null,
    "move",
    contentWindow,
    contentWindow,
    {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      _domDispatchOnly: true,
    }
  );
  const [{ guid }] = await promiseAdded;

  const toolbarInfo = await PlacesUtils.bookmarks.fetch(
    PlacesUtils.bookmarks.toolbarGuid
  );
  Assert.equal(
    toolbarInfo.parentGuid,
    PlacesUtils.bookmarks.rootGuid,
    "Bookmarks Toolbar is still under the root (not moved)."
  );
  Assert.equal(
    await descendentCount(PlacesUtils.bookmarks.menuGuid),
    menuItemCount + 1,
    "Menu gained exactly one child (the symbolic link)."
  );

  const link = await PlacesUtils.bookmarks.fetch(guid);
  checkPlaceUrlForBookmark(link, PlacesUtils.bookmarks.toolbarGuid);
  await PlacesUtils.bookmarks.remove(link.guid);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_copy_paste_root_creates_symbolic_link() {
  const sidebar = await showBookmarksSidebar();

  const toolbarFolderEl = await getRootFolderEl(
    sidebar.component,
    PlacesUtils.bookmarks.toolbarGuid
  );
  const toolbarFolderHeader = toolbarFolderEl.querySelector("summary");

  const menuFolderEl = await getRootFolderEl(
    sidebar.component,
    PlacesUtils.bookmarks.menuGuid
  );
  menuFolderEl.open = true;

  const bookmarkList = menuFolderEl.querySelector("sidebar-bookmark-list");
  const firstMenuBookmark = await BrowserTestUtils.waitForMutationCondition(
    bookmarkList.shadowRoot,
    { childList: true, subtree: true },
    () => bookmarkList.rowEls[0]
  );

  info("Copy the Bookmarks Toolbar via the context menu.");
  await activateContextMenuItem(
    toolbarFolderHeader,
    "sidebar-bookmarks-context-copy"
  );

  info("Paste into the Menu folder via the context menu.");
  const promiseAdded = PlacesTestUtils.waitForNotification(
    "bookmark-added",
    events => {
      return events.some(
        ({ parentGuid, url }) =>
          parentGuid === PlacesUtils.bookmarks.menuGuid &&
          url?.startsWith("place:")
      );
    }
  );
  await activateContextMenuItem(
    firstMenuBookmark,
    "sidebar-bookmarks-context-paste"
  );
  const [{ guid }] = await promiseAdded;

  const link = await PlacesUtils.bookmarks.fetch(guid);
  checkPlaceUrlForBookmark(link, PlacesUtils.bookmarks.toolbarGuid);
  await PlacesUtils.bookmarks.remove(link.guid);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_recursive_symlink_does_not_crash() {
  // Create a symlink to a folder, placed *inside* that folder.
  const recursive = await PlacesUtils.bookmarks.insert({
    url: `place:parent=${PlacesUtils.bookmarks.toolbarGuid}`,
    title: "Recursive Link",
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
  });

  const sidebar = await showBookmarksSidebar();
  const toolbar = await getRootFolderEl(
    sidebar.component,
    PlacesUtils.bookmarks.toolbarGuid
  );
  Assert.ok(toolbar, "Sidebar rendered the Bookmarks Toolbar successfully.");

  await PlacesUtils.bookmarks.remove(recursive.guid);
  SidebarTestUtils.closePanel(window);
});
