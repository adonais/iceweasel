/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  GuardianClient: "resource:///modules/ipprotection/GuardianClient.sys.mjs",
  IPPEnrollAndEntitleManager:
    "resource:///modules/ipprotection/IPPEnrollAndEntitleManager.sys.mjs",
  IPPHelpers: "resource:///modules/ipprotection/IPProtectionHelpers.sys.mjs",
  IPPNimbusHelper: "resource:///modules/ipprotection/IPPNimbusHelper.sys.mjs",
  IPPProxyManager: "resource:///modules/ipprotection/IPPProxyManager.sys.mjs",
  IPProtectionServerlist:
    "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs",
  IPPSignInWatcher: "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs",
  IPPStartupCache: "resource:///modules/ipprotection/IPPStartupCache.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
});

import {
  SIGNIN_DATA,
  ERRORS,
} from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const ENABLED_PREF = "browser.ipProtection.enabled";
const LOG_PREF = "browser.ipProtection.log";
const MAX_ERROR_HISTORY = 50;

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "IPProtectionService",
    maxLogLevel: Services.prefs.getBoolPref(LOG_PREF, false) ? "Debug" : "Warn",
  });
});

/**
 * @typedef {object} IPProtectionStates
 *  List of the possible states of the IPProtectionService.
 * @property {string} UNINITIALIZED
 *  The service has not been initialized yet.
 * @property {string} UNAVAILABLE
 *  The user is not eligible (via nimbus) or still not signed in. No UI is available.
 * @property {string} UNAUTHENTICATED
 *  The user is signed out but eligible (via nimbus). The panel should show the login view.
 * @property {string} READY
 *  Ready to be activated.
 * @property {string} ACTIVE
 *  Proxy is active.
 * @property {string} ERROR
 *  Error
 *
 * Note: If you update this list of states, make sure to update the
 * corresponding documentation in the `docs` folder as well.
 */
export const IPProtectionStates = Object.freeze({
  UNINITIALIZED: "uninitialized",
  UNAVAILABLE: "unavailable",
  UNAUTHENTICATED: "unauthenticated",
  READY: "ready",
  ACTIVE: "active",
  ERROR: "error",
});

/**
 * A singleton service that manages proxy integration and backend functionality.
 *
 * @fires event:"IPProtectionService:StateChanged"
 *  When the proxy state machine changes state. Check the `state` attribute to
 *  know the current state.
 */
class IPProtectionServiceSingleton extends EventTarget {
  #state = IPProtectionStates.UNINITIALIZED;

  errors = [];

  guardian = null;
  proxyManager = null;

  #helpers = null;

  /**
   * Returns the state of the service. See the description of the state
   * machine.
   *
   * @returns {string} - the current state from IPProtectionStates.
   */
  get state() {
    return this.#state;
  }

  /**
   * Checks if the proxy is active and was activated.
   *
   * @returns {Date}
   */
  get activatedAt() {
    return this.proxyManager?.active && this.proxyManager?.activatedAt;
  }

  constructor() {
    super();

    this.guardian = new lazy.GuardianClient();

    this.updateState = this.#updateState.bind(this);
    this.setState = this.#setState.bind(this);
    this.setErrorState = this.#setErrorState.bind(this);

    this.#helpers = lazy.IPPHelpers;
  }

  /**
   * Setups the IPProtectionService if enabled early during the firefox startup
   * phases.
   */
  async maybeEarlyInit() {
    if (
      this.featureEnabled &&
      Services.prefs.getBoolPref("browser.ipProtection.autoStartEnabled")
    ) {
      await this.init();
    }
  }

  /**
   * Setups the IPProtectionService if enabled.
   */
  async init() {
    if (
      this.#state !== IPProtectionStates.UNINITIALIZED ||
      !this.featureEnabled
    ) {
      return;
    }

    this.proxyManager = new lazy.IPPProxyManager(this.guardian);

    this.#helpers.forEach(helper => helper.init());

    this.#updateState();

    if (lazy.IPPStartupCache.isStartupCompleted) {
      this.initOnStartupCompleted();
    }
  }

  /**
   * Removes the UI widget.
   */
  uninit() {
    if (this.#state === IPProtectionStates.UNINITIALIZED) {
      return;
    }

    if (this.#state === IPProtectionStates.ACTIVE) {
      this.stop(false);
    }
    this.proxyManager?.destroy();

    this.errors = [];

    this.#helpers.forEach(helper => helper.uninit());

    this.#setState(IPProtectionStates.UNINITIALIZED);
  }

  async initOnStartupCompleted() {
    await Promise.allSettled(
      this.#helpers.map(helper => helper.initOnStartupCompleted())
    );
  }

