/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const LINKS = Object.freeze({
  // Used for the download button after a user has purchased an upgrade
  DOWNLOAD_URL: "https://www.mozilla.org/en-US/products/vpn/download/",
  // Used for the upgrade button in the main panel view
  PRODUCT_URL:
    "https://www.mozilla.org/products/vpn/?utm_medium=firefox-desktop&utm_source=freevpnpilot&utm_campaign=evergreen&utm_content=vpnpanel",
  SIGNIN_URL:
    "https://accounts.firefox.com?entrypoint=desktop-fx-vpn&service=sync&entrypoint_experiment=fx-vpn-pilot&entrypoint_variation=alpha",
  SUPPORT_URL: "https://support.mozilla.org/kb/use-ip-concealment-in-firefox",
});

export const FLAGS = Object.freeze({
  us: "chrome://browser/content/ipprotection/assets/flags/us.png",
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
