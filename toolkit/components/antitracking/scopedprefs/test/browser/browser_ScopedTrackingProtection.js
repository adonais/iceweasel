/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Test ScopedPref service tracking-protection pref interaction
 * across browsingContexts.
 */

"use strict";

add_setup(async function () {
  registerCleanupFunction(() => {
    SpecialPowers.clearUserPref(
      "privacy.trackingprotection.allow_list.hasUserInteractedWithETPSettings"
    );
  });
});

const PREF_NORMAL = "privacy.trackingprotection.enabled";
const PREF_PRIVATE = "privacy.trackingprotection.pbmode.enabled";
const SCOPED_PREF = Ci.nsIScopedPrefs.PRIVACY_TRACKINGPROTECTION_ENABLED;

async function getTabBcPrefs(browser, config) {
  let tab = await BrowserTestUtils.openNewForegroundTab(browser, config);
  let bc = tab.linkedBrowser.browsingContext;
  let scopedPrefs = bc.scopedPrefs;
  return [tab, bc, scopedPrefs];
}

add_task(async function test_scoped_obeys_global() {
  // get tab in both private and normal browsing
  let privateWin = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  let [normalTab, normalBc, normalScopedPrefs] = await getTabBcPrefs(
    gBrowser,
    "https://example.com"
  );
  let [privateTab, privateBc, privateScopedPrefs] = await getTabBcPrefs(
    privateWin.gBrowser,
    "https://example.com"
  );
  // go through all configurations and assert that the ScopedPref service returns the correct value
  let prefValues = [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ];
  for (const [normal, pbm] of prefValues) {
    info(`Setting pref normal=${normal}, pbm=${pbm}`);
    await SpecialPowers.setBoolPref(PREF_NORMAL, normal);
    await SpecialPowers.setBoolPref(PREF_PRIVATE, pbm);

    Assert.equal(
      normalScopedPrefs.getBoolPrefScoped(SCOPED_PREF, normalBc),
      normal,
      "Tracking protection value is correct in normal browsing mode"
    );
    Assert.equal(
      privateScopedPrefs.getBoolPrefScoped(SCOPED_PREF, privateBc),
      normal || pbm,
      "Tracking protection value is correct in private browsing mode"
    );
  }
  // cleanup
  await BrowserTestUtils.removeTab(normalTab);
  await BrowserTestUtils.removeTab(privateTab);
  await BrowserTestUtils.closeWindow(privateWin);
  SpecialPowers.clearUserPref(PREF_NORMAL);
  SpecialPowers.clearUserPref(PREF_PRIVATE);
});

async function test_scoped_by_bc(browser) {
  let [tab1, bc1, sp1] = await getTabBcPrefs(browser, "https://example.com");
  let [tab2, bc2, sp2] = await getTabBcPrefs(browser, "https://example.com");

  // assert precondition - tracking protection is enabled in the add_task calling this function
  Assert.equal(sp1.getBoolPrefScoped(SCOPED_PREF, bc1), true);
  Assert.equal(sp2.getBoolPrefScoped(SCOPED_PREF, bc2), true);

  // set pref
  sp1.setBoolPrefScoped(SCOPED_PREF, bc1, false);

  // assert only pref for tab1 gets changed
  Assert.equal(sp1.getBoolPrefScoped(SCOPED_PREF, bc1), false);
  Assert.equal(sp2.getBoolPrefScoped(SCOPED_PREF, bc2), true);

  // later added tab is unaffected
  let [tab3, bc3, sp3] = await getTabBcPrefs(browser, "https://example.com");
  Assert.equal(sp3.getBoolPrefScoped(SCOPED_PREF, bc3), true);

  await BrowserTestUtils.removeTab(tab1);
  await BrowserTestUtils.removeTab(tab2);
  await BrowserTestUtils.removeTab(tab3);
}

add_task(async function test_scoped_by_bc_normal() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF_NORMAL, true]] });
  await test_scoped_by_bc(gBrowser);
});

add_task(async function test_scoped_by_bc_pbm() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF_PRIVATE, true]] });
  let privateWin = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  await test_scoped_by_bc(privateWin.gBrowser);
  await BrowserTestUtils.closeWindow(privateWin);
});

add_task(async function test_scoped_by_site() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF_NORMAL, true]] });
  let [tab, bc1, sp1] = await getTabBcPrefs(gBrowser, "https://example.com");

  // assert precondition
  Assert.equal(sp1.getBoolPrefScoped(SCOPED_PREF, bc1), true);

  // set pref
  sp1.setBoolPrefScoped(SCOPED_PREF, bc1, false);

  BrowserTestUtils.loadURIString({
    browser: tab.linkedBrowser,
    uriString: "https://example.org",
  });
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  let bc2 = tab.linkedBrowser.browsingContext;
  let sp2 = bc2.scopedPrefs;
  Assert.equal(sp1.getBoolPrefScoped(SCOPED_PREF, bc1), false);
  Assert.equal(sp2.getBoolPrefScoped(SCOPED_PREF, bc2), true);

  await BrowserTestUtils.removeTab(tab);
});

async function test_clear(name, clear, pref_value) {
  let [tab, bc, sp] = await getTabBcPrefs(gBrowser, "https://example.com");
  // assert precondition
  Assert.equal(
    sp.getBoolPrefScoped(SCOPED_PREF, bc),
    true,
    name + " precondition is correct"
  );

  sp.setBoolPrefScoped(SCOPED_PREF, bc, false);

  // run passed in clear function and assert pref value
  clear(sp);
  Assert.equal(sp.getBoolPrefScoped(SCOPED_PREF, bc), pref_value, name + " ");

  await BrowserTestUtils.removeTab(tab);
}

add_task(async function test_scoped_clear() {
  await SpecialPowers.pushPrefEnv({ set: [[PREF_NORMAL, true]] });
  await test_clear("clear via clearScoped", sp => sp.clearScoped(), true);
  await test_clear(
    "clear via clearCopedPref",
    sp => sp.clearScopedPref(SCOPED_PREF),
    true
  );
  await test_clear(
    "clear via clearScopedByHost with matching host",
    sp => sp.clearScopedByHost("https://example.com"),
    true
  );
  await test_clear(
    "clear via clearScopedByHost with mismatching host",
    sp => sp.clearScopedByHost("https://example.org"),
    false
  );
  await test_clear(
    "clear via clearScopedPrefByHost with matching host",
    sp => sp.clearScopedPrefByHost(SCOPED_PREF, "https://example.com"),
    true
  );
  await test_clear(
    "clear via clearScopedPrefByHost with mismatching host",
    sp => sp.clearScopedPrefByHost(SCOPED_PREF, "https://example.org"),
    false
  );
});
