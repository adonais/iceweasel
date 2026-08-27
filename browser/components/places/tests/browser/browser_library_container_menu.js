/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Tests that the context menu items relating to containers work properly in
// the Library window.

const TEST_URL = "https://example.com/";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.userContext.enabled", true]],
  });
  await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.toolbarGuid,
    url: TEST_URL,
    title: "Test bookmark",
  });
  registerCleanupFunction(async function () {
    await PlacesUtils.bookmarks.eraseEverything();
  });
});

async function openContainerMenuInLibrary(library) {
  library.PlacesOrganizer.selectLeftPaneBuiltIn("BookmarksToolbar");
  library.ContentTree.view.selectAll();

  let placesContext = library.document.getElementById("placesContext");
  let promiseContextMenu = BrowserTestUtils.waitForEvent(
    placesContext,
    "popupshown"
  );
  await synthesizeClickOnSelectedTreeCell(library.ContentTree.view, {
    button: 2,
    type: "contextmenu",
  });
  await promiseContextMenu;

  let containerPopup = library.document.getElementById(
    "placesContext_open_newcontainertab_popup"
  );
  let promiseSubmenu = BrowserTestUtils.waitForEvent(
    containerPopup,
    "popupshown"
  );
  library.document
    .getElementById("placesContext_open:newcontainertab")
    .openMenu(true);
  await promiseSubmenu;

  return containerPopup;
}

function getItemByL10nId(popup, l10nId) {
  let item = [...popup.children].find(child => child.dataset.l10nId == l10nId);
  Assert.ok(item, `Found the ${l10nId} menu item`);
  return item;
}

add_task(async function test_add_container_opens_container_popup() {
  let library = await promiseLibrary("AllBookmarks");
  let containerPopup = await openContainerMenuInLibrary(library);

  let panel = document.getElementById("containerCreation-panel");
  let promisePanel = BrowserTestUtils.waitForEvent(panel, "popupshown");
  let tabCount = gBrowser.tabs.length;
  containerPopup.activateItem(
    getItemByL10nId(containerPopup, "user-context-add-container")
  );
  // Ensure the panel is opened, on the browser window rather than the Library.
  await promisePanel;

  Assert.equal(
    gBrowser.tabs.length,
    tabCount,
    "The bookmark was not opened in a tab"
  );

  let promiseHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  panel.hidePopup();
  await promiseHidden;
  await promiseLibraryClosed(library);
});

add_task(async function test_manage_containers_opens_preferences() {
  // The preferences pane replaces the selected tab when it is empty, so keep a
  // loaded tab selected to always get a new one.
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TEST_URL);
  let library = await promiseLibrary("AllBookmarks");
  let containerPopup = await openContainerMenuInLibrary(library);

  let promisePrefsTab = BrowserTestUtils.waitForNewTab(
    gBrowser,
    url => url.startsWith("about:preferences"),
    true
  );
  containerPopup.activateItem(
    getItemByL10nId(containerPopup, "user-context-manage-containers")
  );
  let prefsTab = await promisePrefsTab;

  Assert.equal(
    prefsTab.linkedBrowser.currentURI.spec,
    "about:preferences#containers",
    "The containers pane was opened"
  );

  BrowserTestUtils.removeTab(prefsTab);
  BrowserTestUtils.removeTab(tab);
  await promiseLibraryClosed(library);
});
