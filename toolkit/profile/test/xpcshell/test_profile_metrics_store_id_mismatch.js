/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_store_id_mismatch() {
  Services.fog.testResetFOG();

  let hash = xreDirProvider.getInstallHash();

  let profileDir = gDataHome.clone();
  profileDir.append("mismatch-profile");
  profileDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

  await IOUtils.writeUTF8(
    PathUtils.join(profileDir.path, "prefs.js"),
    'user_pref("toolkit.profiles.storeID", "profilestore");\n'
  );
  writeCompatibilityIni(profileDir);

  writeProfilesIni({
    options: { startWithLastProfile: true },
    profiles: [
      {
        name: "mismatch",
        path: "mismatch-profile",
        isRelative: true,
        storeID: "profilestore",
      },
    ],
    installs: {
      [hash]: { default: "mismatch-profile" },
    },
  });

  selectStartupProfile();

  // Change the pref so ProfilesDatastoreService.storeID differs from
  // currentProfile.storeID.
  Services.prefs.setStringPref("toolkit.profiles.storeID", "datastorevalue");

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      Assert.equal(
        Glean.profiles.storeIdMismatch.testGetValue(),
        true,
        "store_id_mismatch should be true when storeIDs differ"
      );
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );
});
