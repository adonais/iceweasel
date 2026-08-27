/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(
  async function test_appearance_sidebar_visible_when_redesign_enabled() {
    let tab = await openPrefsTab("appearance");
    let doc = tab.linkedBrowser.contentDocument;

    is_element_visible(
      doc.getElementById("category-appearance"),
      "Appearance category is visible when settings redesign is enabled"
    );

    await BrowserTestUtils.removeTab(tab);
  }
);

add_task(async function test_appearance_pane_loads_setting_groups() {
  let tab = await openPrefsTab("appearance");
  let doc = tab.linkedBrowser.contentDocument;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="appearance"]')
  );

  for (let groupId of ["appearance", "browserTheme", "relatedSettings"]) {
    let group = doc.querySelector(`setting-group[groupid="${groupId}"]`);
    ok(group, `${groupId} setting-group exists`);
    is_element_visible(group, `${groupId} setting-group is visible`);
  }

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_appearance_pane_click_sidebar() {
  let tab = await openPrefsTab("");
  let doc = tab.linkedBrowser.contentDocument;

  let navButton = doc.getElementById("category-appearance");
  await TestUtils.waitForCondition(
    () => navButton?.buttonEl,
    "Wait for appearance nav button to render"
  );

  let paneLoaded = waitForPaneChange("appearance");
  synthesizeClick(navButton);
  await paneLoaded;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="appearance"]')
  );
  ok(
    doc.querySelector('setting-group[groupid="appearance"]'),
    "Appearance setting-group is present after clicking appearance nav button"
  );

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_related_settings_accessibility_link_navigates() {
  let tab = await openPrefsTab("appearance");
  let doc = tab.linkedBrowser.contentDocument;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="relatedSettings"]')
  );

  let paneLoaded = waitForPaneChange("accessibility");
  synthesizeClick(getSettingControl("related-settings-accessibility-link"));
  await paneLoaded;

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_related_settings_home_link_navigates() {
  let tab = await openPrefsTab("appearance");
  let doc = tab.linkedBrowser.contentDocument;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="relatedSettings"]')
  );

  let paneLoaded = waitForPaneChange("home");
  synthesizeClick(getSettingControl("related-settings-home-link"));
  await paneLoaded;

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function test_related_settings_tabs_browsing_link_navigates() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", true]],
  });
  await openPreferencesViaOpenPreferencesAPI("appearance", {
    leaveOpen: true,
  });
  let doc = gBrowser.selectedBrowser.contentDocument;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="relatedSettings"]')
  );

  let paneLoaded = waitForPaneChange("tabsBrowsing");
  synthesizeClick(getSettingControl("related-settings-tabs-browsing-link"));
  await paneLoaded;

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

// Mirrors isAutoTouchModeAvailable() in appearance.mjs: the auto-touch-mode
// checkbox is only offered on Linux (GTK) and on tablet-capable Windows devices,
// so the checkbox stays hidden everywhere else regardless of the selected
// density. The visibility tests skip where it returns false rather than assert
// against a permanently hidden checkbox, which would pass without testing
// anything.
function autoTouchModeAvailable() {
  if (AppConstants.MOZ_WIDGET_GTK) {
    return true;
  }
  if (AppConstants.platform != "win") {
    return false;
  }
  return Cc["@mozilla.org/windows-ui-utils;1"].getService(Ci.nsIWindowsUIUtils)
    .isTabletCapable;
}

async function withWindowDensityPane(callback) {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.nova.enabled", true]],
  });
  // browser.uidensity is a sticky pref, so any user value set during the test
  // outlives pushPrefEnv. Start each task from the default (no user value, i.e.
  // automatic) and restore it when we're done.
  Services.prefs.clearUserPref("browser.uidensity");
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("browser.uidensity")
  );

  let tab = await openPrefsTab("appearance");
  let win = tab.linkedBrowser.contentWindow;
  let doc = win.document;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="windowDensity"]')
  );

  try {
    await callback({ tab, win, doc });
  } finally {
    BrowserTestUtils.removeTab(tab);
    await SpecialPowers.popPrefEnv();
  }
}

// Click a Window Density radio option in the pane the way a user would. The
// radio group re-renders asynchronously when browser.uidensity changes, so
// wait for it to settle (DOM value caught up to the setting model) before
// clicking to avoid operating on a stale, detached radio element.
async function selectDensityOption(control, value) {
  await control.updateComplete;
  await TestUtils.waitForCondition(
    () => control.controlEl?.value === control.setting.value,
    `density radio group settled before selecting "${value}"`
  );
  let radio = [...control.controlEl.querySelectorAll("moz-radio")].find(
    r => r.value == value
  );
  ok(radio?.inputEl, `moz-radio option for "${value}" exists`);
  // Click the radio's input directly. Coordinate-based clicking is unreliable
  // for the "standard" option, whose nested auto-touch checkbox shifts the
  // moz-radio's center off the radio input.
  radio.inputEl.click();
  await TestUtils.waitForCondition(
    () => control.setting.value == value,
    `uiDensity setting reflects "${value}" after clicking`
  );
}

