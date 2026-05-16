/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "fxAccounts", () =>
  ChromeUtils.importESModule(
    "resource://gre/modules/FxAccounts.sys.mjs"
  ).getFxAccountsSingleton()
);
ChromeUtils.defineESModuleGetters(lazy, {
  IPPProxyManager:
    "moz-src:///toolkit/components/ipprotection/IPPProxyManager.sys.mjs",
  IPPStartupCache:
    "moz-src:///toolkit/components/ipprotection/IPPStartupCache.sys.mjs",
  IPProtectionService:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
});

const GUARDIAN_ENDPOINT_PREF = "browser.ipProtection.guardian.endpoint";
const GUARDIAN_ENDPOINT_DEFAULT = "https://vpn.mozilla.com";

const CLIENT_ID_MAP = {
  "http://localhost:3000": "6089c54fdc970aed",
  "https://guardian-dev.herokuapp.com": "64ef9b544a31bca8",
  "https://dev.vpn.nonprod.webservices.mozgcp.net": "64ef9b544a31bca8",
  "https://stage.guardian.nonprod.cloudops.mozgcp.net": "e6eb0d1e856335fc",
  "https://stage.vpn.nonprod.webservices.mozgcp.net": "e6eb0d1e856335fc",
  "https://fpn.firefox.com": "e6eb0d1e856335fc",
  "https://vpn.mozilla.org": "e6eb0d1e856335fc",
};

const LOG_PREF = "browser.ipProtection.log";

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "IPPEnrollAndEntitleManager",
    maxLogLevel: Services.prefs.getBoolPref(LOG_PREF, false) ? "Debug" : "Warn",
  });
});

/**
 * Manages enrollment and entitlement for the IP Protection proxy service.
 * Enrollment links the user's FxA account to Guardian via a hidden browser sign-in flow.
 * Entitlement is an FxA-account-scoped grant that allows access to the proxy service.
 */
class IPPEnrollAndEntitleManagerSingleton extends EventTarget {
  #entitlement = null;
  #signInWatcher = null;

  // Promises to queue enrolling and entitling operations.
  #enrollingPromise = null;
  #entitlementPromise = null;

  constructor() {
    super();

    this.handleEvent = this.#handleEvent.bind(this);
  }

  get entitlement() {
    return this.#entitlement;
  }

