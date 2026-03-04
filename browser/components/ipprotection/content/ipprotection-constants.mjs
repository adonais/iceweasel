/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const LINKS = Object.freeze({
  // Used for the upgrade button in the main panel view
  get PRODUCT_URL() {
    return (
      Services.prefs.getCharPref(
        "browser.ipProtection.productVpn.endpoint",
        "https://www.mozilla.org"
      ) +
      "/products/vpn/?utm_medium=firefox-desktop&utm_source=freevpnpilot&utm_campaign=evergreen&utm_content=vpnpanel"
    );
  },

  SUPPORT_URL: "https://support.mozilla.org/kb/use-ip-concealment-in-firefox",
});

export const ERRORS = Object.freeze({
  GENERIC: "generic-error",
  NETWORK: "network-error",
  TIMEOUT: "timeout-error", // Activation took too long and was aborted
  MISSING_PROMISE: "missing-activation-promise", // Expected promise was not returned
  MISSING_ABORT: "missing-abort-controller", // Expected abort controller was not returned
  PASS_UNAVAILABLE: "pass-unavailable", // No pass was returned from the server
  SERVER_NOT_FOUND: "server-not-found", // No server was found for the location
});

export const SIGNIN_DATA = Object.freeze({
  where: "tab",
  entrypoint: "desktop-fx-vpn",
  autoClose: false,
  extraParams: {
    service: "sync",
    entrypoint_experiment: "fx-vpn-pilot",
    entrypoint_variation: "alpha",
    utm_source: "callout",
    utm_campaign: "fx-vpn-pilot",
    utm_medium: "firefox-desktop",
    utm_term: "fx-vpn-pilot-panel-button",
  },
});

export const ONBOARDING_PREF_FLAGS = {
  EVER_TURNED_ON_AUTOSTART: 1 << 0,
  EVER_USED_SITE_EXCEPTIONS: 1 << 1,
  EVER_TURNED_ON_VPN: 1 << 2,
};

export const BANDWIDTH = Object.freeze({
  BYTES_IN_GB: Math.pow(2, 30),
  BYTES_IN_MB: Math.pow(2, 20),
  MAX_IN_GB: 50,
  FIRST_THRESHOLD: 0.5,
  SECOND_THRESHOLD: 0.25,
  THIRD_THRESHOLD: 0.1,
});
