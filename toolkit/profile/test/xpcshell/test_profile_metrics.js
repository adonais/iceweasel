/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_records_known_profile() {
  Services.fog.testResetFOG();

  let hash = xreDirProvider.getInstallHash();

  let profileDir = gDataHome.clone();
  profileDir.append("known-profile");
  profileDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

  await IOUtils.writeUTF8(
    PathUtils.join(profileDir.path, "prefs.js"),
    'user_pref("toolkit.profiles.storeID", "knownstore");\n'
  );
  writeCompatibilityIni(profileDir);

  writeProfilesIni({
    options: { startWithLastProfile: true },
    profiles: [
      {
        name: "known",
        path: "known-profile",
        isRelative: true,
        storeID: "knownstore",
      },
    ],
    installs: {
      [hash]: { default: "known-profile" },
    },
  });

  selectStartupProfile();

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      let otherProfiles = Glean.profiles.otherProfiles.testGetValue();
      Assert.ok(otherProfiles, "Should have other profiles data");
      Assert.equal(otherProfiles.length, 1, "Should have one other profile");

      let found = otherProfiles[0];
      Assert.equal(found.path_in_profiles_ini, true);
      Assert.equal(found.store_id_in_profiles_ini, true);
      Assert.equal(found.is_current_group, true);
      Assert.equal(found.is_same_install, true);
      Assert.equal(found.install_exists, true);
      Assert.greaterOrEqual(found.last_used_days, 0);

      Assert.equal(
        Glean.profiles.pathInProfilesIni.testGetValue(),
        false,
        "Current profile should not be in profiles.ini"
      );
      Assert.equal(
        Glean.profiles.storeIdInProfilesIni.testGetValue(),
        true,
        "Current profile's store ID should be in profiles.ini"
      );
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );

  Assert.ok(
    Services.prefs.getBoolPref("toolkit.profiles.newProfileSubmitted", false),
    "Pref should be set after quit"
  );
});
