/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_records_profile_with_different_install() {
  Services.fog.testResetFOG();

  let profileDir = gProfilesRoot.clone();
  profileDir.append("other-install-profile");
  profileDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

  await IOUtils.writeUTF8(
    PathUtils.join(profileDir.path, "prefs.js"),
    'user_pref("toolkit.profiles.storeID", "unknownstore");\n'
  );

  let otherInstallDir = gProfilesRoot.clone();
  otherInstallDir.append("nonexistent");
  writeCompatibilityIni(profileDir, undefined, otherInstallDir);

  selectStartupProfile();

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      let otherProfiles = Glean.profiles.otherProfiles.testGetValue();
      Assert.ok(otherProfiles, "Should have other profiles data");
      Assert.greaterOrEqual(
        otherProfiles.length,
        1,
        "Should have at least one entry"
      );

      let found = otherProfiles.find(
        p => !p.is_same_install && !p.install_exists
      );
      Assert.ok(found, "Should have an entry for the other-install profile");
      Assert.equal(found.path_in_profiles_ini, false);
      Assert.equal(found.store_id_in_profiles_ini, false);
      Assert.equal(found.is_current_group, undefined);
      Assert.equal(found.is_same_install, false);
      Assert.equal(found.install_exists, false);
      Assert.greaterOrEqual(found.last_used_days, 0);

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
