/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  IPPEnrollAndEntitleManager:
    "resource:///modules/ipprotection/IPPEnrollAndEntitleManager.sys.mjs",
  IPPChannelFilter: "resource:///modules/ipprotection/IPPChannelFilter.sys.mjs",
  IPProtectionUsage:
    "resource:///modules/ipprotection/IPProtectionUsage.sys.mjs",
  IPPNetworkErrorObserver:
    "resource:///modules/ipprotection/IPPNetworkErrorObserver.sys.mjs",
  IPProtectionServerlist:
    "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs",
  IPProtectionService:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
  IPProtectionStates:
    "resource:///modules/ipprotection/IPProtectionService.sys.mjs",
});

import { ERRORS } from "chrome://browser/content/ipprotection/ipprotection-constants.mjs";

const LOG_PREF = "browser.ipProtection.log";
const MAX_ERROR_HISTORY = 50;

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "IPPProxyManager",
    maxLogLevel: Services.prefs.getBoolPref(LOG_PREF, false) ? "Debug" : "Warn",
  });
});

/**
 * @typedef {object} IPPProxyStates
 *  List of the possible states of the IPPProxyManager.
 * @property {string} NOT_READY
 *  The proxy is not ready because the main state machine is not in the READY state.
 * @property {string} READY
 *  The proxy is ready to be activated.
 * @property {string} ACTIVE
 *  The proxy is active.
 * @property {string} ERROR
 *  Error
 *
 * Note: If you update this list of states, make sure to update the
 * corresponding documentation in the `docs` folder as well.
 */
export const IPPProxyStates = Object.freeze({
  NOT_READY: "not-ready",
  READY: "ready",
  ACTIVATING: "activating",
  ACTIVE: "active",
  ERROR: "error",
});

/**
 * Manages the proxy connection for the IPProtectionService.
 */
class IPPProxyManagerSingleton extends EventTarget {
  #state = IPPProxyStates.NOT_READY;

  #activatingPromise = null;

  #pass = null;
  /**@type {import("./IPPChannelFilter.sys.mjs").IPPChannelFilter | null} */
  #connection = null;
  #usageObserver = null;
  #networkErrorObserver = null;
  // If this is set, we're awaiting a proxy pass rotation
  #rotateProxyPassPromise = null;
  #activatedAt = false;

  errors = [];

  constructor() {
    super();

    this.setErrorState = this.#setErrorState.bind(this);
    this.handleProxyErrorEvent = this.#handleProxyErrorEvent.bind(this);
    this.handleEvent = this.#handleEvent.bind(this);
  }

