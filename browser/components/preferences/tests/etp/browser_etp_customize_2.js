/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Each task reopens about:preferences, whose Lit-based controls render very
// slowly under the ChaosMode passes of test-verify on macOS. This file has the
// most page reopens of the customize suite (the legacy-mode tests each reload
// to re-render the load-time cookie-option visibility), so it needs the largest
// headroom for those passes; normal runs finish in a couple of seconds.
requestLongerTimeout(5);

const CAT_PREF = "browser.contentblocking.category";
const COOKIE_BEHAVIOR_PREF = "network.cookie.cookieBehavior";

// Checks tracking protection toggle and scope dropdown interactions.
add_task(async function test_custom_cookie_controls() {
  let defaults = Services.prefs.getDefaultBranch("");
  let defaultCookieBehavior = defaults.getIntPref(COOKIE_BEHAVIOR_PREF);

  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [COOKIE_BEHAVIOR_PREF, Ci.nsICookieService.BEHAVIOR_ACCEPT],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let cookieToggle = getControl(doc, "etpCustomCookiesEnabled");
  let cookieSelect = getControl(doc, "cookieBehavior");

  ok(
    !cookieToggle.pressed,
    "Cookie toggle starts disabled when behavior is accept"
  );

  let prefChange = waitForAndAssertPrefState(
    COOKIE_BEHAVIOR_PREF,
    defaultCookieBehavior,
    "Enabling cookie toggle restores default behavior"
  );
  synthesizeClick(cookieToggle.buttonEl);
  await prefChange;

  ok(cookieToggle.pressed, "Cookie toggle is pressed when enabled");

  let getOption = value =>
    [...cookieSelect.querySelectorAll("moz-option")].find(
      o => o.value == value
    );

  ok(
    getOption(Ci.nsICookieService.BEHAVIOR_LIMIT_FOREIGN.toString()).hidden,
    "Legacy mode 3 option is hidden when not on a legacy mode"
  );
  ok(
    getOption(Ci.nsICookieService.BEHAVIOR_REJECT_TRACKER.toString()).hidden,
    "Legacy mode 4 option is hidden when not on a legacy mode"
  );

  info("Select a stricter cookie behavior through the dropdown");
  let newBehavior = Ci.nsICookieService.BEHAVIOR_REJECT_FOREIGN.toString();
  await changeMozSelectValue(cookieSelect, newBehavior);
  is(
    Services.prefs.getIntPref(COOKIE_BEHAVIOR_PREF),
    Ci.nsICookieService.BEHAVIOR_REJECT_FOREIGN,
    "Cookie behavior pref updated from moz-select"
  );

  prefChange = waitForAndAssertPrefState(
    COOKIE_BEHAVIOR_PREF,
    Ci.nsICookieService.BEHAVIOR_ACCEPT,
    "Disabling cookie toggle accepts all cookies"
  );
  synthesizeClick(cookieToggle.buttonEl);
  await prefChange;

  ok(!cookieToggle.pressed, "Cookie toggle reflects disabled state");

  gBrowser.removeCurrentTab();
});

add_task(async function test_legacy_cookie_mode_options() {
  for (let legacyMode of [
    Ci.nsICookieService.BEHAVIOR_LIMIT_FOREIGN,
    Ci.nsICookieService.BEHAVIOR_REJECT_TRACKER,
  ]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        [CAT_PREF, "custom"],
        [COOKIE_BEHAVIOR_PREF, legacyMode],
      ],
    });

    let { doc } = await openEtpCustomizePage();
    let cookieSelect = getControl(doc, "cookieBehavior");
    let getOption = value =>
      [...cookieSelect.querySelectorAll("moz-option")].find(
        o => o.value == value
      );

    ok(
      !getOption(legacyMode.toString()).hidden,
      `Current legacy mode ${legacyMode} option is visible`
    );

    let otherLegacyMode =
      legacyMode === Ci.nsICookieService.BEHAVIOR_LIMIT_FOREIGN
        ? Ci.nsICookieService.BEHAVIOR_REJECT_TRACKER
        : Ci.nsICookieService.BEHAVIOR_LIMIT_FOREIGN;
    ok(
      getOption(otherLegacyMode.toString()).hidden,
      `Other legacy mode ${otherLegacyMode} option is hidden`
    );

    gBrowser.removeCurrentTab();
  }
});

add_task(async function test_legacy_cookie_mode_persists_within_session() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [CAT_PREF, "custom"],
      [COOKIE_BEHAVIOR_PREF, Ci.nsICookieService.BEHAVIOR_REJECT_TRACKER],
    ],
  });

  let { doc } = await openEtpCustomizePage();
  let cookieSelect = getControl(doc, "cookieBehavior");
  let getOption = value =>
    [...cookieSelect.querySelectorAll("moz-option")].find(
      o => o.value == value
    );

  ok(
    !getOption(Ci.nsICookieService.BEHAVIOR_REJECT_TRACKER.toString()).hidden,
    "Mode 4 option is visible when it is the current value"
  );

  info("Switch to behavior 5 (Total Cookie Protection)");
  await changeMozSelectValue(
    cookieSelect,
    Ci.nsICookieService.BEHAVIOR_PARTITION_FOREIGN.toString()
  );

  ok(
    !getOption(Ci.nsICookieService.BEHAVIOR_REJECT_TRACKER.toString()).hidden,
    "Mode 4 option remains visible within the same session after switching away"
  );

  gBrowser.removeCurrentTab();

  info("Reload the preferences page");
  ({ doc } = await openEtpCustomizePage());
  cookieSelect = getControl(doc, "cookieBehavior");
  getOption = value =>
    [...cookieSelect.querySelectorAll("moz-option")].find(
      o => o.value == value
    );

  for (let value of [
    Ci.nsICookieService.BEHAVIOR_ACCEPT,
    Ci.nsICookieService.BEHAVIOR_REJECT_FOREIGN,
    Ci.nsICookieService.BEHAVIOR_REJECT,
    Ci.nsICookieService.BEHAVIOR_PARTITION_FOREIGN,
  ]) {
    ok(
      !getOption(value.toString()).hidden,
      `mode ${value} is visible after reload`
    );
  }

  ok(
    getOption(Ci.nsICookieService.BEHAVIOR_LIMIT_FOREIGN.toString()).hidden,
    "Mode 3 is hidden after reload"
  );
  ok(
    getOption(Ci.nsICookieService.BEHAVIOR_REJECT_TRACKER.toString()).hidden,
    "Mode 4 is hidden after reload"
  );

  gBrowser.removeCurrentTab();
});
