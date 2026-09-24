/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_ignores_missing_prefs_js() {
  Services.fog.testResetFOG();

  let profileDir = gProfilesRoot.clone();
  profileDir.append("no-prefs-profile");
  profileDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  writeCompatibilityIni(profileDir);

  selectStartupProfile();

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      let otherProfiles = Glean.profiles.otherProfiles.testGetValue();
      Assert.ok(otherProfiles, "Should have other profiles data");

      Assert.equal(
        otherProfiles.length,
        0,
        "Profile without prefs.js should be ignored"
      );

      Assert.equal(
        Glean.profiles.pathInProfilesIni.testGetValue(),
        false,
        "Current profile should not be in profiles.ini"
      );
      Assert.equal(
        Glean.profiles.storeIdInProfilesIni.testGetValue(),
        undefined,
        "store_id_in_profiles_ini should not be set without a store ID"
      );
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );
});
