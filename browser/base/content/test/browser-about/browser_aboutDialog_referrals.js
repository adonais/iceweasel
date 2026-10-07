/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/toolkit/mozapps/update/tests/browser/head.js",
  this
);

const REFERRALS_PREF = "browser.referrals.enabled";
const REFERRAL_CODE_PREF = "browser.referrals.code";

/**
 * Returns the ids the dialog names in its accessible description.
 *
 * @param {Document} doc
 *        The About dialog document.
 * @returns {string[]}
 */
function describedByIds(doc) {
  return doc.documentElement.getAttribute("aria-describedby").split(" ");
}

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

  let describedBy = describedByIds(doc);
  ok(
    describedBy.includes("contributeDescReferrals"),
    "The referrals blurb is part of the dialog description when the pref is enabled"
  );
  ok(
    !describedBy.includes("contributeDesc"),
    "The hidden default blurb is not part of the dialog description"
  );

  shareLink.click();

  await TestUtils.waitForCondition(
    () =>
      gBrowser.currentURI.displaySpec === "about:referrals" ||
      gBrowser.currentURI.displaySpec.startsWith(
        "https://www.firefox.com/invite"
      ),
    "Waiting for the referrals tab to be opened"
  );

  // The code pref is re-locked after generation, and a locked pref reads its
  // (empty) default, so unlock before reading the user-branch value.
  Services.prefs.unlockPref(REFERRAL_CODE_PREF);
  isnot(
    Services.prefs.getStringPref(REFERRAL_CODE_PREF, ""),
    "",
    "A referral code was generated when opening the referrals tab"
  );

  gBrowser.removeTab(gBrowser.selectedTab);
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

  let describedBy = describedByIds(doc);
  ok(
    describedBy.includes("contributeDesc"),
    "The default blurb is part of the dialog description when the pref is disabled"
  );
  ok(
    !describedBy.includes("contributeDescReferrals"),
    "The hidden referrals blurb is not part of the dialog description"
  );

  aboutDialog.close();
  await SpecialPowers.popPrefEnv();
});

// The description is rewritten in place every time the dialog opens, so check
// it still tracks the pref after a dialog has already opened with it disabled.
add_task(async function dialog_description_tracks_pref_across_openings() {
  await SpecialPowers.pushPrefEnv({ set: [[REFERRALS_PREF, true]] });

  let aboutDialog = await waitForAboutDialog();
  let describedBy = describedByIds(aboutDialog.document);

  ok(
    describedBy.includes("contributeDescReferrals"),
    "The referrals blurb is named again once the pref is re-enabled"
  );
  ok(
    !describedBy.includes("contributeDesc"),
    "The default blurb is not named once the pref is re-enabled"
  );

  aboutDialog.close();
  Services.prefs.clearUserPref(REFERRAL_CODE_PREF);
  await SpecialPowers.popPrefEnv();
});
