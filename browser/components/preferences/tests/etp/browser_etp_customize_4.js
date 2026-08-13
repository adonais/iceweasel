/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Each task reopens about:preferences, whose Lit-based controls render very
// slowly under the ChaosMode passes of test-verify on macOS. Give the file
// extra headroom for those passes; normal runs finish in a couple of seconds.
requestLongerTimeout(3);

const CAT_PREF = "browser.contentblocking.category";
const TP_PREF = "privacy.trackingprotection.enabled";
const TP_PBM_PREF = "privacy.trackingprotection.pbmode.enabled";
const EMAIL_TP_PREF = "privacy.trackingprotection.emailtracking.enabled";
const EMAIL_TP_PBM_PREF =
  "privacy.trackingprotection.emailtracking.pbmode.enabled";
const STP_PREF = "privacy.trackingprotection.socialtracking.enabled";
const STP_COOKIES_PREF = "privacy.socialtracking.block_cookies.enabled";

add_task(async function test_custom_tracking_protection_controls() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [TP_PREF, false],
      [TP_PBM_PREF, true],
      [EMAIL_TP_PREF, false],
      [EMAIL_TP_PBM_PREF, true],
      [STP_PREF, false],
      [STP_COOKIES_PREF, true],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let tpToggle = getControl(doc, "etpCustomTrackingProtectionEnabled");
  let tpContext = getControl(doc, "etpCustomTrackingProtectionEnabledContext");

  ok(tpToggle.pressed, "Tracking protection toggle starts enabled");

  let prefChange = TestUtils.waitForPrefChange(
    TP_PBM_PREF,
    value => value === false
  );
  synthesizeClick(tpToggle.buttonEl);
  await prefChange;

  ok(!tpToggle.pressed, "Tracking protection toggle reflects disabled state");
  ok(
    !Services.prefs.getBoolPref(TP_PREF),
    "All-windows tracking protection pref remains false"
  );
  // Email tracking protection follows tracking protection (bug 2049331): with
  // the toggle off, it must be disabled in both contexts.
  ok(
    !Services.prefs.getBoolPref(EMAIL_TP_PREF),
    "All-windows email tracking protection disabled when toggle is off"
  );
  ok(
    !Services.prefs.getBoolPref(EMAIL_TP_PBM_PREF),
    "Private-windows email tracking protection disabled when toggle is off"
  );
  // Social tracking protection follows all-windows tracking protection
  // (bug 2050000): with the toggle off it must be disabled.
  ok(
    !Services.prefs.getBoolPref(STP_PREF),
    "Social tracking protection disabled when toggle is off"
  );

  prefChange = TestUtils.waitForPrefChange(
    TP_PBM_PREF,
    value => value === true
  );
  synthesizeClick(tpToggle.buttonEl);
  await prefChange;
  ok(tpToggle.pressed, "Tracking protection toggle enabled again");
  ok(
    !Services.prefs.getBoolPref(TP_PREF),
    "All-windows tracking protection pref still false after re-enabling toggle"
  );
  ok(
    !Services.prefs.getBoolPref(EMAIL_TP_PREF),
    "All-windows email tracking protection stays disabled for private-only TP"
  );
  ok(
    Services.prefs.getBoolPref(EMAIL_TP_PBM_PREF),
    "Private-windows email tracking protection enabled with the toggle"
  );
  ok(
    !Services.prefs.getBoolPref(STP_PREF),
    "Social tracking protection stays disabled for private-only TP"
  );

  info("Switch context to protect all windows");
  await changeMozSelectValue(tpContext, "all");
  ok(
    Services.prefs.getBoolPref(TP_PREF),
    "Tracking protection pref enabled for all windows"
  );
  ok(
    Services.prefs.getBoolPref(TP_PBM_PREF),
    "Tracking protection PBM pref stays enabled"
  );
  ok(
    Services.prefs.getBoolPref(EMAIL_TP_PREF),
    "All-windows email tracking protection enabled for all windows"
  );
  ok(
    Services.prefs.getBoolPref(EMAIL_TP_PBM_PREF),
    "Private-windows email tracking protection enabled for all windows"
  );
  ok(
    Services.prefs.getBoolPref(STP_PREF),
    "Social tracking protection enabled for all windows"
  );

  info("Switch back to private windows only");
  await changeMozSelectValue(tpContext, "pbmOnly");
  ok(
    !Services.prefs.getBoolPref(TP_PREF),
    "All windows pref disabled when choosing private only"
  );
  ok(
    Services.prefs.getBoolPref(TP_PBM_PREF),
    "Private windows pref stays enabled"
  );
  ok(
    !Services.prefs.getBoolPref(EMAIL_TP_PREF),
    "All-windows email tracking protection disabled when choosing private only"
  );
  ok(
    Services.prefs.getBoolPref(EMAIL_TP_PBM_PREF),
    "Private-windows email tracking protection stays enabled"
  );
  ok(
    !Services.prefs.getBoolPref(STP_PREF),
    "Social tracking protection disabled when choosing private only"
  );

  gBrowser.removeCurrentTab();
});

// Opening the pane must not write the social tracking pref; it is only written
// on user interaction (bug 2050000).
add_task(async function test_social_tracking_not_written_on_load() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [TP_PREF, false],
      [TP_PBM_PREF, true],
      [STP_COOKIES_PREF, true],
    ],
  });

  Services.prefs.clearUserPref(STP_PREF);
  ok(
    !Services.prefs.prefHasUserValue(STP_PREF),
    "Social tracking pref has no user value before opening the pane"
  );

  await openEtpCustomizePage();
  getControl(
    gBrowser.contentDocument,
    "etpCustomTrackingProtectionEnabledContext"
  );

  ok(
    !Services.prefs.prefHasUserValue(STP_PREF),
    "Opening the ETP customize pane does not write the social tracking pref"
  );

  gBrowser.removeCurrentTab();
});

// When the user isn't blocking social tracking cookies, choosing all windows
// must not enable social tracking protection (bug 2050000).
add_task(async function test_social_tracking_gated_on_block_cookies() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [TP_PREF, false],
      [TP_PBM_PREF, true],
      [STP_PREF, false],
      [STP_COOKIES_PREF, false],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let tpContext = getControl(doc, "etpCustomTrackingProtectionEnabledContext");

  info("Switch context to protect all windows with cookie blocking off");
  await changeMozSelectValue(tpContext, "all");
  ok(
    Services.prefs.getBoolPref(TP_PREF),
    "Tracking protection pref enabled for all windows"
  );
  ok(
    !Services.prefs.getBoolPref(STP_PREF),
    "Social tracking protection stays disabled when not blocking social cookies"
  );

  gBrowser.removeCurrentTab();
});
