/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that we remove the firefox view button from the upper left corner for
 * new profiles and users with the value of `browser.firefox-view.button-clicks`
 * 2 or less.
 */

// eslint-disable-next-line mozilla/no-redeclare-with-import-autofix
const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
);

const BUTTON_CLICKS_PREF = "browser.firefox-view.button-clicks";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Read the saved state for a given area.
 *
 * @returns {string[]}
 */
function getSavedStatePlacements(area) {
  return CustomizableUI.getTestOnlyInternalProp("gSavedState").placements[area];
}

const { updateForNewVersion } = CustomizableUI.getTestOnlyInternalProp(
  "CustomizableUIInternal"
);

/**
 * Assert whether the firefox view button is removed after migrating.
 *
 * @param {object} options
 * @param {string} options.area
 *   The area that the button initially belongs to.
 * @param {object} options.placements
 *   The initial saved state.
 * @param {boolean} options.isRemoved
 *   If true, asserts the button is gone; otherwise asserts it's present.
 * @param {string} message
 */
function assertButtonRemovedAfterMigrate(
  { area, placements, isRemoved = true },
  message
) {
  CustomizableUI.setTestOnlyInternalProp("gSavedState", {
    currentVersion: 24,
    placements,
  });
  updateForNewVersion();
  Assert.equal(
    !getSavedStatePlacements(area)?.includes("firefox-view-button"),
    isRemoved,
    message
  );
}

for (const [area, verticalTabsEnabled] of [
  [CustomizableUI.AREA_TABSTRIP, false],
  [CustomizableUI.AREA_NAVBAR, true],
]) {
  const getPlacements = () => ({
    [area]: verticalTabsEnabled
      ? ["firefox-view-button", "alltabs-button"]
      : ["firefox-view-button", "tabbrowser-tabs"],
  });

  add_task(async function test_new_profile() {
    Services.prefs.setBoolPref("sidebar.verticalTabs", verticalTabsEnabled);
    Services.prefs.clearUserPref(BUTTON_CLICKS_PREF);

    // Pref is unchanged: button removed
    assertButtonRemovedAfterMigrate(
      { area, placements: getPlacements() },
      "firefox-view-button should be removed for new profile with no usage"
    );
  });

  add_task(async function test_low_clicks_recent() {
    // User with <=2 clicks in the last 30 days: button removed
    Services.prefs.setStringPref(
      BUTTON_CLICKS_PREF,
      JSON.stringify({ count: 2, lastCountTime: Date.now() })
    );
    assertButtonRemovedAfterMigrate(
      { area, placements: getPlacements() },
      "firefox-view-button should be removed when clicks <= 2 and recent"
    );
  });

  add_task(async function test_high_clicks_recent() {
    // User with >2 clicks in the last 30 days: button kept
    Services.prefs.setStringPref(
      BUTTON_CLICKS_PREF,
      JSON.stringify({ count: 5, lastCountTime: Date.now() })
    );
    assertButtonRemovedAfterMigrate(
      { area, placements: getPlacements(), isRemoved: false },
      "firefox-view-button should be kept when clicks > 2 and recent"
    );
  });

  add_task(async function test_old_clicks() {
    // User with >2 clicks: button kept regardless of when they last clicked
    Services.prefs.setStringPref(
      BUTTON_CLICKS_PREF,
      JSON.stringify({ count: 5, lastCountTime: Date.now() - 31 * MS_PER_DAY })
    );
    assertButtonRemovedAfterMigrate(
      { area, placements: getPlacements(), isRemoved: false },
      "firefox-view-button should be kept when clicks > 2 even if they are old"
    );
  });

  add_task(async function test_invalid_pref_json() {
    // Malformed pref JSON should not crash, button removed as if no clicks
    Services.prefs.setStringPref(BUTTON_CLICKS_PREF, "invalid json");
    assertButtonRemovedAfterMigrate(
      { area, placements: getPlacements() },
      "firefox-view-button should be removed on malformed pref data"
    );

    Services.prefs.setStringPref(BUTTON_CLICKS_PREF, "null");
    assertButtonRemovedAfterMigrate(
      { area, placements: getPlacements() },
      "firefox-view-button should be removed on non-object pref data"
    );
  });

  add_task(async function test_not_in_placements() {
    Services.prefs.clearUserPref(BUTTON_CLICKS_PREF);
    const placements = {
      [area]: ["home-button"],
    };
    assertButtonRemovedAfterMigrate(
      { area, placements },
      "migration should no-op when firefox-view-button is not in placements"
    );
  });

  add_task(async function test_moved_from_default_position() {
    Services.prefs.clearUserPref(BUTTON_CLICKS_PREF);
    const placements = {
      [area]: ["home-button", "firefox-view-button"],
    };
    assertButtonRemovedAfterMigrate(
      { area, placements, isRemoved: false },
      "firefox-view-button should be kept if its placement was modified from the default position"
    );
  });
}
