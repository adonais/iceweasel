/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PlacesUtils } from "resource://gre/modules/PlacesUtils.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { SidebarTestUtils } from "resource://testing-common/SidebarTestUtils.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/**
 * Show the bookmarks sidebar panel.
 *
 * @param {ChromeWindow} window
 * @returns {{ component: SidebarBookmarks; contentWindow: ChromeWindow; }}
 */
async function showBookmarksSidebar(window) {
  if (window.SidebarController.currentID !== "viewBookmarksSidebar") {
    await SidebarTestUtils.showPanel(window, "viewBookmarksSidebar");
  }
  const { contentDocument, contentWindow } = window.SidebarController.browser;
  await TestUtils.waitForCondition(
    () => contentDocument.querySelector("sidebar-bookmarks"),
    "Wait for sidebar-bookmarks element"
  );
  const component = contentDocument.querySelector("sidebar-bookmarks");
  await component.updateComplete;
  return { component, contentWindow };
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

export const BookmarksSidebarTestUtils = {
  showBookmarksSidebar,
  openFolder,
  openToolbarFolder,
  findBookmarkItemByGuid,
};
