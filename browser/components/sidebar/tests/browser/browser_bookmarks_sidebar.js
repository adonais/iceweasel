/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

const TEST_URL = "https://example.com/";
const TEST_URL_2 = "https://example.org/";
const UPDATED_BOOKMARKS_PREF = "sidebar.updatedBookmarks.enabled";
const BOOKMARK_DIALOG_URL =
  "chrome://browser/content/places/bookmarkProperties.xhtml";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [[UPDATED_BOOKMARKS_PREF, true]],
  });
});

async function showBookmarksSidebar() {
  if (SidebarController.currentID !== "viewBookmarksSidebar") {
    await SidebarTestUtils.showPanel(window, "viewBookmarksSidebar");
  }
  const { contentDocument, contentWindow } = SidebarController.browser;
  await TestUtils.waitForCondition(
    () => contentDocument.querySelector("sidebar-bookmarks"),
    "Wait for sidebar-bookmarks element"
  );
  const component = contentDocument.querySelector("sidebar-bookmarks");
  await component.updateComplete;
  return { component, contentWindow };
}

async function addBookmark({
  url = TEST_URL,
  title = "Test Bookmark",
  parentGuid,
} = {}) {
  return PlacesUtils.bookmarks.insert({
    url,
    title,
    parentGuid: parentGuid ?? PlacesUtils.bookmarks.toolbarGuid,
  });
}

async function addFolder(title = "Test Folder", parentGuid) {
  return PlacesUtils.bookmarks.insert({
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title,
    parentGuid: parentGuid ?? PlacesUtils.bookmarks.toolbarGuid,
  });
}

async function addFolderViaContextMenu(triggerEl) {
  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    null,
    BOOKMARK_DIALOG_URL,
    {
      isSubDialog: true,
      callback: async dialog => {
        await dialog.document.mozSubdialogReady;
        EventUtils.synthesizeKey("VK_RETURN", {}, dialog);
      },
    }
  );
  await activateContextMenuItem(
    triggerEl,
    "sidebar-bookmarks-context-add-folder"
  );
  await dialogPromise;
  // Wait for the dialog's save() to fully complete. NewFolder inserts the
  // folder at the end of the parent and then moves it to the requested index
  // in a second step (bug 1388097); the bookmark-added notification fires
  // before that move, so we must wait for the whole operation to settle.
  return PlacesUIUtils.lastBookmarkDialogDeferred.promise;
}

async function addBookmarkViaContextMenu(triggerEl, url) {
  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    null,
    BOOKMARK_DIALOG_URL,
    {
      isSubDialog: true,
      callback: async dialog => {
        await dialog.document.mozSubdialogReady;
        // The add-bookmark dialog opens with an empty location, which keeps
        // the accept button disabled. Set a URL and fire an input event so the
        // button enables before we confirm.
        const locationField = dialog.document.getElementById(
          "editBMPanel_locationField"
        );
        locationField.value = url;
        locationField.dispatchEvent(
          new dialog.Event("input", { bubbles: true })
        );
        EventUtils.synthesizeKey("VK_RETURN", {}, dialog);
      },
    }
  );
  await activateContextMenuItem(
    triggerEl,
    "sidebar-bookmarks-context-add-bookmark"
  );
  await dialogPromise;
  return PlacesUIUtils.lastBookmarkDialogDeferred.promise;
}

/**
 * Opens a bookmarks folder and waits for its contents to render.
 *
 * @param {HTMLDetailsElement} folderDetails - The folder's details element.
 */
async function openFolder(folderDetails) {
  if (!folderDetails.open) {
    folderDetails.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      folderDetails,
      { attributes: true },
      () => folderDetails.open
    );
  }
}

/**
 * Opens the Bookmarks Toolbar folder in the supplied list.
 *
 * @param {SidebarBookmarkList} tabList - The list containing the toolbar folder.
 * @returns {HTMLDetailsElement} The opened toolbar folder.
 */
async function openToolbarFolder(tabList) {
  const toolbarFolder = await findBookmarkItemByGuid(
    tabList,
    "folderEls",
    PlacesUtils.bookmarks.toolbarGuid
  );
  await openFolder(toolbarFolder);
  return toolbarFolder;
}

/**
 * Finds a bookmark row, expanding its ancestor folders as needed.
 *
 * @param {SidebarBookmarkList} tabList - The sidebar's root bookmark list.
 * @param {object} bookmark - The bookmark returned by Places insertion.
 * @returns {SidebarBookmarkRow} The matching rendered bookmark row.
 */
async function getBookmarkRow(tabList, bookmark) {
  const list = await getBookmarkList(tabList, bookmark.parentGuid);
  return findBookmarkItemByGuid(list, "rowEls", bookmark.guid);
}

/**
 * Finds a bookmark folder, expanding its ancestor folders as needed.
 *
 * @param {SidebarBookmarkList} tabList - The sidebar's root bookmark list.
 * @param {object} folder - The folder returned by Places insertion.
 * @returns {HTMLDetailsElement} The matching rendered folder.
 */
async function getBookmarkFolder(tabList, folder) {
  const list = await getBookmarkList(tabList, folder.parentGuid);
  return findBookmarkItemByGuid(list, "folderEls", folder.guid);
}

/**
 * Opens a bookmark's ancestor folders and returns its containing list.
 *
 * @param {SidebarBookmarkList} tabList - The sidebar's root bookmark list.
 * @param {string} parentGuid - The GUID of the containing Places folder.
 * @returns {SidebarBookmarkList} The list containing the requested bookmark or folder.
 */
async function getBookmarkList(tabList, parentGuid) {
  const path = [];
  while (parentGuid !== PlacesUtils.bookmarks.rootGuid) {
    path.unshift(parentGuid);
    parentGuid = (await PlacesUtils.bookmarks.fetch(parentGuid)).parentGuid;
  }

  let list = tabList;
  for (const guid of path) {
    const folder = await findBookmarkItemByGuid(list, "folderEls", guid);
    await openFolder(folder);
    list = folder.querySelector("sidebar-bookmark-list");
  }
  return list;
}

/**
 * Waits for a bookmark row or folder with a given GUID.
 *
 * @param {SidebarBookmarkList} list - The list to search.
 * @param {string} query - The node list from `SidebarBookmarkList.queries`.
 * @param {string} guid - The Places GUID to match.
 * @returns {HTMLDetailsElement | SidebarBookmarkRow} The matching rendered element.
 */
async function findBookmarkItemByGuid(list, query, guid) {
  return BrowserTestUtils.waitForMutationCondition(
    list.shadowRoot,
    { childList: true, subtree: true },
    () => [...list[query]].find(element => element.guid === guid)
  );
}

/**
 * Creates a Recently Bookmarked query and a Recent Tags query with one tag.
 *
 * @param {string} url - The URL used for the query result.
 * @param {string} tag - The tag used for the tags-root query.
 * @returns {object} The created bookmarks for use and cleanup.
 */
