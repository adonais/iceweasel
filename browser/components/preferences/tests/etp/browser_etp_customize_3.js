/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Each task reopens about:preferences, whose Lit-based controls render very
// slowly under the ChaosMode passes of test-verify on macOS. Give the file
// extra headroom for those passes; normal runs finish in a couple of seconds.
requestLongerTimeout(3);

const CAT_PREF = "browser.contentblocking.category";
const CRYPTOMINING_PREF = "privacy.trackingprotection.cryptomining.enabled";
const FINGERPRINTING_PREF = "privacy.trackingprotection.fingerprinting.enabled";
const SUSPECT_FP_PREF = "privacy.fingerprintingProtection";
const SUSPECT_FP_PBM_PREF = "privacy.fingerprintingProtection.pbmode";

// Covers cryptomining/fingerprinting toggles and suspect protection context behavior.
add_task(async function test_custom_fingerprinting_controls() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [CRYPTOMINING_PREF, false],
      [FINGERPRINTING_PREF, false],
      [SUSPECT_FP_PREF, false],
      [SUSPECT_FP_PBM_PREF, false],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let cryptoToggle = getControl(doc, "etpCustomCryptominingProtectionEnabled");
  let knownFpToggle = getControl(
    doc,
    "etpCustomKnownFingerprintingProtectionEnabled"
  );
  let suspectFpToggle = getControl(
    doc,
    "etpCustomSuspectFingerprintingProtectionEnabled"
  );
  let suspectContext = getControl(
    doc,
    "etpCustomSuspectFingerprintingProtectionEnabledContext"
  );

  info("Enable cryptomining protection");
  let prefChange = waitForAndAssertPrefState(
    CRYPTOMINING_PREF,
    true,
    "Cryptomining pref enabled"
  );
  synthesizeClick(cryptoToggle.buttonEl);
  await prefChange;

  info("Enable known fingerprinting protection");
  prefChange = waitForAndAssertPrefState(
    FINGERPRINTING_PREF,
    true,
    "Fingerprinting pref enabled"
  );
  synthesizeClick(knownFpToggle.buttonEl);
  await prefChange;

  info("Enable suspect fingerprinting protection");
  prefChange = TestUtils.waitForPrefChange(
    SUSPECT_FP_PBM_PREF,
    value => value === true
  );
  synthesizeClick(suspectFpToggle.buttonEl);
  await prefChange;
  ok(
    !Services.prefs.getBoolPref(SUSPECT_FP_PREF),
    "All-windows suspect fingerprinting pref remains false after toggle"
  );

  info("Switch suspect protection context to all windows");
  await changeMozSelectValue(suspectContext, "all");
  ok(
    Services.prefs.getBoolPref(SUSPECT_FP_PREF),
    "All-windows suspect fingerprinting pref enabled"
  );
  ok(
    Services.prefs.getBoolPref(SUSPECT_FP_PBM_PREF),
    "PBM suspect fingerprinting pref remains enabled"
  );

  info("Disable suspect protection through the toggle");
  prefChange = TestUtils.waitForPrefChange(
    SUSPECT_FP_PBM_PREF,
    value => value === false
  );
  synthesizeClick(suspectFpToggle.buttonEl);
  await prefChange;
  ok(
    !Services.prefs.getBoolPref(SUSPECT_FP_PREF),
    "All-window suspect pref disabled after toggle off"
  );

  gBrowser.removeCurrentTab();
});

// Enabling cryptominer or known-fingerprinter blocking must force an immediate
// tracker list refresh, matching the legacy UI (bug 2050749). The page module
// can't be imported into the test process, so we mock the url-classifier list
// manager service and assert forceUpdates runs with the relevant tables.
add_task(async function test_custom_tracker_lists_force_update() {
  const { MockRegistrar } = ChromeUtils.importESModule(
    "resource://testing-common/MockRegistrar.sys.mjs"
  );

  let forcedTables = [];
  let mockListManager = {
    QueryInterface: ChromeUtils.generateQI(["nsIUrlListManager"]),
    forceUpdates(tables) {
      forcedTables.push(tables);
      return true;
    },
  };
  // The page resolves the list manager lazily on first use, so register the
  // mock before opening the pane.
  let mockCid = MockRegistrar.register(
    "@mozilla.org/url-classifier/listmanager;1",
    mockListManager
  );
  registerCleanupFunction(() => MockRegistrar.unregister(mockCid));

  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [CRYPTOMINING_PREF, false],
      [FINGERPRINTING_PREF, false],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let cryptoToggle = getControl(doc, "etpCustomCryptominingProtectionEnabled");
  let knownFpToggle = getControl(
    doc,
    "etpCustomKnownFingerprintingProtectionEnabled"
  );

  info("Enable cryptomining protection");
  forcedTables = [];
  let prefChange = waitForAndAssertPrefState(
    CRYPTOMINING_PREF,
    true,
    "Cryptomining pref enabled"
  );
  synthesizeClick(cryptoToggle.buttonEl);
  await prefChange;
  ok(
    forcedTables.some(t => t.includes("cryptomining")),
    "Toggling cryptomining protection forces a cryptomining list update"
  );

  info("Enable known fingerprinting protection");
  forcedTables = [];
  prefChange = waitForAndAssertPrefState(
    FINGERPRINTING_PREF,
    true,
    "Fingerprinting pref enabled"
  );
  synthesizeClick(knownFpToggle.buttonEl);
  await prefChange;
  ok(
    forcedTables.some(t => t.includes("fingerprinting")),
    "Toggling known fingerprinting protection forces a fingerprinting list update"
  );

  MockRegistrar.unregister(mockCid);
  gBrowser.removeCurrentTab();
});

// The suspect fingerprinting checkbox and scope menu must record the
// privacy.ui.fpp.click telemetry, matching the legacy UI (bug 2050750).
add_task(async function test_custom_suspect_fingerprinting_telemetry() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [SUSPECT_FP_PREF, false],
      [SUSPECT_FP_PBM_PREF, false],
    ],
  });

  Services.fog.testResetFOG();

  let { doc } = await openEtpCustomizePage();
  let suspectFpToggle = getControl(
    doc,
    "etpCustomSuspectFingerprintingProtectionEnabled"
  );
  let suspectContext = getControl(
    doc,
    "etpCustomSuspectFingerprintingProtectionEnabledContext"
  );

  info("Enable suspect fingerprinting protection through the toggle");
  let prefChange = TestUtils.waitForPrefChange(
    SUSPECT_FP_PBM_PREF,
    value => value === true
  );
  synthesizeClick(suspectFpToggle.buttonEl);
  await prefChange;

  let checkboxEvents = Glean.privacyUiFppClick.checkbox.testGetValue();
  is(checkboxEvents.length, 1, "One checkbox telemetry event recorded");
  is(
    checkboxEvents[0].extra.checked,
    "true",
    "Checkbox event records the checked state"
  );

  info("Switch suspect protection context to all windows");
  await changeMozSelectValue(suspectContext, "all");

  let menuEvents = Glean.privacyUiFppClick.menu.testGetValue();
  is(menuEvents.length, 1, "One menu telemetry event recorded");
  is(menuEvents[0].extra.value, "all", "Menu event records the selected value");

  gBrowser.removeCurrentTab();
});
