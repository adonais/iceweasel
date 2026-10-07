/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// eslint-disable-next-line mozilla/no-redeclare-with-import-autofix
const { CustomizableUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
);

const ORGANIZE_TABS = "smartwindow-group-tabs-button";
const SWITCHER = "ai-window-toggle";
// The migration bumps the version to 27, so start one below it.
const PRIOR_MIGRATION_VERSION = 26;
const VERTICAL_TABS_PREF = "sidebar.verticalTabs";
const HORIZONTAL_SNAPSHOT_PREF = "browser.uiCustomization.horizontalTabstrip";
const VERTICAL_NAVBAR_SNAPSHOT_PREF =
  "browser.uiCustomization.navBarWhenVerticalTabs";

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
 * @param {object} [options]
 * @param {string[]} [options.seen]
 *   Widgets the profile has already registered once. Defaults to both
 *   buttons, which is the state of any profile that hit the bug.
 */
function migrateWithPlacements(
  placements,
  { seen = [ORGANIZE_TABS, SWITCHER] } = {}
) {
  const seenWidgets = CustomizableUI.getTestOnlyInternalProp("gSeenWidgets");
  seenWidgets.clear();
  for (const id of seen) {
    seenWidgets.add(id);
  }
  CustomizableUI.setTestOnlyInternalProp("gSavedState", {
    currentVersion: PRIOR_MIGRATION_VERSION,
    placements,
  });
  updateForNewVersion();
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(VERTICAL_TABS_PREF);
  Services.prefs.clearUserPref(HORIZONTAL_SNAPSHOT_PREF);
  Services.prefs.clearUserPref(VERTICAL_NAVBAR_SNAPSHOT_PREF);
});

add_task(async function test_appended_button_is_swapped() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "alltabs-button",
      SWITCHER,
      ORGANIZE_TABS,
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "alltabs-button", ORGANIZE_TABS, SWITCHER],
    "A button appended after the switcher is swapped to its left"
  );
});

add_task(async function test_idempotent() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "alltabs-button",
      ORGANIZE_TABS,
      SWITCHER,
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "alltabs-button", ORGANIZE_TABS, SWITCHER],
    "A button already in place is left untouched"
  );
});

add_task(async function test_never_seen_button_is_inserted() {
  migrateWithPlacements(
    {
      [CustomizableUI.AREA_TABSTRIP]: [
        "tabbrowser-tabs",
        "alltabs-button",
        SWITCHER,
      ],
    },
    { seen: [SWITCHER] }
  );
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "alltabs-button", ORGANIZE_TABS, SWITCHER],
    "A button the profile has never created is reserved a slot left of the switcher"
  );
});

add_task(async function test_removed_button_stays_removed() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "alltabs-button",
      SWITCHER,
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "alltabs-button", SWITCHER],
    "A button the user removed to the palette is not put back"
  );
});

add_task(async function test_placed_button_missing_from_seen_widgets() {
  migrateWithPlacements(
    {
      [CustomizableUI.AREA_TABSTRIP]: [
        "tabbrowser-tabs",
        "alltabs-button",
        SWITCHER,
      ],
      [CustomizableUI.AREA_BOOKMARKS]: ["personal-bookmarks", ORGANIZE_TABS],
    },
    { seen: [SWITCHER] }
  );
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "alltabs-button", SWITCHER],
    "A button already placed somewhere is not inserted again when gSeenWidgets lacks it"
  );
});

add_task(async function test_switcher_moved_to_overflow_menu() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "alltabs-button",
      ORGANIZE_TABS,
    ],
    [CustomizableUI.AREA_FIXED_OVERFLOW_PANEL]: [SWITCHER],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "alltabs-button", ORGANIZE_TABS],
    "The button keeps its default slot when the switcher has been pinned away"
  );
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_FIXED_OVERFLOW_PANEL),
    [SWITCHER],
    "The button does not follow the switcher into the overflow menu"
  );
});

