/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { NimbusTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/NimbusTestUtils.sys.mjs"
);
const { ExperimentAPI } = ChromeUtils.importESModule(
  "resource://nimbus/ExperimentAPI.sys.mjs"
);
const { PreonboardingSplash } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/PreonboardingSplash.sys.mjs"
);
const { TelemetryReportingPolicy } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetryReportingPolicy.sys.mjs"
);
const { ASRouterTargeting } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouterTargeting.sys.mjs"
);
const { OnboardingMessageProvider } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/OnboardingMessageProvider.sys.mjs"
);

NimbusTestUtils.init(this);

const EXPERIMENTS_GATE_PREF = "browser.aboutwelcome.experimentsGate.enabled";
const SKIP_SPLASH_IF_LOADED_PREF =
  "browser.aboutwelcome.experimentsGate.skipSplashIfLoaded";
const DID_SEE_ABOUT_WELCOME_PREF = "trailhead.firstrun.didSeeAboutWelcome";
const PREONBOARDING_ENABLED_PREF = "browser.preonboarding.enabled";
const SPLASH_SHOWN_PREF = "browser.preonboarding.splashShown";

add_setup(async function () {
  do_get_profile();
  const { cleanup } = await NimbusTestUtils.setupTest();
  registerCleanupFunction(cleanup);
});

// Stub the module's show seam and return the captured stubs plus the fake
// browser/window they hand to the spotlight.
function stubShow() {
  const browser = {};
  const win = { gBrowser: { selectedBrowser: browser } };
  const getTopWindow = sinon
    .stub(PreonboardingSplash.Policy, "getTopWindow")
    .returns(win);
  const showSpotlight = sinon
    .stub(PreonboardingSplash.Policy, "showSpotlight")
    .returns(undefined);
  return { browser, win, getTopWindow, showSpotlight };
}

// Establish the state under which the splash should show: gate on, Nimbus
// enabled, the TOU modal not showing, a genuinely new user, and preonboarding
// enabled so the default message's screens are available.
function stubSplashWillShow() {
  sinon.stub(ExperimentAPI, "enabled").get(() => true);
  sinon.stub(TelemetryReportingPolicy, "willShowTOUModal").returns(false);
  sinon
    .stub(TelemetryReportingPolicy, "hasUserResolvedTermsOfUse")
    .returns(false);
  Services.prefs.setBoolPref(EXPERIMENTS_GATE_PREF, true);
  // Whether experiments have already loaded depends on the test harness, so
  // deterministically disable the skip-if-loaded suppression except where a
  // test exercises it.
  Services.prefs.setBoolPref(SKIP_SPLASH_IF_LOADED_PREF, false);
  Services.prefs.setBoolPref(PREONBOARDING_ENABLED_PREF, true);
  Services.prefs.clearUserPref(DID_SEE_ABOUT_WELCOME_PREF);
  Services.prefs.clearUserPref(SPLASH_SHOWN_PREF);
}

function restoreState() {
  sinon.restore();
  Services.prefs.clearUserPref(EXPERIMENTS_GATE_PREF);
  Services.prefs.clearUserPref(SKIP_SPLASH_IF_LOADED_PREF);
  Services.prefs.clearUserPref(PREONBOARDING_ENABLED_PREF);
  Services.prefs.clearUserPref(DID_SEE_ABOUT_WELCOME_PREF);
  Services.prefs.clearUserPref(SPLASH_SHOWN_PREF);
}

add_task(async function test_splash_shown_to_new_user_when_gate_on() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    1,
    "splash is shown to a new user when the gate is on and the modal will not show"
  );

  restoreState();
});

add_task(async function test_no_splash_when_gate_off() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();
  Services.prefs.setBoolPref(EXPERIMENTS_GATE_PREF, false);

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    0,
    "splash is not shown when the experiments gate is off"
  );

  restoreState();
});

add_task(async function test_no_splash_when_experiments_disabled() {
  // Nimbus globally disabled (e.g. automation): nothing to load behind the
  // splash, so it should not show. Set up "would show" but with ExperimentAPI
  // off.
  const { showSpotlight } = stubShow();
  sinon.stub(ExperimentAPI, "enabled").get(() => false);
  sinon.stub(TelemetryReportingPolicy, "willShowTOUModal").returns(false);
  sinon
    .stub(TelemetryReportingPolicy, "hasUserResolvedTermsOfUse")
    .returns(false);
  Services.prefs.setBoolPref(EXPERIMENTS_GATE_PREF, true);
  // Disable the skip-if-loaded suppression: with Nimbus off, experiments
  // count as loaded, and it would otherwise suppress the splash before the
  // ExperimentAPI check under test gets exercised.
  Services.prefs.setBoolPref(SKIP_SPLASH_IF_LOADED_PREF, false);
  Services.prefs.setBoolPref(PREONBOARDING_ENABLED_PREF, true);
  Services.prefs.clearUserPref(DID_SEE_ABOUT_WELCOME_PREF);
  Services.prefs.clearUserPref(SPLASH_SHOWN_PREF);

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    0,
    "splash is not shown when Nimbus is globally disabled"
  );

  restoreState();
});

add_task(async function test_splash_suppressed_when_modal_will_show() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();
  // The full TOU modal already contains the loading screen as its first screen.
  TelemetryReportingPolicy.willShowTOUModal.returns(true);

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    0,
    "standalone splash is suppressed when the TOU modal will show"
  );

  restoreState();
});

