/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);

const PREF_IS_DEFAULT_WINDOW = "browser.smartwindow.isDefaultWindow";

/**
 * Enrolling in the smartWindow feature with isDefault=true sets the
 * isDefaultWindow pref on the user branch.
 */
add_task(async function test_nimbus_enrollment_sets_pref() {
  ok(
    !Services.prefs.prefHasUserValue(PREF_IS_DEFAULT_WINDOW),
    "No user value for isDefaultWindow before enrollment"
  );

  const cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "smartWindow",
    value: { isDefault: true },
  });

  ok(
    Services.prefs.getBoolPref(PREF_IS_DEFAULT_WINDOW),
    "isDefaultWindow pref is true after enrollment"
  );
  ok(
    Services.prefs.prefHasUserValue(PREF_IS_DEFAULT_WINDOW),
    "isDefaultWindow pref is set on the user branch"
  );

  await cleanup();
  Services.prefs.clearUserPref(PREF_IS_DEFAULT_WINDOW);
});

/**
 * Unenrolling restores the pref to its pre-enrollment value, providing
 * rollback without a code change.
 */
add_task(async function test_nimbus_unenrollment_restores_pref() {
  const cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "smartWindow",
    value: { isDefault: true },
  });

  ok(
    Services.prefs.getBoolPref(PREF_IS_DEFAULT_WINDOW),
    "isDefaultWindow pref is true while enrolled"
  );

  await cleanup();

  ok(
    !Services.prefs.getBoolPref(PREF_IS_DEFAULT_WINDOW, false),
    "isDefaultWindow pref is false after unenrollment"
  );
});

/**
 * Existing eligibility checks still apply: isDefaultWindow requires
 * browser.smartwindow.enabled. Nimbus enrollment alone does not bypass
 * this check.
 */
add_task(async function test_nimbus_enrollment_respects_eligibility_checks() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", false]],
  });

  const cleanup = await NimbusTestUtils.enrollWithFeatureConfig({
    featureId: "smartWindow",
    value: { isDefault: true },
  });

  ok(
    !AIWindow.isDefaultWindow,
    "isDefaultWindow is false even when enrolled because browser.smartwindow.enabled is false"
  );

  await cleanup();
  Services.prefs.clearUserPref(PREF_IS_DEFAULT_WINDOW);
  await SpecialPowers.popPrefEnv();
});