add_task(async function test_horizontal_tabs_switcher_moved_to_navbar() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [
      "tabbrowser-tabs",
      "alltabs-button",
      ORGANIZE_TABS,
    ],
    [CustomizableUI.AREA_NAVBAR]: ["urlbar-container", SWITCHER],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    ["tabbrowser-tabs", "alltabs-button", ORGANIZE_TABS],
    "With horizontal tabs the button stays in the visible tab strip"
  );
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_NAVBAR),
    ["urlbar-container", SWITCHER],
    "The button does not follow a switcher the user moved to the nav-bar"
  );
});

add_task(async function test_vertical_tabs_appended_to_navbar() {
  Services.prefs.setBoolPref(VERTICAL_TABS_PREF, true);
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [],
    [CustomizableUI.AREA_NAVBAR]: [
      "urlbar-container",
      "alltabs-button",
      SWITCHER,
      ORGANIZE_TABS,
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_NAVBAR),
    ["urlbar-container", "alltabs-button", ORGANIZE_TABS, SWITCHER],
    "A button appended to the nav-bar under vertical tabs is swapped"
  );
  Services.prefs.clearUserPref(VERTICAL_TABS_PREF);
});

add_task(async function test_vertical_tabs_stranded_in_hidden_tabstrip() {
  // Before bug 2066894 a widget defaulting to the tab strip was appended
  // there even while tabs were vertical, where the user cannot see it.
  Services.prefs.setBoolPref(VERTICAL_TABS_PREF, true);
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [ORGANIZE_TABS],
    [CustomizableUI.AREA_NAVBAR]: [
      "urlbar-container",
      "alltabs-button",
      SWITCHER,
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_TABSTRIP),
    [],
    "The stray button is taken out of the hidden tab strip"
  );
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_NAVBAR),
    ["urlbar-container", "alltabs-button", ORGANIZE_TABS, SWITCHER],
    "The button joins the switcher in the nav-bar"
  );
  Services.prefs.clearUserPref(VERTICAL_TABS_PREF);
});

add_task(async function test_vertical_tabs_button_in_both_areas() {
  Services.prefs.setBoolPref(VERTICAL_TABS_PREF, true);
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [ORGANIZE_TABS],
    [CustomizableUI.AREA_NAVBAR]: ["urlbar-container", SWITCHER, ORGANIZE_TABS],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_NAVBAR),
    ["urlbar-container", ORGANIZE_TABS, SWITCHER],
    "A stray copy in the hidden tab strip is not pulled in as a second nav-bar entry"
  );
  Services.prefs.clearUserPref(VERTICAL_TABS_PREF);
});

add_task(async function test_vertical_tabs_sidebar_button_pinned_to_end() {
  // With the sidebar on the right the sidebar button is kept at the end of
  // the nav-bar, so a button appended later lands just past it.
  Services.prefs.setBoolPref(VERTICAL_TABS_PREF, true);
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [],
    [CustomizableUI.AREA_NAVBAR]: [
      "urlbar-container",
      "alltabs-button",
      SWITCHER,
      "sidebar-button",
      ORGANIZE_TABS,
    ],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_NAVBAR),
    [
      "urlbar-container",
      "alltabs-button",
      ORGANIZE_TABS,
      SWITCHER,
      "sidebar-button",
    ],
    "A button appended past the pinned sidebar button moves before the switcher"
  );
  Services.prefs.clearUserPref(VERTICAL_TABS_PREF);
});

add_task(async function test_horizontal_snapshot() {
  // A user currently in vertical tabs: the horizontal layout they will return
  // to lives in the snapshot pref rather than the live tabstrip placements.
  Services.prefs.setCharPref(
    HORIZONTAL_SNAPSHOT_PREF,
    JSON.stringify([
      "tabbrowser-tabs",
      "alltabs-button",
      SWITCHER,
      ORGANIZE_TABS,
    ])
  );
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [],
    [CustomizableUI.AREA_NAVBAR]: ["urlbar-container"],
  });

  Assert.deepEqual(
    JSON.parse(Services.prefs.getCharPref(HORIZONTAL_SNAPSHOT_PREF)),
    ["tabbrowser-tabs", "alltabs-button", ORGANIZE_TABS, SWITCHER],
    "The horizontal snapshot is migrated too"
  );

  Services.prefs.clearUserPref(HORIZONTAL_SNAPSHOT_PREF);
});