add_task(async function test_window_density_group_visible_with_nova() {
  await withWindowDensityPane(async ({ win }) => {
    let group = win.document.querySelector(
      'setting-group[groupid="windowDensity"]'
    );
    ok(group, "windowDensity setting-group exists");
    is_element_visible(group, "windowDensity setting-group is visible");

    let control = getSettingControl("uiDensity", win);
    ok(control, "uiDensity setting-control exists");
    await control.updateComplete;
    is_element_visible(control, "uiDensity radio group is visible");
  });
});

add_task(async function test_window_density_radio_reflects_pref() {
  await withWindowDensityPane(async ({ win }) => {
    let control = getSettingControl("uiDensity", win);
    await control.updateComplete;

    const cases = [
      { pref: null, expected: "auto", desc: "no user value maps to automatic" },
      {
        pref: 0,
        expected: "standard",
        desc: "normal density maps to standard",
      },
      { pref: 1, expected: "compact", desc: "compact density maps to compact" },
      { pref: 2, expected: "touch", desc: "touch density maps to touch" },
    ];

    for (let { pref, expected, desc } of cases) {
      if (pref === null) {
        Services.prefs.clearUserPref("browser.uidensity");
      } else {
        Services.prefs.setIntPref("browser.uidensity", pref);
      }
      is(control.setting.value, expected, desc);
      await TestUtils.waitForCondition(
        () => control.controlEl.value === expected,
        `radio group renders "${expected}": ${desc}`
      );
    }
  });
});

add_task(async function test_window_density_radio_updates_pref() {
  await withWindowDensityPane(async ({ win }) => {
    let control = getSettingControl("uiDensity", win);
    await control.updateComplete;

    let selectOption = value => selectDensityOption(control, value);

    await selectOption("compact");
    is(
      Services.prefs.getIntPref("browser.uidensity"),
      1,
      "Selecting compact sets browser.uidensity to 1"
    );

    await selectOption("touch");
    is(
      Services.prefs.getIntPref("browser.uidensity"),
      2,
      "Selecting touch sets browser.uidensity to 2"
    );

    await selectOption("standard");
    ok(
      Services.prefs.prefHasUserValue("browser.uidensity"),
      "Selecting standard records an explicit user value"
    );
    is(
      Services.prefs.getIntPref("browser.uidensity"),
      0,
      "Selecting standard sets browser.uidensity to 0"
    );

    await selectOption("auto");
    ok(
      !Services.prefs.prefHasUserValue("browser.uidensity"),
      "Selecting automatic clears the browser.uidensity user value"
    );
  });
});

// Picking an explicit density in about:preferences must leave the user's
// browser.touchmode.auto choice untouched, even when the density is currently
// overridden (e.g. forced to touch by tablet mode). gUIDensity.getCurrentDensity
// already respects an explicit compact/touch value over the auto-touch pref, and
// the auto-touch pref is the standard density's own opt-in, so selecting a
// density should never rewrite it.
add_task(
  async function test_window_density_preserves_auto_touch_on_explicit_choice() {
    await withWindowDensityPane(async ({ win }) => {
      let control = getSettingControl("uiDensity", win);
      await control.updateComplete;

      let gUIDensity = win.browsingContext.topChromeWindow.gUIDensity;
      let originalGetCurrentDensity = gUIDensity.getCurrentDensity;
      // Simulate tablet mode's touch override without needing a real tablet, so
      // that any re-introduced clear-on-override logic would trigger here.
      gUIDensity.getCurrentDensity = () => ({
        mode: gUIDensity.MODE_TOUCH,
        overridden: true,
      });
      registerCleanupFunction(() => {
        gUIDensity.getCurrentDensity = originalGetCurrentDensity;
        Services.prefs.clearUserPref("browser.touchmode.auto");
        Services.prefs.clearUserPref("browser.uidensity");
      });

      let selectOption = value => selectDensityOption(control, value);

      Services.prefs.setBoolPref("browser.touchmode.auto", true);
      await selectOption("compact");
      is(
        Services.prefs.getIntPref("browser.uidensity"),
        1,
        "Selecting compact sets browser.uidensity to 1"
      );
      ok(
        Services.prefs.getBoolPref("browser.touchmode.auto"),
        "Selecting compact leaves browser.touchmode.auto untouched"
      );

      await selectOption("touch");
      ok(
        Services.prefs.getBoolPref("browser.touchmode.auto"),
        "Selecting touch leaves browser.touchmode.auto untouched"
      );

      await selectOption("standard");
      ok(
        Services.prefs.getBoolPref("browser.touchmode.auto"),
        "Selecting standard leaves browser.touchmode.auto untouched"
      );
    });
  }
);

