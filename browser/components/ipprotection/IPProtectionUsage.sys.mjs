/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Service Class to observe and record IP protection usage.
 *
 * When started it will observe all HTTP requests and record the
 * transfer sizes of requests and responses that are proxied through
 * the IP protection proxy.
 *
 * It should be started when the IP protection proxy is active.
 * It should be stopped when we know all proxy requests have been completed.
 *
 * It will record all Proxied Requests that match the isolation keys.
 * So after a connection is established, the isolation key should be added.
 */
export class IPProtectionUsage {
  constructor() {
    ChromeUtils.generateQI([Ci.nsIObserver]);
  }

  start() {
    if (this.#active) {
      return;
    }
    Services.obs.addObserver(this, "http-on-stop-request");
    this.#active = true;
  }
  stop() {
    if (!this.#active) {
      return;
    }
    this.#active = false;
    this.#isolationKeys.clear();
    Services.obs.removeObserver(this, "http-on-stop-request");
  }

  addIsolationKey(key) {
    if (typeof key !== "string" || !key) {
      throw new Error("Isolation key must be a non-empty string");
    }
    this.#isolationKeys.add(key);
  }

  observe(subject, topic) {
    if (topic != "http-on-stop-request") {
      return;
    }
    try {
      const chan = subject.QueryInterface(Ci.nsIHttpChannel);
      if (this.shouldCountChannel(chan)) {
        IPProtectionUsage.countChannel(chan);
      }
    } catch (err) {
      // If the channel is not an nsIHttpChannel
    }
  }
  /**
   * Checks if a channel should be counted.
   *
   * @param {nsIHttpChannel} channel
   * @returns {boolean} true if the channel should be counted.
   */
  shouldCountChannel(channel) {
    try {
      const proxiedChannel = channel.QueryInterface(Ci.nsIProxiedChannel);
      const proxyInfo = proxiedChannel.proxyInfo;
      if (!proxyInfo) {
        // No proxy info, nothing to do.
        return false;
      }
      const isolationKey = proxyInfo.connectionIsolationKey;
      return isolationKey && this.#isolationKeys.has(isolationKey);
    } catch (err) {
      // If the channel is not an nsIHttpChannel or nsIProxiedChannel, as it's irrelevant
      // for this class.
    }
    return false;
  }

  /**
   * Checks a completed channel and records the transfer sizes to glean.
   *
   * @param {nsIHttpChannel} chan - A completed Channel to check.
   */
  static countChannel(chan) {
    try {
      const cacheInfo = chan.QueryInterface(Ci.nsICacheInfoChannel);
      if (cacheInfo.isFromCache()) {
        return;
      }
    } catch (_) {
      /* not all channels support it */
    }

    if (chan.transferSize > 0) {
      Glean.ipprotection.usageRx.accumulate(chan.transferSize);
    }
    if (chan.requestSize > 0) {
      Glean.ipprotection.usageTx.accumulate(chan.requestSize);
    }
  }

  #active = false;
  #isolationKeys = new Set();
}

IPProtectionUsage.prototype.QueryInterface = ChromeUtils.generateQI([
  Ci.nsIObserver,
]);