add_task(async function test_no_splash_for_returning_user() {
  // A user who already accepted TOU or saw the legacy data-reporting flow.
  const { showSpotlight } = stubShow();
  stubSplashWillShow();
  TelemetryReportingPolicy.hasUserResolvedTermsOfUse.returns(true);

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    0,
    "splash is not shown to a user who already resolved the TOU"
  );

  restoreState();

  // A user who has already seen about:welcome.
  const { showSpotlight: show2 } = stubShow();
  stubSplashWillShow();
  Services.prefs.setBoolPref(DID_SEE_ABOUT_WELCOME_PREF, true);

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    show2.callCount,
    0,
    "splash is not shown to a user who has already seen about:welcome"
  );

  restoreState();
});

add_task(async function test_splash_passes_only_loading_screen() {
  const { browser, showSpotlight } = stubShow();
  stubSplashWillShow();

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(showSpotlight.callCount, 1, "spotlight is shown");
  const [config, receivedBrowser] = showSpotlight.firstCall.args;
  Assert.equal(config.type, "SHOW_SPOTLIGHT", "spotlight action type");

  const { content } = config.data;
  Assert.equal(content.id, "PRE_ONBOARDING_SPLASH", "spotlight id");
  Assert.equal(content.screens.length, 1, "splash has exactly one screen");
  Assert.equal(
    content.screens[0].id,
    "TOU_ONBOARDING_LOADING",
    "the single screen is the loading screen (TOU acceptance excluded)"
  );
  Assert.equal(
    content.disableEscClose,
    false,
    "the splash does not disable Esc-to-close"
  );
  Assert.strictEqual(
    receivedBrowser,
    browser,
    "showSpotlight receives the selected browser"
  );

  restoreState();
});

add_task(async function test_splash_shown_only_once() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(showSpotlight.callCount, 1, "splash is shown on the first run");
  Assert.ok(
    Services.prefs.getBoolPref(SPLASH_SHOWN_PREF, false),
    "showing the splash records the shown pref"
  );

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    1,
    "splash is not shown again in the same profile"
  );

  restoreState();
});

add_task(async function test_no_splash_when_pref_persisted_from_prior_run() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();
  Services.prefs.setBoolPref(SPLASH_SHOWN_PREF, true);

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    0,
    "splash is not shown when a prior run already showed it"
  );

  restoreState();
});

add_task(async function test_enabled_false_is_hard_opt_out() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();

  const doCleanup = await NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: "preonboarding",
      value: {
        enabled: false,
        screens: [{ id: "TOU_ONBOARDING_LOADING", content: {} }],
      },
    },
    { isRollout: false }
  );

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    0,
    "splash is not shown when preonboarding is explicitly disabled, even with experiment screens"
  );

  await doCleanup();
  restoreState();
});

add_task(
  { skip_if: () => AppConstants.platform !== "linux" },
  async function test_enabled_false_is_hard_opt_out_on_eligible_linux() {
    const { showSpotlight } = stubShow();
    stubSplashWillShow();
    // CI Linux builds ship a `mozilla-official` distribution id, so the
    // automation opt-out must hold even on eligible Linux distributions.
    Services.prefs
      .getDefaultBranch(null)
      .setCharPref("distribution.id", "mozilla-official");
    Services.prefs.setBoolPref(PREONBOARDING_ENABLED_PREF, false);

    PreonboardingSplash.maybeShowStartupSplash();

    Assert.equal(
      showSpotlight.callCount,
      0,
      "explicit disablement is honored on eligible Linux distributions"
    );

    Services.prefs.getDefaultBranch(null).deleteBranch("distribution.id");
    restoreState();
  }
);

add_task(async function test_empty_screens_falls_back_to_default_message() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();

  const doCleanup = await NimbusTestUtils.enrollWithFeatureConfig(
    {
      featureId: "preonboarding",
      value: { enabled: true, screens: [] },
    },
    { isRollout: false }
  );

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    1,
    "splash is shown from the default message when an experiment supplies no screens"
  );
  Assert.equal(
    showSpotlight.firstCall.args[0].data.content.screens[0].id,
    "TOU_ONBOARDING_LOADING",
    "the default message's loading screen survives an empty screens array"
  );

  await doCleanup();
  restoreState();
});

add_task(async function test_targeting_stripped_from_standalone_screen() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(showSpotlight.callCount, 1, "spotlight is shown");
  const [screen] = showSpotlight.firstCall.args[0].data.content.screens;
  Assert.strictEqual(
    screen.targeting,
    undefined,
    "render-time targeting is stripped so the sole screen can't be filtered out"
  );
  Assert.ok(
    screen.advance_on_experiment_load,
    "the auto-advance config survives the strip"
  );

  const providerScreen = OnboardingMessageProvider.getPreonboardingMessages()
    .find(m => m.id === "NEW_USER_TOU_ONBOARDING")
    .screens.find(s => s.id === "TOU_ONBOARDING_LOADING");
  Assert.ok(
    providerScreen.targeting,
    "the provider's own message screen is not mutated"
  );

  restoreState();
});

add_task(async function test_splash_skipped_when_experiments_already_loaded() {
  const { showSpotlight } = stubShow();
  stubSplashWillShow();
  sinon
    .stub(ASRouterTargeting.Environment, "experimentsLoaded")
    .get(() => true);
  Services.prefs.setBoolPref(SKIP_SPLASH_IF_LOADED_PREF, true);

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    0,
    "splash is skipped when experiments have already loaded and skipping is enabled"
  );

  Services.prefs.setBoolPref(SKIP_SPLASH_IF_LOADED_PREF, false);

  PreonboardingSplash.maybeShowStartupSplash();

  Assert.equal(
    showSpotlight.callCount,
    1,
    "splash still shows with experiments loaded when skipping is disabled"
  );

  restoreState();
});
