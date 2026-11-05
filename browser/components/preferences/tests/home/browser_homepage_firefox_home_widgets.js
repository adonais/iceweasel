/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const WIDGETS_SYSTEM_PREF =
  "browser.newtabpage.activity-stream.widgets.system.enabled";
const WIDGETS_PREF = "browser.newtabpage.activity-stream.widgets.enabled";
const LISTS_SYSTEM_PREF =
  "browser.newtabpage.activity-stream.widgets.system.lists.enabled";
const TIMER_SYSTEM_PREF =
  "browser.newtabpage.activity-stream.widgets.system.focusTimer.enabled";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      // Opening preferences initializes FxA code which sets this pref.
      // Track it to avoid test warnings.
      ["identity.fxaccounts.account.device.name", ""],
    ],
  });
});

add_task(async function test_widgets_parent_toggle_visibility() {
  await SpecialPowers.pushPrefEnv({
    set: [[WIDGETS_SYSTEM_PREF, false]],
  });

  let { win, tab } = await openHomePreferences();

  let widgetsWrapper = getSettingControl("widgets", win);
  ok(
    !widgetsWrapper || BrowserTestUtils.isHidden(widgetsWrapper),
    "Widgets control is hidden when system pref is false"
  );

  BrowserTestUtils.removeTab(tab);

  await SpecialPowers.pushPrefEnv({
    set: [
      [WIDGETS_SYSTEM_PREF, true],
      [WIDGETS_PREF, true],
    ],
  });

  ({ win, tab } = await openHomePreferences());

  widgetsWrapper = await settingControlRenders("widgets", win);
  ok(widgetsWrapper, "Widgets control exists when system pref is true");
  ok(
    BrowserTestUtils.isVisible(widgetsWrapper),
    "Widgets control is visible when system pref is true"
  );

  let widgetsControl = await settingControlRenders("widgets", win);
  let toggle = widgetsControl.querySelector("moz-toggle");
  ok(toggle, "Widgets toggle exists");
  ok(toggle.pressed, "Widgets toggle is checked");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_widgets_has_no_per_widget_toggles() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [WIDGETS_SYSTEM_PREF, true],
      [WIDGETS_PREF, true],
      [LISTS_SYSTEM_PREF, true],
      [TIMER_SYSTEM_PREF, true],
    ],
  });

  let { win, tab } = await openHomePreferences();

  let manageWidgets = await settingControlRenders("manageWidgets", win);
  ok(
    BrowserTestUtils.isVisible(manageWidgets),
    "Manage widgets link is visible"
  );
  ok(
    manageWidgets.querySelector("moz-box-link"),
    "Manage widgets renders a moz-box-link"
  );
  for (let id of ["lists", "focusTimer", "weather"]) {
    ok(!getSettingControl(id, win), `${id} has no toggle on the Home pane`);
  }

  BrowserTestUtils.removeTab(tab);
});
