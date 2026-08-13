/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests the urlbar.autofill.input_context_menu_dismissal labeled counter,
 * which records dismissals of adaptive autofill heuristic results via the
 * urlbar input field's right-click context menu.
 */

"use strict";

const ADAPTIVE_URL = "https://example.com/adaptive-page";
const ORIGIN_URL = "https://example.com/";
const SEARCH_STRING = "exa";
const ADAPTIVE_INPUT = "exa";

const DISMISS_ID = "urlbar-input-dismiss-autofill";
const FORGET_ID = "urlbar-input-remove-from-history";

add_setup(async function () {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();

  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.autoFill", true],
      ["browser.urlbar.autoFill.adaptiveHistory.enabled", true],
      ["browser.urlbar.autoFill.adaptiveHistory.minCharsThreshold", 0],
      ["browser.urlbar.autoFill.adaptiveHistory.useCountThreshold", 0],
      ["browser.urlbar.suggest.quicksuggest.sponsored", false],
      ["browser.urlbar.suggest.quicksuggest.nonsponsored", false],
    ],
  });

  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
    await PlacesUtils.bookmarks.eraseEverything();
  });
});

async function addAdaptiveHistoryEntry(url, input, useCount = 3) {
  await PlacesTestUtils.addVisits({
    uri: url,
    transition: PlacesUtils.history.TRANSITIONS.TYPED,
  });
  for (let i = 0; i < useCount; i++) {
    await UrlbarUtils.addToInputHistory(url, input);
  }
}

async function showAutofillFor(win, value) {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window: win,
    value,
    fireInputEvent: true,
  });
}

async function openAndCloseContextMenu(win) {
  let textBox = win.gURLBar.querySelector("moz-input-box");
  let cxmenu = textBox.menupopup;
  let openPromise = BrowserTestUtils.waitForEvent(cxmenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    win.gURLBar.inputField,
    { type: "contextmenu", button: 2 },
    win
  );
  await openPromise;
  await new Promise(win.requestAnimationFrame);

  let closePromise = BrowserTestUtils.waitForEvent(cxmenu, "popuphidden");
  cxmenu.hidePopup();
  await closePromise;
}

// Wait for telemetry instead of instantly checking it because on some platforms
// when a context menu item is clicked it doesn't run immediately, a brief
// blink animation on the highlighted item will play. Polling gives the blink
// animation time to finish and the handler to run.
async function waitForLabel(label, expected, message) {
  await TestUtils.waitForCondition(
    () =>
      Glean.urlbarAutofill.inputContextMenuDismissal[label].testGetValue() ===
      expected,
    message
  );
}

// Dismissing an adaptive_url heuristic via the input context menu should
// increment the "dismiss" label exactly once.
add_task(async function dismiss_label_recorded_for_adaptive_url() {
  Services.fog.testResetFOG();
  await PlacesUtils.history.clear();
  await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);

  await showAutofillFor(window, SEARCH_STRING);
  await UrlbarTestUtils.activateContextMenuItem(window, DISMISS_ID);

  await waitForLabel("dismiss", 1, "Dismiss label should be incremented once");
  Assert.equal(
    Glean.urlbarAutofill.inputContextMenuDismissal.forget.testGetValue(),
    null,
    "Forget label should not be incremented"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Dismissing a plain origin autofill heuristic should also increment the
// "dismiss" label.
add_task(async function dismiss_label_recorded_for_origin_autofill() {
  Services.fog.testResetFOG();
  await PlacesUtils.history.clear();
  await PlacesTestUtils.addVisits({
    uri: ORIGIN_URL,
    transition: PlacesUtils.history.TRANSITIONS.TYPED,
  });
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await showAutofillFor(window, SEARCH_STRING);
  await UrlbarTestUtils.activateContextMenuItem(window, DISMISS_ID);

  await waitForLabel(
    "dismiss",
    1,
    "Dismiss label should be incremented once for plain origin autofill"
  );
  Assert.equal(
    Glean.urlbarAutofill.inputContextMenuDismissal.forget.testGetValue(),
    null,
    "Forget label should not be incremented"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Forgetting an adaptive_url heuristic should increment the "forget" label
// and leave "dismiss" untouched.
add_task(async function forget_label_recorded_for_adaptive_url() {
  Services.fog.testResetFOG();
  await PlacesUtils.history.clear();
  await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);

  await showAutofillFor(window, SEARCH_STRING);
  await UrlbarTestUtils.activateContextMenuItem(window, FORGET_ID);

  await waitForLabel("forget", 1, "Forget label should be incremented once");
  Assert.equal(
    Glean.urlbarAutofill.inputContextMenuDismissal.dismiss.testGetValue(),
    null,
    "Dismiss label should not be incremented"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Repeated dismissals should accumulate on the same label.
add_task(async function dismiss_label_accumulates() {
  Services.fog.testResetFOG();
  await PlacesUtils.history.clear();

  for (let i = 0; i < 3; i++) {
    await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);
    await showAutofillFor(window, SEARCH_STRING);
    await UrlbarTestUtils.activateContextMenuItem(window, DISMISS_ID);
    await waitForLabel(
      "dismiss",
      i + 1,
      `Dismiss label should be incremented to ${i + 1} after iteration ${i}`
    );
    await UrlbarTestUtils.promisePopupClose(window);
    await PlacesUtils.history.clear();
  }

  Assert.equal(
    Glean.urlbarAutofill.inputContextMenuDismissal.dismiss.testGetValue(),
    3,
    "Dismiss label should accumulate across multiple dismissals"
  );
});

// Opening and closing the context menu without clicking Dismiss/Forget
// should not record telemetry.
add_task(async function no_telemetry_when_menu_not_activated() {
  Services.fog.testResetFOG();
  await PlacesUtils.history.clear();
  await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);

  await showAutofillFor(window, SEARCH_STRING);
  await openAndCloseContextMenu(window);

  Assert.equal(
    Glean.urlbarAutofill.inputContextMenuDismissal.dismiss.testGetValue(),
    null,
    "Dismiss label should not be recorded when the menu is dismissed"
  );
  Assert.equal(
    Glean.urlbarAutofill.inputContextMenuDismissal.forget.testGetValue(),
    null,
    "Forget label should not be recorded when the menu is dismissed"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// In a private window, the Dismiss item is hidden, so no dismiss telemetry
// can be recorded from there.
add_task(async function no_dismiss_telemetry_in_private_window() {
  Services.fog.testResetFOG();
  await PlacesUtils.history.clear();
  await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);

  let privateWin = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  await showAutofillFor(privateWin, SEARCH_STRING);
  await openAndCloseContextMenu(privateWin);

  Assert.equal(
    Glean.urlbarAutofill.inputContextMenuDismissal.dismiss.testGetValue(),
    null,
    "Dismiss label should not be recorded in a private window"
  );

  await UrlbarTestUtils.promisePopupClose(privateWin);
  await BrowserTestUtils.closeWindow(privateWin);
  await PlacesUtils.history.clear();
});
