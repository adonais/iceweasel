/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const TEST_URLS = [
  "https://example.com/1",
  "https://example.com/2",
  "https://example.com/3",
];

var gToolbar = document.getElementById("PersonalToolbar");
var gWasCollapsed = gToolbar.collapsed;
var gFolder;

add_setup(async function () {
  await PlacesUtils.bookmarks.eraseEverything();

  if (gWasCollapsed) {
    await promiseSetToolbarVisibility(gToolbar, true);
  }

  gFolder = await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    title: "Test Folder",
  });

  for (let [index, url] of TEST_URLS.entries()) {
    await PlacesUtils.bookmarks.insert({
      parentGuid: gFolder.guid,
      title: `Bookmark ${index}`,
      url,
    });
  }

  await waitForBookmarksToolbarElements(1);

  registerCleanupFunction(async () => {
    if (gWasCollapsed) {
      await promiseSetToolbarVisibility(gToolbar, false);
    }
    await PlacesUtils.bookmarks.eraseEverything();
  });
});

add_task(async function test_open_all_in_tabs_from_toolbar_folder() {
  let folderElt = getToolbarNodeForItemGuid(gFolder.guid);
  Assert.ok(folderElt, "Found the folder button on the bookmarks toolbar");

  let popup = folderElt.querySelector("menupopup");
  let popupShownPromise = BrowserTestUtils.waitForPopupEvent(popup, "shown");
  EventUtils.synthesizeMouseAtCenter(folderElt, {});
  await popupShownPromise;

  let openAllInTabs = popup.querySelector(".openintabs-menuitem");
  Assert.ok(
    openAllInTabs,
    "Found the Open All in Tabs menuitem in the folder popup"
  );

  let popupHiddenPromise = promisePopupHidden(popup);
  let tabsOpenedPromise = Promise.all(
    TEST_URLS.map(url =>
      BrowserTestUtils.waitForNewTab(gBrowser, url, false, true)
    )
  );

  EventUtils.synthesizeMouseAtCenter(openAllInTabs, {});

  let tabs = await tabsOpenedPromise;

  for (let [index, tab] of tabs.entries()) {
    Assert.equal(
      tab.linkedBrowser.currentURI.spec,
      TEST_URLS[index],
      `Opened a tab for bookmark ${index}`
    );
  }

  await popupHiddenPromise;

  for (let tab of tabs) {
    BrowserTestUtils.removeTab(tab);
  }
});
