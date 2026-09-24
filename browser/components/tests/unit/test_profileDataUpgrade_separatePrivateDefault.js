/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Bug 2031836: when the data version moves to 182, the search prefs
 * `browser.search.separatePrivateDefault` and
 * `browser.search.separatePrivateDefault.ui.enabled` are renamed to
 * `browser.search.separatePrivateDefault.enabled` and
 * `browser.search.separatePrivateDefault.featureGate` respectively, and the
 * old prefs are cleared. `.featureGate` should always mirror the old
 * `.ui.enabled` value. `.enabled` should only become true if the old UI pref
 * was enabled and the old `separatePrivateDefault` pref was not explicitly
 * set to false by the user (that pref defaulted to true, so "no user value"
 * means it was effectively true).
 */

const MIGRATION_VERSION = 182;

const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);

const OLD_ENABLED_PREF = "browser.search.separatePrivateDefault";
const OLD_UI_ENABLED_PREF = "browser.search.separatePrivateDefault.ui.enabled";
const NEW_ENABLED_PREF = "browser.search.separatePrivateDefault.enabled";
const NEW_FEATURE_GATE_PREF =
  "browser.search.separatePrivateDefault.featureGate";

// Sentinel meaning "do not set a user value for this pref".
const UNSET = Symbol("unset");

function setUpOldPrefs(uiEnabled, oldEnabled) {
  Services.prefs.clearUserPref(OLD_UI_ENABLED_PREF);
  Services.prefs.clearUserPref(OLD_ENABLED_PREF);
  Services.prefs.clearUserPref(NEW_ENABLED_PREF);
  Services.prefs.clearUserPref(NEW_FEATURE_GATE_PREF);

  if (uiEnabled !== UNSET) {
    Services.prefs.setBoolPref(OLD_UI_ENABLED_PREF, uiEnabled);
  }
  if (oldEnabled !== UNSET) {
    Services.prefs.setBoolPref(OLD_ENABLED_PREF, oldEnabled);
  }
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("browser.migration.version");
  Services.prefs.clearUserPref(OLD_UI_ENABLED_PREF);
  Services.prefs.clearUserPref(OLD_ENABLED_PREF);
  Services.prefs.clearUserPref(NEW_ENABLED_PREF);
  Services.prefs.clearUserPref(NEW_FEATURE_GATE_PREF);
});

const SCENARIOS = [
  {
    name: "ui enabled, old pref never touched by the user",
    uiEnabled: true,
    oldEnabled: UNSET,
    expectedFeatureGate: true,
    expectedEnabled: true,
  },
  {
    name: "ui enabled, old pref explicitly set to true",
    uiEnabled: true,
    oldEnabled: true,
    expectedFeatureGate: true,
    expectedEnabled: true,
  },
  {
    name: "ui enabled, old pref explicitly set to false",
    uiEnabled: true,
    oldEnabled: false,
    expectedFeatureGate: true,
    expectedEnabled: false,
  },
  {
    name: "ui disabled, old pref never touched by the user",
    uiEnabled: UNSET,
    oldEnabled: UNSET,
    expectedFeatureGate: false,
    expectedEnabled: false,
  },
  {
    name: "ui explicitly disabled, old pref explicitly set to true",
    uiEnabled: false,
    oldEnabled: true,
    expectedFeatureGate: false,
    expectedEnabled: false,
  },
];

add_task(async function test_migratesSeparatePrivateDefaultPrefs() {
  for (let scenario of SCENARIOS) {
    setUpOldPrefs(scenario.uiEnabled, scenario.oldEnabled);

    ProfileDataUpgrader.upgrade(MIGRATION_VERSION - 1, MIGRATION_VERSION);

    Assert.equal(
      Services.prefs.getBoolPref(NEW_FEATURE_GATE_PREF, false),
      scenario.expectedFeatureGate,
      `${scenario.name}: featureGate pref has the expected value`
    );
    Assert.equal(
      Services.prefs.getBoolPref(NEW_ENABLED_PREF, false),
      scenario.expectedEnabled,
      `${scenario.name}: enabled pref has the expected value`
    );
    Assert.ok(
      !Services.prefs.prefHasUserValue(OLD_UI_ENABLED_PREF),
      `${scenario.name}: old ui.enabled pref was cleared`
    );
    Assert.ok(
      !Services.prefs.prefHasUserValue(OLD_ENABLED_PREF),
      `${scenario.name}: old separatePrivateDefault pref was cleared`
    );
  }
});

add_task(async function test_doesNotRunAgainForAlreadyMigratedProfiles() {
  // Use values that differ from the old prefs' (simulated) defaults, so that
  // real user overrides are created and survive the assertions below -
  // setting a pref to its own default value does not create a user value.
  setUpOldPrefs(true, false);

  ProfileDataUpgrader.upgrade(MIGRATION_VERSION, MIGRATION_VERSION + 1);

  Assert.ok(
    !Services.prefs.prefHasUserValue(NEW_FEATURE_GATE_PREF),
    "featureGate pref was not touched for an already-migrated profile"
  );
  Assert.ok(
    !Services.prefs.prefHasUserValue(NEW_ENABLED_PREF),
    "enabled pref was not touched for an already-migrated profile"
  );
  Assert.ok(
    Services.prefs.prefHasUserValue(OLD_UI_ENABLED_PREF),
    "old ui.enabled pref survives when the migration does not run"
  );
  Assert.ok(
    Services.prefs.prefHasUserValue(OLD_ENABLED_PREF),
    "old separatePrivateDefault pref survives when the migration does not run"
  );
});
