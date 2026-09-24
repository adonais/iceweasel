/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

add_setup(setup);

add_task(async function testCleanFlow() {
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

  await ensureTRRMode(2);
  await checkHeuristicsTelemetry("enable_doh", "startup");

  await prefPromise;
  is(
    Services.prefs.getStringPref(prefs.DOORHANGER_USER_DECISION_PREF),
    "UIOk",
    "User decision recorded."
  );
  is(
    Services.prefs.getBoolPref(prefs.BREADCRUMB_PREF),
    true,
    "Breadcrumb not cleared."
  );

  BrowserTestUtils.removeTab(tab);

  // Change the environment to failing and simulate a network change.
  setFailingHeuristics();
  simulateNetworkChange();
  await ensureTRRMode(0);
  await checkHeuristicsTelemetry("disable_doh", "netchange");

  // Trigger another network change.
  simulateNetworkChange();
  await ensureNoTRRModeChange(0);
  await checkHeuristicsTelemetry("disable_doh", "netchange");

  // Restart the controller for good measure.
  await restartDoHController();
  await ensureNoTRRSelectionTelemetry();
  // The mode technically changes from undefined/empty to 0 here.
  await ensureTRRMode(0);
  await checkHeuristicsTelemetry("disable_doh", "startup");

  // Set a passing environment and simulate a network change.
  setPassingHeuristics();
  simulateNetworkChange();
  await ensureTRRMode(2);
  await checkHeuristicsTelemetry("enable_doh", "netchange");

  // Again, repeat and check nothing changed.
  simulateNetworkChange();
  await ensureNoTRRModeChange(2);
  await checkHeuristicsTelemetry("enable_doh", "netchange");

  // Test the clearModeOnShutdown pref. `restartDoHController` does the actual
  // test for us between shutdown and startup.
  Services.prefs.setBoolPref(prefs.CLEAR_ON_SHUTDOWN_PREF, false);
  await restartDoHController();
  await ensureNoTRRSelectionTelemetry();
  await ensureNoTRRModeChange(2);
  await checkHeuristicsTelemetry("enable_doh", "startup");
  Services.prefs.setBoolPref(prefs.CLEAR_ON_SHUTDOWN_PREF, true);
});
