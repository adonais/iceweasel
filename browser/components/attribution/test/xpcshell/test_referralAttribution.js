/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
"use strict";

/**
 * Tests that a referral code carried in the `content` attribution field is
 * kept out of the parsed attribution data and is instead recorded and
 * submitted via the separate `referrals` ping (bug 2055255).
 */

const REFERRAL_SUBMITTED_PREF = "browser.referrals.pingSubmitted";

function resetState() {
  Services.fog.testResetFOG();
  Services.prefs.clearUserPref(REFERRAL_SUBMITTED_PREF);
}

add_setup(function () {
  do_get_profile();
  Services.fog.initializeFOG();
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref(REFERRAL_SUBMITTED_PREF)
  );
});

add_task(function test_referral_extracted_and_submitted() {
  resetState();

  const referralCode = "0123456789ABCDEF";
  const code =
    "source%3Dgoogle.com%26medium%3Dorganic%26content%3Dfxrefer" + referralCode;

  let submitted = false;
  GleanPings.referrals.testBeforeNextSubmit(() => {
    submitted = true;
    Assert.equal(
      Glean.browser.referralCode.testGetValue(),
      referralCode,
      "The referral code is recorded on the referrals ping"
    );
  });

  const parsed = AttributionCode.parseAttributionCode(code);

  Assert.ok(submitted, "The referrals ping was submitted");
  Assert.ok(
    Services.prefs.getBoolPref(REFERRAL_SUBMITTED_PREF, false),
    "The submitted pref is set after submission"
  );
  Assert.deepEqual(
    parsed,
    { source: "google.com", medium: "organic" },
    "The referral code is excluded from parsed attribution data"
  );
  Assert.ok(
    !("content" in parsed),
    "No `content` key leaks into attribution data"
  );
});

add_task(function test_empty_referral_code() {
  resetState();

  const code = "source%3Dgoogle.com%26content%3Dfxrefer";

  let submitted = false;
  GleanPings.referrals.testBeforeNextSubmit(() => {
    submitted = true;
  });

  const parsed = AttributionCode.parseAttributionCode(code);

  Assert.ok(!submitted, "No referrals ping is submitted for an empty code");
  Assert.ok(
    !Services.prefs.getBoolPref(REFERRAL_SUBMITTED_PREF, false),
    "The submitted pref is not set for an empty code"
  );
  Assert.deepEqual(
    parsed,
    { source: "google.com" },
    "An empty referral code is still stripped from attribution data"
  );
});

add_task(function test_invalid_attribution_still_submitted() {
  resetState();

  const code = "content%3DfxreferABC123%26notavalidkey%3Dsomething";

  let submitted = false;
  GleanPings.referrals.testBeforeNextSubmit(() => {
    submitted = true;
  });

  const parsed = AttributionCode.parseAttributionCode(code);

  Assert.ok(
    submitted,
    "Referrals ping sent from an otherwise invalid attribution code"
  );
  Assert.deepEqual(parsed, {}, "Invalid attribution parses to an empty object");
  Assert.ok(
    Services.prefs.getBoolPref(REFERRAL_SUBMITTED_PREF, false),
    "The submitted pref is set for an invalid attribution code containing a referral code"
  );
});

add_task(function test_referral_submitted_only_once() {
  resetState();

  const code = "source%3Dgoogle.com%26content%3DfxreferABC123";

  let firstSubmit = false;
  GleanPings.referrals.testBeforeNextSubmit(() => {
    firstSubmit = true;
  });
  AttributionCode.parseAttributionCode(code);

  Assert.ok(firstSubmit, "The referrals ping is submitted on first parse");
  Assert.ok(
    Services.prefs.getBoolPref(REFERRAL_SUBMITTED_PREF, false),
    "The submitted pref is set after the first submission"
  );

  let secondSubmit = false;
  GleanPings.referrals.testBeforeNextSubmit(() => {
    secondSubmit = true;
  });
  const parsed = AttributionCode.parseAttributionCode(code);

  Assert.ok(!secondSubmit, "The referrals ping is not submitted a second time");
  Assert.deepEqual(
    parsed,
    { source: "google.com" },
    "The referral code is still stripped on subsequent parses"
  );
});

add_task(function test_prefix_only_matches_content_field() {
  resetState();

  // The referral prefix in a field other than `content` must be treated as an
  // ordinary value: no extraction, no ping.
  const code = "source%3Dgoogle.com%26campaign%3DfxreferABC123";

  let submitted = false;
  GleanPings.referrals.testBeforeNextSubmit(() => {
    submitted = true;
  });

  const parsed = AttributionCode.parseAttributionCode(code);

  Assert.ok(!submitted, "No referrals ping for a non-content field");
  Assert.equal(
    Glean.browser.referralCode.testGetValue(),
    null,
    "No referral code is recorded for a non-content field"
  );
  Assert.deepEqual(
    parsed,
    { source: "google.com", campaign: "fxreferABC123" },
    "The prefixed value passes through unchanged in a non-content field"
  );
});
