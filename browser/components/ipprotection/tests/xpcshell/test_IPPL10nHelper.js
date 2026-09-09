/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPPL10nHelper } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ipprotection/IPPL10nHelper.sys.mjs"
);
const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const HAS_SEEN_FEATURE_PREF = "browser.ipProtection.hasSeenFeature";
const GATE_VERSION_PREF = "browser.ipProtection.l10nGateVersion";
const CURRENT_VERSION = parseInt(AppConstants.MOZ_APP_VERSION, 10);

// A locale with a private variant subtag: no build packages coverage for it, so
// the lookup only ever sees the mock source registered below.
const LOC_COVERAGE = "de-cover";
// ipProtection.ftl: 10 messages, three untranslated (ratio 0.7, below the
// threshold used by IPPL10nHelper).
const COVERAGE_JSON = JSON.stringify({
  "browser/browser/ipProtection.ftl": {
    total: 10,
    missing: [
      "ipprotection-title",
      "ipprotection-button-label",
      "ipprotection-help-button-label",
    ],
  },
});

do_get_profile();

add_setup(async function () {
  // The coverage of the effective locale is cached until a live Localization
  // observes an app-locale change, so this instance is kept alive on the global
  // for the tasks that switch locale below.
  globalThis.coverageLocalization = new Localization(
    ["browser/ipProtection.ftl"],
    true
  );

  await putServerInRemoteSettings();
  IPProtectionService.uninit();
  IPProtectionActivator.addHelpers([IPPL10nHelper]);
  IPProtectionActivator.setupHelpers();

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref(HAS_SEEN_FEATURE_PREF);
    Services.prefs.clearUserPref(GATE_VERSION_PREF);
    IPProtectionActivator.removeHelpers();
    IPProtectionActivator.setupHelpers();
    await IPProtectionService.init();
  });
});

/**
 * Sufficient coverage exposes the feature. Runs before any locale is requested,
 * while the app locale is still the source locale (en-US), which counts as fully
 * covered.
 */
add_task(async function test_hidesFeature_sufficient_coverage() {
  Services.prefs.setBoolPref(HAS_SEEN_FEATURE_PREF, false);

  Assert.equal(
    IPPL10nHelper.hidesFeature(),
    false,
    "The feature is exposed in a locale that is localized enough"
  );

  Assert.ok(
    !Services.prefs.getBoolPref(HAS_SEEN_FEATURE_PREF),
    "Checking the coverage does not set the hasSeenFeature pref"
  );

  Assert.equal(
    Services.prefs.getIntPref(GATE_VERSION_PREF, 0),
    0,
    "An exposed feature does not record a gate version"
  );

  Services.prefs.clearUserPref(HAS_SEEN_FEATURE_PREF);
});

/**
 * hidesFeature() gates on l10n coverage only while the user has never seen the
 * feature; the hasSeenFeature pref forces it on regardless.
 */
add_task(async function test_hidesFeature_gating() {
  const resProto = Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler);
  const l10nReg = L10nRegistry.getInstance();

  const root = do_get_tempdir();
  root.append("ipp-l10n-coverage");
  const covDir = root.clone();
  covDir.append(LOC_COVERAGE);
  await IOUtils.makeDirectory(covDir.path, { createAncestors: true });
  await IOUtils.writeUTF8(
    PathUtils.join(covDir.path, "coverage.json"),
    COVERAGE_JSON
  );
  resProto.setSubstitution("ipp-covtest", Services.io.newFileURI(root));

  l10nReg.registerSources([
    L10nFileSource.createMock(
      "ipp-covtest",
      "app",
      [LOC_COVERAGE],
      "resource://ipp-covtest/{locale}/",
      []
    ),
  ]);

  const origAvailable = Services.locale.availableLocales;
  const origRequested = Services.locale.requestedLocales;

  registerCleanupFunction(() => {
    Services.locale.availableLocales = origAvailable;
    Services.locale.requestedLocales = origRequested;
    l10nReg.removeSources(["ipp-covtest"]);
    resProto.setSubstitution("ipp-covtest", null);
  });

  Services.locale.availableLocales = [LOC_COVERAGE, "en-US"];
  Services.locale.requestedLocales = [LOC_COVERAGE];

  Services.prefs.setBoolPref(HAS_SEEN_FEATURE_PREF, false);
  Services.prefs.clearUserPref(GATE_VERSION_PREF);

  Assert.equal(
    IPPL10nHelper.hidesFeature(),
    true,
    "A user who never saw the feature does not see it when the UI " +
      "is not localized enough (coverage 0.7)"
  );

  Assert.ok(
    !Services.prefs.getBoolPref(HAS_SEEN_FEATURE_PREF),
    "Coverage below the threshold does not set the hasSeenFeature pref"
  );

  Assert.equal(
    Services.prefs.getIntPref(GATE_VERSION_PREF, 0),
    CURRENT_VERSION,
    "Hiding the feature records the current major version"
  );

  Services.prefs.setBoolPref(HAS_SEEN_FEATURE_PREF, true);
  Assert.equal(
    IPPL10nHelper.hidesFeature(),
    false,
    "The hasSeenFeature pref forces the feature on regardless of coverage"
  );
  Services.prefs.setBoolPref(HAS_SEEN_FEATURE_PREF, false);
  Assert.equal(
    IPPL10nHelper.hidesFeature(),
    true,
    "Clearing the hasSeenFeature pref brings the gate back"
  );

  Services.prefs.clearUserPref(HAS_SEEN_FEATURE_PREF);
  Services.prefs.clearUserPref(GATE_VERSION_PREF);
});

