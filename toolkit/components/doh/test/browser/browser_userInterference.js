/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

add_task(setup);

add_task(async function testUserInterference() {
  // Set up a passing environment and enable DoH.
  setPassingHeuristics();
  let prefPromise = TestUtils.waitForPrefChange(prefs.BREADCRUMB_PREF);
  Services.prefs.setBoolPref(prefs.ENABLED_PREF, true);

  await prefPromise;
  is(
    Services.prefs.getBoolPref(prefs.BREADCRUMB_PREF),
    true,
    "Breadcrumb saved."
  );
  is(
    Services.prefs.getStringPref(prefs.TRR_SELECT_URI_PREF),
    "https://example.com/dns-query",
    "TRR selection complete."
  );
  await checkTRRSelectionTelemetry();

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, EXAMPLE_URL);

  prefPromise = TestUtils.waitForPrefChange(
    prefs.DOORHANGER_USER_DECISION_PREF
  );
  simulateUserDecision(true);
  await prefPromise;

  is(
    Services.prefs.getStringPref(prefs.DOORHANGER_USER_DECISION_PREF),
    "UIOk",
    "User decision recorded."
  );

  BrowserTestUtils.removeTab(tab);

  await ensureTRRMode(2);
  await checkHeuristicsTelemetry("enable_doh", "startup");

  // Set the TRR mode pref manually and ensure we respect this.
  Services.prefs.setIntPref(prefs.NETWORK_TRR_MODE_PREF, 3);
  await ensureTRRMode(undefined);

  // Simulate a network change.
  simulateNetworkChange();
  await ensureNoTRRModeChange(undefined);
  await ensureNoHeuristicsTelemetry();

  is(
    Services.prefs.getBoolPref(prefs.DISABLED_PREF),
    true,
    "Manual disable recorded."
  );
  ok(
    !Services.prefs.prefHasUserValue(prefs.BREADCRUMB_PREF),
    "Breadcrumb cleared."
  );

  // Simulate another network change.
  simulateNetworkChange();
  await ensureNoTRRModeChange(undefined);
  await ensureNoHeuristicsTelemetry();

  // Restart the controller for good measure.
  await restartDoHController();
  await ensureNoTRRModeChange(undefined);
  await ensureNoTRRSelectionTelemetry();
  await ensureNoHeuristicsTelemetry();

  // Simulate another network change.
  simulateNetworkChange();
  await ensureNoTRRModeChange(undefined);
  await ensureNoHeuristicsTelemetry();
});
