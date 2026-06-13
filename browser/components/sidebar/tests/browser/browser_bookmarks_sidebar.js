/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

const TEST_URL = "https://example.com/";
const TEST_URL_2 = "https://example.org/";
const UPDATED_BOOKMARKS_PREF = "sidebar.updatedBookmarks.enabled";

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
  await BrowserTestUtils.waitForCondition(
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

add_setup(async function () {
  await PlacesUtils.bookmarks.eraseEverything();
  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
    SidebarController.hide();
  });
});

add_task(async function test_bookmarks_panel_opens() {
  const { component } = await showBookmarksSidebar();
  ok(component, "Bookmarks panel component is present.");

  ok(component.panelHeader, "Panel header is rendered.");
  ok(component.searchInput, "Search input is rendered.");

  SidebarController.hide();
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
  SidebarController.hide();
});

add_task(async function test_bookmarks_shows_bookmark_in_folder() {
  const bookmark = await addBookmark({ title: "My Test Page" });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );

  // Open the toolbar folder if not already open.
  const details = tabList.folderEls[0];
  if (!details.open) {
    details.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      details,
      { attributes: true },
      () => details.open
    );
  }

  const nestedList = details.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => nestedList.rowEls[0]
  );

  const rows = nestedList.rowEls;
  Assert.greater(
    rows.length,
    0,
    "Bookmark rows are rendered inside the folder."
  );
  const matchingRow = [...rows].find(r => r.title === "My Test Page");
  ok(matchingRow, "The added bookmark is visible in the panel.");

  await PlacesUtils.bookmarks.remove(bookmark);
  SidebarController.hide();
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
  SidebarController.hide();
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
  SidebarController.hide();
});

add_task(async function test_bookmarks_folder_expand_collapse() {
  const folder = await addFolder("ExpandableFolder");
  await addBookmark({ title: "Inside Folder", parentGuid: folder.guid });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );

  const toolbarDetails = [...tabList.folderEls].find(d => d.open !== undefined);
  ok(toolbarDetails, "Toolbar folder details element found.");

  if (!toolbarDetails.open) {
    toolbarDetails.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      toolbarDetails,
      { attributes: true },
      () => toolbarDetails.open
    );
  }

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
  SidebarController.hide();
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

  SidebarController.hide();
});

add_task(async function test_bookmarks_context_menu_bookmark() {
  const bm = await addBookmark({ title: "Context Menu Bookmark" });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );

  const toolbarDetails = tabList.folderEls[0];
  if (!toolbarDetails.open) {
    toolbarDetails.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      toolbarDetails,
      { attributes: true },
      () => toolbarDetails.open
    );
  }

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

  contextMenu.hidePopup();
  await PlacesUtils.bookmarks.remove(bm);
  SidebarController.hide();
});

add_task(async function test_bookmarks_context_menu_folder() {
  const folder = await addFolder("Context Menu Folder");
  await addBookmark({ title: "In Folder", parentGuid: folder.guid });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );

  const toolbarDetails = tabList.folderEls[0];
  if (!toolbarDetails.open) {
    toolbarDetails.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      toolbarDetails,
      { attributes: true },
      () => toolbarDetails.open
    );
  }

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
  SidebarController.hide();
});

add_task(async function test_bookmarks_delete_via_context_menu() {
  await addBookmark({ title: "Delete Me" });

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );

  const toolbarDetails = tabList.folderEls[0];
  if (!toolbarDetails.open) {
    toolbarDetails.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      toolbarDetails,
      { attributes: true },
      () => toolbarDetails.open
    );
  }

  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => [...nestedList.rowEls].some(r => r.title === "Delete Me")
  );

  const row = [...nestedList.rowEls].find(r => r.title === "Delete Me");

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
    () =>
      !nestedList.isConnected ||
      ![...nestedList.rowEls].some(r => r.title === "Delete Me")
  );

  SidebarController.hide();
});

