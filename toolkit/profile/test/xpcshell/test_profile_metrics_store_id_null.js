/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_store_id_null_profile() {
  Services.fog.testResetFOG();

  let hash = xreDirProvider.getInstallHash();

  let profileDir = gDataHome.clone();
  profileDir.append("nullstore-profile");
  profileDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

  await IOUtils.writeUTF8(PathUtils.join(profileDir.path, "prefs.js"), "");
  writeCompatibilityIni(profileDir);

  writeProfilesIni({
    options: { startWithLastProfile: true },
    profiles: [
      {
        name: "nullstore",
        path: "nullstore-profile",
        isRelative: true,
      },
    ],
    installs: {
      [hash]: { default: "nullstore-profile" },
    },
  });

  selectStartupProfile();

  Services.prefs.setStringPref("toolkit.profiles.storeID", "datastorevalue");

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      Assert.equal(
        Glean.profiles.storeIdMismatch.testGetValue(),
        false,
        "store_id_mismatch should be false when currentProfile.storeID is null"
      );
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );
});