  init() {
    // We will use data from the cache until we are fully functional. Then we
    // will recompute the state in `initOnStartupCompleted`.
    this.#entitlement = lazy.IPPStartupCache.entitlement;

    // Duck typing: signInWatcher is not part of the base IPPAuthProvider contract.
    // This manager requires the active auth provider to be an IPPFxaAuthProvider.
    this.#signInWatcher = lazy.IPProtectionService.authProvider.signInWatcher;
    if (!this.#signInWatcher) {
      throw new Error(
        "IPPEnrollAndEntitleManager requires an auth provider with a signInWatcher"
      );
    }

    this.#signInWatcher.addEventListener(
      "IPPSignInWatcher:StateChanged",
      this.handleEvent
    );
  }

  initOnStartupCompleted() {
    if (!this.#signInWatcher.isSignedIn) {
      return;
    }
    // This bit must be async because we want to trigger the updateState at
    // the end of the rest of the initialization.
    this.updateEntitlement();
  }

  uninit() {
    this.#signInWatcher.removeEventListener(
      "IPPSignInWatcher:StateChanged",
      this.handleEvent
    );
    this.#signInWatcher = null;

    this.#entitlement = null;
  }

  #handleEvent(_event) {
    if (!this.#signInWatcher.isSignedIn) {
      this.#setEntitlement(null);
      return;
    }
    this.updateEntitlement();
  }

  /**
   * Updates the entitlement status.
   * This will run only one fetch at a time, and queue behind any ongoing enrollment.
   *
   * @param {boolean} forceRefetch - If true, will refetch the entitlement even when one is present.
   * @returns {Promise<object>} status
   * @returns {boolean} status.isEntitled - True if the user is entitled.
   * @returns {string} [status.error] - Error message if entitlement fetch failed.
   */
  async updateEntitlement(forceRefetch = false) {
    if (this.#entitlementPromise) {
      return this.#entitlementPromise;
    }

    // Queue behind any ongoing enrollment.
    if (this.#enrollingPromise) {
      await this.#enrollingPromise;
    }

    let deferred = Promise.withResolvers();
    this.#entitlementPromise = deferred.promise;

    // Notify listeners that an entitlement check has started so they can
    // react to isCheckingEntitlement becoming true.
    this.dispatchEvent(
      new CustomEvent("IPPEnrollAndEntitleManager:StateChanged", {
        bubbles: true,
        composed: true,
      })
    );

    const entitled = await this.#entitle(forceRefetch);
    deferred.resolve(entitled);

    if (entitled?.isEntitled) {
      lazy.IPPProxyManager.refreshUsage();
    }

    this.#entitlementPromise = null;

    // Notify listeners that the entitlement check has completed so they can
    // react to isCheckingEntitlement becoming false.
    this.dispatchEvent(
      new CustomEvent("IPPEnrollAndEntitleManager:StateChanged", {
        bubbles: true,
        composed: true,
      })
    );

    return entitled;
  }

  /**
   * Enrolls and entitles the current Firefox account when possible.
   * This is a long-running request that will set isEnrolling while in progress
   * and will only run once until it completes.
   *
   * @param {AbortSignal} [abortSignal=null] - a signal to indicate the process should be aborted
   * @returns {Promise<object>} result
   * @returns {boolean} result.isEnrolledAndEntitled - True if the user is enrolled and entitled.
   * @returns {string} [result.error] - Error message if enrollment or entitlement failed.
   */
  async maybeEnrollAndEntitle(abortSignal = null) {
    if (this.#enrollingPromise) {
      return this.#enrollingPromise;
    }

    let deferred = Promise.withResolvers();
    this.#enrollingPromise = deferred.promise;

    const enrolledAndEntitled = await this.#enrollAndEntitle(abortSignal);
    deferred.resolve(enrolledAndEntitled);
    this.#enrollingPromise = null;

    // By the time enrollingPromise is unset, notify listeners so that they
    // can react to isEnrolling becoming false.
    this.dispatchEvent(
      new CustomEvent("IPPEnrollAndEntitleManager:StateChanged", {
        bubbles: true,
        composed: true,
      })
    );

    return enrolledAndEntitled;
  }

  /**
   * Enroll and entitle the current Firefox account.
   *
   * This will attempt to enroll the user if they are not enrolled, and then fetch
   *
   * @param {AbortSignal} abortSignal - a signal to abort the enrollment
   * @returns {Promise<object>} status
   * @returns {boolean} status.isEnrolledAndEntitled - True if the user is enrolled and entitled.
   * @returns {string} [status.error] - Error message if enrollment or entitlement failed.
   */
  async #enrollAndEntitle(abortSignal = null) {
    if (this.#entitlement) {
      return { isEnrolledAndEntitled: true };
    }

    const { enrollment, error: enrollmentError } =
      // Duck typing: enroll() is not part of the base IPPAuthProvider contract.
      // This manager requires the active auth provider to be an IPPFxaAuthProvider.
      await lazy.IPProtectionService.authProvider.enroll(abortSignal);

    if (enrollmentError || !enrollment) {
      // Unset the entitlement if enrollment failed.
      this.#setEntitlement(null);
      return { isEnrolledAndEntitled: false, error: enrollmentError };
    }

    const { entitlement, error: entitlementError } =
      await IPPEnrollAndEntitleManagerSingleton.#getEntitlement();

    if (entitlementError || !entitlement) {
      // Unset the entitlement if not available.
      this.#setEntitlement(null);
      return { isEnrolledAndEntitled: false, error: entitlementError };
    }

    this.#setEntitlement(entitlement);
    return { isEnrolledAndEntitled: true };
  }

  /**
   * Fetch and update the entitlement.
   *
   * @param {boolean} forceRefetch - If true, will refetch the entitlement even when one is present.
   * @returns {Promise<object>} status
   * @returns {boolean} status.isEntitled - True if the user is entitled.
   * @returns {string} [status.error] - Error message if entitlement fetch failed.
   */
  async #entitle(forceRefetch = false) {
    if (this.#entitlement && !forceRefetch) {
      return { isEntitled: true };
    }

    // Linked does not mean enrolled: it could be that the link comes from a
    // previous MozillaVPN subscription.
    let isLinked = await this.isLinkedToGuardian(!forceRefetch);

    if (!isLinked) {
      this.#setEntitlement(null);
      return { isEntitled: false };
    }

    // Enrolling will handle updating the entitlement.
    if (this.#enrollingPromise) {
      return { isEntitled: false };
    }

    let { entitlement, error } =
      await IPPEnrollAndEntitleManagerSingleton.#getEntitlement();

    if (error || !entitlement) {
      this.#setEntitlement(null);
      return { isEntitled: false, error };
    }

    this.#setEntitlement(entitlement);
    return { isEntitled: true };
  }

  /**
   * Checks if the current FxA account is linked to Guardian by inspecting
   * the list of attached FxA OAuth clients for a matching Guardian client ID.
   *
   * @param {boolean} useCache - If true, will use the cached client list if available.
   * @returns {Promise<boolean>} - True if linked, false otherwise.
   */
  async isLinkedToGuardian(useCache = true) {
    try {
      const endpoint = Services.prefs.getCharPref(
        GUARDIAN_ENDPOINT_PREF,
        GUARDIAN_ENDPOINT_DEFAULT
      );
      const clientId = CLIENT_ID_MAP[new URL(endpoint).origin];
      if (!clientId) {
        return false;
      }
      const cached = await lazy.fxAccounts.listAttachedOAuthClients();
      if (cached.some(c => c.id === clientId)) {
        return true;
      }
      if (useCache) {
        return false;
      }
      const refreshed = await lazy.fxAccounts.listAttachedOAuthClients(true);
      return refreshed.some(c => c.id === clientId);
    } catch (_) {
      return false;
    }
  }

  /**
   * Fetches the entitlement for the current Firefox account.
   *
   * Static to avoid changing internal state of the singleton.
   *
   * @returns {Promise<object>} status
   * @returns {object} status.entitlement - The entitlement object.
   * @returns {string} [status.error] - Error message if fetching entitlement failed.
   */
  static async #getEntitlement() {
    try {
      const { status, entitlement, error } =
        await lazy.IPProtectionService.guardian.fetchUserInfo();
      lazy.logConsole.debug("Entitlement:", { status, entitlement, error });

      if (error || !entitlement || status != 200) {
        return { entitlement: null, error: error || `Status: ${status}` };
      }

      return { entitlement };
    } catch (error) {
      return { entitlement: null, error: error.message };
    }
  }

  /**
   * Sets the entitlement and updates the cache and IPProtectionService state.
   *
   * @param {object | null} entitlement - The entitlement object or null to unset.
   */
  #setEntitlement(entitlement) {
    this.#entitlement = entitlement;
    lazy.IPPStartupCache.storeEntitlement(this.#entitlement);

    lazy.IPProtectionService.updateState();

    this.dispatchEvent(
      new CustomEvent("IPPEnrollAndEntitleManager:StateChanged", {
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Checks if we have the entitlement
   */
  get isEnrolledAndEntitled() {
    return !!this.#entitlement;
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
   * Checks if the entitlement exists and it contains a UUID
   */
  get hasEntitlementUid() {
    return !!this.#entitlement?.uid;
  }

  /**
   * Checks if we are currently enrolling.
   */
  get isEnrolling() {
    return !!this.#enrollingPromise;
  }

  /**
   * Checks if we are currently checking entitlement.
   */
  get isCheckingEntitlement() {
    return !!this.#entitlementPromise;
  }

  /**
   * Waits for the current enrollment to complete, if any.
   */
  async waitForEnrollment() {
    return this.#enrollingPromise;
  }

  /**
   * Refetches the entitlement even if it is cached.
   */
  async refetchEntitlement() {
    await this.updateEntitlement(true);
  }

  /**
   * Unsets any stored entitlement.
   */
  resetEntitlement() {
    this.#setEntitlement(null);
  }
}

const IPPEnrollAndEntitleManager = new IPPEnrollAndEntitleManagerSingleton();

export { IPPEnrollAndEntitleManager };
