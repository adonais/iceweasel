/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This splash screen is the full-viewport loading screen shown to new users at
 * startup while first-run experiments enroll behind it. It shows at most once
 * per profile (`browser.preonboarding.splashShown`).
 *
 * When the TOU modal will show, it already includes a splash screen as
 * its first screen, so this standalone splash suppresses itself in that case.
 * It also suppresses itself when about:welcome is not going to be shown this
 * startup, since there is then nothing for the splash to gate.
 *
 * It is triggered from BrowserGlue._onWindowsRestored at
 * `sessionstore-windows-restored` time so that it appears before about:welcome
 * content renders.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  BrowserHandler: ["@mozilla.org/browser/clh;1", Ci.nsIBrowserHandler],
});

ChromeUtils.defineESModuleGetters(lazy, {
  ASRouterTargeting: "resource:///modules/asrouter/ASRouterTargeting.sys.mjs",
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  ExperimentAPI: "resource://nimbus/ExperimentAPI.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
  OnboardingMessageProvider:
    "resource:///modules/asrouter/OnboardingMessageProvider.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
  TelemetryReportingPolicy:
    "resource://gre/modules/TelemetryReportingPolicy.sys.mjs",
});

const ABOUT_WELCOME_ENABLED_PREF = "browser.aboutwelcome.enabled";
const WELCOME_URL_PREF = "startup.homepage_welcome_url";
const EXPERIMENTS_GATE_PREF = "browser.aboutwelcome.experimentsGate.enabled";
const SKIP_SPLASH_IF_LOADED_PREF =
  "browser.aboutwelcome.experimentsGate.skipSplashIfLoaded";
const DID_SEE_ABOUT_WELCOME_PREF = "trailhead.firstrun.didSeeAboutWelcome";
const SPLASH_SHOWN_PREF = "browser.preonboarding.splashShown";

export const PreonboardingSplash = {
  /**
   * Stub shims - tests replace these to observe or simulate showing the
   * spotlight without a real browser window.
   */
  Policy: {
    getTopWindow: () =>
      lazy.BrowserWindowTracker.getTopWindow({
        allowFromInactiveWorkspace: true,
      }),
    showSpotlight: (config, browser) =>
      lazy.SpecialMessageActions.handleAction(config, browser),
    isFirstRunProfile: () => lazy.BrowserHandler.firstRunProfile,
  },

  /**
   * Entry point called from BrowserGlue at `sessionstore-windows-restored`
   * time.
   */
  maybeShowStartupSplash() {
    if (!this._shouldShow()) {
      return;
    }

    const screens = this._getSplashScreens();
    if (!screens.length) {
      return;
    }

    this._show(screens).catch(e =>
      console.error(`PreonboardingSplash: failed to show splash: ${e}`)
    );
  },

  /**
   * Determine whether the standalone preonboarding splash should be shown.
   */
  _shouldShow() {
    // The splash exists to hold back about:welcome while experiments enroll,
    // so there is no reason to show it when about:welcome is not going to be
    // shown at all
    if (!this._willShowAboutWelcome()) {
      return false;
    }

    if (Services.prefs.getBoolPref(SPLASH_SHOWN_PREF, false)) {
      return false;
    }

    if (!Services.prefs.getBoolPref(EXPERIMENTS_GATE_PREF, false)) {
      return false;
    }

    // The splash exists to allow for first-run experiments to load behind it.
    // If Nimbus is disabled (e.g. in automation) there is nothing to wait for,
    // and no reason to show it.
    if (!lazy.ExperimentAPI.enabled) {
      return false;
    }

    // Likewise if experiments have already loaded there is nothing to wait
    // for. This mirrors the loading screen's own render-time targeting; the
    // decision must be made here because a spotlight whose only screen is
    // filtered out at render time shows an empty modal.
    if (
      Services.prefs.getBoolPref(SKIP_SPLASH_IF_LOADED_PREF, true) &&
      lazy.ASRouterTargeting.Environment.experimentsLoaded
    ) {
      return false;
    }

    // When the full TOU modal will show, it already includes its own splash as its
    // first screen, so this standalone splash doesn't need to fire.
    if (lazy.TelemetryReportingPolicy.willShowTOUModal()) {
      return false;
    }

    // Only show the splash to new users who have not already interacted with the TOU.
    if (
      Services.prefs.getBoolPref(DID_SEE_ABOUT_WELCOME_PREF, false) ||
      lazy.TelemetryReportingPolicy.hasUserResolvedTermsOfUse()
    ) {
      return false;
    }

    return true;
  },

  /**
   * Whether or not about:welcome is going to be shown for this startup
   */
  _willShowAboutWelcome() {
    if (!this.Policy.isFirstRunProfile()) {
      return false;
    }

    if (!Services.prefs.getBoolPref(ABOUT_WELCOME_ENABLED_PREF, true)) {
      return false;
    }

    return Services.urlFormatter
      .formatURLPref(WELCOME_URL_PREF)
      .split("|")
      .includes("about:welcome");
  },

  /**
   * Source the splash screen ("TOU_ONBOARDING_LOADING") from the `preonboarding`
   * Nimbus feature, falling back to the built-in default onboarding message
   * so the splash is consistent with the TOU modal's screen
   *
   * @return {object[]} Exactly one splash screen, or [] if unavailable.
   */
  _getSplashScreens() {
    let variables = lazy.NimbusFeatures.preonboarding.getAllVariables();

    // Explicit disablement is a hard opt-out, even when an experiment supplies
    // screens, and even on eligible Linux distributions where the TOU flow
    // enables itself at runtime. Automation relies on
    // `browser.preonboarding.enabled=false` to keep this UI out of tests, and
    // CI Linux builds include a `mozilla-official` distribution id, so enabling
    // preonboarding at runtime should never override the opt-out here.
    if (variables.enabled === false) {
      return [];
    }

    variables =
      lazy.OnboardingMessageProvider.getPreonboardingVariablesWithDefaults(
        variables
      );

    const screens = Array.isArray(variables?.screens) ? variables.screens : [];
    const splashScreens = screens.filter(
      screen => screen.id === "TOU_ONBOARDING_LOADING"
    );

    // We expect exactly one screen.
    if (splashScreens.length !== 1) {
      return [];
    }

    // _shouldShow already decided visibility; the render-time targeting filter
    // must not re-decide, or the spotlight could render zero screens.
    return splashScreens.map(({ targeting: _targeting, ...screen }) => screen);
  },

  /**
   * Show the standalone preonboarding splash.
   *
   * @param {object[]} screens the screens from `_getSplashScreens`.
   * @return {Promise<boolean>} `true` if the splash was shown.
   */
  async _show(screens) {
    let win = this.Policy.getTopWindow();
    if (!win) {
      return false;
    }

    const config = {
      type: "SHOW_SPOTLIGHT",
      data: {
        content: {
          template: "multistage",
          id: "PRE_ONBOARDING_SPLASH",
          screens,
          // The splash auto-advances, but can be dismissed with esc
          disableEscClose: false,
        },
      },
    };

    this.Policy.showSpotlight(config, win.gBrowser.selectedBrowser);
    Services.prefs.setBoolPref(SPLASH_SHOWN_PREF, true);

    return true;
  },
};