  init() {
    lazy.IPProtectionService.addEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );
  }

  initOnStartupCompleted() {}

  uninit() {
    lazy.IPProtectionService.removeEventListener(
      "IPProtectionService:StateChanged",
      this.handleEvent
    );

    this.errors = [];

    if (
      this.#state === IPPProxyStates.ACTIVE ||
      this.#state === IPPProxyStates.ACTIVATING
    ) {
      this.stop(false);
    }

    this.reset();
    this.#connection = null;
    this.usageObserver.stop();
  }

  /**
   * Checks if the proxy is active and was activated.
   *
   * @returns {Date}
   */
  get activatedAt() {
    return this.#state === IPPProxyStates.ACTIVE && this.#activatedAt;
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

  get active() {
    return this.#state === IPPProxyStates.ACTIVE;
  }

  get isolationKey() {
    return this.#connection?.isolationKey;
  }

  get hasValidProxyPass() {
    return !!this.#pass?.isValid();
  }

  createChannelFilter() {
    if (!this.#connection) {
      this.#connection = lazy.IPPChannelFilter.create();
      this.#connection.start();
    }
  }

  cancelChannelFilter() {
    if (this.#connection) {
      this.#connection.stop();
      this.#connection = null;
    }
  }

  get state() {
    return this.#state;
  }

  /**
   * Start the proxy if the user is eligible.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  async start(userAction = true) {
    if (this.#state === IPPProxyStates.NOT_READY) {
      throw new Error("This method should not be called when not ready");
    }

    if (this.#state === IPPProxyStates.ACTIVATING) {
      if (!this.#activatingPromise) {
        throw new Error("Activating without a promise?!?");
      }

      return this.#activatingPromise;
    }

    const activating = async () => {
      let started = false;
      try {
        started = await this.#startInternal();
      } catch (error) {
        this.#setErrorState(ERRORS.GENERIC, error);
        return;
      }

      if (this.#state === IPPProxyStates.ERROR) {
        return;
      }

      // Proxy failed to start but no error was given.
      if (!started) {
        this.#setState(IPPProxyStates.READY);
        return;
      }

      this.#setState(IPPProxyStates.ACTIVE);

      Glean.ipprotection.toggled.record({
        userAction,
        enabled: true,
      });

      if (userAction) {
        this.#reloadCurrentTab();
      }
    };

    this.#setState(IPPProxyStates.ACTIVATING);
    this.#activatingPromise = activating().finally(
      () => (this.#activatingPromise = null)
    );
    return this.#activatingPromise;
  }

  async #startInternal() {
    await lazy.IPProtectionServerlist.maybeFetchList();

    const enrollAndEntitleData =
      await lazy.IPPEnrollAndEntitleManager.maybeEnrollAndEntitle();
    if (!enrollAndEntitleData || !enrollAndEntitleData.isEnrolledAndEntitled) {
      this.#setErrorState(enrollAndEntitleData.error || ERRORS.GENERIC);
      return false;
    }

    if (lazy.IPProtectionService.state !== lazy.IPProtectionStates.READY) {
      this.#setErrorState(ERRORS.GENERIC);
      return false;
    }

    // Retry getting state if the previous attempt failed.
    if (this.#state === IPPProxyStates.ERROR) {
      this.updateState();
    }

    this.errors = [];

    this.createChannelFilter();

    // If the current proxy pass is valid, no need to re-authenticate.
    // Throws an error if the proxy pass is not available.
    if (!this.#pass?.isValid()) {
      this.#pass = await this.#getProxyPass();
    }

    const location = lazy.IPProtectionServerlist.getDefaultLocation();
    const server = lazy.IPProtectionServerlist.selectServer(location?.city);
    if (!server) {
      this.#setErrorState(ERRORS.GENERIC, "No server found");
      return false;
    }

    lazy.logConsole.debug("Server:", server?.hostname);

    this.#connection.initialize(this.#pass.asBearerToken(), server);

    this.usageObserver.start();
    this.usageObserver.addIsolationKey(this.#connection.isolationKey);

    this.networkErrorObserver.start();
    this.networkErrorObserver.addIsolationKey(this.#connection.isolationKey);

    lazy.logConsole.info("Started");

    if (!!this.#connection?.active && !!this.#connection?.proxyInfo) {
      this.#activatedAt = ChromeUtils.now();
      return true;
    }

    return false;
  }

  /**
   * Stops the proxy.
   *
   * @param {boolean} userAction
   * True if started by user action, false if system action
   */
  async stop(userAction = true) {
    if (this.#state === IPPProxyStates.ACTIVATING) {
      if (!this.#activatingPromise) {
        throw new Error("Activating without a promise?!?");
      }

      await this.#activatingPromise.then(() => this.stop(userAction));
      return;
    }

    if (this.#state !== IPPProxyStates.ACTIVE) {
      return;
    }

    this.cancelChannelFilter();

    this.networkErrorObserver.stop();

    lazy.logConsole.info("Stopped");

    const sessionLength = ChromeUtils.now() - this.#activatedAt;

    Glean.ipprotection.toggled.record({
      userAction,
      duration: sessionLength,
      enabled: false,
    });

    this.#setState(IPPProxyStates.READY);

    if (userAction) {
      this.#reloadCurrentTab();
    }
  }

  /**
   * Gets the current window and reloads the selected tab.
   */
  #reloadCurrentTab() {
    let win = Services.wm.getMostRecentBrowserWindow();
    if (win) {
      win.gBrowser.reloadTab(win.gBrowser.selectedTab);
    }
  }

  /**
   * Stop any connections and reset the pass if the user has changed.
   */
  async reset() {
    this.#pass = null;
    if (
      this.#state === IPPProxyStates.ACTIVE ||
      this.#state === IPPProxyStates.ACTIVATING
    ) {
      await this.stop();
    }
  }

  #handleEvent(_event) {
    this.updateState();
  }

  /**
   * Fetches a new ProxyPass.
   * Throws an error on failures.
   *
   * @returns {Promise<ProxyPass|Error>} - the proxy pass if it available.
   */
  async #getProxyPass() {
    let { status, error, pass } =
      await lazy.IPProtectionService.guardian.fetchProxyPass();
    lazy.logConsole.debug("ProxyPass:", {
      status,
      valid: pass?.isValid(),
      error,
    });

    if (error || !pass || status != 200) {
      throw error || new Error(`Status: ${status}`);
    }

    return pass;
  }

  /**
   * Starts a flow to get a new ProxyPass and replace the current one.
   *
   * @returns {Promise<void>} - Returns a promise that resolves when the rotation is complete or failed.
   * When it's called again while a rotation is in progress, it will return the existing promise.
   */
  async #rotateProxyPass() {
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
    if (this.#connection?.active) {
      this.#connection.replaceAuthToken(pass.asBearerToken());
      this.usageObserver.addIsolationKey(this.#connection.isolationKey);
      this.networkErrorObserver.addIsolationKey(this.#connection.isolationKey);
    }
    lazy.logConsole.debug("Successfully rotated token!");
    this.#pass = pass;
    return null;
  }

  #handleProxyErrorEvent(event) {
    if (!this.#connection?.active) {
      return null;
    }
    const { isolationKey, level, httpStatus } = event.detail;
    if (isolationKey != this.#connection?.isolationKey) {
      // This error does not concern our current connection.
      // This could be due to an old request after a token refresh.
      return null;
    }

    if (httpStatus !== 401) {
      // Envoy returns a 401 if the token is rejected
      // So for now as we only care about rotating tokens we can exit here.
      return null;
    }

    if (level == "error" || this.#pass?.shouldRotate()) {
      // If this is a visible top-level error force a rotation
      return this.#rotateProxyPass();
    }
    return null;
  }

  updateState() {
    this.stop(false);
    this.reset();

    if (lazy.IPProtectionService.state === lazy.IPProtectionStates.READY) {
      this.#setState(IPPProxyStates.READY);
      return;
    }

    this.#setState(IPPProxyStates.NOT_READY);
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

    this.#setState(IPPProxyStates.ERROR);
    lazy.logConsole.error(errorContext || error);
    Glean.ipprotection.error.record({ source: "ProxyManager" });
  }

  #setState(state) {
    if (state === this.#state) {
      return;
    }

    this.#state = state;

    this.dispatchEvent(
      new CustomEvent("IPPProxyManager:StateChanged", {
        bubbles: true,
        composed: true,
        detail: {
          state,
        },
      })
    );
  }
}

const IPPProxyManager = new IPPProxyManagerSingleton();

export { IPPProxyManager };