async function createSmartBookmarks(url, tag) {
  // "Recently Bookmarked" style smart bookmark.
  const recentBookmark = await addBookmark({ title: "Recent Page", url });
  const recentSmart = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: "Recently Bookmarked",
    url: "place:queryType=1&sort=12&maxResults=10&excludeQueries=1&excludeItemIfParentHasAnnotation=livemark%2FfeedURI",
  });

  // "Recent Tags" style smart bookmark with one bookmark tagged so the
  // RESULTS_AS_TAGS_ROOT query yields a tag container.
  await PlacesUtils.tagging.tagURI(Services.io.newURI(url), [tag]);
  const tagsSmart = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: "Recent Tags",
    url: `place:type=${Ci.nsINavHistoryQueryOptions.RESULTS_AS_TAGS_ROOT}&sort=1&maxResults=10`,
  });
  return { recentBookmark, recentSmart, tagsSmart };
}

/**
 * Removes the smart-bookmark fixture created by createSmartBookmarks().
 *
 * @param {object} smartBookmarks - The fixture returned by createSmartBookmarks().
 * @param {object} smartBookmarks.recentBookmark - The regular tagged bookmark.
 * @param {object} smartBookmarks.recentSmart - The Recently Bookmarked query.
 * @param {object} smartBookmarks.tagsSmart - The Recent Tags query.
 * @param {string} url - The URL to untag.
 * @param {string} tag - The tag to remove.
 */
async function removeSmartBookmarks(
  { recentBookmark, recentSmart, tagsSmart },
  url,
  tag
) {
  await PlacesUtils.tagging.untagURI(Services.io.newURI(url), [tag]);
  await PlacesUtils.bookmarks.remove(tagsSmart.guid);
  await PlacesUtils.bookmarks.remove(recentSmart.guid);
  await PlacesUtils.bookmarks.remove(recentBookmark.guid);
}

add_setup(async function () {
  await PlacesUtils.bookmarks.eraseEverything();
  await SidebarTestUtils.waitForInitialized(window);
  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
    SidebarTestUtils.closePanel(window);
  });
});

add_task(async function test_bookmarks_panel_opens() {
  const { component } = await showBookmarksSidebar();
  ok(component, "Bookmarks panel component is present.");

  ok(component.panelHeader, "Panel header is rendered.");
  ok(component.searchInput, "Search input is rendered.");

  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_shows_toolbar_folder() {
  const bookmark = await addBookmark();

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );

  const folders = tabList.folderEls;
  Assert.greater(folders.length, 0, "At least one folder is rendered.");

  const summaries = [...folders].map(d =>
    d.querySelector("summary").textContent.trim()
  );
  ok(
    summaries.some(s => !!s.length),
    "Folder summaries have content."
  );

  await PlacesUtils.bookmarks.remove(bookmark);
  SidebarTestUtils.closePanel(window);
});

async function testBookmarkTitleRendering(bookmarkInfo, title, message) {
  const bookmark = await addBookmark(bookmarkInfo);

  const { component } = await showBookmarksSidebar();
  const row = await getBookmarkRow(component.bookmarkList, bookmark);
  Assert.equal(row.title, title, message);

  await PlacesUtils.bookmarks.remove(bookmark);
  SidebarTestUtils.closePanel(window);
}

add_task(async function test_bookmarks_shows_bookmark_in_folder() {
  await testBookmarkTitleRendering(
    { title: "My Test Page", url: "https://example.com" },
    "My Test Page",
    "If a bookmark has title set, use that title."
  );
  await testBookmarkTitleRendering(
    { title: "", url: "https://example.com" },
    "example.com/",
    "If a bookmark has no title, generate one from its URI."
  );
  await testBookmarkTitleRendering(
    { title: "", url: "about:robots" },
    PlacesUIUtils.promptLocalization.formatValueSync("places-no-title"),
    "If the URI is an about: page, use placeholder string."
  );
});

add_task(async function test_bookmarks_search_filters_results() {
  const bm1 = await addBookmark({
    title: "Apple Cider",
    url: "https://example.com/",
  });
  const bm2 = await addBookmark({
    title: "Banana Split",
    url: "https://example.org/",
  });

  const { component, contentWindow } = await showBookmarksSidebar();
  ok(component.searchInput, "Search input is present.");

  info("Search for 'Apple'.");
  EventUtils.synthesizeMouseAtCenter(component.searchInput, {}, contentWindow);
  EventUtils.sendString("Apple", contentWindow);

  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => component.searchResults?.length > 0
  );

  Assert.equal(component.searchQuery, "Apple", "Search query is set.");
  const results = component.searchResults;
  Assert.equal(results.length, 1, "One search result found.");
  Assert.equal(results[0].title, "Apple Cider", "Correct bookmark found.");

  info("Search for a term with no matches.");
  EventUtils.synthesizeMouseAtCenter(component.searchInput, {}, contentWindow);
  EventUtils.sendString(" ZZZNOMATCH", contentWindow);
  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => component.searchResults?.length === 0 && component.searchQuery !== ""
  );
  Assert.equal(
    component.searchResults.length,
    0,
    "No results for bogus query."
  );

  await PlacesUtils.bookmarks.remove(bm1);
  await PlacesUtils.bookmarks.remove(bm2);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_search_results_show_tab_list() {
  const bm = await addBookmark({ title: "SearchTarget", url: TEST_URL });

  const { component, contentWindow } = await showBookmarksSidebar();

  EventUtils.synthesizeMouseAtCenter(component.searchInput, {}, contentWindow);
  EventUtils.sendString("SearchTarget", contentWindow);

  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => component.bookmarkList && component.searchResults?.length === 1
  );

  ok(component.bookmarkList, "Search results tab list is shown.");

  const header = component.shadowRoot.querySelector(
    "[data-l10n-id='firefoxview-search-results-header']"
  );
  ok(header, "Search results header is shown.");

  await PlacesUtils.bookmarks.remove(bm);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_searchbox_focus_and_context_menu() {
  const { component, contentWindow } = await showBookmarksSidebar();
  const { searchInput } = component;

  ok(component.shadowRoot.activeElement, "check activeElement is present");
  Assert.equal(
    component.shadowRoot.activeElement,
    searchInput,
    "Check search box is focused"
  );

  const promisePopupShown = BrowserTestUtils.waitForEvent(
    contentWindow,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    searchInput,
    { type: "contextmenu", button: 2 },
    contentWindow
  );
  const { target: menu } = await promisePopupShown;
  Assert.equal(
    menu.id,
    "textbox-contextmenu",
    "The edit context menu is shown for the search input."
  );
  menu.hidePopup();

  SidebarController.hide();
});