add_task(async function test_bookmarks_empty_folder_shows_label() {
  const folder = await addFolder("Empty Folder");

  const { component } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );

  const toolbarDetails = tabList.folderEls[0];
  if (!toolbarDetails.open) {
    toolbarDetails.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      toolbarDetails,
      { attributes: true },
      () => toolbarDetails.open
    );
  }

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

  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  SidebarController.hide();
});

async function openToolbarFolder(tabList) {
  await BrowserTestUtils.waitForMutationCondition(
    tabList.shadowRoot,
    { childList: true, subtree: true },
    () => tabList.folderEls[0]
  );
  const toolbarDetails = tabList.folderEls[0];
  if (!toolbarDetails.open) {
    toolbarDetails.querySelector("summary").click();
    await BrowserTestUtils.waitForMutationCondition(
      toolbarDetails,
      { attributes: true },
      () => toolbarDetails.open
    );
  }
  return toolbarDetails;
}

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

  const toolbarDetails = await openToolbarFolder(tabList);
  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => [...nestedList.rowEls].some(r => r.title === "Drag Second")
  );

  const rowA = [...nestedList.rowEls].find(r => r.title === "Drag First");
  const rowB = [...nestedList.rowEls].find(r => r.title === "Drag Second");
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

  await BrowserTestUtils.waitForCondition(async () => {
    fetchA = await PlacesUtils.bookmarks.fetch(bmA.guid);
    fetchB = await PlacesUtils.bookmarks.fetch(bmB.guid);
    return fetchA.index > fetchB.index;
  }, "Bookmark A moves after B.");

  await PlacesUtils.bookmarks.remove(bmA.guid);
  await PlacesUtils.bookmarks.remove(bmB.guid);
  SidebarController.hide();
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

  const toolbarDetails = await openToolbarFolder(tabList);
  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () =>
      [...nestedList.rowEls].some(r => r.title === "Drag To Folder") &&
      [...nestedList.folderEls].some(
        d =>
          d.querySelector("summary")?.textContent.trim() ===
          "Drop Target Folder"
      )
  );

  const bookmarkRow = [...nestedList.rowEls].find(
    r => r.title === "Drag To Folder"
  );
  const folderSummary = [...nestedList.folderEls]
    .find(
      d =>
        d.querySelector("summary")?.textContent.trim() === "Drop Target Folder"
    )
    ?.querySelector("summary");
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

  await BrowserTestUtils.waitForCondition(async () => {
    const fetchBm = await PlacesUtils.bookmarks.fetch(bm.guid);
    return fetchBm.parentGuid === folder.guid;
  }, "Bookmark is moved into the folder.");

  await PlacesUtils.bookmarks.remove({ guid: folder.guid });
  SidebarController.hide();
});

add_task(async function test_bookmarks_drag_url_to_panel() {
  const folder = await addFolder("URL Drop Target Folder");
  await addBookmark({
    title: "Existing Bookmark",
    parentGuid: folder.guid,
  });

  const { component, contentWindow } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);
  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () =>
      [...nestedList.folderEls].some(
        d =>
          d.querySelector("summary")?.textContent.trim() ===
          "URL Drop Target Folder"
      )
  );

  const folderSummary = [...nestedList.folderEls]
    .find(
      d =>
        d.querySelector("summary")?.textContent.trim() ===
        "URL Drop Target Folder"
    )
    ?.querySelector("summary");
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
  SidebarController.hide();
});

add_task(async function test_bookmarks_drag_tab_to_panel() {
  const bm = await addBookmark({ title: "Tab Drop Target" });
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/tab-page"
  );

  const { component, contentWindow } = await showBookmarksSidebar();
  const tabList = component.bookmarkList;

  const toolbarDetails = await openToolbarFolder(tabList);
  const nestedList = toolbarDetails.querySelector("sidebar-bookmark-list");
  await BrowserTestUtils.waitForMutationCondition(
    nestedList.shadowRoot,
    { childList: true, subtree: true },
    () => [...nestedList.rowEls].some(r => r.title === "Tab Drop Target")
  );

  const targetRow = [...nestedList.rowEls].find(
    r => r.title === "Tab Drop Target"
  );
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
  SidebarController.hide();
});
