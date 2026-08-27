/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test the migration (kVersion 26) that adds a flexible space (spring) to the
 * left of the alltabs-button. Only the horizontal tab strip layout is touched:
 * the live tabstrip placements for users in horizontal tabs, and the saved
 * horizontal snapshot for users currently in vertical tabs (whose live tabstrip
 * placements are empty).
 */

// eslint-disable-next-line mozilla/no-redeclare-with-import-autofix
const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
);

// The migration inserts a plain "spring", which is resolved to a generated
// customizableui-special-springN id when the area is later built.
const SPRING = "spring";
// The migration bumps the version to 26, so start one below it.
const PRIOR_MIGRATION_VERSION = 25;
const HORIZONTAL_SNAPSHOT_PREF = "browser.uiCustomization.horizontalTabstrip";

const { updateForNewVersion } = CustomizableUI.getTestOnlyInternalProp(
  "CustomizableUIInternal"
);

/**
 * Read the migrated saved state for a given area.
 *
 * @param {string} area
 * @returns {string[]}
 */
function getSavedStatePlacements(area) {
  return CustomizableUI.getTestOnlyInternalProp("gSavedState").placements[area];
}

/**
 * Seed gSavedState at the pre-migration version and run the migration.
 *
 * @param {object} placements
 *   The initial per-area saved placements.
 */
function migrateWithPlacements(placements) {
  CustomizableUI.setTestOnlyInternalProp("gSavedState", {
    currentVersion: PRIOR_MIGRATION_VERSION,
    placements,
  });
  updateForNewVersion();
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(HORIZONTAL_SNAPSHOT_PREF);
});

add_task(async function test_inserted_before_alltabs() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "new-tab-button",
      "alltabs-button",
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "new-tab-button", SPRING, "alltabs-button"],
    "The spring is inserted immediately before alltabs-button"
  );
});

add_task(async function test_idempotent() {
  // An existing spring already resolved to a customizableui-special-springN id.
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "new-tab-button",
      "customizableui-special-spring1",
      "alltabs-button",
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    [
      "tabbrowser-tabs",
      "new-tab-button",
      "customizableui-special-spring1",
      "alltabs-button",
    ],
    "No spring is added when one is already present before alltabs-button"
  );
});

add_task(async function test_no_alltabs_button() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: ["tabbrowser-tabs", "new-tab-button"],
  });
  Assert.ok(
    !getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP).includes(SPRING),
    "No spring is added when there is no alltabs-button to anchor to"
  );
});

add_task(async function test_vertical_tabs_snapshot() {
  // A user currently in vertical tabs: the live tabstrip placements are empty
  // and the horizontal layout lives in the snapshot pref.
  Services.prefs.setCharPref(
    HORIZONTAL_SNAPSHOT_PREF,
    JSON.stringify(["tabbrowser-tabs", "new-tab-button", "alltabs-button"])
  );
  migrateWithPlacements({ [CustomizableUI.AREA_TABSTRIP]: [] });

  Assert.deepEqual(
    JSON.parse(Services.prefs.getCharPref(HORIZONTAL_SNAPSHOT_PREF)),
    ["tabbrowser-tabs", "new-tab-button", SPRING, "alltabs-button"],
    "The spring is inserted into the horizontal snapshot for vertical-tabs users"
  );
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    [],
    "The live (empty) tabstrip placements are left untouched"
  );

  Services.prefs.clearUserPref(HORIZONTAL_SNAPSHOT_PREF);
});
