/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests that shared metrics (pathInProfilesIni, storeIdInProfilesIni,
 * storeIdMismatch) are still collected even after the new-profile ping has
 * already been submitted.
 */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);

add_task(async function test_shared_metrics_collected_after_submission() {
  Services.fog.testResetFOG();

  let hash = xreDirProvider.getInstallHash();
  let currentDir = Services.dirsvc.get("ProfD", Ci.nsIFile);

  writeProfilesIni({
    options: { startWithLastProfile: true },
    profiles: [
      {
        name: "Profile1",
        path: currentDir.path,
        isRelative: false,
        storeID: "teststore",
      },
    ],
    installs: {
      [hash]: { default: currentDir.path },
    },
  });

  selectStartupProfile();

  Services.prefs.setStringPref("toolkit.profiles.storeID", "teststore");
  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", true);

  await ProfileMetrics.init();

  Assert.strictEqual(
    Glean.profiles.pathInProfilesIni.testGetValue(),
    true,
    "pathInProfilesIni should be collected even after new-profile ping was submitted"
  );
  Assert.strictEqual(
    Glean.profiles.storeIdInProfilesIni.testGetValue(),
    true,
    "storeIdInProfilesIni should be collected even after new-profile ping was submitted"
  );
  Assert.strictEqual(
    Glean.profiles.storeIdMismatch.testGetValue(),
    false,
    "storeIdMismatch should be collected even after new-profile ping was submitted"
  );
});

add_task(async function test_store_id_mismatch_collected_after_submission() {
  Services.fog.testResetFOG();

  Services.prefs.setStringPref("toolkit.profiles.storeID", "differentstore");
  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", true);

  await ProfileMetrics.init();

  Assert.strictEqual(
    Glean.profiles.storeIdMismatch.testGetValue(),
    true,
    "storeIdMismatch should detect mismatch even after new-profile ping was submitted"
  );
});