add_task(async function test_bookmarks_folder_expand_collapse() {
  const folder = await addFolder("ExpandableFolder");
  await addBookmark({ title: "Inside Folder", parentGuid: folder.guid });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);
  ok(toolbarDetails, "Toolbar folder details element found.");

  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => nestedList.folderEls[0]
  );

  const folderDetails = nestedList.folderEls[0];
  ok(folderDetails, "Nested folder is rendered as a <details> element.");

  const summary = folderDetails.querySelector("summary");
  Assert.equal(
    summary.textContent.trim(),
    "ExpandableFolder",
    "Folder label matches."
  );

  const wasOpen = folderDetails.open;
  summary.click();
  await BrowserTestUtils.waitForMutationCondition(
    folderDetails,
    { attributes: true },
    () => folderDetails.open !== wasOpen
  );
  Assert.notEqual(folderDetails.open, wasOpen, "Folder toggled open/closed.");

  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_panel_updates_on_places_event() {
  const { component } = await showBookmarksSidebar();

  const bm = await addBookmark({ title: "Dynamic Bookmark" });

  function findInTree(node, title) {
    if (node.title === title) {
      return true;
    }
    for (const child of node.children ?? []) {
      if (findInTree(child, title)) {
        return true;
      }
    }
    return false;
  }

  await BrowserTestUtils.waitForMutationCondition(
    component.bookmarkList.shadowRoot,
    { childList: true, subtree: true },
    () => findInTree(component.bookmarks, "Dynamic Bookmark")
  );

  await PlacesUtils.bookmarks.remove(bm);

  await BrowserTestUtils.waitForMutationCondition(
    component.bookmarkList.shadowRoot,
    { childList: true, subtree: true },
    () => !findInTree(component.bookmarks, "Dynamic Bookmark")
  );

  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_context_menu_bookmark() {
  const bm = await addBookmark({ title: "Context Menu Bookmark" });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);

  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => nestedList.rowEls[0]
  );

  const row = nestedList.rowEls[0];
  const contextMenu = SidebarController.currentContextMenu;
  await openAndWaitForContextMenu(contextMenu, row.mainEl, () => {});

  ok(
    !document.getElementById("sidebar-bookmarks-context-open-in-tab").hidden,
    "Open in tab is visible for a bookmark."
  );
  ok(
    document.getElementById("sidebar-bookmarks-context-open-all-bookmarks")
      .hidden,
    "Open all bookmarks is hidden for a bookmark."
  );
  ok(
    !document.getElementById("sidebar-bookmarks-context-edit-bookmark").hidden,
    "Edit bookmark is visible."
  );
  ok(
    !document.getElementById("sidebar-bookmarks-context-delete-bookmark")
      .hidden,
    "Delete bookmark is visible."
  );
  ok(
    !document.getElementById("sidebar-bookmarks-context-copy-link").hidden,
    "Copy link is visible for a bookmark."
  );
  ok(
    document.getElementById("sidebar-bookmarks-context-show-in-folder").hidden,
    "Show in Folder is hidden when not searching."
  );

  contextMenu.hidePopup();
  await PlacesUtils.bookmarks.remove(bm);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_search_context_menu_show_in_folder() {
  const folder = await addFolder("Outer");
  const bm = await addBookmark({
    title: "FindMe",
    url: TEST_URL,
    parentGuid: folder.guid,
  });

  const { component, contentWindow } = await showBookmarksSidebar();

  info("Search for the nested bookmark.");
  EventUtils.synthesizeMouseAtCenter(component.searchInput, {}, contentWindow);
  EventUtils.sendString("FindMe", contentWindow);
  await BrowserTestUtils.waitForMutationCondition(
    component.shadowRoot,
    { childList: true, subtree: true },
    () => component.searchResults?.length === 1
  );

  const resultsList = component.bookmarkList;
  await BrowserTestUtils.waitForMutationCondition(
    resultsList.shadowRoot,
    { childList: true, subtree: true },
    () => resultsList.rowEls[0]?.guid === bm.guid
  );
  const row = resultsList.rowEls[0];

  const contextMenu = SidebarController.currentContextMenu;
  await openAndWaitForContextMenu(contextMenu, row.mainEl, () => {});

  ok(
    !document.getElementById("sidebar-bookmarks-context-show-in-folder").hidden,
    "Show in Folder is visible in search results."
  );
  ok(
    document.getElementById("sidebar-bookmarks-context-copy-link").hidden,
    "Copy Link is hidden in search results."
  );
  ok(
    document.getElementById("sidebar-bookmarks-context-paste").hidden,
    "Paste is hidden in search results."
  );
  for (const id of [
    "sidebar-bookmarks-context-sep-edit-copy",
    "sidebar-bookmarks-context-sep-add",
    "sidebar-bookmarks-context-add-bookmark",
    "sidebar-bookmarks-context-add-folder",
    "sidebar-bookmarks-context-add-separator",
  ]) {
    ok(
      document.getElementById(id).hidden,
      `${id} is hidden in search results.`
    );
  }

  info("Activate Show in Folder.");
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
  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );

  const findRow = list => {
    if (!list) {
      return null;
    }
    for (const r of list.rowEls ?? []) {
      if (r.guid === bm.guid) {
        return r;
      }
    }
    for (const details of list.folderEls ?? []) {
      const sublist = details.querySelector("sidebar-bookmark-list");
      const found = findRow(sublist);
      if (found) {
        return found;
      }
    }
    return null;
  };

  await TestUtils.waitForCondition(
    () => findRow(tabList),
    "The bookmark row appears in the tree view after Show in Folder."
  );
  const revealedRow = findRow(tabList);
  await TestUtils.waitForCondition(
    () => revealedRow.selected,
    "The bookmark row is visually selected after Show in Folder."
  );

  await PlacesUtils.bookmarks.remove(bm);
  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_context_menu_folder() {
  const folder = await addFolder("Context Menu Folder");
  await addBookmark({ title: "In Folder", parentGuid: folder.guid });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);

  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => nestedList.folderEls[0]
  );

  const folderDetails = nestedList.folderEls[0];
  const summary = folderDetails.querySelector("summary");

  const contextMenu = SidebarController.currentContextMenu;
  await openAndWaitForContextMenu(contextMenu, summary, () => {});

  ok(
    !document.getElementById("sidebar-bookmarks-context-open-all-bookmarks")
      .hidden,
    "Open all bookmarks is visible for a folder."
  );
  ok(
    !document.getElementById("sidebar-bookmarks-context-open-all-bookmarks")
      .disabled,
    "Open all bookmarks is enabled for a folder with bookmark items."
  );
  ok(
    document.getElementById("sidebar-bookmarks-context-open-in-tab").hidden,
    "Open in tab is hidden for a folder."
  );
  ok(
    document.getElementById("sidebar-bookmarks-context-copy-link").hidden,
    "Copy link is hidden for a folder."
  );
  ok(
    !document.getElementById("sidebar-bookmarks-context-sort-by-name").hidden,
    "Sort by name is visible for a folder."
  );

  contextMenu.hidePopup();
  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  SidebarTestUtils.closePanel(window);
});

add_task(
  async function test_bookmarks_context_menu_folder_without_bookmark_items() {
    const folder = await addFolder("Subfolders Only");
    await addFolder("Nested Folder", folder.guid);

    const { component } = await showBookmarksSidebar();
    const tabList = component.bookmarkList;

    const toolbarDetails = await openToolbarFolder(tabList);

    const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
    await BrowserTestUtils.waitForMutationCondition(
      nestedList.shadowRoot,
      { childList: true, subtree: true },
      () => nestedList.folderEls[0]
    );

    const folderDetails = nestedList.folderEls[0];
    const summary = folderDetails.querySelector("summary");

    const contextMenu = SidebarController.currentContextMenu;
    await openAndWaitForContextMenu(contextMenu, summary, () => {});

    ok(
      !document.getElementById("sidebar-bookmarks-context-open-all-bookmarks")
        .hidden,
      "Open all bookmarks is visible for a folder with only subfolders."
    );
    ok(
      document.getElementById("sidebar-bookmarks-context-open-all-bookmarks")
        .disabled,
      "Open all bookmarks is disabled for a folder with no bookmark items."
    );

    contextMenu.hidePopup();
    await PlacesUtils.bookmarks.remove({ guid: folder.guid });
    SidebarTestUtils.closePanel(window);
  }
);

