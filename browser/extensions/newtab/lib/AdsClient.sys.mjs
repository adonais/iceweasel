/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MozAdsClientBuilder:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAdsClient.sys.mjs",
  MozAdsEnvironment:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAdsClient.sys.mjs",
  MozAdsRequestOptions:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAdsClient.sys.mjs",
  MozAdsTelemetry:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustAdsClient.sys.mjs",
  OhttpConfig:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustViaduct.sys.mjs",
  configureOhttpChannel:
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustViaduct.sys.mjs",
});

const PREF_ADSCLIENT_ENABLED = "unifiedAds.adsClient.enabled";

// Viaduct OHTTP channel the ads-client sends over (matches OHTTP_CHANNEL_ID in
// the vendored ads-client crate).
const OHTTP_CHANNEL_ID = "ads-client";
const PREF_OHTTP_ENABLED =
  "browser.newtabpage.activity-stream.unifiedAds.ohttp.enabled";
const PREF_OHTTP_RELAY_URL =
  "browser.newtabpage.activity-stream.discoverystream.ohttp.relayURL";
const PREF_OHTTP_CONFIG_URL =
  "browser.newtabpage.activity-stream.discoverystream.ohttp.configURL";

/**
 * Manages the process-wide MozAdsClient singleton, exported below as
 * `AdsClient`.
 */
export class _AdsClient {
  #client;

  /**
   * @param {object} prefValues The New Tab store's Prefs.values.
   * @returns {boolean}
   */
  isEnabled(prefValues) {
    return Boolean(
      prefValues?.trainhopConfig?.adsClient?.enabled ||
      prefValues?.[PREF_ADSCLIENT_ENABLED]
    );
  }

  /**
   * Build (once) and return the MozAdsClient singleton.
   *
   * @returns {?MozAdsClient} null if the bindings are unavailable.
   */
  getClient() {
    if (this.#client === undefined) {
      this.#client = this.#build();
    }
    return this.#client;
  }

  /**
   * Options for requestTileAds/requestSpocAds/record*, with the OHTTP channel
   * configured from prefs.
   *
   * @returns {MozAdsRequestOptions}
   */
  requestOptions() {
    return new lazy.MozAdsRequestOptions({
      flags: new Map(),
      ohttp: this.#configureOhttp(),
    });
  }

  /**
   * Configure the viaduct OHTTP channel the ads-client sends over.
   *
   * @returns {boolean} Whether OHTTP is configured and should be requested.
   */
  #configureOhttp() {
    const enabled = Services.prefs.getBoolPref(PREF_OHTTP_ENABLED, false);
    const relayUrl = Services.prefs.getStringPref(PREF_OHTTP_RELAY_URL, "");
    const configUrl = Services.prefs.getStringPref(PREF_OHTTP_CONFIG_URL, "");

    if (!enabled || !relayUrl || !configUrl) {
      return false;
    }

    try {
      lazy.configureOhttpChannel(
        OHTTP_CHANNEL_ID,
        new lazy.OhttpConfig({
          relayUrl,
          gatewayHost: new URL(configUrl).host,
        })
      );
      return true;
    } catch (error) {
      console.error("MozAdsClient failed to configure OHTTP channel", error);
      return false;
    }
  }

  #build() {
    // @backward-compat { version 154 }
    // The ads-client bindings only exist on Fx154+, and the New Tab add-on can
    // train-hop onto older Beta/Release builds. Bail out before touching the
    // lazily-loaded lazy.MozAds* bindings. Remove once 154 reaches Release.
    if (Services.vc.compare(AppConstants.MOZ_APP_VERSION, "154.0a1") < 0) {
      return null;
    }

    try {
      // Placeholder telemetry until Glean is wired up.
      class LoggerTelemetry extends lazy.MozAdsTelemetry {
        recordBuildCacheError(label, value) {
          console.error(
            "MozAdsClient telemetry: build cache error",
            label,
            value
          );
        }
        recordClientError(label, value) {
          console.error("MozAdsClient telemetry: client error", label, value);
        }
        recordClientOperationTotal(label) {
          console.warn("MozAdsClient telemetry: client operation", label);
        }
        recordDeserializationError(label, value) {
          console.error(
            "MozAdsClient telemetry: deserialization error",
            label,
            value
          );
        }
        recordHttpCacheOutcome(label, value) {
          console.warn(
            "MozAdsClient telemetry: http cache outcome",
            label,
            value
          );
        }
      }

      return lazy.MozAdsClientBuilder.init()
        .environment(lazy.MozAdsEnvironment.PROD)
        .telemetry(new LoggerTelemetry())
        .build();
    } catch (error) {
      console.error("MozAdsClient failed to initialize", error);
      return null;
    }
  }
}

export const AdsClient = new _AdsClient();
