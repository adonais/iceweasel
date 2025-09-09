/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  GuardianClient: "resource:///modules/ipprotection/GuardianClient.sys.mjs",
  // eslint-disable-next-line mozilla/valid-lazy
  IPPChannelFilter: "resource:///modules/ipprotection/IPPChannelFilter.sys.mjs",
  IPPNetworkErrorObserver:
    "resource:///modules/ipprotection/IPPNetworkErrorObserver.sys.mjs",
  getDefaultLocation:
    "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs",
  selectServer:
    "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs",
  IPProtectionUsage:
    "resource:///modules/ipprotection/IPProtectionUsage.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
  IPProtection: "resource:///modules/ipprotection/IPProtection.sys.mjs",
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

import {
  SIGNIN_DATA,
  ERRORS,
} from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const ENABLED_PREF = "browser.ipProtection.enabled";
const LOG_PREF = "browser.ipProtection.log";
const VPN_ADDON_ID = "vpn@mozilla.com";

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "IPProtectionService",
    maxLogLevel: Services.prefs.getBoolPref(LOG_PREF, false) ? "Debug" : "Warn",
  });
});

/**
 * A singleton service that manages proxy integration and backend functionality.
 *
 * It exposes init and uninit for app startup.
 *
 * @fires event:"IPProtectionService:Started"
 *  When the proxy has started and includes the timestamp of when
 *  it was activated as `detail.activatedAt`.
 * @fires event:"IPProtectionService:Stopped"
 *  When the proxy is stopped
 * @fires event:"IPProtectionService:SignedIn"
 *  When user signs into their account
 * @fires event:"IPProtectionService:SignedOut"
 *  When user signs out of their account
 * @fires event:"IPProtectionService:UpdateHasUpgraded"
 *  When the hasUpgraded property is updated.
 *  True if the user upgraded to a Mozilla VPN subscription.
 * @fires event:"IPProtectionService:Error"
 *  When there has been an error
 */
class IPProtectionServiceSingleton extends EventTarget {
  static WIDGET_ID = "ipprotection-button";
  static PANEL_ID = "PanelUI-ipprotection";

  isActive = false;
  activatedAt = null;
  deactivatedAt = null;
  sessionLength = 0;
  isSignedIn = null;
  isEnrolled = null;
  isEligible = null;
  isEntitled = null;
  hasUpgraded = null;
  hasProxyPass = null;
  hasError = null;

  location = null;
  /**@type {import("./IPPChannelFilter.sys.mjs").IPPChannelFilter | null} */
  connection = null;
  errors = [];

  guardian = null;
  #entitlement = null;
  #pass = null;
  #inited = false;
  #usageObserver = null;
  #networkErrorObserver = null;
  // If this is set, we're awating a proxy pass rotation
  #rotateProxyPassPromise = null;

  constructor() {
    super();

    this.guardian = new lazy.GuardianClient();

    this.updateEnabled = this.#updateEnabled.bind(this);
    this.updateSignInStatus = this.#updateSignInStatus.bind(this);
    this.updateEligibility = this.#updateEligibility.bind(this);
    this.handleProxyErrorEvent = this.#handleProxyErrorEvent.bind(this);
  }

  /**
   * Setups the IPProtectionService if enabled.
   */
  async init() {
    if (this.#inited || !this.featureEnabled) {
      return;
    }

    this.#addSignInStateObserver();
    this.addVPNAddonObserver();
    this.#addEligibilityListeners();

    this.#updateSignInStatus();
    this.#updateEligibility();
    this.#updateEnrollment(true /* onlyCached */);

    this.#inited = true;
  }

  /**
   * Removes the IPProtectionService and IPProtection widget.
   */
  uninit() {
    lazy.IPProtection.uninit();

    this.removeSignInStateObserver();
    this.removeVPNAddonObserver();

    if (this.isActive) {
      this.stop(false);
    }
    this.usageObserver.stop();

    this.#removeEligibilityListeners();

    this.isSignedIn = null;
    this.isEnrolled = null;
    this.isEligible = null;
    this.isEntitled = null;
    this.hasUpgraded = null;
    this.hasProxyPass = null;
    this.hasError = null;

    this.#entitlement = null;
    this.#pass = null;
    this.errors = [];

    this.#inited = false;
  }

