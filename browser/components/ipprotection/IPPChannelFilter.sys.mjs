/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = XPCOMUtils.declareLazy({
  ProxyService: {
    service: "@mozilla.org/network/protocol-proxy-service;1",
    iid: Ci.nsIProtocolProxyService,
  },
});
const { TRANSPARENT_PROXY_RESOLVES_HOST } = Ci.nsIProxyInfo;
const failOverTimeout = 10; // seconds

const DEFAULT_EXCLUDED_URL_PREFS = [
  "browser.ipProtection.guardian.endpoint",
  "identity.fxaccounts.remote.profile.uri",
  "identity.fxaccounts.auth.uri",
  "identity.fxaccounts.remote.profile.uri",
];

/**
 * IPPChannelFilter is a class that implements the nsIProtocolProxyChannelFilter
 * when active it will funnel all requests to its provided proxy.
 *
 * the connection can be stopped
 *
 */
export class IPPChannelFilter {
  /**
   * Creates a new IPPChannelFilter that can connect to a proxy server.
   *
   * @param {string} authToken - a bearer token for the proxy server.
   * @param {string} host - the host of the proxy server.
   * @param {number} port - the port of the proxy server.
   * @param {string} proxyType - "socks" or "http" or "https"
   * @param {Array<string>} [excludedPages] - list of page URLs whose *origin* should bypass the proxy
   */
  static create(
    authToken = "",
    host = "",
    port = 443,
    proxyType = "https",
    excludedPages = []
  ) {
    const proxyInfo = lazy.ProxyService.newProxyInfo(
      proxyType,
      host,
      port,
      authToken,
      IPPChannelFilter.makeIsolationKey(),
      TRANSPARENT_PROXY_RESOLVES_HOST,
      failOverTimeout,
      null // Failover proxy info
    );
    if (!proxyInfo) {
      throw new Error("Failed to create proxy info");
    }
    return new IPPChannelFilter(proxyInfo, excludedPages);
  }

  /**
   * @param {nsIProxyInfo} proxyInfo
   * @param {Array<string>} [excludedPages]
   */
  constructor(proxyInfo, excludedPages = []) {
    if (!proxyInfo) {
      throw new Error("ProxyInfo is required for IPPChannelFilter");
    }

    Object.freeze(proxyInfo);
    this.proxyInfo = proxyInfo;

    // Normalize and store excluded origins (scheme://host[:port])
    this.#excludedOrigins = new Set();
    excludedPages.forEach(url => {
      this.addPageExclusion(url);
    });
    DEFAULT_EXCLUDED_URL_PREFS.forEach(pref => {
      const prefValue = Services.prefs.getStringPref(pref, "");
      if (prefValue) {
        this.addPageExclusion(prefValue);
      }
    });
  }

  /**
   * This method (which is required by the nsIProtocolProxyService interface)
   * is called to apply proxy filter rules for the given URI and proxy object
   * (or list of proxy objects).
   *
   * @param {nsIChannel} channel The channel for which these proxy settings apply.
   * @param {nsIProxyInfo} _defaultProxyInfo The proxy (or list of proxies) that
   *     would be used by default for the given URI. This may be null.
   * @param {nsIProxyProtocolFilterResult} proxyFilter
   */
  async applyFilter(channel, _defaultProxyInfo, proxyFilter) {
    // If this channel should be excluded (origin match), do nothing
    if (this.shouldExclude(channel)) {
      // Calling this with "null" will enforce a non-proxy connection
      proxyFilter.onProxyFilterResult(null);
      return;
    }

    proxyFilter.onProxyFilterResult(this.proxyInfo);

    // Notify observers that the channel is being proxied
    this.#observers.forEach(observer => {
      observer(channel);
    });
  }

  /**
   * Decide whether a channel should bypass the proxy based on origin.
   *
   * @param {nsIChannel} channel
   * @returns {boolean}
   */
  shouldExclude(channel) {
    try {
      const uri = channel.URI; // nsIURI
      if (!uri) {
        return false;
      }
      const origin = uri.prePath; // scheme://host[:port]
      return this.#excludedOrigins.has(origin);
    } catch (_) {
      return false;
    }
  }

  /**
   * Adds a page URL to the exclusion list.
   *
   * @param {string} url - The URL to exclude.
   */
  addPageExclusion(url) {
    try {
      const uri = Services.io.newURI(url);
      // prePath is scheme://host[:port]
      this.#excludedOrigins.add(uri.prePath);
    } catch (_) {
      // ignore bad entries
    }
  }

  /**
   * Starts the Channel Filter, feeding all following Requests through the proxy.
   */
  start() {
    lazy.ProxyService.registerChannelFilter(
      this /* nsIProtocolProxyChannelFilter aFilter */,
      0 /* unsigned long aPosition */
    );
    this.#active = true;
  }

  /**
   * Stops the Channel Filter, stopping all following Requests from being proxied.
   */
  stop() {
    if (!this.#active) {
      return;
    }
    lazy.ProxyService.unregisterChannelFilter(this);
    this.#active = false;
    this.#abort.abort();
  }

  /**
   * Returns the isolation key of the proxy connection.
   * All ProxyInfo objects related to this Connection will have the same isolation key.
   */
  get isolationKey() {
    return this.proxyInfo.connectionIsolationKey;
  }

  /**
   * Replaces the authentication token used by the proxy connection.
   * --> Important <--: This Changes the isolationKey of the Connection!
   *
   * @param {string} newToken - The new authentication token.
   */
  replaceAuthToken(newToken) {
    const newInfo = lazy.ProxyService.newProxyInfo(
      this.proxyInfo.type,
      this.proxyInfo.host,
      this.proxyInfo.port,
      newToken,
      IPPChannelFilter.makeIsolationKey(),
      TRANSPARENT_PROXY_RESOLVES_HOST,
      failOverTimeout,
      null // Failover proxy info
    );
    Object.freeze(newInfo);
    this.proxyInfo = newInfo;
  }

  /**
   * Returns an async generator that yields channels this Connection is proxying.
   *
   * This allows to introspect channels that are proxied, i.e
   * to measure usage, or catch proxy errors.
   *
   * @returns {AsyncGenerator<nsIChannel>} An async generator that yields proxied channels.
   */
  async *proxiedChannels() {
    const stop = Promise.withResolvers();
    this.#abort.signal.addEventListener(
      "abort",
      () => {
        stop.reject();
      },
      { once: true }
    );
    while (this.#active) {
      const { promise, resolve } = Promise.withResolvers();
      this.#observers.push(resolve);
      try {
        const result = await Promise.race([stop.promise, promise]);
        this.#observers = this.#observers.filter(
          observer => observer !== resolve
        );
        yield result;
      } catch (error) {
        // Stop iteration if the filter is stopped or aborted
        return;
      }
    }
  }

  /**
   * Returns true if this filter is active.
   */
  get active() {
    return this.#active;
  }

  #abort = new AbortController();
  #observers = [];
  #active = false;
  #excludedOrigins = new Set();

  static makeIsolationKey() {
    return Math.random().toString(36).slice(2, 18).padEnd(16, "0");
  }
}
