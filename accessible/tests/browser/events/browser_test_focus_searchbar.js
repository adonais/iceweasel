/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../mochitest/states.js */
/* import-globals-from ../../mochitest/role.js */
loadScripts(
  { name: "states.js", dir: MOCHITESTS_DIR },
  { name: "role.js", dir: MOCHITESTS_DIR }
);

ChromeUtils.defineESModuleGetters(this, {
  CustomizableUITestUtils:
    "resource://testing-common/CustomizableUITestUtils.sys.mjs",
  SearchbarTestUtils: "resource://testing-common/UrlbarTestUtils.sys.mjs",
  SearchTestUtils: "resource://testing-common/SearchTestUtils.sys.mjs",
});

const QUERY = "example";

function isEventForResultItem(event) {
  // XXX: See bug 2016839
  return event.accessible.role == ROLE_OPTION;
}

function isEventForMenuPopup(event) {
  return event.accessible.role == ROLE_MENUPOPUP;
}

function isEventForMenuItem(event) {
  return event.accessible.role == ROLE_MENUITEM;
}

let searchbar;

add_setup(async function () {
  SearchbarTestUtils.init(this);
  SearchTestUtils.init(this);
  // The default engine's suggestions would require network access.
  await SearchTestUtils.updateRemoteSettingsConfig([{ identifier: "engine1" }]);

  let gCUITestUtils = new CustomizableUITestUtils(window);
  searchbar = await gCUITestUtils.addSearchBar();
  // Gives us two more results besides the heuristic search result, so that
  // arrowing through them doesn't wrap around.
  await SearchbarTestUtils.formHistory.add([QUERY, `${QUERY}2`]);

  registerCleanupFunction(async () => {
    await SearchbarTestUtils.promisePopupClose(window);
    searchbar.handleRevert();
    await SearchbarTestUtils.formHistory.clear();
    gCUITestUtils.removeSearchBar();
  });
});

