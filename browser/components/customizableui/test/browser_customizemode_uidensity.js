/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PREF_UI_DENSITY = "browser.uidensity";
const PREF_AUTO_TOUCH_MODE = "browser.touchmode.auto";

async function testModeMenuitem(mode, modePref) {
  await startCustomizing();

  let win = document.getElementById("main-window");
  let popupButton = document.getElementById("customization-uidensity-button");
  let popup = document.getElementById("customization-uidensity-menu");

  // Show the popup.
  let popupShownPromise = popupShown(popup);
  EventUtils.synthesizeMouseAtCenter(popupButton, {});
  await popupShownPromise;

  let item = document.getElementById(
    "customization-uidensity-menuitem-" + mode
  );
  let normalItem = document.getElementById(
    "customization-uidensity-menuitem-normal"
  );

  is(
    normalItem.getAttribute("active"),
    "true",
    "Normal mode menuitem should be active by default"
  );

  // Hover over the mode menuitem and wait for the event that updates the UI
  // density.
  let mouseoverPromise = BrowserTestUtils.waitForEvent(item, "mouseover");
  EventUtils.synthesizeMouseAtCenter(item, { type: "mouseover" });
  await mouseoverPromise;

  is(
    win.getAttribute("uidensity"),
    mode,
    `UI Density should be set to ${mode} on ${mode} menuitem hover`
  );

  is(
    Services.prefs.getIntPref(PREF_UI_DENSITY),
    window.gUIDensity.MODE_NORMAL,
    `UI Density pref should still be set to normal on ${mode} menuitem hover`
  );

  // Hover the normal menuitem again and check that the UI density reset to normal.
  EventUtils.synthesizeMouseAtCenter(normalItem, { type: "mouseover" });
  await TestUtils.waitForCondition(() => !win.hasAttribute("uidensity"));

  ok(
    !win.hasAttribute("uidensity"),
    `UI Density should be reset when no longer hovering the ${mode} menuitem`
  );

  // Select the custom UI density and wait for the popup to be hidden.
  let popupHiddenPromise = popupHidden(popup);
  EventUtils.synthesizeMouseAtCenter(item, {});
  await popupHiddenPromise;

  // Check that the click permanently changed the UI density.
  is(
    win.getAttribute("uidensity"),
    mode,
    `UI Density should be set to ${mode} on ${mode} menuitem click`
  );
  is(
    Services.prefs.getIntPref(PREF_UI_DENSITY),
    modePref,
    `UI Density pref should be set to ${mode} when clicking the ${mode} menuitem`
  );

  // Open the popup again.
  popupShownPromise = popupShown(popup);
  EventUtils.synthesizeMouseAtCenter(popupButton, {});
  await popupShownPromise;

  // Check that the menuitem is still active after opening and closing the popup.
  is(
    item.getAttribute("active"),
    "true",
    `${mode} mode menuitem should be active`
  );

  // Hide the popup again.
  popupHiddenPromise = popupHidden(popup);
  EventUtils.synthesizeMouseAtCenter(popupButton, {});
  await popupHiddenPromise;

  // Check that the menuitem is still active after re-opening customize mode.
  await endCustomizing();
  await startCustomizing();

  popupShownPromise = popupShown(popup);
  EventUtils.synthesizeMouseAtCenter(popupButton, {});
  await popupShownPromise;

  is(
    item.getAttribute("active"),
    "true",
    `${mode} mode menuitem should be active after entering and exiting customize mode`
  );

  // Click the normal menuitem and check that the density is reset.
  popupHiddenPromise = popupHidden(popup);
  EventUtils.synthesizeMouseAtCenter(normalItem, {});
  await popupHiddenPromise;

  ok(
    !win.hasAttribute("uidensity"),
    "UI Density should be reset when clicking the normal menuitem"
  );

  is(
    Services.prefs.getIntPref(PREF_UI_DENSITY),
    window.gUIDensity.MODE_NORMAL,
    "UI Density pref should be set to normal."
  );

  // Show the popup and click on the mode menuitem again to test the
  // reset default feature.
  popupShownPromise = popupShown(popup);
  EventUtils.synthesizeMouseAtCenter(popupButton, {});
  await popupShownPromise;

  popupHiddenPromise = popupHidden(popup);
  EventUtils.synthesizeMouseAtCenter(item, {});
  await popupHiddenPromise;

  is(
    win.getAttribute("uidensity"),
    mode,
    `UI Density should be set to ${mode} on ${mode} menuitem click`
  );

  is(
    Services.prefs.getIntPref(PREF_UI_DENSITY),
    modePref,
    `UI Density pref should be set to ${mode} when clicking the ${mode} menuitem`
  );

  await gCustomizeMode.reset();

  ok(
    !win.hasAttribute("uidensity"),
    "UI Density should be reset when clicking the normal menuitem"
  );

  is(
    Services.prefs.getIntPref(PREF_UI_DENSITY),
    window.gUIDensity.MODE_NORMAL,
    "UI Density pref should be set to normal."
  );

  await endCustomizing();
}

