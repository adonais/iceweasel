/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_setup(function () {
  resetReferralCode();
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("browser.referrals.enabled");
    resetReferralCode();
  });
});

add_task(function test_disabled_returns_empty() {
  resetReferralCode();
  Services.prefs.setBoolPref("browser.referrals.enabled", false);

  Assert.equal(
    Referrals.getReferralCode(),
    "",
    "Should return an empty string when referrals are disabled"
  );
  Assert.equal(
    Services.prefs.getStringPref(REFERRAL_CODE_PREF, ""),
    "",
    "Should not have generated or stored a code when disabled"
  );
});

add_task(function test_generates_and_stores_code() {
  resetReferralCode();
  Services.prefs.setBoolPref("browser.referrals.enabled", true);

  const code = Referrals.getReferralCode();

  Assert.equal(
    code.length,
    10,
    "Should generate a code of the expected length"
  );

  Assert.ok(
    Services.prefs.prefIsLocked(REFERRAL_CODE_PREF),
    "Should lock the pref after generating the code"
  );

  Assert.equal(
    Referrals.getReferralCode(),
    code,
    "Should return the same code on subsequent calls"
  );

  Services.prefs.unlockPref(REFERRAL_CODE_PREF);
  Assert.equal(
    Services.prefs.getStringPref(REFERRAL_CODE_PREF, ""),
    code,
    "Should persist the generated code on the user branch"
  );
});
