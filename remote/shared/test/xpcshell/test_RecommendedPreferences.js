/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { RecommendedPreferences } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/RecommendedPreferences.sys.mjs"
);

const COMMON_PREF = "toolkit.startup.max_resumed_crashes";
const COMMON_PREF_VALUE = -1;

const PROTOCOL_1_PREF = "dom.disable_beforeunload";
const PROTOCOL_1_PREF_VALUE = true;
const PROTOCOL_1_RECOMMENDED_PREFS = new Map([
  [PROTOCOL_1_PREF, PROTOCOL_1_PREF_VALUE],
]);

const PROTOCOL_2_PREF = "browser.contentblocking.features.standard";
const PROTOCOL_2_PREF_VALUE = "-tp,tpPrivate,cookieBehavior0,-cm,-fp";
const PROTOCOL_2_RECOMMENDED_PREFS = new Map([
  [PROTOCOL_2_PREF, PROTOCOL_2_PREF_VALUE],
]);

function cleanup() {
  info("Restore recommended preferences and test preferences");
  Services.prefs.clearUserPref("remote.prefs.recommended");
  RecommendedPreferences.resetForTesting();
}

// cleanup() should be called:
// - explicitly after each test to avoid side effects
// - via registerCleanupFunction in case a test crashes/times out
registerCleanupFunction(cleanup);

add_task(async function test_multipleClients() {
  info("Check initial values for the test preferences");
  checkPreferences({ common: false, protocol_1: false, protocol_2: false });

  info("Apply recommended preferences for a protocol_1 client");
  RecommendedPreferences.applyPreferences(PROTOCOL_1_RECOMMENDED_PREFS);
  checkPreferences({ common: true, protocol_1: true, protocol_2: false });

  info("Apply recommended preferences for a protocol_2 client");
  RecommendedPreferences.applyPreferences(PROTOCOL_2_RECOMMENDED_PREFS);
  checkPreferences({ common: true, protocol_1: true, protocol_2: true });

  info("Restore all the altered preferences");
  RecommendedPreferences.resetForTesting();
  checkPreferences({ common: false, protocol_1: false, protocol_2: false });

  info("Attempts to restore again");
  RecommendedPreferences.resetForTesting();
  checkPreferences({ common: false, protocol_1: false, protocol_2: false });

  cleanup();
});

add_task(async function test_disabled() {
  info("Disable RecommendedPreferences");
  Services.prefs.setBoolPref("remote.prefs.recommended", false);

  info("Check initial values for the test preferences");
  checkPreferences({ common: false, protocol_1: false, protocol_2: false });

  info("Recommended preferences are not applied, applyPreferences is a no-op");
  RecommendedPreferences.applyPreferences(PROTOCOL_1_RECOMMENDED_PREFS);
  checkPreferences({ common: false, protocol_1: false, protocol_2: false });

  cleanup();
});

add_task(async function test_noCustomPreferences() {
  info("Applying preferences without any custom preference should not throw");

  // First call invokes setting of default preferences
  RecommendedPreferences.applyPreferences();

  // Second call does nothing
  RecommendedPreferences.applyPreferences();

  cleanup();
});

// Check that protocols can override common preferences.
add_task(async function test_override() {
  info("Make sure the common preference has no user value");
  Services.prefs.clearUserPref(COMMON_PREF);

  const OVERRIDE_VALUE = 42;
  const OVERRIDE_COMMON_PREF = new Map([[COMMON_PREF, OVERRIDE_VALUE]]);

  info("Apply a map of preferences overriding a common preference");
  RecommendedPreferences.applyPreferences(OVERRIDE_COMMON_PREF);

  equal(
    Services.prefs.getIntPref(COMMON_PREF),
    OVERRIDE_VALUE,
    "The common preference was set to the expected value"
  );

  cleanup();
});

// Check that no preference ends up on the user branch, which would persist it
// in the profile's prefs.js file.
add_task(async function test_noUserValues() {
  // The xpcshell profile already sets some of the recommended preferences on
  // the user branch, so only consider the ones added by applyPreferences.
  const before = Services.prefs
    .getChildList("")
    .filter(pref => Services.prefs.prefHasUserValue(pref));

  RecommendedPreferences.applyPreferences(PROTOCOL_1_RECOMMENDED_PREFS);

  const added = Services.prefs
    .getChildList("")
    .filter(pref => Services.prefs.prefHasUserValue(pref))
    .filter(pref => !before.includes(pref));

  deepEqual(added, [], "No preference was set on the user branch");

  cleanup();
});

