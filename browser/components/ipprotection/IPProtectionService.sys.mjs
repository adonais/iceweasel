/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  GuardianClient: "resource:///modules/ipprotection/GuardianClient.sys.mjs",
  IPPHelpers: "resource:///modules/ipprotection/IPProtectionHelpers.sys.mjs",
  IPPProxyManager: "resource:///modules/ipprotection/IPPProxyManager.sys.mjs",
  IPPSignInWatcher: "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
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
 * @property {string} ENROLLING
 *  The user is signed in and eligible (via nimbus). The UI should show the main view,
 *  but not allow activation until enrollment has finished.
 * @property {string} READY
 *  Ready to be activated.
 * @property {string} ACTIVE
 *  Proxy is active.
 * @property {string} ERROR
 *  Error
 */
export const IPProtectionStates = Object.freeze({
  UNINITIALIZED: "uninitialized",
  UNAVAILABLE: "unavailable",
  UNAUTHENTICATED: "unauthenticated",
  ENROLLING: "enrolling",
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

  // Prevents multiple `#updateState()` executions at once.
  #updating = false;

  errors = [];
  enrolling = null;

  guardian = null;
  proxyManager = null;

  #entitlement = null;

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
   * Checks if a user has upgraded.
   *
   * @returns {boolean}
   */
  get hasUpgraded() {
    return this.#entitlement?.subscribed;
  }

  /**
   * Checks if the service has an entitlement object
   *
   * @returns {boolean}
   */
  get hasEntitlement() {
    return !!this.#entitlement;
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
   * Setups the IPProtectionService if enabled.
   */
  async init() {
    if (this.#state !== IPProtectionStates.UNINITIALIZED) {
      return;
    }
    this.proxyManager = new lazy.IPPProxyManager(this.guardian);

    await Promise.allSettled(this.#helpers.map(helper => helper.init()));

    await this.#updateState();
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

    this.#entitlement = null;
    this.errors = [];
    this.enrolling = null;

    this.#helpers.forEach(helper => helper.uninit());

    this.#setState(IPProtectionStates.UNINITIALIZED);
  }

  /**
   * Start the proxy if the user is eligible.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  async start(userAction = true) {
    // Wait for enrollment to finish.
    await this.enrolling;

    // Retry getting state if the previous attempt failed.
    if (this.#state === IPProtectionStates.ERROR) {
      await this.#updateState();
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

  /**
   * Enroll the current account if it meets all the criteria.
   *
   * @returns {Promise<void>}
   */
  async maybeEnroll() {
    if (this.#state !== IPProtectionStates.ENROLLING) {
      return null;
    }
    return this.#enroll();
  }

  /**
   * Reset the statuses that are set based on a FxA account.
   */
  resetAccount() {
    this.#entitlement = null;
    if (this.proxyManager?.active) {
      this.stop(false);
    }
    this.proxyManager.reset();
  }

  /**
   * Checks if the user has enrolled with FxA to use the proxy.
   *
   * @param { boolean } onlyCached - if true only the cached clients will be checked.
   * @returns {Promise<boolean>}
   */
  async #isEnrolled(onlyCached) {
    let isEnrolled;
    try {
      isEnrolled = await this.guardian.isLinkedToGuardian(onlyCached);
    } catch (error) {
      this.#setErrorState(error?.message);
    }

    return isEnrolled;
  }

  /**
   * Check if this device is in the experiment with a variant branch.
   *
   * @returns {boolean}
   */
  get isEligible() {
    let inExperiment = lazy.NimbusFeatures.ipProtection.getEnrollmentMetadata();
    let isEligible = inExperiment?.branch && inExperiment.branch !== "control";

    if (inExperiment) {
      lazy.NimbusFeatures.ipProtection.recordExposureEvent({
        once: true,
      });
    }

    return isEligible;
  }

  /**
   * Clear the current entitlement and requests a state update to dispatch
   * the current hasUpgraded status.
   *
   * @returns {Promise<void>}
   */
  async refetchEntitlement() {
    let prevState = this.#state;
    this.#entitlement = null;
    await this.#updateState();
    // hasUpgraded might not change the state.
    if (prevState === this.#state) {
      this.#stateChanged(this.#state, prevState);
    }
  }

  /**
   * Enrolls a users FxA account to use the proxy and updates the state.
   *
   * @returns {Promise<void>}
   */
  async #enroll() {
    if (this.#state !== IPProtectionStates.ENROLLING) {
      return null;
    }

    if (this.enrolling) {
      return this.enrolling;
    }

    this.enrolling = this.guardian
      .enroll()
      .then(enrollment => {
        let ok = enrollment?.ok;

        lazy.logConsole.debug(
          "Guardian:",
          ok ? "Enrolled" : "Enrollment Failed"
        );

        if (!ok) {
          this.#setErrorState(enrollment?.error || ERRORS.GENERIC);
          return null;
        }

        return this.#updateState();
      })
      .catch(error => {
        this.#setErrorState(error?.message);
      })
      .finally(() => {
        this.enrolling = null;
      });

    return this.enrolling;
  }

  /**
   * Gets the entitlement information for the user.
   */
  async #getEntitlement() {
    if (this.#entitlement) {
      return this.#entitlement;
    }

    let { status, entitlement, error } = await this.guardian.fetchUserInfo();
    lazy.logConsole.debug("Entitlement:", { status, entitlement, error });

    if (error || !entitlement || status != 200) {
      this.#setErrorState(error || `Status: ${status}`);
      return null;
    }

    // Entitlement is set until the user changes or it is cleared to check subscription status.
    this.#entitlement = entitlement;

    return entitlement;
  }

  async startLoginFlow(browser) {
    return lazy.SpecialMessageActions.fxaSignInFlow(SIGNIN_DATA, browser);
  }

  /**
   * Request to update the current state.
   *
   * Updates will be queued if another update is in progress.
   */
  async #updateState() {
    // Wait for any current updates to finish.
    await this.#updating;

    // Start a new update
    this.#updating = this.#checkState();
    let newState = await this.#updating;
    this.#updating = false;

    this.#setState(newState);
  }

  /**
   * Checks observed statuses or with Guardian to get the current state.
   *
   * @returns {Promise<IPProtectionStates>}
   */
  async #checkState() {
    // The IPP feature is disabled.
    if (!this.featureEnabled) {
      return IPProtectionStates.UNINITIALIZED;
    }

    // For non authenticated users, we can check if they are eligible (the UI
    // is shown and they have to login) or we don't know yet their current
    // enroll state (no UI is shown).
    let eligible = this.isEligible;
    if (!lazy.IPPSignInWatcher.isSignedIn) {
      return !eligible
        ? IPProtectionStates.UNAVAILABLE
        : IPProtectionStates.UNAUTHENTICATED;
    }

    // The connection is already active.
    if (this.proxyManager?.active) {
      return IPProtectionStates.ACTIVE;
    }

    // The proxy can be started if the current entitlement is valid.
    if (this.#entitlement?.uid) {
      return IPProtectionStates.READY;
    }

    // The following are remote authentication checks and should be avoided
    // whenever possible.

    // Check if the current account is enrolled with Guardian.
    let enrolled = await this.#isEnrolled(
      this.#state !== IPProtectionStates.ENROLLING /*onlyCached*/
    );
    if (!enrolled) {
      return !eligible
        ? IPProtectionStates.UNAVAILABLE
        : IPProtectionStates.ENROLLING;
    }

    // Check if the current account can get an entitlement.
    let entitled = await this.#getEntitlement();
    if (!entitled && !eligible) {
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
