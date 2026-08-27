/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const RECENTLY_USED_ORDER_DEFAULT = false;
const UI_VERSION = 107;

const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);

add_task(async function has_not_used_ctrl_tab_and_its_off() {
  Services.prefs.setBoolPref("browser.engagement.ctrlTab.has-used", false);
  Services.prefs.setBoolPref("browser.ctrlTab.recentlyUsedOrder", false);

  // Simulate a migration.
  ProfileDataUpgrader.upgrade(UI_VERSION, UI_VERSION + 1);

  Assert.equal(
    RECENTLY_USED_ORDER_DEFAULT,
    Services.prefs.getBoolPref("browser.ctrlTab.sortByRecentlyUsed")
  );
});

add_task(async function has_not_used_ctrl_tab_and_its_on() {
  Services.prefs.setBoolPref("browser.engagement.ctrlTab.has-used", false);
  Services.prefs.setBoolPref("browser.ctrlTab.recentlyUsedOrder", true);

  // Simulate a migration.
  ProfileDataUpgrader.upgrade(UI_VERSION, UI_VERSION + 1);

  Assert.equal(
    RECENTLY_USED_ORDER_DEFAULT,
    Services.prefs.getBoolPref("browser.ctrlTab.sortByRecentlyUsed")
  );
});

add_task(async function has_used_ctrl_tab_and_its_off() {
  Services.prefs.setBoolPref("browser.engagement.ctrlTab.has-used", true);
  Services.prefs.setBoolPref("browser.ctrlTab.recentlyUsedOrder", false);

  // Simulate a migration.
  ProfileDataUpgrader.upgrade(UI_VERSION, UI_VERSION + 1);

  Assert.equal(
    false,
    Services.prefs.getBoolPref("browser.ctrlTab.sortByRecentlyUsed")
  );
});

add_task(async function has_used_ctrl_tab_and_its_on() {
  Services.prefs.setBoolPref("browser.engagement.ctrlTab.has-used", true);
  Services.prefs.setBoolPref("browser.ctrlTab.recentlyUsedOrder", true);

  // Simulate a migration.
  ProfileDataUpgrader.upgrade(UI_VERSION, UI_VERSION + 1);

  Assert.equal(
    true,
    Services.prefs.getBoolPref("browser.ctrlTab.sortByRecentlyUsed")
  );
});

add_task(async function has_used_ctrl_tab_and_its_default() {
  Services.prefs.setBoolPref("browser.engagement.ctrlTab.has-used", true);
  Services.prefs.clearUserPref("browser.ctrlTab.recentlyUsedOrder");

  // Simulate a migration.
  ProfileDataUpgrader.upgrade(UI_VERSION, UI_VERSION + 1);

  // Default had been true
  Assert.equal(
    true,
    Services.prefs.getBoolPref("browser.ctrlTab.sortByRecentlyUsed")
  );
});

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("browser.migration.version");
  Services.prefs.clearUserPref("browser.engagement.ctrlTab.has-used");
  Services.prefs.clearUserPref("browser.ctrlTab.recentlyUsedOrder");
  Services.prefs.clearUserPref("browser.ctrlTab.sortByRecentlyUsed");
});