add_task(async function test_snapshots_predate_button() {
  // Snapshots captured before the button existed lack it for that reason:
  // the live placements say the button is placed, so both get it back
  // beside the switcher.
  Services.prefs.setCharPref(
    HORIZONTAL_SNAPSHOT_PREF,
    JSON.stringify(["tabbrowser-tabs", "alltabs-button", SWITCHER])
  );
  Services.prefs.setCharPref(
    VERTICAL_NAVBAR_SNAPSHOT_PREF,
    JSON.stringify(["urlbar-container", "alltabs-button", SWITCHER])
  );
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: [],
    [CustomizableUI.AREA_NAVBAR]: ["urlbar-container", ORGANIZE_TABS, SWITCHER],
  });

  Assert.deepEqual(
    JSON.parse(Services.prefs.getCharPref(HORIZONTAL_SNAPSHOT_PREF)),
    ["tabbrowser-tabs", "alltabs-button", ORGANIZE_TABS, SWITCHER],
    "A placed button is added to a horizontal snapshot that predates it"
  );
  Assert.deepEqual(
    JSON.parse(Services.prefs.getCharPref(VERTICAL_NAVBAR_SNAPSHOT_PREF)),
    ["urlbar-container", "alltabs-button", ORGANIZE_TABS, SWITCHER],
    "A placed button is added to a vertical nav-bar snapshot that predates it"
  );

  Services.prefs.clearUserPref(HORIZONTAL_SNAPSHOT_PREF);
  Services.prefs.clearUserPref(VERTICAL_NAVBAR_SNAPSHOT_PREF);
});

add_task(async function test_removed_button_not_added_to_snapshots() {
  Services.prefs.setCharPref(
    HORIZONTAL_SNAPSHOT_PREF,
    JSON.stringify(["tabbrowser-tabs", "alltabs-button", SWITCHER])
  );
  Services.prefs.setCharPref(
    VERTICAL_NAVBAR_SNAPSHOT_PREF,
    JSON.stringify(["urlbar-container", "alltabs-button", SWITCHER])
  );
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: ["tabbrowser-tabs", "alltabs-button"],
    [CustomizableUI.AREA_NAVBAR]: ["urlbar-container", SWITCHER],
  });

  Assert.deepEqual(
    JSON.parse(Services.prefs.getCharPref(HORIZONTAL_SNAPSHOT_PREF)),
    ["tabbrowser-tabs", "alltabs-button", SWITCHER],
    "A button the user removed is not put back into the horizontal snapshot"
  );
  Assert.deepEqual(
    JSON.parse(Services.prefs.getCharPref(VERTICAL_NAVBAR_SNAPSHOT_PREF)),
    ["urlbar-container", "alltabs-button", SWITCHER],
    "A button the user removed is not put back into the vertical snapshot"
  );

  Services.prefs.clearUserPref(HORIZONTAL_SNAPSHOT_PREF);
  Services.prefs.clearUserPref(VERTICAL_NAVBAR_SNAPSHOT_PREF);
});

add_task(async function test_corrupt_area_placements() {
  migrateWithPlacements({
    [CustomizableUI.AREA_TABSTRIP]: "not-an-array",
    [CustomizableUI.AREA_NAVBAR]: ["urlbar-container", SWITCHER, ORGANIZE_TABS],
  });
  Assert.deepEqual(
    getSavedStatePlacements(CustomizableUI.AREA_NAVBAR),
    ["urlbar-container", ORGANIZE_TABS, SWITCHER],
    "A non-array area in the saved state is skipped rather than thrown on"
  );
});
