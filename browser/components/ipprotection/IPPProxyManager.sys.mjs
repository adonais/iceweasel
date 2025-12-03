/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  GuardianClient: "resource:///modules/ipprotection/GuardianClient.sys.mjs",
  IPPChannelFilter: "resource:///modules/ipprotection/IPPChannelFilter.sys.mjs",
  IPProtectionUsage:
    "resource:///modules/ipprotection/IPProtectionUsage.sys.mjs",
  IPPNetworkErrorObserver:
    "resource:///modules/ipprotection/IPPNetworkErrorObserver.sys.mjs",
  IPProtectionServerlist:
    "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs",
});

const LOG_PREF = "browser.ipProtection.log";

ChromeUtils.defineLazyGetter(lazy, "logConsole", function () {
  return console.createInstance({
    prefix: "IPPProxyManager",
    maxLogLevel: Services.prefs.getBoolPref(LOG_PREF, false) ? "Debug" : "Warn",
  });
});

/**
 * Manages the proxy connection for the IPProtectionService.
 */
class IPPProxyManager {
  #guardian = null;
  #pass = null;
  /**@type {import("./IPPChannelFilter.sys.mjs").IPPChannelFilter | null} */
  #connection = null;
  #usageObserver = null;
  #networkErrorObserver = null;
  // If this is set, we're awaiting a proxy pass rotation
  #rotateProxyPassPromise = null;
  #activatedAt = false;

  get activatedAt() {
    return this.#activatedAt;
  }

  get guardian() {
    if (!this.#guardian) {
      this.#guardian = new lazy.GuardianClient();
    }
    return this.#guardian;
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
    return !!this.#connection?.active && !!this.#connection?.proxyInfo;
  }

  get isolationKey() {
    return this.#connection?.isolationKey;
  }

  get hasValidProxyPass() {
    return !!this.#pass?.isValid();
  }

  constructor(guardian) {
    this.#guardian = guardian;
    this.handleProxyErrorEvent = this.#handleProxyErrorEvent.bind(this);
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

  /**
   * Starts the proxy connection:
   * - Gets a new proxy pass if needed.
   * - Find the server to use.
   * - Adds usage and network-error observers.
   *
   * @returns {Promise<boolean|Error>}
   */
  async start() {
    this.createChannelFilter();

    // If the current proxy pass is valid, no need to re-authenticate.
    // Throws an error if the proxy pass is not available.
    if (!this.#pass?.isValid()) {
      this.#pass = await this.#getProxyPass();
    }

    const location = lazy.IPProtectionServerlist.getDefaultLocation();
    const server = lazy.IPProtectionServerlist.selectServer(location?.city);
    if (!server) {
      lazy.logConsole.error("No server found");
      throw new Error("No server found");
    }

    lazy.logConsole.debug("Server:", server?.hostname);

    this.#connection.initialize(
      this.#pass.asBearerToken(),
      server.hostname,
      server.port
    );

    this.usageObserver.start();
    this.usageObserver.addIsolationKey(this.#connection.isolationKey);

    this.networkErrorObserver.start();
    this.networkErrorObserver.addIsolationKey(this.#connection.isolationKey);

    lazy.logConsole.info("Started");

    if (this.active) {
      this.#activatedAt = ChromeUtils.now();
    }

    return this.active;
  }

  /**
   * Stops the proxy connection and observers. Returns the duration of the connection.
   *
   * @returns {int}
   */
  stop() {
    this.cancelChannelFilter();

    this.networkErrorObserver.stop();

    lazy.logConsole.info("Stopped");

    return ChromeUtils.now() - this.#activatedAt;
  }

  /**
   * Stop any connections and reset the pass if the user has changed.
   */
  async reset() {
    this.#pass = null;
    if (this.active) {
      await this.stop();
    }
  }

  /**
   * Cleans up this instance.
   */
  destroy() {
    this.reset();
    this.#connection = null;
    this.usageObserver.stop();
  }

  /**
   * Fetches a new ProxyPass.
   * Throws an error on failures.
   *
   * @returns {Promise<ProxyPass|Error>} - the proxy pass if it available.
   */
  async #getProxyPass() {
    let { status, error, pass } = await this.guardian.fetchProxyPass();
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
}

export { IPPProxyManager };
