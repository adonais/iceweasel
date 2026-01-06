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
  IPPOptOutHelper: "resource:///modules/ipprotection/IPPOptOutHelper.sys.mjs",
  IPPSignInWatcher: "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs",
  IPPStartupCache: "resource:///modules/ipprotection/IPPStartupCache.sys.mjs",
  IPPVPNAddonHelper:
    "resource:///modules/ipprotection/IPPVPNAddonHelper.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
});

import { SIGNIN_DATA } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const ENABLED_PREF = "browser.ipProtection.enabled";

/**
 * @typedef {object} IPProtectionStates
 *  List of the possible states of the IPProtectionService.
 * @property {string} UNINITIALIZED
 *  The service has not been initialized yet.
 * @property {string} UNAVAILABLE
 *  The user is not eligible (via nimbus) or still not signed in. No UI is available.
 * @property {string} UNAUTHENTICATED
 *  The user is signed out but eligible (via nimbus). The panel should show the login view.
 * @property {string} OPTED_OUT
 *  The user has opted out from using VPN. The toolbar icon and panel should not be visible.
 * @property {string} READY
 *  Ready to be activated.
 *
 * Note: If you update this list of states, make sure to update the
 * corresponding documentation in the `docs` folder as well.
 */
export const IPProtectionStates = Object.freeze({
  UNINITIALIZED: "uninitialized",
  UNAVAILABLE: "unavailable",
  UNAUTHENTICATED: "unauthenticated",
  OPTED_OUT: "optedout",
  READY: "ready",
});

/**
 * A singleton service that manages proxy integration and backend functionality.
 *
 * @fires IPProtectionServiceSingleton#"IPProtectionService:StateChanged"
 *  When the proxy state machine changes state. Check the `state` attribute to
 *  know the current state.
 */
class IPProtectionServiceSingleton extends EventTarget {
  #state = IPProtectionStates.UNINITIALIZED;

  guardian = null;

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

  constructor() {
    super();

    this.guardian = new lazy.GuardianClient();

    this.updateState = this.#updateState.bind(this);
    this.setState = this.#setState.bind(this);

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

    this.#helpers.forEach(helper => helper.uninit());

    this.#setState(IPProtectionStates.UNINITIALIZED);
  }

  async initOnStartupCompleted() {
    await Promise.allSettled(
      this.#helpers.map(helper => helper.initOnStartupCompleted())
    );
  }

  async startLoginFlow(browser) {
    return lazy.SpecialMessageActions.fxaSignInFlow(SIGNIN_DATA, browser);
  }

  /**
   * Recomputes the current state synchronously using the latest helper data.
   * Callers should update their own inputs before invoking this.
   */
  #updateState() {
    this.#setState(this.#computeState());
  }

  /**
   * Checks observed statuses or with Guardian to get the current state.
   *
   * @returns {Promise<IPProtectionStates>}
   */
  #computeState() {
    // The IPP feature is disabled.
    if (!this.featureEnabled) {
      return IPProtectionStates.UNINITIALIZED;
    }

    if (lazy.IPPOptOutHelper.optedOut) {
      return IPProtectionStates.OPTED_OUT;
    }

    // Maybe we have to use the cached state, because we are not initialized yet.
    if (!lazy.IPPStartupCache.isStartupCompleted) {
      return lazy.IPPStartupCache.state;
    }

    // If the VPN add-on is installed...
    if (
      lazy.IPPVPNAddonHelper.vpnAddonDetected &&
      lazy.IPPEnrollAndEntitleManager.hasUpgraded
    ) {
      return IPProtectionStates.UNAVAILABLE;
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