// Check that the searchbar manages accessibility focus appropriately.
async function runTests() {
  let focused = waitForEvent(
    EVENT_FOCUS,
    event => event.accessible.DOMNode == searchbar.inputField
  );
  searchbar.focus();
  let event = await focused;
  let textBox = event.accessible;

  info("Ensuring no focus change when text is typed");
  await SearchbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: QUERY.slice(0, 3),
  });
  Assert.equal(
    SearchbarTestUtils.getResultCount(window),
    3,
    "Expected the heuristic search result and the form history results"
  );
  // Wait a tick for a11y events to fire.
  await TestUtils.waitForTick();
  testStates(textBox, STATE_FOCUSED);

  info("Ensuring result focus on down arrow (1)");
  focused = waitForEvent(EVENT_FOCUS, isEventForResultItem);
  EventUtils.synthesizeKey("KEY_ArrowDown");
  event = await focused;
  testStates(event.accessible, STATE_FOCUSED);

  info("Ensuring focus of another result on down arrow");
  focused = waitForEvent(EVENT_FOCUS, isEventForResultItem);
  EventUtils.synthesizeKey("KEY_ArrowDown");
  event = await focused;
  testStates(event.accessible, STATE_FOCUSED);

  if (AppConstants.platform == "macosx") {
    info("Ensuring focus of another result on ctrl-n");
    focused = waitForEvent(EVENT_FOCUS, isEventForResultItem);
    EventUtils.synthesizeKey("n", { ctrlKey: true });
    event = await focused;
    testStates(event.accessible, STATE_FOCUSED);

    info("Ensuring focus of another result on ctrl-p");
    focused = waitForEvent(EVENT_FOCUS, isEventForResultItem);
    EventUtils.synthesizeKey("p", { ctrlKey: true });
    event = await focused;
    testStates(event.accessible, STATE_FOCUSED);
  }

  info("Ensuring focus of another result on up arrow");
  focused = waitForEvent(EVENT_FOCUS, isEventForResultItem);
  EventUtils.synthesizeKey("KEY_ArrowUp");
  event = await focused;
  testStates(event.accessible, STATE_FOCUSED);

  info("Ensuring text box focus on left arrow");
  focused = waitForEvent(EVENT_FOCUS, textBox);
  EventUtils.synthesizeKey("KEY_ArrowLeft");
  await focused;
  testStates(textBox, STATE_FOCUSED);

  await SearchbarTestUtils.promisePopupClose(window);
  // On Mac, down arrow when not at the end of the field moves to the end.
  // Move back to the end so the next press of down arrow opens the popup.
  EventUtils.synthesizeKey("KEY_ArrowRight");

  info("Ensuring result focus on down arrow (2)");
  focused = waitForEvent(EVENT_FOCUS, isEventForResultItem);
  EventUtils.synthesizeKey("KEY_ArrowDown");
  event = await focused;
  testStates(event.accessible, STATE_FOCUSED);

  info("Ensuring text box focus when text is typed");
  focused = waitForEvent(EVENT_FOCUS, textBox);
  EventUtils.sendString("m");
  await focused;
  testStates(textBox, STATE_FOCUSED);
  EventUtils.synthesizeKey("KEY_Backspace");
  await SearchbarTestUtils.promiseSearchComplete(window);

  info("Ensuring result focus on down arrow (3)");
  focused = waitForEvent(EVENT_FOCUS, isEventForResultItem);
  EventUtils.synthesizeKey("KEY_ArrowDown");
  event = await focused;
  testStates(event.accessible, STATE_FOCUSED);

  info("Ensuring text box focus on backspace");
  focused = waitForEvent(EVENT_FOCUS, textBox);
  EventUtils.synthesizeKey("KEY_Backspace");
  await focused;
  testStates(textBox, STATE_FOCUSED);
  await SearchbarTestUtils.promiseSearchComplete(window);

  info("Ensuring result focus on down arrow (4)");
  focused = waitForEvent(EVENT_FOCUS, isEventForResultItem);
  EventUtils.synthesizeKey("KEY_ArrowDown");
  event = await focused;
  testStates(event.accessible, STATE_FOCUSED);

  info("Ensuring text box focus on text selection");
  focused = waitForEvent(EVENT_FOCUS, textBox);
  EventUtils.synthesizeKey("KEY_ArrowLeft", { shiftKey: true });
  await focused;
  testStates(textBox, STATE_FOCUSED);

  if (
    AppConstants.platform == "macosx" &&
    Services.prefs.getBoolPref("widget.macos.native-context-menus", false)
  ) {
    // With native context menus, we do not observe accessibility events and we
    // cannot send synthetic key events to the menu.
    info("Opening and closing native context menu");
    let contextMenu = window.EditContextMenu.popup;
    let popupshown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      searchbar.querySelector(".urlbar-input-box"),
      { type: "contextmenu" }
    );
    await popupshown;
    let popuphidden = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
    contextMenu.hidePopup();
    await popuphidden;
  } else {
    info(
      "Ensuring context menu gets menu event on launch, and item focus on down"
    );
    let menuEvent = waitForEvent(
      nsIAccessibleEvent.EVENT_MENUPOPUP_START,
      isEventForMenuPopup
    );
    EventUtils.synthesizeMouseAtCenter(
      searchbar.querySelector(".urlbar-input-box"),
      { type: "contextmenu" }
    );
    await menuEvent;

    focused = waitForEvent(EVENT_FOCUS, isEventForMenuItem);
    EventUtils.synthesizeKey("KEY_ArrowDown");
    event = await focused;
    testStates(event.accessible, STATE_FOCUSED);

    focused = waitForEvent(EVENT_FOCUS, textBox);
    let closed = waitForEvent(
      nsIAccessibleEvent.EVENT_MENUPOPUP_END,
      isEventForMenuPopup
    );
    EventUtils.synthesizeKey("KEY_Escape");
    await closed;
    await focused;
  }
  info("Ensuring searchbar is focused after context menu is dismissed.");
  testStates(textBox, STATE_FOCUSED);
}

addAccessibleTask(``, runTests);
