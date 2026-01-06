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

const MODE_PREF = "browser.ipProtection.mode";

export const IPPMode = Object.freeze({
  MODE_FULL: 0,
  MODE_PB: 1,
  MODE_TRACKER: 2,
});

const TRACKING_FLAGS =
  Ci.nsIClassifiedChannel.CLASSIFIED_TRACKING |
  Ci.nsIClassifiedChannel.CLASSIFIED_TRACKING_AD |
  Ci.nsIClassifiedChannel.CLASSIFIED_TRACKING_ANALYTICS |
  Ci.nsIClassifiedChannel.CLASSIFIED_TRACKING_SOCIAL |
  Ci.nsIClassifiedChannel.CLASSIFIED_TRACKING_CONTENT;

const DEFAULT_EXCLUDED_URL_PREFS = [
  "browser.ipProtection.guardian.endpoint",
  "identity.fxaccounts.remote.profile.uri",
  "identity.fxaccounts.auth.uri",
  "identity.fxaccounts.remote.profile.uri",
];

const ESSENTIAL_URL_PREFS = [
  "toolkit.telemetry.server",
  "network.trr.uri",
  "network.trr.default_provider_uri",
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
   * Creates a new IPPChannelFilter that can connect to a proxy server. After
   * created, the proxy can be immediately activated. It will suspend all the
   * received nsIChannel until the object is fully initialized.
   *
   * @param {Array<string>} [excludedPages] - list of page URLs whose *origin* should bypass the proxy
   */
  static create(excludedPages = []) {
    return new IPPChannelFilter(excludedPages);
  }

  /**
   * Sets the IPP Mode.
   *
   * @param {IPPMode} [mode] - the new mode
   */
  static setMode(mode) {
    Services.prefs.setIntPref(MODE_PREF, mode);
  }

  /**
   * Takes a protocol definition and constructs the appropriate nsIProxyInfo
   *
   * @typedef {import("./IPProtectionServerlist.sys.mjs").MasqueProtocol} MasqueProtocol
   * @typedef {import("./IPProtectionServerlist.sys.mjs").ConnectProtocol } ConnectProtocol
   *
   * @param {string} authToken - a bearer token for the proxy server.
   * @param {string} isolationKey - the isolation key for the proxy connection.
   * @param {MasqueProtocol|ConnectProtocol} protocol - the protocol definition.
   * @param {nsIProxyInfo} fallBackInfo - optional fallback proxy info.
   * @returns {nsIProxyInfo}
   */
  static constructProxyInfo(
    authToken,
    isolationKey,
    protocol,
    fallBackInfo = null
  ) {
    switch (protocol.name) {
      case "masque":
        return lazy.ProxyService.newMASQUEProxyInfo(
          protocol.host,
          protocol.port,
          protocol.templateString,
          authToken,
          isolationKey,
          TRANSPARENT_PROXY_RESOLVES_HOST,
          failOverTimeout,
          fallBackInfo
        );
      case "connect":
        return lazy.ProxyService.newProxyInfo(
          protocol.scheme,
          protocol.host,
          protocol.port,
          authToken,
          isolationKey,
          TRANSPARENT_PROXY_RESOLVES_HOST,
          failOverTimeout,
          fallBackInfo
        );
      default:
        throw new Error(
          "Cannot construct ProxyInfo for Unknown server-protocol: " +
            protocol.name
        );
    }
  }
  /**
   * Takes a server definition and constructs the appropriate nsIProxyInfo
   * If the server supports multiple Protocols, a fallback chain will be created.
   * The first protocol in the list will be the primary one, with the others as fallbacks.
   *
   * @typedef {import("./IPProtectionServerlist.sys.mjs").Server} Server
   * @param {string} authToken - a bearer token for the proxy server.
   * @param {Server} server - the server to connect to.
   * @returns {nsIProxyInfo}
   */
  static serverToProxyInfo(authToken, server) {
    const isolationKey = IPPChannelFilter.makeIsolationKey();
    return server.protocols.reduceRight((fallBackInfo, protocol) => {
      return IPPChannelFilter.constructProxyInfo(
        authToken,
        isolationKey,
        protocol,
        fallBackInfo
      );
    }, null);
  }

  /**
   * Initialize a IPPChannelFilter object. After this step, the filter, if
   * active, will process the new and the pending channels.
   *
   * @typedef {import("./IPProtectionServerlist.sys.mjs").Server} Server
   * @param {string} authToken - a bearer token for the proxy server.
   * @param {Server} server - the server to connect to.
   */
  initialize(authToken = "", server) {
    if (this.proxyInfo) {
      throw new Error("Double initialization?!?");
    }
    const proxyInfo = IPPChannelFilter.serverToProxyInfo(authToken, server);
    Object.freeze(proxyInfo);
    this.proxyInfo = proxyInfo;

    this.#processPendingChannels();
  }

  /**
   * @param {Array<string>} [excludedPages]
   */
  constructor(excludedPages = []) {
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

    // Get origins essential to starting the proxy and exclude
    // them prior to connecting
    this.#essentialOrigins = new Set();
    ESSENTIAL_URL_PREFS.forEach(pref => {
      const prefValue = Services.prefs.getStringPref(pref, "");
      if (prefValue) {
        this.addEssentialExclusion(prefValue);
      }
    });

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "mode",
      MODE_PREF,
      IPPMode.MODE_FULL
    );
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
  applyFilter(channel, _defaultProxyInfo, proxyFilter) {
    // If this channel should be excluded (origin match), do nothing
    if (!this.#matchMode(channel) || this.shouldExclude(channel)) {
      // Calling this with "null" will enforce a non-proxy connection
      proxyFilter.onProxyFilterResult(null);
      return;
    }

    if (!this.proxyInfo) {
      // We are not initialized yet!
      this.#pendingChannels.push({ channel, proxyFilter });
      return;
    }

    proxyFilter.onProxyFilterResult(this.proxyInfo);

    // Notify observers that the channel is being proxied
    this.#observers.forEach(observer => {
      observer(channel);
    });
  }

  #matchMode(channel) {
    switch (this.mode) {
      case IPPMode.MODE_PB:
        return !!channel.loadInfo.originAttributes.privateBrowsingId;

      case IPPMode.MODE_TRACKER:
        return (
          TRACKING_FLAGS &
          channel.loadInfo.triggeringThirdPartyClassificationFlags
        );

      case IPPMode.MODE_FULL:
      default:
        return true;
    }
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
        return true;
      }

      if (!["http", "https"].includes(uri.scheme)) {
        return true;
      }

      const origin = uri.prePath; // scheme://host[:port]

      if (!this.proxyInfo && this.#essentialOrigins.has(origin)) {
        return true;
      }

      return this.#excludedOrigins.has(origin);
    } catch (_) {
      return true;
    }
  }

  /**
   * Adds a page URL to the exclusion list.
   *
   * @param {string} url - The URL to exclude.
   * @param {Set<string>} [list] - The exclusion list to add the URL to.
   */
  addPageExclusion(url, list = this.#excludedOrigins) {
    try {
      const uri = Services.io.newURI(url);
      // prePath is scheme://host[:port]
      list.add(uri.prePath);
    } catch (_) {
      // ignore bad entries
    }
  }

  /**
   * Adds a URL to the essential exclusion list.
   *
   * @param {string} url - The URL to exclude.
   */
  addEssentialExclusion(url) {
    this.addPageExclusion(url, this.#essentialOrigins);
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

    this.#abortPendingChannels();

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

  get hasPendingChannels() {
    return !!this.#pendingChannels.length;
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
   * @yields {object}
   *   Proxied channels.
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

  #processPendingChannels() {
    if (this.#pendingChannels.length) {
      this.#pendingChannels.forEach(data =>
        this.applyFilter(data.channel, null, data.proxyFilter)
      );
      this.#pendingChannels = [];
    }
  }

  #abortPendingChannels() {
    if (this.#pendingChannels.length) {
      this.#pendingChannels.forEach(data =>
        data.channel.cancel(Cr.NS_BINDING_ABORTED)
      );
      this.#pendingChannels = [];
    }
  }

  #abort = new AbortController();
  #observers = [];
  #active = false;
  #excludedOrigins = new Set();
  #essentialOrigins = new Set();
  #pendingChannels = [];

  static makeIsolationKey() {
    return Math.random().toString(36).slice(2, 18).padEnd(16, "0");
  }
}
