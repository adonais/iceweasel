/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  Referrals: "resource:///modules/referrals/Referrals.sys.mjs",
});

const REFERRAL_CODE_PREF = "browser.referrals.code";

/**
 * Resets browser.referrals.code back to its empty, unlocked default so tests
 * start from the same clean state as a fresh profile at startup.
 */
function resetReferralCode() {
  if (Services.prefs.prefIsLocked(REFERRAL_CODE_PREF)) {
    Services.prefs.unlockPref(REFERRAL_CODE_PREF);
  }
  Services.prefs.clearUserPref(REFERRAL_CODE_PREF);
}
