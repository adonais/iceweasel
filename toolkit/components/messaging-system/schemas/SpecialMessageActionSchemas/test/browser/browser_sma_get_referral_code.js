/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const REFERRALS_PREF = "browser.referrals.enabled";

add_task(async function test_GET_REFERRAL_CODE() {
  let spy = sinon.spy(window, "openTrustedLinkIn");
  const referralStub = sinon
    .stub(Referrals, "getReferralCode")
    .returns("test-referral-code");

  const action = {
    type: "GET_REFERRAL_CODE",
    data: {
      entrypoint: "test",
      where: "current",
    },
  };

  // Test error handling when the pref is off
  Services.prefs.setBoolPref(REFERRALS_PREF, false);
  let error;
  try {
    await SpecialMessageActions.handleAction(action, gBrowser);
  } catch (e) {
    error = e;
  }

  Assert.equal(
    referralStub.callCount,
    1,
    "getReferralCode called by the action"
  );

  ok(error, "should throw if the action is called when referrals are disabled");
  Assert.equal(
    error.message,
    "Cannot generate referral code; referrals disabled by pref"
  );

  // Turn the pref on and re-test the action
  Services.prefs.setBoolPref(REFERRALS_PREF, true);

  await SMATestUtils.executeAndValidateAction(action);

  Assert.ok(spy.calledOnce, "openTrustedLinkIn called");
  let [urlString, where] = openTrustedLinkIn.firstCall.args;
  // Convert the params back into params
  let url = new URL(urlString);

  Assert.equal(where, "current");
  Assert.ok(url.searchParams.has("entrypoint", "test"));
  Assert.ok(url.searchParams.has("ref_key", "test-referral-code"));

  Services.prefs.clearUserPref(REFERRALS_PREF);
  spy.restore();
});
