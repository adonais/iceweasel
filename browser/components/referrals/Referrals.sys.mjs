/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "REFERRALS_ENABLED",
  "browser.referrals.enabled",
  false
);

const REFERRAL_CODE_PREF = "browser.referrals.code";
const REFERRAL_CODE_LENGTH = 10;
// Crockford base32
const REFERRAL_CODE_CHARSET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Manages the Firefox Referral program's per-profile referral code.
 */
class ReferralsClass {
  get isEnabled() {
    return lazy.REFERRALS_ENABLED;
  }

  /**
   * Returns the profile's referral code, generating and storing one on first
   * access. Returns an empty string when referrals are disabled.
   *
   * @returns {string} The referral code || ""
   */
  getReferralCode() {
    if (!this.isEnabled) {
      return "";
    }

    // A locked pref reads its default, so unlock to read the user-branch code.
    if (Services.prefs.prefIsLocked(REFERRAL_CODE_PREF)) {
      Services.prefs.unlockPref(REFERRAL_CODE_PREF);
    }

    let code = Services.prefs.getStringPref(REFERRAL_CODE_PREF, "");
    if (!code) {
      code = this.#generateCode();
      Services.prefs.setStringPref(REFERRAL_CODE_PREF, code);
    }

    Services.prefs.lockPref(REFERRAL_CODE_PREF);
    return code;
  }

  /**
   * Opens about:referrals in a new tab. No-op when referrals are disabled.
   *
   * @param {Window} window The browser window to open the tab in.
   */
  openReferralsTab(window) {
    if (!this.isEnabled) {
      return;
    }
    this.getReferralCode();
    window.openTrustedLinkIn("about:referrals", "tab");
  }

  /**
   * Generates a Referral code that will persist and be saved per-profile
   *
   * @returns {string} A newly generated referral code.
   */
  #generateCode() {
    const bytes = new Uint8Array(REFERRAL_CODE_LENGTH);
    crypto.getRandomValues(bytes);

    let code = "";
    for (const byte of bytes) {
      code += REFERRAL_CODE_CHARSET[byte % REFERRAL_CODE_CHARSET.length];
    }
    return code;
  }
}

export const Referrals = new ReferralsClass();
