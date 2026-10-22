/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { showBookmarksSidebar, findBookmarkItemByGuid } =
  SidebarTestUtils.bookmarks;

const UPDATED_BOOKMARKS_PREF = "sidebar.updatedBookmarks.enabled";

add_setup(async () => {
  await SpecialPowers.pushPrefEnv({
    set: [[UPDATED_BOOKMARKS_PREF, true]],
  });
  await PlacesUtils.bookmarks.eraseEverything();
  await SidebarTestUtils.waitForInitialized(window);
  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
    SidebarTestUtils.closePanel(window);
  });
});

/**
 * Asserts that a long folder title is truncated with an ellipsis and that the
 * folder icon and title both stay visible within the row.
 *
 * @param {HTMLElement} rowEl - The <summary> or .bookmark-folder-label that
 *   hosts the title span and the folder icon ::before.
 * @param {SidebarBookmarkList} list - The list containing the folder.
 */
function assertFolderTitleTruncated(rowEl, list) {
  const titleEl = rowEl.querySelector(".bookmark-folder-title");
  ok(titleEl, "Title span is reachable within the folder row.");

  // If the fix regresses, the title flex item keeps its min-content width
  // and its scrollWidth collapses to clientWidth instead of overflowing.
  Assert.greater(
    titleEl.scrollWidth,
    titleEl.clientWidth,
    "Long folder title is clipped (scrollWidth > clientWidth)."
  );

  const rowRect = rowEl.getBoundingClientRect();
  const titleRect = titleEl.getBoundingClientRect();
  Assert.greater(titleRect.width, 0, "Folder title span is visible.");
  Assert.lessOrEqual(
    titleRect.right,
    rowRect.right + 0.5,
    "Folder title does not overflow its row."
  );

  // The folder icon is a ::before pseudo-element, so get computed styles.
  // flex-shrink: 0 is what keeps a long title from squeezing it out.
  const iconStyle = getComputedStyle(rowEl, "::before");
  Assert.notEqual(iconStyle.display, "none", "Folder icon is rendered.");
  Assert.greater(
    parseFloat(iconStyle.width),
    0,
    "Folder icon keeps its width despite a long folder title."
  );

  Assert.lessOrEqual(
    rowRect.right,
    list.getBoundingClientRect().right + 0.5,
    "Folder row does not overflow the sidebar list horizontally."
  );
}

const LONG_FOLDER_TITLE =
  "A bookmark folder title that is intentionally very long so the grid cell must " +
  "clip it instead of expanding around it " +
  "x".repeat(120);

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

  const { component } = await showBookmarksSidebar(window);
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

// Regression coverage for bug 2071281: `text-overflow: ellipsis` needs the
// folder title in its own element that can shrink below its content width,
// while the folder icon keeps its size via flex-shrink: 0.
add_task(async function test_long_bookmark_folder_title_is_truncated_empty() {
  const folder = await addFolder(LONG_FOLDER_TITLE);

  const { component } = await showBookmarksSidebar(window);
  const list = await getBookmarkList(component.bookmarkList, folder.parentGuid);
  await BrowserTestUtils.waitForMutationCondition(
    list.shadowRoot,
    { childList: true, subtree: true },
    () => list.folderLabelEl
  );

  assertFolderTitleTruncated(list.folderLabelEl, list);

  await PlacesUtils.bookmarks.remove(folder);
  SidebarTestUtils.closePanel(window);
});

add_task(
  async function test_long_bookmark_folder_title_is_truncated_not_empty() {
    const folder = await addFolder(LONG_FOLDER_TITLE);
    await addBookmark({
      title: "Test bookmark for long folder title",
      parentGuid: folder.guid,
    });

    const { component } = await showBookmarksSidebar(window);
    const list = await getBookmarkList(
      component.bookmarkList,
      folder.parentGuid
    );
    const folderItem = await findBookmarkItemByGuid(
      list,
      "folderEls",
      folder.guid
    );

    assertFolderTitleTruncated(folderItem.querySelector("summary"), list);

    await PlacesUtils.bookmarks.remove(folder);
    SidebarTestUtils.closePanel(window);
  }
);
