/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/mozapps/update/tests/browser/head.js",
  this
);

const REFERRALS_PREF = "browser.referrals.enabled";
const REFERRAL_CODE_PREF = "browser.referrals.code";

add_task(async function share_firefox_link_opens_referrals_when_enabled() {
  await SpecialPowers.pushPrefEnv({ set: [[REFERRALS_PREF, true]] });

  let aboutDialog = await waitForAboutDialog();
  let doc = aboutDialog.document;

  let defaultDesc = doc.getElementById("contributeDesc");
  let referralsDesc = doc.getElementById("contributeDescReferrals");
  let shareLink = referralsDesc.querySelector(
    '[data-l10n-name="helpus-shareFirefoxLink"]'
  );

  ok(!referralsDesc.hidden, "Referrals blurb is shown when pref is enabled");
  ok(defaultDesc.hidden, "Default blurb is hidden when pref is enabled");
  ok(shareLink, "Share Firefox link element exists");

  let tabPromise = BrowserTestUtils.waitForNewTab(gBrowser, "about:referrals");
  shareLink.click();
  let tab = await tabPromise;

  is(
    tab.linkedBrowser.currentURI.displaySpec,
    "about:referrals",
    "Share Firefox opened about:referrals in a new tab"
  );

  // The code pref is re-locked after generation, and a locked pref reads its
  // (empty) default, so unlock before reading the user-branch value.
  Services.prefs.unlockPref(REFERRAL_CODE_PREF);
  isnot(
    Services.prefs.getStringPref(REFERRAL_CODE_PREF, ""),
    "",
    "A referral code was generated when opening the referrals tab"
  );

  BrowserTestUtils.removeTab(tab);
  aboutDialog.close();

  Services.prefs.clearUserPref(REFERRAL_CODE_PREF);
  await SpecialPowers.popPrefEnv();
});

add_task(async function share_firefox_link_hidden_when_disabled() {
  await SpecialPowers.pushPrefEnv({ set: [[REFERRALS_PREF, false]] });

  let aboutDialog = await waitForAboutDialog();
  let doc = aboutDialog.document;

  ok(
    !doc.getElementById("contributeDesc").hidden,
    "Default blurb is shown when pref is disabled"
  );
  ok(
    doc.getElementById("contributeDescReferrals").hidden,
    "Referrals blurb is hidden when pref is disabled"
  );

  aboutDialog.close();
  await SpecialPowers.popPrefEnv();
});
