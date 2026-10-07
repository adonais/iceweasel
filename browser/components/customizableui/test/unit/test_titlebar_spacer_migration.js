/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test the two migrations that add the flexible space (spring) which replaced
 * the post-tabs titlebar-spacer to the horizontal tab strip:
 *
 *  - kVersion 26 inserts it to the left of the alltabs-button.
 *  - kVersion 28 covers the profiles version 26 skipped for lack of an
 *    alltabs-button to anchor to, appending the space to the tab strip unless
 *    one already sits somewhere after the tabs.
 *
 * Only the horizontal tab strip layout is touched: the live tabstrip placements
 * for users in horizontal tabs, and the saved horizontal snapshot for users
 * currently in vertical tabs (whose live tabstrip placements are empty).
 */

// eslint-disable-next-line mozilla/no-redeclare-with-import-autofix
const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
);

// The migrations insert a plain "spring", which is resolved to a generated
// customizableui-special-springN id when the area is later built.
const SPRING = "spring";
// A profile old enough that neither migration has run.
const VERSION_BEFORE_MIGRATIONS = 25;
// A profile that already went through the version 26 migration.
const VERSION_AFTER_ALLTABS_ANCHOR = 27;
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
 * Seed gSavedState at a pre-migration version and run the migrations.
 *
 * @param {object} placements
 *   The initial per-area saved placements.
 * @param {number} [currentVersion]
 *   The version the seeded state was last saved at.
 */
function migrateWithPlacements(
  placements,
  currentVersion = VERSION_BEFORE_MIGRATIONS
) {
  CustomizableUI.setTestOnlyInternalProp("gSavedState", {
    currentVersion,
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
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "new-tab-button", SPRING],
    "The spring goes at the end of the tab strip without an alltabs-button"
  );
});

add_task(async function test_no_alltabs_button_with_other_widgets() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "new-tab-button",
      "smartwindow-group-tabs-button",
      "ext1-browser-action",
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    [
      "tabbrowser-tabs",
      "new-tab-button",
      "smartwindow-group-tabs-button",
      "ext1-browser-action",
      SPRING,
    ],
    "The spring goes past whatever else the user has in the tab strip"
  );
});

add_task(async function test_spring_after_the_tabs_counts() {
  // A space the user put anywhere after the tabs already pushes what follows
  // it against the window controls, so it is the one we would have added.
  // Users who worked around bug 2069684 by dragging one in themselves land
  // here and should keep the layout they chose.
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "customizableui-special-spring1",
      "new-tab-button",
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "customizableui-special-spring1", "new-tab-button"],
    "A spring between the tabs and another widget is left to do the job"
  );
});

add_task(async function test_spring_before_the_tabs_does_not_count() {
  // A space the user added to pad the start of the tab strip is not the one
  // that keeps the window controls reachable.
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "customizableui-special-spring1",
      "tabbrowser-tabs",
      "new-tab-button",
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    [
      "customizableui-special-spring1",
      "tabbrowser-tabs",
      "new-tab-button",
      SPRING,
    ],
    "A spring further up the tab strip does not stop one being added at the end"
  );
});

add_task(async function test_removed_spring_is_not_restored() {
  // The user kept the alltabs-button, so version 26 gave them a spring and
  // they took it back out. Leave their layout alone.
  migrateWithPlacements(
    {
      [CustomizableUI.AREA_TABSTRIP]: [
        "tabbrowser-tabs",
        "new-tab-button",
        "alltabs-button",
      ],
    },
    VERSION_AFTER_ALLTABS_ANCHOR
  );
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "new-tab-button", "alltabs-button"],
    "A spring the user removed is not added back"
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

add_task(async function test_vertical_tabs_snapshot_no_alltabs_button() {
  Services.prefs.setCharPref(
    HORIZONTAL_SNAPSHOT_PREF,
    JSON.stringify(["tabbrowser-tabs", "new-tab-button"])
  );
  migrateWithPlacements({ [CustomizableUI.AREA_TABSTRIP]: [] });

  Assert.deepEqual(
    JSON.parse(Services.prefs.getCharPref(HORIZONTAL_SNAPSHOT_PREF)),
    ["tabbrowser-tabs", "new-tab-button", SPRING],
    "The snapshot gets a spring at the end without an alltabs-button"
  );

  Services.prefs.clearUserPref(HORIZONTAL_SNAPSHOT_PREF);
});