  /**
   * Start the proxy if the user is eligible.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  async start(userAction = true) {
    // Retry enrollment if the previous attempt failed.
    if (this.hasError && !this.isEnrolled) {
      await this.#updateEnrollment();
    }

    // Retry getting entitlement if the previous attempt failed.
    if (this.hasError && !this.isEntitled) {
      await this.#updateEntitlement();
    }

    if (
      !this.isSignedIn ||
      !this.isEnrolled ||
      !this.isEntitled ||
      this.isActive
    ) {
      lazy.logConsole.info("Proxy: Error");
      lazy.logConsole.debug("Could not start:", {
        isSignedIn: this.isSignedIn,
        isEnrolled: this.isEnrolled,
        isEntitled: this.isEntitled,
        isActive: this.isActive,
      });
      this.#dispatchError(ERRORS.GENERIC);
      return;
    }
    this.hasError = false;
    this.errors = [];

    // If the current proxy pass is valid,
    // no need to re-authenticate.
    if (!this.#pass?.isValid()) {
      this.#pass = await this.#getProxyPass();
      if (!this.#pass) {
        lazy.logConsole.info("Proxy: No Pass");
        this.#dispatchError(ERRORS.GENERIC);
        return;
      }
      this.hasProxyPass = true;
    }

    this.location = await lazy.getDefaultLocation();
    const server = await lazy.selectServer(this.location?.city);
    lazy.logConsole.debug("Server:", server?.hostname);
    if (this.connection?.active) {
      this.connection.stop();
    }

    this.connection = lazy.IPPChannelFilter.create(
      this.#pass.asBearerToken(),
      server.hostname,
      server.port
    );
    this.connection.start();

    this.isActive = true;
    this.activatedAt = Cu.now();

    this.usageObserver.start();
    this.usageObserver.addIsolationKey(this.connection.isolationKey);

    this.networkErrorObserver.start();
    this.networkErrorObserver.addIsolationKey(this.connection.isolationKey);

    this.dispatchEvent(
      new CustomEvent("IPProtectionService:Started", {
        bubbles: true,
        composed: true,
        detail: {
          activatedAt: this.activatedAt,
        },
      })
    );
    Glean.ipprotection.toggled.record({
      userAction,
      enabled: true,
    });

    if (userAction) {
      this.reloadCurrentTab();
    }
    lazy.logConsole.info("Proxy: Started");
  }

  /**
   * Stops the proxy.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  stop(userAction = true) {
    this.isActive = false;

    let deactivatedAt = Cu.now();
    let sessionLength = deactivatedAt - this.activatedAt;

    Glean.ipprotection.toggled.record({
      userAction,
      duration: sessionLength,
      enabled: false,
    });

    this.activatedAt = null;
    this.connection?.stop();
    this.networkErrorObserver.stop();
    this.connection = null;
    this.dispatchEvent(
      new CustomEvent("IPProtectionService:Stopped", {
        bubbles: true,
        composed: true,
      })
    );

    if (userAction) {
      this.reloadCurrentTab();
    }
    lazy.logConsole.info("Proxy: Stopped");
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
   * Checks if a user has signed in.
   *
   * @returns {boolean}
   */
  #isSignedIn() {
    let { status } = lazy.UIState.get();
    return status == lazy.UIState.STATUS_SIGNED_IN;
  }

  /**
   * Checks if the user has enrolled with FxA to use the proxy.
   *
   * @param { boolean } onlyCached - if true only the cached clients will be checked.
   * @returns {Promise<boolean>}
   */
  async #isEnrolled(onlyCached) {
    if (!this.isSignedIn) {
      return false;
    }

    let isEnrolled;
    try {
      isEnrolled = await this.guardian.isLinkedToGuardian(onlyCached);
    } catch (error) {
      this.#dispatchError(error?.message);
    }

    if (isEnrolled) {
      lazy.logConsole.info("Account: Linked");
    }

    return isEnrolled;
  }

  /**
   * Check if this device is in the experiment with a variant branch.
   *
   * @returns {boolean}
   */
  #isEligible() {
    let inExperiment = lazy.NimbusFeatures.ipProtection.getEnrollmentMetadata();
    let isEligible = inExperiment?.branch && inExperiment.branch !== "control";

    if (inExperiment) {
      lazy.NimbusFeatures.ipProtection.recordExposureEvent();
    }

    if (isEligible) {
      lazy.logConsole.info("Device: Eligible");
    }

    return isEligible;
  }

  /**
   * Checks whether the feature pref is enabled and
   * will init or uninit the IPProtectionService instance.
   */
  #updateEnabled() {
    if (this.featureEnabled) {
      this.init();
    } else {
      this.uninit();
    }
  }

  #addEligibilityListeners() {
    lazy.NimbusFeatures.ipProtection.onUpdate(this.updateEligibility);
  }

  #removeEligibilityListeners() {
    lazy.NimbusFeatures.ipProtection.offUpdate(this.updateEligibility);
  }

  /**
   * Dispatches "IPProtectionService:UpdateHasUpgraded" to pass the
   * `hasUpgraded` status. By default, pass the current value of
   * `hasUpgraded`. Otherwise, if `refetchEntitlement` is true,
   * get the most up to date entitlement status and set
   * `hasUpgraded` based on whether the user's Mozilla account is
   * linked to Mozilla VPN.
   *
   * @param {boolean} refetchEntitlement
   *  True to refetch entitlement details.
   *  Else use the current entitlement status.
   */
  async updateHasUpgradedStatus(refetchEntitlement = false) {
    if (refetchEntitlement) {
      await this.#updateEntitlement();
    }

    this.dispatchEvent(
      new CustomEvent("IPProtectionService:UpdateHasUpgraded", {
        bubbles: true,
        composed: true,
        detail: {
          hasUpgraded: this.hasUpgraded,
        },
      })
    );
  }

  /**
   * Adds an observer for the FxA sign-in state.
   */
  #addSignInStateObserver() {
    let manager = this;
    this.fxaObserver = {
      QueryInterface: ChromeUtils.generateQI([
        Ci.nsIObserver,
        Ci.nsISupportsWeakReference,
      ]),

      observe() {
        manager.updateSignInStatus();
      },
    };

    Services.obs.addObserver(this.fxaObserver, lazy.UIState.ON_UPDATE);
  }

  /**
   * Removes the FxA sign-in state observer
   */
  removeSignInStateObserver() {
    if (this.fxaObserver) {
      Services.obs.removeObserver(this.fxaObserver, lazy.UIState.ON_UPDATE);
      this.fxaObserver = null;
    }
  }

  /**
   * Adds an observer to monitor the VPN add-on installation
   */
  addVPNAddonObserver() {
    let service = this;
    this.addonVPNListener = {
      onInstallEnded(_install, addon) {
        if (addon.id === VPN_ADDON_ID && service.hasUpgraded) {
          // Place the widget in the customization palette.
          lazy.CustomizableUI.removeWidgetFromArea(
            IPProtectionServiceSingleton.WIDGET_ID
          );
          lazy.logConsole.info("VPN Extension: Installed");
        }
      },
    };

    lazy.AddonManager.addInstallListener(this.addonVPNListener);
  }

  /**
   * Removes the VPN add-on installation observer
   */
  removeVPNAddonObserver() {
    if (this.addonVPNListener) {
      lazy.AddonManager.removeInstallListener(this.addonVPNListener);
    }
  }

  /**
   * Updates the `isSignedIn` property based on the UIState status.
   *
   * Will update if the new user is enrolled
   * or clear enrollment.
   *
   * Dispatch events when the sign-in state changes:
   *  - "IPProtectionService:SignedIn"
   *  - "IPProtectionService:SignedOut"
   */
  async #updateSignInStatus() {
    let isSignedIn = this.#isSignedIn();

    if (this.isSignedIn == isSignedIn) {
      return;
    }

    this.isSignedIn = isSignedIn;

    if (!this.#inited) {
      return;
    }

    if (this.isSignedIn) {
      lazy.logConsole.info("Account: Signed In");
      this.dispatchEvent(
        new CustomEvent("IPProtectionService:SignedIn", {
          bubbles: true,
          composed: true,
        })
      );
      await this.#updateEnrollment();
      await this.updateHasUpgradedStatus();
    } else {
      lazy.logConsole.info("Account: Signed Out");
      this.dispatchEvent(
        new CustomEvent("IPProtectionService:SignedOut", {
          bubbles: true,
          composed: true,
        })
      );
      this.isEnrolled = false;
      if (this.isActive) {
        this.stop();
      }
      this.hasUpgraded = false;
      this.updateHasUpgradedStatus();
    }
  }

  /**
   * Checks if a device is enrolled in an experiment that
   * allow using the VPN and if so adds the widget.
   *
   * If a user is signed in, checks if they are or can be
   * enrolled.
   *
   * @returns {Promise<void>}
   */
  async #updateEligibility() {
    this.isEligible = this.#isEligible();

    if (!this.isEligible) {
      return;
    }

    lazy.IPProtection.init();

    if (this.#inited && this.isSignedIn) {
      this.#updateEnrollment();
    }
  }

  /**
   * Checks if a users FxA account has been enrolled to use the proxy and
   * updates the enrolled pref.
   *
   * If no user is signed in, the enrolled pref will set to false.
   *
   * If the user is not enrolled but meets the other conditions to use
   * the VPN they will be enrolled now.
   *
   * @param { boolean } onlyCached - if true only the cached clients will be checked.
   * @returns {Promise<void>}
   */
  async #updateEnrollment(onlyCached = false) {
    this.isEnrolled = await this.#isEnrolled(onlyCached);

    if (this.isEnrolled) {
      lazy.IPProtection.init();
    } else if (
      !this.isEnrolled &&
      lazy.IPProtection.isInitialized &&
      this.isEligible &&
      this.isSignedIn
    ) {
      this.isEnrolled = await this.#enroll();
    }

    if (this.isEnrolled) {
      await this.#updateEntitlement();
    } else {
      this.#entitlement = null;
      this.#pass = null;
      this.isEntitled = null;
      this.hasUpgraded = null;
      this.hasProxyPass = null;
    }
  }

  /**
   * Starts a flow to get a new ProxyPass and replace the current one.
   *
   * @returns {Promise<void>} - Returns a promise that resolves when the rotation is complete or failed.
   * When it's called again while a rotation is in progress, it will return the existing promise.
   */
  async rotateProxyPass() {
    if (this.#rotateProxyPassPromise) {
      return this.#rotateProxyPassPromise;
    }
    this.#rotateProxyPassPromise = this.#getProxyPass();
    const pass = await this.#rotateProxyPassPromise;
    this.#rotateProxyPassPromise = null;
    if (!pass) {
      return null;
    }
    // Inject the new token in the current connection
    if (this.connection?.active) {
      this.connection.replaceAuthToken(pass.asBearerToken());
      this.usageObserver.addIsolationKey(this.connection.isolationKey);
      this.networkErrorObserver.addIsolationKey(this.connection.isolationKey);
    }
    lazy.logConsole.debug("Successfully rotated token!");
    this.#pass = pass;
    return null;
  }

  /**
   * Enrolls a users FxA account to use the proxy if they are eligible and not already
   * enrolled then updates the enrollment status.
   *
   * If they are enrolled, updates the enrollment status.
   *
   * If the user is already enrolled, this will do nothing.
   *
   * @returns {Promise<boolean | null>}
   */
  async #enroll() {
    let { isSignedIn, isEnrolled, isEligible } = this;
    if (!isSignedIn) {
      return null;
    }

    if (isEnrolled || !isEligible) {
      return null;
    }

    let enrollment;
    try {
      enrollment = await this.guardian.enroll();
    } catch (error) {
      this.#dispatchError(error?.message);
    }

    lazy.logConsole.debug(
      "Guardian:",
      enrollment?.ok ? "Enrolled" : "Enrollment Failed"
    );

    if (enrollment?.ok) {
      return true;
    }

    this.#dispatchError(enrollment?.error);
    return false;
  }

  /**
   * Update the entitlement and hasUpgraded statues.
   */
  async #updateEntitlement() {
    this.#entitlement = await this.#getEntitlement();
    if (this.#entitlement) {
      this.isEntitled = !!this.#entitlement.uid;
      this.hasUpgraded = this.#entitlement.subscribed;
    }
  }

  /**
   * Gets the entitlement information for the user.
   *
   * @returns {Promise<Entitlement|null>} - The entitlement object or null if not entitled.
   */
  async #getEntitlement() {
    let { status, entitlement, error } = await this.guardian.fetchUserInfo();
    lazy.logConsole.debug("Entitlement:", { status, entitlement, error });

    if (error || !entitlement || status != 200) {
      this.#dispatchError(error || `Status: ${status}`);
      return null;
    }

    return entitlement;
  }

  /**
   * Fetches a new ProxyPass.
   *
   * @returns {Promise<ProxyPass|null>} - the proxy pass if it available.
   */
  async #getProxyPass() {
    let proxyPass;
    try {
      proxyPass = await this.guardian.fetchProxyPass();
    } catch (error) {
      this.#dispatchError(error);
      return null;
    }

    let { status, error, pass } = proxyPass;
    lazy.logConsole.debug("ProxyPass:", {
      status,
      valid: pass?.isValid(),
      error,
    });

    if (error || !pass || status != 200) {
      this.#dispatchError(error);
      return null;
    }

    return pass;
  }

  async startLoginFlow(browser) {
    return lazy.SpecialMessageActions.fxaSignInFlow(SIGNIN_DATA, browser);
  }
  get usageObserver() {
    if (!this.#usageObserver) {
      this.#usageObserver = new lazy.IPProtectionUsage();
    }
    return this.#usageObserver;
  }

  get networkErrorObserver() {
    if (!this.#networkErrorObserver) {
      this.#networkErrorObserver = new lazy.IPPNetworkErrorObserver();
      this.#networkErrorObserver.addEventListener(
        "proxy-http-error",
        this.handleProxyErrorEvent
      );
    }
    return this.#networkErrorObserver;
  }

  #handleProxyErrorEvent(event) {
    if (!this.connection?.active) {
      return null;
    }
    const { isolationKey, level, httpStatus } = event.detail;
    if (isolationKey != this.connection?.isolationKey) {
      // This error does not concern our current connection.
      // This could be due to an old request after a token refresh.
      return null;
    }

    if (httpStatus !== 401) {
      // Envoy returns a 401 if the token is rejected
      // So for now as we only care about rotating tokens we can exit here.
      return null;
    }
    if (level == "error" || this.#pass.shouldRotate()) {
      // If this is a visible top-level error force a rotation
      return this.rotateProxyPass();
    }
    return null;
  }

  /**
   * Helper to dispatch error messages.
   *
   * @param {string} error - the error message to send.
   */
  #dispatchError(error) {
    this.hasError = true;
    this.errors.push(error);
    this.dispatchEvent(
      new CustomEvent("IPProtectionService:Error", {
        bubbles: true,
        composed: true,
        detail: {
          error,
        },
      })
    );
    lazy.logConsole.error(error);
  }
}

const IPProtectionService = new IPProtectionServiceSingleton();

XPCOMUtils.defineLazyPreferenceGetter(
  IPProtectionService,
  "featureEnabled",
  ENABLED_PREF,
  false,
  IPProtectionService.updateEnabled
);

export { IPProtectionService };