add_task(async function test_touch_mode_menuitem() {
  // The density dropdown is only shown when Nova is disabled.
  await SpecialPowers.pushPrefEnv({
    set: [["browser.nova.enabled", false]],
  });

  // browser.touchmode.auto's default tracks whether nova is enabled and is set
  // once at startup (see CustomizableUI._setAutoTouchModeDefault). Re-derive it
  // now that nova is forced off, so the "checked by default" and
  // reset-to-default assertions below hold even when the browser started with
  // nova enabled. Restore the default afterwards.
  const defaultBranch = Services.prefs.getDefaultBranch("");
  const originalAutoTouchDefault =
    defaultBranch.getBoolPref(PREF_AUTO_TOUCH_MODE);
  CustomizableUI.getTestOnlyInternalProp(
    "CustomizableUIInternal"
  )._setAutoTouchModeDefault();
  registerCleanupFunction(() =>
    defaultBranch.setBoolPref(PREF_AUTO_TOUCH_MODE, originalAutoTouchDefault)
  );

  // OSX doesn't get touch mode for now.
  if (AppConstants.platform == "macosx") {
    is(
      document.getElementById("customization-uidensity-menuitem-touch"),
      null,
      "There's no touch option on Mac OSX"
    );
    await SpecialPowers.popPrefEnv();
    return;
  }

  await testModeMenuitem("touch", window.gUIDensity.MODE_TOUCH);

  // Test the checkbox for automatic Touch Mode transition
  // in Windows Tablet Mode.
  if (AppConstants.platform == "win") {
    await startCustomizing();

    let popupButton = document.getElementById("customization-uidensity-button");
    let popup = document.getElementById("customization-uidensity-menu");
    let popupShownPromise = popupShown(popup);
    EventUtils.synthesizeMouseAtCenter(popupButton, {});
    await popupShownPromise;

    let checkbox = document.getElementById(
      "customization-uidensity-autotouchmode-checkbox"
    );
    ok(checkbox.checked, "Checkbox should be checked by default");

    // Test toggling the checkbox.
    EventUtils.synthesizeMouseAtCenter(checkbox, {});
    is(
      Services.prefs.getBoolPref(PREF_AUTO_TOUCH_MODE),
      false,
      "Automatic Touch Mode is off when the checkbox is unchecked."
    );

    EventUtils.synthesizeMouseAtCenter(checkbox, {});
    is(
      Services.prefs.getBoolPref(PREF_AUTO_TOUCH_MODE),
      true,
      "Automatic Touch Mode is on when the checkbox is checked."
    );

    // Test reset to defaults.
    EventUtils.synthesizeMouseAtCenter(checkbox, {});
    is(
      Services.prefs.getBoolPref(PREF_AUTO_TOUCH_MODE),
      false,
      "Automatic Touch Mode is off when the checkbox is unchecked."
    );

    await gCustomizeMode.reset();
    is(
      Services.prefs.getBoolPref(PREF_AUTO_TOUCH_MODE),
      true,
      "Automatic Touch Mode is on when the checkbox is checked."
    );
  }

  await endCustomizing();
  await SpecialPowers.popPrefEnv();
});

// When Nova is enabled, a link to the Window Density section of
// about:preferences is shown instead of the density dropdown.
add_task(async function test_uidensity_link() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.nova.enabled", true]],
  });

  await startCustomizing();

  let button = document.getElementById("customization-uidensity-button");
  let link = document.getElementById("customization-uidensity-link");

  ok(button.hidden, "The density dropdown button is hidden when Nova is on");
  ok(!link.hidden, "The density link is visible when Nova is on");

  let waitForNewTab = BrowserTestUtils.waitForNewTab(gBrowser, url =>
    url.startsWith("about:preferences")
  );
  link.click();
  let prefsTab = await waitForNewTab;

  ok(
    gBrowser.currentURI.spec.startsWith("about:preferences#appearance"),
    "The link opened about:preferences#appearance"
  );
  BrowserTestUtils.removeTab(prefsTab);

  // Wait for customize mode to be re-entered now that the customize tab is
  // active. This is needed for endCustomizing() to work properly.
  await TestUtils.waitForCondition(() =>
    document.documentElement.hasAttribute("customizing")
  );
  await endCustomizing();
  await SpecialPowers.popPrefEnv();
});

add_task(async function cleanup() {
  await endCustomizing();

  Services.prefs.clearUserPref(PREF_UI_DENSITY);
  Services.prefs.clearUserPref(PREF_AUTO_TOUCH_MODE);
});
