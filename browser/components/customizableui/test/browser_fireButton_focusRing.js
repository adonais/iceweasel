/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Opens the real clear-data dialog, but only ever cancels it.

const SELECTOR_CHOOSE_LINK = "panel #fire-button-panel-choose-link";

/**
 * Focus a toolbar button the way toolbar keyboard navigation does.
 *
 * @param {Element} button - The toolbar button.
 */
function focusWithKeyboard(button) {
  button.setAttribute("tabindex", "-1");
  Services.focus.setFocus(button, Services.focus.FLAG_BYKEY);
  button.removeAttribute("tabindex");
  Assert.equal(document.activeElement, button, "The button has focus.");
}

/**
 * Open the panel by pressing Space on the keyboard-focused fire button.
 *
 * @param {Element} button - The fire button.
 */
async function openPanelWithKeyboard(button) {
  focusWithKeyboard(button);
  let shown = BrowserTestUtils.waitForEvent(document, "popupshown", true);
  EventUtils.synthesizeKey(" ");
  await shown;
}

/**
 * Open the clear-data dialog through the fire button and cancel it.
 *
 * @param {Function} activate - Called with the fire button, opens the dialog.
 * @returns {Promise<boolean>} Whether the dialog's initial focus showed a
 *   focus ring.
 */
async function openDialogAndGetFocusRing(activate) {
  let button = document.getElementById("fire-button");
  // While the anchor of the previous activation's panel still has its open
  // attribute, activating the button closes that panel instead.
  await TestUtils.waitForCondition(
    () => !button.hasAttribute("open"),
    "Waiting for the panel anchor to reset."
  );
  let dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    null,
    "chrome://browser/content/sanitize_v2.xhtml",
    { isSubDialog: true }
  );
  await activate(button);
  let win = await dialogPromise;
  let doc = win.document;
  await TestUtils.waitForCondition(
    () => doc.activeElement && doc.activeElement != doc.documentElement,
    "Waiting for the dialog to set its initial focus."
  );
  Assert.equal(
    doc.activeElement.id,
    "sanitizeDurationChoice",
    "The duration dropdown has the initial focus."
  );
  let ring = doc.activeElement.matches(":focus-visible");
  let unloaded = BrowserTestUtils.waitForEvent(win, "unload");
  doc.querySelector("dialog").cancelDialog();
  await unloaded;
  return ring;
}

add_task(async function test_directFlow() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.fireButton.flow", "direct"]],
  });

  EventUtils.synthesizeMouseAtCenter(gBrowser.selectedBrowser, {});
  Assert.ok(
    !(await openDialogAndGetFocusRing(button =>
      EventUtils.synthesizeMouseAtCenter(button, {})
    )),
    "Clicking the button opens the dialog without a focus ring."
  );

  Assert.ok(
    await openDialogAndGetFocusRing(button => {
      focusWithKeyboard(button);
      EventUtils.synthesizeKey(" ");
    }),
    "Activating the button with the keyboard shows the focus ring."
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_panelFlowChoose() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.fireButton.flow", "panel"]],
  });

  EventUtils.synthesizeMouseAtCenter(gBrowser.selectedBrowser, {});
  Assert.ok(
    !(await openDialogAndGetFocusRing(async button => {
      let shown = BrowserTestUtils.waitForEvent(document, "popupshown", true);
      EventUtils.synthesizeMouseAtCenter(button, {});
      await shown;
      EventUtils.synthesizeMouseAtCenter(
        document.querySelector(SELECTOR_CHOOSE_LINK),
        {}
      );
    })),
    "Clicking Choose… opens the dialog without a focus ring."
  );

  Assert.ok(
    await openDialogAndGetFocusRing(async button => {
      await openPanelWithKeyboard(button);
      document.querySelector(SELECTOR_CHOOSE_LINK).focus();
      EventUtils.synthesizeKey("KEY_Enter");
    }),
    "Activating Choose… with the keyboard shows the focus ring."
  );

  await SpecialPowers.popPrefEnv();
});