// Check that restoring puts back the original default value, and removes
// preferences which had no default value at all.
add_task(async function test_restoreDefaultValues() {
  const PREF_WITH_DEFAULT = PROTOCOL_1_PREF;
  const PREF_WITHOUT_DEFAULT = "remote.test.recommended.no.default";

  const originalValue = Services.prefs.getBoolPref(PREF_WITH_DEFAULT);
  notEqual(
    originalValue,
    PROTOCOL_1_PREF_VALUE,
    "The preference does not default to the recommended value"
  );
  equal(
    Services.prefs.getPrefType(PREF_WITHOUT_DEFAULT),
    Services.prefs.PREF_INVALID,
    "The preference without a default value does not exist yet"
  );

  RecommendedPreferences.applyPreferences(
    new Map([
      [PREF_WITH_DEFAULT, PROTOCOL_1_PREF_VALUE],
      [PREF_WITHOUT_DEFAULT, "recommended"],
    ])
  );

  equal(
    Services.prefs.getBoolPref(PREF_WITH_DEFAULT),
    PROTOCOL_1_PREF_VALUE,
    "The preference with a default value was applied"
  );
  equal(
    Services.prefs.getStringPref(PREF_WITHOUT_DEFAULT),
    "recommended",
    "The preference without a default value was applied"
  );

  RecommendedPreferences.resetForTesting();

  equal(
    Services.prefs.getBoolPref(PREF_WITH_DEFAULT),
    originalValue,
    "The original default value was restored"
  );
  equal(
    Services.prefs.getPrefType(PREF_WITHOUT_DEFAULT),
    Services.prefs.PREF_INVALID,
    "The preference without a default value was removed"
  );

  cleanup();
});

// Check that a user value set by a client keeps precedence, and is left
// untouched when the recommended preferences are restored.
add_task(async function test_userValueHasPrecedence() {
  const USER_VALUE = 42;
  Services.prefs.setIntPref(COMMON_PREF, USER_VALUE);

  RecommendedPreferences.applyPreferences();
  equal(
    Services.prefs.getIntPref(COMMON_PREF),
    USER_VALUE,
    "The user value has precedence over the recommended value"
  );

  RecommendedPreferences.resetForTesting();
  equal(
    Services.prefs.getIntPref(COMMON_PREF),
    USER_VALUE,
    "The user value was not modified"
  );

  Services.prefs.clearUserPref(COMMON_PREF);
  cleanup();
});

function checkPreferences({ common, protocol_1, protocol_2 }) {
  checkPreference(COMMON_PREF, COMMON_PREF_VALUE, { applied: common });
  checkPreference(PROTOCOL_1_PREF, PROTOCOL_1_PREF_VALUE, {
    applied: protocol_1,
  });
  checkPreference(PROTOCOL_2_PREF, PROTOCOL_2_PREF_VALUE, {
    applied: protocol_2,
  });
}

function checkPreference(pref, value, { applied }) {
  equal(
    RecommendedPreferences.alteredPrefs.has(pref),
    applied,
    applied
      ? `The preference ${pref} is tracked as altered`
      : `The preference ${pref} is not tracked as altered`
  );

  ok(
    !Services.prefs.prefHasUserValue(pref),
    `The preference ${pref} has no user value`
  );

  if (applied) {
    equal(
      getPreference(pref),
      value,
      `The preference ${pref} has the recommended value`
    );
  } else {
    notEqual(
      getPreference(pref),
      value,
      `The preference ${pref} does not have the recommended value`
    );
  }
}

function getPreference(pref) {
  switch (Services.prefs.getPrefType(pref)) {
    case Services.prefs.PREF_BOOL:
      return Services.prefs.getBoolPref(pref);
    case Services.prefs.PREF_INT:
      return Services.prefs.getIntPref(pref);
    case Services.prefs.PREF_STRING:
      return Services.prefs.getStringPref(pref);
    default:
      return undefined;
  }
}
