/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { RecommendedPreferences } = ChromeUtils.importESModule(
  "chrome://remote/content/shared/RecommendedPreferences.sys.mjs"
);
const { WebDriverBiDi } = ChromeUtils.importESModule(
  "chrome://remote/content/webdriver-bidi/WebDriverBiDi.sys.mjs"
);

const APPLIED_PREF = "remote.prefs.recommended.applied";
const BIDI_PREF = "permissions.isolateBy.userContext";

add_task(async function setup() {
  // Prepare profile directory, WebDriverBiDi.start writes
  // WebDriverBiDiServer.json in the profile folder.
  do_get_profile();
});

add_task(async function test_start_dynamicStart_doesNotApplyPreferences() {
  Services.prefs.setBoolPref("remote.prefs.recommended", true);
  let bidi;
  try {
    bidi = new WebDriverBiDi(
      createAgentStub({ isBrowserAutomationRunning: false })
    );
    await bidi.start();
    ok(
      !Services.prefs.prefHasUserValue(APPLIED_PREF),
      `${APPLIED_PREF} was not applied for a dynamic start`
    );
    ok(
      !Services.prefs.prefHasUserValue(BIDI_PREF),
      `${BIDI_PREF} was not applied for a dynamic start`
    );
    equal(
      RecommendedPreferences.alteredPrefs.size,
      0,
      "No recommended preference was altered"
    );
    await bidi.stop();
  } finally {
    RecommendedPreferences.restoreAllPreferences();
    Services.prefs.clearUserPref("remote.prefs.recommended");
  }
});

add_task(async function test_start_browserAutomation_appliesPreferences() {
  Services.prefs.setBoolPref("remote.prefs.recommended", true);
  let bidi;
  try {
    bidi = new WebDriverBiDi(
      createAgentStub({ isBrowserAutomationRunning: true })
    );
    await bidi.start();

    ok(
      Services.prefs.prefHasUserValue(APPLIED_PREF),
      `${APPLIED_PREF} was applied for browser automation`
    );
    ok(
      Services.prefs.prefHasUserValue(BIDI_PREF),
      `${BIDI_PREF} was applied for browser automation`
    );

    await bidi.stop();
  } finally {
    RecommendedPreferences.restoreAllPreferences();
    Services.prefs.clearUserPref("remote.prefs.recommended");
  }

  ok(
    !Services.prefs.prefHasUserValue(APPLIED_PREF),
    `${APPLIED_PREF} was restored`
  );
  ok(!Services.prefs.prefHasUserValue(BIDI_PREF), `${BIDI_PREF} was restored`);
});

/**
 * Minimal Remote Agent stub for this test.
 *
 * @param {object} options
 * @param {boolean} options.isBrowserAutomationRunning
 *     Whether Remote Agent should pretend to run for automation.
 */
function createAgentStub(options) {
  const { isBrowserAutomationRunning } = options;
  return {
    host: "localhost",
    port: 9222,
    running: true,
    isBrowserAutomationRunning,
    server: {
      registerPathHandler() {},
    },
  };
}