// Assert the nested auto-touch checkbox's visibility. Only meaningful where
// auto-touch is available; callers skip otherwise.
async function assertAutoTouchCheckboxVisibility(win, expectVisible, desc) {
  let checkbox = getSettingControl("uiDensityAutoTouchMode", win);
  ok(checkbox, `auto-touch checkbox setting-control exists (${desc})`);
  await TestUtils.waitForCondition(
    () => checkbox.hidden === !expectVisible,
    `auto-touch checkbox ${expectVisible ? "shown" : "hidden"}: ${desc}`
  );
  if (expectVisible) {
    is_element_visible(checkbox, desc);
  } else {
    is_element_hidden(checkbox, desc);
  }
}

// The "Use touch spacing for tablet mode" checkbox is nested under the Standard
// density option and should only be shown while that option is selected.
add_task(async function test_window_density_auto_touch_checkbox_visibility() {
  if (!autoTouchModeAvailable()) {
    info(
      "Auto-touch mode is unavailable on this device, so the checkbox is " +
        "always hidden and there is nothing to assert. Note that this leaves " +
        "the shown path uncovered here; Linux (GTK) is where it runs."
    );
    return;
  }
  await withWindowDensityPane(async ({ win }) => {
    let control = getSettingControl("uiDensity", win);
    await control.updateComplete;

    let selectOption = value => selectDensityOption(control, value);
    let assertVisibility = (standardSelected, desc) =>
      assertAutoTouchCheckboxVisibility(win, standardSelected, desc);

    // The pane opens on automatic in a fresh profile.
    await assertVisibility(false, "automatic hides the checkbox on load");

    // Switch automatic to standard, with the int fixed at 0: the checkbox has to
    // appear the first time Standard is selected.
    await selectOption("standard");
    await assertVisibility(true, "standard shows the checkbox");

    // Switch standard to automatic, again with the int fixed at 0.
    await selectOption("auto");
    await assertVisibility(false, "automatic hides the checkbox");

    await selectOption("compact");
    await assertVisibility(false, "compact hides the checkbox");

    await selectOption("standard");
    await assertVisibility(true, "standard shows the checkbox again");

    await selectOption("touch");
    await assertVisibility(false, "touch hides the checkbox");
  });
});

// The checkbox must also follow the density changing from outside the pane (for
// example from another window), which has no radio click to piggyback on.
add_task(
  async function test_window_density_auto_touch_checkbox_follows_pref_changes() {
    if (!autoTouchModeAvailable()) {
      info(
        "Auto-touch mode is unavailable on this device, so the checkbox is " +
          "always hidden and there is nothing to assert. Note that this " +
          "leaves the shown path uncovered here; Linux (GTK) is where it runs."
      );
      return;
    }
    await withWindowDensityPane(async ({ win }) => {
      let control = getSettingControl("uiDensity", win);
      await control.updateComplete;
      let assertVisibility = (standardSelected, desc) =>
        assertAutoTouchCheckboxVisibility(win, standardSelected, desc);

      Services.prefs.setIntPref("browser.uidensity", 0);
      await assertVisibility(true, "explicit standard shows the checkbox");

      Services.prefs.clearUserPref("browser.uidensity");
      await assertVisibility(false, "cleared pref hides the checkbox");

      Services.prefs.setIntPref("browser.uidensity", 2);
      await assertVisibility(false, "touch hides the checkbox");

      Services.prefs.setIntPref("browser.uidensity", 0);
      await assertVisibility(true, "standard shows the checkbox");
    });
  }
);

add_task(async function test_browser_layout_group_in_tabs_browsing_pane() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.settings-redesign.enabled", true]],
  });
  await openPreferencesViaOpenPreferencesAPI("tabsBrowsing", {
    leaveOpen: true,
  });
  let doc = gBrowser.selectedBrowser.contentDocument;

  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector('setting-group[groupid="browserLayout"]')
  );

  let group = doc.querySelector('setting-group[groupid="browserLayout"]');
  ok(group, "browserLayout setting-group exists in tabs-browsing pane");
  is_element_visible(group, "browserLayout setting-group is visible");

  await BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