/**
 * The gate only holds for the major version that recorded it: a Firefox update
 * exposes the feature even when the coverage is still below the threshold.
 */
add_task(async function test_gate_expires_on_update() {
  Services.prefs.setBoolPref(HAS_SEEN_FEATURE_PREF, false);
  Services.prefs.setIntPref(GATE_VERSION_PREF, CURRENT_VERSION - 1);

  Assert.equal(
    IPPL10nHelper.hidesFeature(),
    false,
    "A gate recorded by a previous major version does not hide the feature"
  );

  Assert.equal(
    Services.prefs.getIntPref(GATE_VERSION_PREF),
    CURRENT_VERSION - 1,
    "An expired gate keeps its recorded version"
  );

  Services.prefs.setIntPref(GATE_VERSION_PREF, CURRENT_VERSION);
  Assert.equal(
    IPPL10nHelper.hidesFeature(),
    true,
    "A gate recorded by this major version still hides the feature"
  );

  Services.prefs.clearUserPref(HAS_SEEN_FEATURE_PREF);
  Services.prefs.clearUserPref(GATE_VERSION_PREF);
});

/**
 * An otherwise-ready service is UNAVAILABLE when the helper vetoes exposure,
 * and recovers once it stops.
 */
add_task(async function test_state_gated_on_coverage() {
  let sandbox = sinon.createSandbox();
  let hidden = true;
  sandbox.stub(IPPL10nHelper, "hidesFeature").callsFake(() => hidden);

  IPPDummyAuthProvider.simulateSignIn(true);
  IPPDummyAuthProvider.setGetEntitlementResponse({
    entitlement: createTestEntitlement(),
  });

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNAVAILABLE,
    "Service is unavailable when the helper hides the feature"
  );

  hidden = false;
  IPProtectionService.updateState();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "Service becomes ready once the helper stops hiding the feature"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * The hasSeenFeature pref is pinned as soon as the state machine exposes the
 * UI, which includes UNAUTHENTICATED: the login panel is part of the feature.
 */
add_task(async function test_exposing_the_feature_pins_the_pref() {
  Services.prefs.setBoolPref(HAS_SEEN_FEATURE_PREF, false);

  let sandbox = sinon.createSandbox();
  let hidden = true;
  sandbox.stub(IPPL10nHelper, "hidesFeature").callsFake(() => hidden);

  IPPDummyAuthProvider.simulateSignIn(false);
  IPPDummyAuthProvider.setGetEntitlementResponse({});

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNAVAILABLE,
    "Service is unavailable while the feature is gated"
  );
  Assert.ok(
    !Services.prefs.getBoolPref(HAS_SEEN_FEATURE_PREF, false),
    "A gated feature does not pin the hasSeenFeature pref"
  );

  hidden = false;
  IPProtectionService.updateState();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNAUTHENTICATED,
    "Service shows the login UI once the feature is not gated"
  );
  Assert.ok(
    Services.prefs.getBoolPref(HAS_SEEN_FEATURE_PREF, false),
    "Exposing the UI pins the hasSeenFeature pref"
  );

  IPProtectionService.uninit();
  sandbox.restore();
  Services.prefs.clearUserPref(HAS_SEEN_FEATURE_PREF);
});
