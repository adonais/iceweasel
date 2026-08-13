/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const CAT_PREF = "browser.contentblocking.category";
const BASELINE_PREF = "privacy.trackingprotection.allow_list.baseline.enabled";
const CONVENIENCE_PREF =
  "privacy.trackingprotection.allow_list.convenience.enabled";

/**
 * Helper that resolves once `el` is the active element of its root (works
 * for both light DOM and shadow DOM hosts).
 *
 * @param {HTMLElement} el
 * @returns {Promise<void>}
 */
async function waitForFocus(el) {
  if (el.getRootNode().activeElement === el) {
    return;
  }
  await BrowserTestUtils.waitForEvent(el, "focus");
}

/**
 * Click the back arrow on the currently shown sub-pane.
 *
 * @param {Window} win
 * @param {string} paneId
 */
async function clickBackArrow(win, paneId) {
  let pane = win.document.querySelector(
    `setting-pane[data-category="${paneId}"]`
  );
  await pane.updateComplete;
  let backButton = pane.pageHeaderEl.backButtonEl;
  ok(backButton, `Back button present on ${paneId}`);
  backButton.click();
}

/**
 * When the user navigates to a different top-level pane and then comes back
 * via the browser back button, the control they were on before should be
 * focused again.
 */
add_task(async function test_top_level_back_restores_focus() {
  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });
  let win = gBrowser.contentWindow;
  let doc = win.document;

  let dohControl = await settingControlRenders("dohAdvancedButton", win);
  let dohButton = dohControl.controlEl;
  dohButton.focus();
  await waitForFocus(dohButton);

  let searchShown = waitForPaneChange("search", win);
  await win.gotoPref("search");
  await searchShown;

  let privacyShown = waitForPaneChange("privacy", win);
  win.history.back();
  await privacyShown;

  await waitForFocus(dohButton);
  is(
    doc.activeElement,
    dohButton,
    "Focus restored to the original privacy control on browser back nav"
  );

  gBrowser.removeCurrentTab();
});

/**
 * Drilling into a sub-pane and using the sub-pane back arrow should land
 * focus back on the control that triggered the drill-down, instead of at
 * the bottom of the page.
 */
add_task(async function test_sub_pane_back_arrow_restores_trigger_focus() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [BASELINE_PREF, true],
      [CONVENIENCE_PREF, true],
      ["privacy.trackingprotection.allow_list.hasMigratedCategoryPrefs", true],
    ],
  });

  await openPreferencesViaOpenPreferencesAPI("etp", { leaveOpen: true });
  let win = gBrowser.contentWindow;
  let doc = win.document;

  let triggerControl = await settingControlRenders("etpCustomizeButton", win);
  let triggerButton = triggerControl.controlEl;
  triggerButton.focus();
  await waitForFocus(triggerButton);

  let customizeShown = waitForPaneChange("etpCustomize", win);
  triggerButton.click();
  await customizeShown;

  let etpShown = waitForPaneChange("etp", win);
  await clickBackArrow(win, "paneEtpCustomize");
  await etpShown;

  await waitForFocus(triggerButton);
  is(
    doc.activeElement,
    triggerButton,
    "Focus restored to the sub-pane trigger after back arrow"
  );

  gBrowser.removeCurrentTab();
  await SpecialPowers.popPrefEnv();
});

/**
 * Same as the click-based sub-pane test above, but the user navigates in
 * and back out using the keyboard. Covers the original bug report: Enter
 * to open the sub-pane, Enter on the back arrow to return.
 */
add_task(async function test_sub_pane_keyboard_back_restores_trigger_focus() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [BASELINE_PREF, true],
      [CONVENIENCE_PREF, true],
      ["privacy.trackingprotection.allow_list.hasMigratedCategoryPrefs", true],
    ],
  });

  await openPreferencesViaOpenPreferencesAPI("etp", { leaveOpen: true });
  let win = gBrowser.contentWindow;
  let doc = win.document;

  let triggerControl = await settingControlRenders("etpCustomizeButton", win);
  let triggerButton = triggerControl.controlEl;
  triggerButton.focus();
  await waitForFocus(triggerButton);

  let customizeShown = waitForPaneChange("etpCustomize", win);
  EventUtils.synthesizeKey("KEY_Enter", {}, win);
  await customizeShown;

  let customizePane = doc.querySelector(
    'setting-pane[data-category="paneEtpCustomize"]'
  );
  await customizePane.updateComplete;
  let backButton = customizePane.pageHeaderEl.backButtonEl;
  await waitForFocus(backButton);

  let etpShown = waitForPaneChange("etp", win);
  EventUtils.synthesizeKey("KEY_Enter", {}, win);
  await etpShown;

  await waitForFocus(triggerButton);
  is(
    doc.activeElement,
    triggerButton,
    "Focus restored to the trigger after keyboard back navigation"
  );

  gBrowser.removeCurrentTab();
  await SpecialPowers.popPrefEnv();
});

/**
 * Browser-level back via Alt+Left should land focus on the originally
 * focused control just like the in-page back arrow does.
 */
add_task(async function test_top_level_alt_left_restores_focus() {
  await openPreferencesViaOpenPreferencesAPI("privacy", { leaveOpen: true });
  let win = gBrowser.contentWindow;
  let doc = win.document;

  let dohControl = await settingControlRenders("dohAdvancedButton", win);
  let dohButton = dohControl.controlEl;
  dohButton.focus();
  await waitForFocus(dohButton);

  let searchShown = waitForPaneChange("search", win);
  await win.gotoPref("search");
  await searchShown;

  let privacyShown = waitForPaneChange("privacy", win);
  let backMods =
    AppConstants.platform == "macosx" ? { accelKey: true } : { altKey: true };
  EventUtils.synthesizeKey("KEY_ArrowLeft", backMods, window);
  await privacyShown;

  await waitForFocus(dohButton);
  is(
    doc.activeElement,
    dohButton,
    "Focus restored after Alt+Left back navigation"
  );

  gBrowser.removeCurrentTab();
});
