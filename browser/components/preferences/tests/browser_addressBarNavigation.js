/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const RESULT_MENU_PREF = "browser.urlbar.resultMenu.keyboardAccessible";

add_task(async function test_skip_result_menu_checkbox() {
  await SpecialPowers.pushPrefEnv({ set: [[RESULT_MENU_PREF, true]] });

  let tab = await openPrefsTab("search");
  let win = tab.linkedBrowser.contentWindow;

  let control = await settingControlRenders("skipResultMenuOnTab", win);
  let checkbox = control.querySelector("moz-checkbox");

  ok(
    !checkbox.checked,
    "Checkbox is unchecked while the result menu is keyboard accessible"
  );

  let changed = waitForSettingControlChange(control);
  synthesizeClick(checkbox);
  await changed;

  ok(checkbox.checked, "Checkbox is checked after clicking");
  is(
    Services.prefs.getBoolPref(RESULT_MENU_PREF),
    false,
    "Checking the box makes the tab key skip the result menu"
  );

  changed = waitForSettingControlChange(control);
  synthesizeClick(checkbox);
  await changed;

  ok(!checkbox.checked, "Checkbox is unchecked after clicking again");
  is(
    Services.prefs.getBoolPref(RESULT_MENU_PREF),
    true,
    "Unchecking the box restores keyboard access to the result menu"
  );

  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_checkbox_follows_external_pref_change() {
  await SpecialPowers.pushPrefEnv({ set: [[RESULT_MENU_PREF, true]] });

  let tab = await openPrefsTab("search");
  let win = tab.linkedBrowser.contentWindow;

  let control = await settingControlRenders("skipResultMenuOnTab", win);
  let checkbox = control.querySelector("moz-checkbox");
  ok(!checkbox.checked, "Checkbox starts unchecked");

  let changed = waitForSettingControlChange(control);
  Services.prefs.setBoolPref(RESULT_MENU_PREF, false);
  await changed;

  ok(
    checkbox.checked,
    "Checkbox reflects the pref being changed outside of settings"
  );

  await BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_accessibility_link_navigates_to_the_group() {
  let tab = await openPrefsTab("accessibility");
  let doc = tab.linkedBrowser.contentDocument;
  let win = tab.linkedBrowser.contentWindow;

  let control = await settingControlRenders("addressBarNavigationLink", win);
  let link = control.querySelector("moz-box-link");
  ok(link, "The address bar navigation link is rendered");
  ok(
    control.closest('setting-group[groupid="keyboardAndScrolling"]'),
    "The link lives in the Keyboard navigation and scrolling group"
  );
  is(
    link.getAttribute("href"),
    "about:preferences#search-addressBarNavigation",
    "The link points at the Address bar navigation subcategory"
  );

  let paneShown = waitForPaneChange("search", win);
  synthesizeClick(link);
  await paneShown;

  let spotlight = await TestUtils.waitForCondition(
    () => doc.querySelector(".spotlight"),
    "Wait for the spotlight on the target group"
  );
  is(
    spotlight.getAttribute("data-subcategory"),
    "addressBarNavigation",
    "Clicking the link spotlights the Address bar navigation group"
  );

  win.spotlight(null);
  await BrowserTestUtils.removeTab(tab);
});
