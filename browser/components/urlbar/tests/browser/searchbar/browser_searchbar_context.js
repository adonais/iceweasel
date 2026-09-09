/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

let searchbar;

add_setup(async function () {
  searchbar = document.getElementById("searchbar-new");

  await SearchTestUtils.updateRemoteSettingsConfig([{ identifier: "engine1" }]);
});

add_task(async function test_clearSearchHistoryAvailability() {
  // The context menu is shared by both inputs, so the item is there either way
  // and only shown for the searchbar.
  await UrlbarTestUtils.withContextMenu(window, popup => {
    let menuitem = popup.querySelector('[anonid="clear-search-history"]');
    Assert.ok(
      !BrowserTestUtils.isVisible(menuitem),
      "Menuitem is not shown for the urlbar"
    );
  });
  await SearchbarTestUtils.withContextMenu(window, popup => {
    let menuitem = popup.querySelector('[anonid="clear-search-history"]');
    Assert.ok(
      BrowserTestUtils.isVisible(menuitem),
      "Menuitem is shown for the searchbar"
    );
  });
});

add_task(async function test_clearSearchHistory() {
  // Add one form history entry by actually searching.
  searchbar.focus();
  EventUtils.sendString("search term 1");
  let promise = Promise.all([
    SearchbarTestUtils.formHistory.promiseChanged(),
    BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser),
  ]);
  EventUtils.synthesizeKey("KEY_Enter");
  await promise;
  searchbar.handleRevert();

  // Add one form history entry synthetically.
  await SearchbarTestUtils.formHistory.add(["search term 2"]);

  await SearchbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });

  Assert.equal(
    SearchbarTestUtils.getResultCount(window),
    2,
    "Both form history entries are suggested"
  );

  info("Clearing form history via context menu.");
  promise = SearchbarTestUtils.formHistory.promiseChanged();
  await SearchbarTestUtils.activateContextMenuItem(
    window,
    "clear-search-history"
  );
  await promise;

  // Add something back so the results panel will appear.
  await SearchbarTestUtils.formHistory.add(["search term 3"]);
  await SearchbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "",
  });
  Assert.equal(
    SearchbarTestUtils.getResultCount(window),
    1,
    "Form history entries were removed"
  );

  await SearchbarTestUtils.formHistory.clear();
});

add_task(async function test_itemsGoWithTheSearchbar() {
  let popup = window.EditContextMenu.popup;
  let count = anonid => popup.querySelectorAll(`[anonid="${anonid}"]`).length;

  Assert.equal(count("clear-search-history"), 1, "The searchbar has an item");
  Assert.equal(count("paste-and-go"), 2, "Both inputs have an item");

  await gCUITestUtils.removeSearchBar();
  Assert.equal(
    count("clear-search-history"),
    0,
    "The searchbar's item is gone"
  );
  Assert.equal(count("paste-and-go"), 1, "Only the urlbar's item is left");

  await gCUITestUtils.addSearchBar();
  Assert.equal(count("clear-search-history"), 1, "The item is back");
  Assert.equal(count("paste-and-go"), 2, "The items aren't duplicated");
});
