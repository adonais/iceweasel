/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_combobox_controls_listbox() {
  let ariaControlsElements = gURLBar.inputField.ariaControlsElements;
  is(
    ariaControlsElements.length,
    1,
    "The urlbar input controls one other element"
  );
  is(
    ariaControlsElements[0].id,
    "urlbar-results",
    "The urlbar input controls the results combobox"
  );
  is(
    ariaControlsElements[0],
    document.querySelector("#urlbar .urlbarView-results"),
    "The results combobox controlled by the urlbar input is a descendent of the urlbar"
  );
});

add_task(async function test_searchmode_switcher_exposed_once() {
  let switcher = gURLBar.querySelector(".searchmode-switcher");
  Assert.ok(
    !switcher.hasAttribute("offscreen"),
    "The search mode switcher is available"
  );

  let accService = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  let container = gURLBar.querySelector(".urlbar-input-container");
  let button = switcher.shadowRoot.querySelector("button");
  let containerAcc, buttonAcc;
  await TestUtils.waitForCondition(() => {
    containerAcc = accService.getAccessibleFor(container);
    buttonAcc = accService.getAccessibleFor(button);
    return containerAcc && buttonAcc;
  }, "Waiting for the accessibility service to expose the search mode switcher");

  is(
    buttonAcc.role,
    Ci.nsIAccessibleRole.ROLE_PUSHBUTTON,
    "The search mode switcher is a button"
  );
  is(
    buttonAcc.parent,
    containerAcc,
    "The button's host contributes no accessible of its own"
  );
  let dropmarkerLabel = switcher.querySelector(
    ".searchmode-switcher-dropmarker"
  ).title;
  Assert.ok(dropmarkerLabel, "The dropmarker is localized");
  is(
    buttonAcc.name,
    dropmarkerLabel,
    "The button takes its name from the dropmarker"
  );

  let state = {},
    extraState = {};
  buttonAcc.getState(state, extraState);
  Assert.ok(
    state.value & Ci.nsIAccessibleStates.STATE_HASPOPUP,
    "The button announces that it opens a menu"
  );
  Assert.ok(
    state.value & Ci.nsIAccessibleStates.STATE_COLLAPSED,
    "The button announces that the menu is closed"
  );
});