add_task(async function test_add_folder_before_right_clicked_bookmark() {
  await addBookmark({ title: "Alpha", url: "https://example.com/a" });
  const bmB = await addBookmark({
    title: "Beta",
    url: "https://example.com/b",
  });
  await addBookmark({ title: "Gamma", url: "https://example.com/c" });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  const rowB = await getBookmarkRow(tabList, bmB);
  const { index: indexB } = await PlacesUtils.bookmarks.fetch(bmB.guid);

  const newFolderGuid = await addFolderViaContextMenu(rowB.mainEl);
  info(`newFolderGuid: ${newFolderGuid}`);
  const newFolder = await PlacesUtils.bookmarks.fetch(newFolderGuid);
  info(`newFolder index: ${newFolder.index}`);

  is(
    newFolder.parentGuid,
    PlacesUtils.bookmarks.toolbarGuid,
    "New folder is created in the right-clicked bookmark's parent."
  );
  is(
    newFolder.index,
    indexB,
    "New folder is created just before the right-clicked bookmark."
  );
  const movedB = await PlacesUtils.bookmarks.fetch(bmB.guid);
  is(
    movedB.index,
    indexB + 1,
    "The right-clicked bookmark is pushed down by the new folder."
  );

  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_add_folder_into_right_clicked_folder() {
  const folder = await addFolder("Parent Folder");
  await addBookmark({
    title: "Child One",
    url: "https://example.com/1",
    parentGuid: folder.guid,
  });
  await addBookmark({
    title: "Child Two",
    url: "https://example.com/2",
    parentGuid: folder.guid,
  });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  const folderDetails = await getBookmarkFolder(tabList, folder);
  const summary = folderDetails.querySelector("summary");

  const newFolderGuid = await addFolderViaContextMenu(summary);

  const newFolder = await PlacesUtils.bookmarks.fetch(newFolderGuid);
  is(
    newFolder.parentGuid,
    folder.guid,
    "New folder is created inside the right-clicked folder."
  );
  is(
    newFolder.index,
    2,
    "New folder is appended at the end of the right-clicked folder."
  );

  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_add_bookmark_before_right_clicked_bookmark() {
  await addBookmark({ title: "Alpha", url: "https://example.com/a" });
  const bmB = await addBookmark({
    title: "Beta",
    url: "https://example.com/b",
  });
  await addBookmark({ title: "Gamma", url: "https://example.com/c" });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  const rowB = await getBookmarkRow(tabList, bmB);
  const { index: indexB } = await PlacesUtils.bookmarks.fetch(bmB.guid);

  const newBookmarkGuid = await addBookmarkViaContextMenu(
    rowB.mainEl,
    "https://example.com/new"
  );
  const newBookmark = await PlacesUtils.bookmarks.fetch(newBookmarkGuid);

  is(
    newBookmark.parentGuid,
    PlacesUtils.bookmarks.toolbarGuid,
    "New bookmark is created in the right-clicked bookmark's parent."
  );
  is(
    newBookmark.index,
    indexB,
    "New bookmark is created just before the right-clicked bookmark."
  );
  const movedB = await PlacesUtils.bookmarks.fetch(bmB.guid);
  is(
    movedB.index,
    indexB + 1,
    "The right-clicked bookmark is pushed down by the new bookmark."
  );

  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_add_bookmark_into_right_clicked_folder() {
  const folder = await addFolder("Parent Folder");
  await addBookmark({
    title: "Child One",
    url: "https://example.com/1",
    parentGuid: folder.guid,
  });
  await addBookmark({
    title: "Child Two",
    url: "https://example.com/2",
    parentGuid: folder.guid,
  });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  const folderDetails = await getBookmarkFolder(tabList, folder);
  const summary = folderDetails.querySelector("summary");

  const newBookmarkGuid = await addBookmarkViaContextMenu(
    summary,
    "https://example.com/new"
  );

  const newBookmark = await PlacesUtils.bookmarks.fetch(newBookmarkGuid);
  is(
    newBookmark.parentGuid,
    folder.guid,
    "New bookmark is created inside the right-clicked folder."
  );
  is(
    newBookmark.index,
    2,
    "New bookmark is appended at the end of the right-clicked folder."
  );

  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_copy_writes_all_flavors() {
  const bookmark = await addBookmark({
    title: "Copy Me",
    url: "https://example.com/copy",
  });

  const { component } = await showBookmarksSidebar();
  const row = await getBookmarkRow(component.bookmarkList, bookmark);
  await activateContextMenuItem(row.mainEl, "sidebar-bookmarks-context-copy");

  for (const flavor of [
    PlacesUtils.TYPE_X_MOZ_PLACE,
    PlacesUtils.TYPE_X_MOZ_URL,
    PlacesUtils.TYPE_PLAINTEXT,
  ]) {
    ok(
      Services.clipboard.hasDataMatchingFlavors(
        [flavor],
        Ci.nsIClipboard.kGlobalClipboard
      ),
      `Clipboard has the ${flavor} flavor.`
    );
  }

  // Check text/plain flavor saved in clipboard holds the expected bookmark url
  const xferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  xferable.init(null);
  xferable.addDataFlavor(PlacesUtils.TYPE_PLAINTEXT);
  Services.clipboard.getData(xferable, Ci.nsIClipboard.kGlobalClipboard);
  const plain = {};
  xferable.getTransferData(PlacesUtils.TYPE_PLAINTEXT, plain);
  is(
    plain.value.QueryInterface(Ci.nsISupportsString).data,
    "https://example.com/copy",
    "text/plain flavor holds the bookmark URL."
  );

  Services.clipboard.emptyClipboard(Ci.nsIClipboard.kGlobalClipboard);
  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_copy_paste_into_folder() {
  const bm = await addBookmark({
    title: "Copy and Paste Me",
    url: "https://example.com/paste",
  });
  const folder = await addFolder("Paste Target Folder");
  await addBookmark({
    title: "Inside Folder Already",
    url: "https://example.com/existing-in-paste-folder",
    parentGuid: folder.guid,
  });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  const row = await getBookmarkRow(tabList, bm);
  await activateContextMenuItem(row.mainEl, "sidebar-bookmarks-context-copy");

  const folderDetails = await getBookmarkFolder(tabList, folder);
  const summary = folderDetails.querySelector("summary");
  const promiseAdded = PlacesTestUtils.waitForNotification("bookmark-added");

  await activateContextMenuItem(summary, "sidebar-bookmarks-context-paste");
  const [{ guid: pastedGuid }] = await promiseAdded;

  const pasted = await PlacesUtils.bookmarks.fetch(pastedGuid);
  is(
    pasted.parentGuid,
    folder.guid,
    "The copied bookmark is pasted inside the folder."
  );
  is(
    pasted.url.href,
    "https://example.com/paste",
    "The pasted bookmark has the right URL."
  );
  ok(
    await PlacesUtils.bookmarks.fetch(bm.guid),
    "The original bookmark still exists after a copy."
  );

  Services.clipboard.emptyClipboard(Ci.nsIClipboard.kGlobalClipboard);
  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_cut_moves_after_paste() {
  const bm = await addBookmark({
    title: "Cut Me",
    url: "https://example.com/cut",
  });
  const folder = await addFolder("Paste Target Folder");
  await addBookmark({
    title: "Inside Folder Already",
    url: "https://example.com/existing",
    parentGuid: folder.guid,
  });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  const row = await getBookmarkRow(tabList, bm);
  await activateContextMenuItem(row.mainEl, "sidebar-bookmarks-context-cut");

  ok(
    await PlacesUtils.bookmarks.fetch(bm.guid),
    "The bookmark still exists after being cut, before pasting."
  );

  const folderDetails = await getBookmarkFolder(tabList, folder);
  const summary = folderDetails.querySelector("summary");
  await activateContextMenuItem(summary, "sidebar-bookmarks-context-paste");

  await TestUtils.waitForCondition(async () => {
    const moved = await PlacesUtils.bookmarks.fetch(bm.guid);
    return moved?.parentGuid === folder.guid;
  }, "Cut bookmark is moved into the folder.");

  const moved = await PlacesUtils.bookmarks.fetch(bm.guid);
  isnot(
    moved.parentGuid,
    PlacesUtils.bookmarks.toolbarGuid,
    "The bookmark is no longer in its original parent."
  );

  Services.clipboard.emptyClipboard(Ci.nsIClipboard.kGlobalClipboard);
  await PlacesUtils.bookmarks.eraseEverything();
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_delete_via_context_menu() {
  const bookmark = await addBookmark({ title: "Delete Me" });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const row = await getBookmarkRow(tabList, bookmark);

  const contextMenu = SidebarController.currentContextMenu;
  const promiseRemoved =
    PlacesTestUtils.waitForNotification("bookmark-removed");
  await openAndWaitForContextMenu(contextMenu, row.mainEl, () =>
    contextMenu.activateItem(
      document.getElementById("sidebar-bookmarks-context-delete-bookmark")
    )
  );
  await promiseRemoved;

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => !row.isConnected
  );

  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_empty_folder_shows_label() {
  const folder = await addFolder("Empty Folder");

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);

  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => nestedList.folderLabelEl
  );

  ok(nestedList.folderLabelEl, "Empty folder renders as a label element.");
  Assert.equal(
    nestedList.folderLabelEl.textContent.trim(),
    "Empty Folder",
    "Empty folder label text matches."
  );
  Assert.equal(
    nestedList.folderLabelEl.getAttribute("role"),
    "listitem",
    "Empty folder has a listitem role."
  );
  Assert.equal(
    nestedList.folderLabelEl.getAttribute("aria-label"),
    "Empty Folder",
    "Empty folder has an accessible name matching its title."
  );

  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_drag_reorders_items() {
  const bmA = await addBookmark({
    title: "Drag First",
    url: "https://example.com/a",
  });
  const bmB = await addBookmark({
    title: "Drag Second",
    url: "https://example.com/b",
  });

  const { component, contentWindow } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const rowA = await getBookmarkRow(tabList, bmA);
  const rowB = await getBookmarkRow(tabList, bmB);
  ok(rowA && rowB, "Both bookmark rows are visible.");

  let fetchA = await PlacesUtils.bookmarks.fetch(bmA.guid);
  let fetchB = await PlacesUtils.bookmarks.fetch(bmB.guid);
  Assert.less(fetchA.index, fetchB.index, "Bookmark A is before B initially.");

  const rectB = rowB.getBoundingClientRect();
  EventUtils.synthesizeDrop(
    rowA,
    rowB,
    null,
    "move",
    contentWindow,
    contentWindow,
    {
      clientX: rectB.left + rectB.width / 2,
      clientY: rectB.top + rectB.height * 0.75,
      _domDispatchOnly: true,
    }
  );

  await TestUtils.waitForCondition(async () => {
    fetchA = await PlacesUtils.bookmarks.fetch(bmA.guid);
    fetchB = await PlacesUtils.bookmarks.fetch(bmB.guid);
    return fetchA.index > fetchB.index;
  }, "Bookmark A moves after B.");

  await PlacesUtils.bookmarks.remove(bmA.guid);
  await PlacesUtils.bookmarks.remove(bmB.guid);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_drag_into_folder() {
  const folder = await addFolder("Drop Target Folder");
  await addBookmark({
    title: "Inside Folder Already",
    parentGuid: folder.guid,
  });
  const bm = await addBookmark({
    title: "Drag To Folder",
    url: "https://example.com/drag",
  });

  const { component, contentWindow } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const bookmarkRow = await getBookmarkRow(tabList, bm);
  const folderSummary = (
    await getBookmarkFolder(tabList, folder)
  ).querySelector("summary");
  ok(
    bookmarkRow && folderSummary,
    "Bookmark row and folder summary are found."
  );

  const rectSummary = folderSummary.getBoundingClientRect();
  EventUtils.synthesizeDrop(
    bookmarkRow,
    folderSummary,
    null,
    "move",
    contentWindow,
    contentWindow,
    {
      clientX: rectSummary.left + rectSummary.width / 2,
      clientY: rectSummary.top + rectSummary.height * 0.5,
      _domDispatchOnly: true,
    }
  );

  await TestUtils.waitForCondition(async () => {
    const fetchBm = await PlacesUtils.bookmarks.fetch(bm.guid);
    return fetchBm.parentGuid === folder.guid;
  }, "Bookmark is moved into the folder.");

  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_drag_hover_expands_folder() {
  const folder = await addFolder("Hover Expand Folder");
  await addBookmark({
    title: "Inside Hover Folder",
    parentGuid: folder.guid,
  });
  const bm = await addBookmark({
    title: "Hover Drag Source",
    url: "https://example.com/hover-drag",
  });

  const { component, contentWindow } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const bookmarkRow = await getBookmarkRow(tabList, bm);
  const folderDetails = await getBookmarkFolder(tabList, folder);
  const folderSummary = folderDetails.querySelector("summary");
  ok(bookmarkRow && folderSummary, "Source row and target folder are found.");
  ok(!folderDetails.open, "Target folder starts collapsed.");

  EventUtils.startDragSession(contentWindow, "move");
  try {
    const rect = folderSummary.getBoundingClientRect();
    EventUtils.synthesizeDragOver(
      bookmarkRow,
      folderSummary,
      null,
      "move",
      contentWindow,
      contentWindow,
      {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height * 0.5,
        _domDispatchOnly: true,
      }
    );

    await TestUtils.waitForCondition(
      () => folderDetails.open,
      "Collapsed folder auto-expands while hovered during a drag."
    );

    const bmAfter = await PlacesUtils.bookmarks.fetch(bm.guid);
    Assert.equal(
      bmAfter.parentGuid,
      PlacesUtils.bookmarks.toolbarGuid,
      "Hovering must not move the dragged bookmark."
    );
  } finally {
    const sess = contentWindow.windowUtils.dragSession;
    if (sess) {
      sess.endDragSession(true);
    }
  }

  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  await PlacesUtils.bookmarks.remove({ guid: bm.guid });
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_drag_url_to_panel() {
  const folder = await addFolder("URL Drop Target Folder");
  await addBookmark({
    title: "Existing Bookmark",
    parentGuid: folder.guid,
  });

  const { component, contentWindow } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const folderSummary = (
    await getBookmarkFolder(tabList, folder)
  ).querySelector("summary");
  ok(folderSummary, "Drop target folder summary found.");

  const rectSummary = folderSummary.getBoundingClientRect();
  const promiseAdded = PlacesTestUtils.waitForNotification("bookmark-added");
  // Use the browser tab as a neutral external drag source so the sidebar's
  // own dragstart handler does not add TYPE_X_MOZ_PLACE data that would take
  // priority over the explicit text/x-moz-url data.
  EventUtils.synthesizeDrop(
    gBrowser.selectedTab,
    folderSummary,
    [
      [
        {
          type: "text/x-moz-url",
          data: "https://example.com/dropped\nDropped URL",
        },
      ],
    ],
    "copy",
    window,
    contentWindow,
    {
      clientX: rectSummary.left + rectSummary.width / 2,
      clientY: rectSummary.top + rectSummary.height * 0.5,
      _domDispatchOnly: true,
    }
  );

  await promiseAdded;

  const fetchInfo = await PlacesUtils.bookmarks.fetch({
    url: "https://example.com/dropped",
  });
  ok(fetchInfo, "Dropped URL was bookmarked.");
  Assert.equal(
    fetchInfo.parentGuid,
    folder.guid,
    "Dropped URL bookmark is in the target folder."
  );

  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_drag_tab_to_panel() {
  const bm = await addBookmark({ title: "Tab Drop Target" });
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/tab-page"
  );

  const { component, contentWindow } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const targetRow = await getBookmarkRow(tabList, bm);
  ok(targetRow, "Drop target bookmark row found.");

  const rectRow = targetRow.getBoundingClientRect();
  const promiseAdded = PlacesTestUtils.waitForNotification("bookmark-added");
  EventUtils.synthesizeDrop(
    tab,
    targetRow,
    null,
    "copy",
    window,
    contentWindow,
    {
      clientX: rectRow.left + rectRow.width / 2,
      clientY: rectRow.top + rectRow.height * 0.75,
      _domDispatchOnly: true,
    }
  );

  await promiseAdded;

  const fetchInfo = await PlacesUtils.bookmarks.fetch({
    url: "https://example.com/tab-page",
  });
  ok(fetchInfo, "Tab page was bookmarked after drag.");
  Assert.equal(
    fetchInfo.parentGuid,
    PlacesUtils.bookmarks.toolbarGuid,
    "Tab bookmark is in the toolbar folder."
  );

  await PlacesUtils.bookmarks.remove(fetchInfo.guid);
  BrowserTestUtils.removeTab(tab);
  await PlacesUtils.bookmarks.remove(bm.guid);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_smart_bookmark_renders_as_folder() {
  const url = "https://example.com/recent-smart";
  const tag = "regression-tag";
  const smartBookmarks = await createSmartBookmarks(url, tag);
  const { recentSmart, tagsSmart } = smartBookmarks;

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);
  const toolbarList = toolbarDetails.querySelector("sidebar-bookmark-list");

  await BrowserTestUtils.waitForMutationCondition(
    toolbarList.shadowRoot,
    { childList: true, subtree: true },
    () =>
      [...toolbarList.folderEls].some(
        d => d.guid === recentSmart.guid || d.guid === tagsSmart.guid
      )
  );

  const recentFolder = [...toolbarList.folderEls].find(
    d => d.guid === recentSmart.guid
  );
  ok(recentFolder, "Recently Bookmarked renders as a folder.");
  Assert.equal(
    recentFolder.dataset.folderKind,
    "place-container",
    "Recently Bookmarked has the place-container folder kind."
  );

  const tagsFolder = [...toolbarList.folderEls].find(
    d => d.guid === tagsSmart.guid
  );
  ok(tagsFolder, "Recent Tags renders as a folder.");
  Assert.equal(
    tagsFolder.dataset.folderKind,
    "tags-root",
    "Recent Tags has the tags-root folder kind."
  );

  await openFolder(tagsFolder);

  const tagsList = tagsFolder.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    tagsList.shadowRoot,
    { childList: true, subtree: true },
    () => [...tagsList.folderEls].length
  );

  const tagContainers = [...tagsList.folderEls];
  Assert.greater(
    tagContainers.length,
    0,
    "Recent Tags renders each tag as a child folder."
  );
  ok(
    tagContainers.every(d => d.dataset.folderKind === "tag-container"),
    "Tag containers under Recent Tags are marked with the tag-container kind."
  );

  await removeSmartBookmarks(smartBookmarks, url, tag);
  SidebarController.hide();
});

add_task(async function test_bookmarks_smart_bookmark_uses_bookmark_guid() {
  // A folder-shortcut smart bookmark expands into the contents of a folder.
  // The expanded children must carry the bookmark guid (b.guid), not the page
  // guid (h.guid), otherwise selecting/editing/removing them targets the wrong
  // item.
  const folder = await addFolder("Shortcut Target");
  const innerBookmark = await addBookmark({
    title: "Inner Page",
    url: "https://example.com/inner-shortcut",
    parentGuid: folder.guid,
  });
  const { guid: pageGuid } = await PlacesUtils.history.fetch(
    "https://example.com/inner-shortcut"
  );
  Assert.notEqual(
    pageGuid,
    innerBookmark.guid,
    "Sanity check: page guid and bookmark guid differ."
  );

  const shortcut = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: "Folder Shortcut",
    url: `place:parent=${folder.guid}`,
  });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);
  const toolbarList = toolbarDetails.querySelector("sidebar-bookmark-list");

  await BrowserTestUtils.waitForMutationCondition(
    toolbarList.shadowRoot,
    { childList: true, subtree: true },
    () => [...toolbarList.folderEls].some(d => d.guid === shortcut.guid)
  );

  const shortcutFolder = [...toolbarList.folderEls].find(
    d => d.guid === shortcut.guid
  );
  ok(shortcutFolder, "Folder shortcut renders as a folder.");

  if (!shortcutFolder.open) {
    shortcutFolder.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      shortcutFolder,
      { attributes: true },
      () => shortcutFolder.open
    );
  }

  const shortcutList = shortcutFolder.querySelector("sidebar-bookmark-list");
  const innerRow = await BrowserTestUtils.waitForMutationCondition(
    shortcutList.shadowRoot,
    { childList: true, subtree: true },
    () => [...shortcutList.rowEls].find(row => row.title === "Inner Page")
  );
  ok(innerRow, "The folder's bookmark is visible inside the shortcut.");
  Assert.equal(
    innerRow.guid,
    innerBookmark.guid,
    "Expanded child carries the bookmark guid, not the page guid."
  );

  await PlacesUtils.bookmarks.remove(shortcut.guid);
  await PlacesUtils.bookmarks.remove(innerBookmark.guid);
  await PlacesUtils.bookmarks.remove(folder.guid);
  SidebarController.hide();
});

add_task(async function test_bookmarks_folder_shortcut_uses_folder_icon() {
  // A shortcut to a plain folder should render with a plain folder icon,
  // not the tag-container icon (bug 2047956).
  const folder = await addFolder("Icon Shortcut Target");
  const innerBookmark = await addBookmark({
    title: "Inner Page",
    url: "https://example.com/folder-shortcut-icon-inner",
    parentGuid: folder.guid,
  });
  const folderShortcut = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: "Folder Shortcut Icon Test",
    url: `place:parent=${folder.guid}`,
  });
  // A shortcut to an actual tag container should still render with the
  // tag-container icon.
  const taggedBookmark = await addBookmark({
    title: "Tagged Page",
    url: "https://example.com/folder-shortcut-icon-test",
  });
  await PlacesUtils.tagging.tagURI(
    Services.io.newURI("https://example.com/folder-shortcut-icon-test"),
    ["icon-test-tag"]
  );
  const tagShortcut = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    title: "Tag Shortcut Icon Test",
    url: "place:tag=icon-test-tag",
  });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  const toolbarDetails = await openToolbarFolder(tabList);
  const toolbarList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    toolbarList.shadowRoot,
    { childList: true, subtree: true },
    () =>
      [...toolbarList.folderEls].some(d => d.guid === folderShortcut.guid) &&
      [...toolbarList.folderEls].some(d => d.guid === tagShortcut.guid)
  );

  const folderShortcutEl = [...toolbarList.folderEls].find(
    d => d.guid === folderShortcut.guid
  );
  ok(folderShortcutEl, "Folder shortcut renders as a folder.");
  Assert.equal(
    folderShortcutEl.dataset.folderKind,
    "place-container",
    "Folder shortcut has the place-container folder kind, not tag-container."
  );

  const tagShortcutEl = [...toolbarList.folderEls].find(
    d => d.guid === tagShortcut.guid
  );
  ok(tagShortcutEl, "Tag shortcut renders as a folder.");
  Assert.equal(
    tagShortcutEl.dataset.folderKind,
    "tag-container",
    "Tag shortcut still has the tag-container folder kind."
  );

  await PlacesUtils.tagging.untagURI(
    Services.io.newURI("https://example.com/folder-shortcut-icon-test"),
    ["icon-test-tag"]
  );
  await PlacesUtils.bookmarks.remove(tagShortcut.guid);
  await PlacesUtils.bookmarks.remove(taggedBookmark.guid);
  await PlacesUtils.bookmarks.remove(folderShortcut.guid);
  await PlacesUtils.bookmarks.remove(innerBookmark.guid);
  await PlacesUtils.bookmarks.remove(folder.guid);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_smart_bookmark_drag_disabled() {
  const url = "https://example.com/recent-smart-drag";
  const tag = "regression-tag-drag";
  const smartBookmarks = await createSmartBookmarks(url, tag);
  const { recentSmart, tagsSmart } = smartBookmarks;

  // A regular bookmark used as the drag source for the drop-into attempts.
  const dragSource = await addBookmark({
    title: "Drag Source For Smart",
    url: "https://example.com/drag-source-smart",
  });

  const { component, contentWindow } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);
  const toolbarList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    toolbarList.shadowRoot,
    { childList: true, subtree: true },
    () =>
      [...toolbarList.folderEls].some(d => d.guid === recentSmart.guid) &&
      [...toolbarList.folderEls].some(d => d.guid === tagsSmart.guid) &&
      [...toolbarList.rowEls].some(r => r.guid === dragSource.guid)
  );

  const dispatchDragStart = el => {
    const event = new contentWindow.DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: new contentWindow.DataTransfer(),
    });
    el.dispatchEvent(event);
    return event;
  };

  info("A regular bookmark row can still be dragged.");
  const sourceRow = [...toolbarList.rowEls].find(
    r => r.guid === dragSource.guid
  );
  ok(
    !dispatchDragStart(sourceRow).defaultPrevented,
    "dragstart is allowed for a regular bookmark."
  );

  info("Items within Recently Bookmarked cannot be dragged.");
  const recentFolder = [...toolbarList.folderEls].find(
    d => d.guid === recentSmart.guid
  );
  await openFolder(recentFolder);
  const recentList = recentFolder.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    recentList.shadowRoot,
    { childList: true, subtree: true },
    () => [...recentList.rowEls].length
  );
  ok(recentList.readOnly, "Recently Bookmarked contents are read-only.");
  const recentChildRow = [...recentList.rowEls][0];
  ok(
    dispatchDragStart(recentChildRow).defaultPrevented,
    "dragstart is blocked for an item within Recently Bookmarked."
  );

  info("Dropping onto Recently Bookmarked does not move the bookmark into it.");
  const recentSummary = recentFolder.querySelector("summary");
  const recentRect = recentSummary.getBoundingClientRect();
  EventUtils.synthesizeDrop(
    sourceRow,
    recentSummary,
    null,
    "move",
    contentWindow,
    contentWindow,
    {
      clientX: recentRect.left + recentRect.width / 2,
      clientY: recentRect.top + recentRect.height * 0.5,
      _domDispatchOnly: true,
    }
  );
  let sourceInfo = await PlacesUtils.bookmarks.fetch(dragSource.guid);
  Assert.equal(
    sourceInfo.parentGuid,
    PlacesUtils.bookmarks.toolbarGuid,
    "Bookmark is not moved into the Recently Bookmarked query folder."
  );

  info("Tag subfolders within Recent Tags cannot be dragged.");
  const tagsFolder = [...toolbarList.folderEls].find(
    d => d.guid === tagsSmart.guid
  );
  await openFolder(tagsFolder);
  const tagsList = tagsFolder.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    tagsList.shadowRoot,
    { childList: true, subtree: true },
    () => [...tagsList.folderEls].length
  );
  ok(tagsList.readOnly, "Recent Tags contents are read-only.");
  const tagContainer = [...tagsList.folderEls][0];
  ok(
    dispatchDragStart(tagContainer.querySelector("summary")).defaultPrevented,
    "dragstart is blocked for a tag subfolder within Recent Tags."
  );

  info("Dropping onto Recent Tags does not move the bookmark into it.");
  const tagsSummary = tagsFolder.querySelector("summary");
  const tagsRect = tagsSummary.getBoundingClientRect();
  EventUtils.synthesizeDrop(
    sourceRow,
    tagsSummary,
    null,
    "move",
    contentWindow,
    contentWindow,
    {
      clientX: tagsRect.left + tagsRect.width / 2,
      clientY: tagsRect.top + tagsRect.height * 0.5,
      _domDispatchOnly: true,
    }
  );
  sourceInfo = await PlacesUtils.bookmarks.fetch(dragSource.guid);
  Assert.equal(
    sourceInfo.parentGuid,
    PlacesUtils.bookmarks.toolbarGuid,
    "Bookmark is not moved into the Recent Tags query folder."
  );

  await removeSmartBookmarks(smartBookmarks, url, tag);
  await PlacesUtils.bookmarks.remove(dragSource.guid);
  SidebarTestUtils.closePanel(window);
});