  /**
   * Start the proxy if the user is eligible.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  async start(userAction = true) {
    await lazy.IPProtectionServerlist.maybeFetchList();

    const enrollAndEntitleData =
      await lazy.IPPEnrollAndEntitleManager.maybeEnrollAndEntitle();
    if (!enrollAndEntitleData || !enrollAndEntitleData.isEnrolledAndEntitled) {
      this.setErrorState(enrollAndEntitleData.error || ERRORS.GENERIC);
      return;
    }

    // Retry getting state if the previous attempt failed.
    if (this.#state === IPProtectionStates.ERROR) {
      this.#updateState();
    }

    if (this.#state !== IPProtectionStates.READY) {
      this.#setErrorState(ERRORS.GENERIC);
      return;
    }
    this.errors = [];

    let started;
    try {
      started = await this.proxyManager.start();
    } catch (error) {
      this.#setErrorState(ERRORS.GENERIC, error);
    }

    // Proxy failed to start but no error was given.
    if (!started) {
      return;
    }

    this.#setState(IPProtectionStates.ACTIVE);

    Glean.ipprotection.toggled.record({
      userAction,
      enabled: true,
    });

    if (userAction) {
      this.reloadCurrentTab();
    }
  }

  /**
   * Stops the proxy.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  async stop(userAction = true) {
    if (!this.proxyManager?.active) {
      return;
    }

    const sessionLength = this.proxyManager.stop();

    Glean.ipprotection.toggled.record({
      userAction,
      duration: sessionLength,
      enabled: false,
    });

    this.#setState(IPProtectionStates.READY);

    if (userAction) {
      this.reloadCurrentTab();
    }
  }

  /**
   * Gets the current window and reloads the selected tab.
   */
  reloadCurrentTab() {
    let win = Services.wm.getMostRecentBrowserWindow();
    if (win) {
      win.gBrowser.reloadTab(win.gBrowser.selectedTab);
    }
  }

  async startLoginFlow(browser) {
    return lazy.SpecialMessageActions.fxaSignInFlow(SIGNIN_DATA, browser);
  }

  /**
   * Request to update the current state.
   *
   * Updates will be queued if another update is in progress.
   */
  #updateState() {
    this.#setState(this.#checkState());
  }

  /**
   * Checks observed statuses or with Guardian to get the current state.
   *
   * @returns {Promise<IPProtectionStates>}
   */
  #checkState() {
    // The IPP feature is disabled.
    if (!this.featureEnabled) {
      return IPProtectionStates.UNINITIALIZED;
    }

    // Maybe we have to use the cached state, because we are not initialized yet.
    if (!lazy.IPPStartupCache.isStartupCompleted) {
      return lazy.IPPStartupCache.state;
    }

    // For non authenticated users, we can check if they are eligible (the UI
    // is shown and they have to login) or we don't know yet their current
    // enroll state (no UI is shown).
    let eligible = lazy.IPPNimbusHelper.isEligible;
    if (!lazy.IPPSignInWatcher.isSignedIn) {
      return !eligible
        ? IPProtectionStates.UNAVAILABLE
        : IPProtectionStates.UNAUTHENTICATED;
    }

    // The connection is already active.
    if (this.proxyManager?.active) {
      return IPProtectionStates.ACTIVE;
    }

    // Check if the current account is enrolled and has an entitlement.
    if (!lazy.IPPEnrollAndEntitleManager.isEnrolledAndEntitled && !eligible) {
      return IPProtectionStates.UNAVAILABLE;
    }

    // The proxy can be activated.
    return IPProtectionStates.READY;
  }

  /**
   * Sets the current state and triggers the state change event if needed.
   *
   * @param {IPProtectionStates} newState
   */
  #setState(newState) {
    if (newState === this.#state) {
      return;
    }

    let prevState = this.#state;
    this.#state = newState;

    this.#stateChanged(newState, prevState);
  }

  /**
   * Handles side effects of a state change and dispatches the StateChanged event.
   *
   * @param {IPProtectionStates} state
   * @param {IPProtectionStates} prevState
   */
  #stateChanged(state, prevState) {
    this.dispatchEvent(
      new CustomEvent("IPProtectionService:StateChanged", {
        bubbles: true,
        composed: true,
        detail: {
          state,
          prevState,
        },
      })
    );
  }

  /**
   * Helper to dispatch error messages.
   *
   * @param {string} error - the error message to send.
   * @param {string} [errorContext] - the error message to log.
   */
  #setErrorState(error, errorContext) {
    this.errors.push(error);

    if (this.errors.length > MAX_ERROR_HISTORY) {
      this.errors.splice(0, this.errors.length - MAX_ERROR_HISTORY);
    }

    this.#setState(IPProtectionStates.ERROR);
    lazy.logConsole.error(errorContext || error);
    Glean.ipprotection.error.record({ source: "ProxyManager" });
  }
}

const IPProtectionService = new IPProtectionServiceSingleton();

XPCOMUtils.defineLazyPreferenceGetter(
  IPProtectionService,
  "featureEnabled",
  ENABLED_PREF,
  false,
  (_pref, _oldVal, featureEnabled) => {
    if (featureEnabled) {
      IPProtectionService.init();
    } else {
      IPProtectionService.uninit();
    }
  }
);

export { IPProtectionService };
