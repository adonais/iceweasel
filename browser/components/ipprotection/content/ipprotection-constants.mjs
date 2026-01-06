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