add_task(async function test_bookmarks_smart_bookmark_context_menu() {
  const url = "https://example.com/recent-smart-menu";
  const tag = "regression-tag-menu";
  const smartBookmarks = await createSmartBookmarks(url, tag);
  const { recentSmart, tagsSmart } = smartBookmarks;

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);
  const toolbarList = toolbarDetails.querySelector("sidebar-bookmark-list");

  await BrowserTestUtils.waitForMutationCondition(
    toolbarList.shadowRoot,
    { childList: true, subtree: true },
    () =>
      [...toolbarList.folderEls].some(d => d.guid === recentSmart.guid) &&
      [...toolbarList.folderEls].some(d => d.guid === tagsSmart.guid)
  );

  const contextMenu = SidebarController.currentContextMenu;
  const item = id => document.getElementById(id);
  const hideMenu = async () => {
    const promiseHidden = BrowserTestUtils.waitForPopupEvent(
      contextMenu,
      "hidden"
    );
    contextMenu.hidePopup();
    await promiseHidden;
  };

  info(
    "Context menu on a place-container smart bookmark (Recently Bookmarked)."
  );
  const recentFolder = [...toolbarList.folderEls].find(
    d => d.guid === recentSmart.guid
  );
  await openAndWaitForContextMenu(
    contextMenu,
    recentFolder.querySelector("summary"),
    () => {}
  );

  ok(
    !item("sidebar-bookmarks-context-open-all-bookmarks").hidden,
    "Open all is visible for a place-container smart bookmark."
  );
  ok(
    !item("sidebar-bookmarks-context-open-all-bookmarks").disabled,
    "Open all is enabled for a non-empty place-container smart bookmark."
  );
  Assert.equal(
    item("sidebar-bookmarks-context-open-all-bookmarks").getAttribute(
      "data-l10n-id"
    ),
    "places-open-all-in-tabs",
    "Place-container uses the open-all-in-tabs label."
  );
  ok(
    !item("sidebar-bookmarks-context-edit-bookmark").hidden,
    "Edit is visible for a place-container smart bookmark."
  );
  ok(
    item("sidebar-bookmarks-context-edit-bookmark").disabled,
    "Edit is disabled for a place-container smart bookmark."
  );
  ok(
    !item("sidebar-bookmarks-context-delete-bookmark").hidden,
    "Delete is visible for a place-container smart bookmark."
  );
  Assert.equal(
    item("sidebar-bookmarks-context-delete-bookmark").getAttribute(
      "data-l10n-id"
    ),
    "text-action-delete",
    "Delete uses the generic delete label."
  );
  ok(
    !item("sidebar-bookmarks-context-cut").hidden,
    "Cut is visible for a place-container smart bookmark."
  );
  for (const id of [
    "sidebar-bookmarks-context-sort-by-name",
    "sidebar-bookmarks-context-show-in-folder",
    "sidebar-bookmarks-context-copy-link",
    "sidebar-bookmarks-context-paste",
    "sidebar-bookmarks-context-add-bookmark",
    "sidebar-bookmarks-context-add-folder",
    "sidebar-bookmarks-context-add-separator",
  ]) {
    ok(item(id).hidden, `${id} is hidden for a smart bookmark.`);
  }
  await hideMenu();

  info("Context menu on a tags-root smart bookmark (Recent Tags).");
  const tagsFolder = [...toolbarList.folderEls].find(
    d => d.guid === tagsSmart.guid
  );
  await openAndWaitForContextMenu(
    contextMenu,
    tagsFolder.querySelector("summary"),
    () => {}
  );
  ok(
    !item("sidebar-bookmarks-context-open-all-bookmarks").hidden,
    "Open all is visible for a tags-root smart bookmark."
  );
  ok(
    item("sidebar-bookmarks-context-open-all-bookmarks").disabled,
    "Open all is disabled for a tags-root smart bookmark."
  );
  ok(
    item("sidebar-bookmarks-context-edit-bookmark").disabled,
    "Edit is disabled for a tags-root smart bookmark."
  );
  await hideMenu();

  info("Context menu on a tag container (a child tag under Recent Tags).");
  await openFolder(tagsFolder);
  const tagsList = tagsFolder.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    tagsList.shadowRoot,
    { childList: true, subtree: true },
    () => [...tagsList.folderEls].length
  );
  const tagContainer = [...tagsList.folderEls][0];
  await openAndWaitForContextMenu(
    contextMenu,
    tagContainer.querySelector("summary"),
    () => {}
  );
  Assert.equal(
    item("sidebar-bookmarks-context-open-all-bookmarks").getAttribute(
      "data-l10n-id"
    ),
    "places-open-all-bookmarks",
    "Tag container uses the open-all-bookmarks label."
  );
  ok(
    !item("sidebar-bookmarks-context-edit-bookmark").disabled,
    "Edit is enabled for a tag container."
  );
  ok(
    item("sidebar-bookmarks-context-cut").hidden,
    "Cut is hidden for a tag container."
  );
  await hideMenu();

  await removeSmartBookmarks(smartBookmarks, url, tag);
  SidebarController.hide();
});

