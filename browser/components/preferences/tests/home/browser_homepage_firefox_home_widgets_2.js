/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const WIDGETS_SYSTEM_PREF =
  "browser.newtabpage.activity-stream.widgets.system.enabled";
const WIDGETS_PREF = "browser.newtabpage.activity-stream.widgets.enabled";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      // Opening preferences initializes FxA code which sets this pref.
      // Track it to avoid test warnings.
      ["identity.fxaccounts.account.device.name", ""],
    ],
  });
});

add_task(async function test_manage_widgets_follows_widgets_toggle() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [WIDGETS_SYSTEM_PREF, true],
      [WIDGETS_PREF, false],
    ],
  });

  let { win, tab } = await openHomePreferences();

  let widgetsControl = await settingControlRenders("widgets", win);
  let toggle = widgetsControl.controlEl;
  await toggle.updateComplete;
  ok(!toggle.pressed, "Widgets toggle is unchecked");

  let manageWidgets = getSettingControl("manageWidgets", win);
  ok(
    !manageWidgets || BrowserTestUtils.isHidden(manageWidgets),
    "Manage widgets is hidden while Widgets is off"
  );

  let prefChanged = waitForPrefChange(WIDGETS_PREF, true);
  toggle.click();
  await prefChanged;
  await waitForToggleState(toggle, true);

  manageWidgets = await settingControlRenders("manageWidgets", win);
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(manageWidgets),
    "Manage widgets appears once Widgets is turned on"
  );

  prefChanged = waitForPrefChange(WIDGETS_PREF, false);
  toggle.click();
  await prefChanged;
  await waitForToggleState(toggle, false);

  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(manageWidgets),
    "Manage widgets is hidden again once Widgets is turned off"
  );

  BrowserTestUtils.removeTab(tab);
});
