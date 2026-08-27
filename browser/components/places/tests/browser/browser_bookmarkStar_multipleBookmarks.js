/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests that the bookmark star only unstars a page once every bookmark for
 * that page's uri has been removed, even if some of those bookmarks were
 * added after the page was already starred (bug 1882241).
 */
add_task(async function star_persists_until_last_bookmark_is_removed() {
  const TEST_URL = "https://example.com/browser_bookmarkStar_multipleBookmarks";

  registerCleanupFunction(async () => {
    await PlacesUtils.bookmarks.eraseEverything();
  });

  let folder = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Folder",
  });
  let subfolder = await PlacesUtils.bookmarks.insert({
    parentGuid: folder.guid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Subfolder",
  });

  await BrowserTestUtils.withNewTab(TEST_URL, async () => {
    await TestUtils.waitForCondition(
      () => BookmarkingUI.status != BookmarkingUI.STATUS_UPDATING,
      "BookmarkingUI should not be updating"
    );
    Assert.ok(
      !BookmarkingUI.star.hasAttribute("starred"),
      "Page should not be starred yet"
    );

    info("Bookmark the page in the folder.");
    let addedPromise = PlacesTestUtils.waitForNotification(
      "bookmark-added",
      events => events.some(e => e.url == TEST_URL)
    );
    let bookmarkInFolder = await PlacesUtils.bookmarks.insert({
      parentGuid: folder.guid,
      url: TEST_URL,
      title: "Bookmark in folder",
    });
    await addedPromise;
    Assert.ok(
      BookmarkingUI.star.hasAttribute("starred"),
      "Page should be starred after the first bookmark is added"
    );

    info("Bookmark the same page again, in the subfolder.");
    addedPromise = PlacesTestUtils.waitForNotification(
      "bookmark-added",
      events => events.some(e => e.url == TEST_URL)
    );
    let bookmarkInSubfolder = await PlacesUtils.bookmarks.insert({
      parentGuid: subfolder.guid,
      url: TEST_URL,
      title: "Bookmark in subfolder",
    });
    await addedPromise;
    Assert.ok(
      BookmarkingUI.star.hasAttribute("starred"),
      "Page should still be starred after the second bookmark is added"
    );

    info(
      "Remove the bookmark in the folder; the page is still bookmarked in the subfolder."
    );
    let removedPromise = PlacesTestUtils.waitForNotification(
      "bookmark-removed",
      events => events.some(e => e.url == TEST_URL)
    );
    await PlacesUtils.bookmarks.remove(bookmarkInFolder);
    await removedPromise;
    Assert.ok(
      BookmarkingUI.star.hasAttribute("starred"),
      "Page should remain starred because it is still bookmarked in the subfolder"
    );

    info("Remove the remaining bookmark in the subfolder.");
    removedPromise = PlacesTestUtils.waitForNotification(
      "bookmark-removed",
      events => events.some(e => e.url == TEST_URL)
    );
    await PlacesUtils.bookmarks.remove(bookmarkInSubfolder);
    await removedPromise;
    Assert.ok(
      !BookmarkingUI.star.hasAttribute("starred"),
      "Page should no longer be starred once every bookmark is removed"
    );
  });
});