add_task(async function test_long_bookmark_title_is_truncated() {
  // Regression coverage for bug 2049187: the bookmarks sidebar grid was
  // creating implicit columns sized to content, which let long titles
  // visually escape the sidebar instead of being clipped with an ellipsis.
  // After the fix, the grid columns are minmax(0, 1fr), so the inner title
  // span is bounded by its grid cell and `text-overflow: ellipsis` actually
  // takes effect — observable as scrollWidth > clientWidth on the title span.
  const longTitle =
    "A bookmark title that is intentionally very long so the grid cell must " +
    "clip it instead of expanding around it " +
    "x".repeat(120);
  const bookmark = await addBookmark({
    title: longTitle,
    url: "https://example.com/long-title-bookmark",
  });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;
  const nestedList = await getBookmarkList(tabList, bookmark.parentGuid);
  const row = await getBookmarkRow(tabList, bookmark);
  await nestedList.updateComplete;

  const titleEl = row.shadowRoot.getElementById("fxview-tab-row-title");
  ok(titleEl, "Bookmark row exposes its inner title span.");

  // The grid cell holding the title must be bounded so text-overflow can
  // clip the long string. If the fix regresses, the cell expands to fit the
  // content and scrollWidth equals clientWidth.
  Assert.greater(
    titleEl.scrollWidth,
    titleEl.clientWidth,
    "Long bookmark title is being clipped by its grid cell (scrollWidth > clientWidth)."
  );

  // The row itself must also not exceed the sidebar bookmark list host width:
  // a runaway grid cell would let the row push past the sidebar viewport.
  const rowRect = row.getBoundingClientRect();
  const hostRect = nestedList.getBoundingClientRect();
  Assert.lessOrEqual(
    rowRect.right,
    hostRect.right + 0.5,
    "Bookmark row does not overflow the sidebar list horizontally."
  );

  await PlacesUtils.bookmarks.remove(bookmark);
  SidebarTestUtils.closePanel(window);
});
