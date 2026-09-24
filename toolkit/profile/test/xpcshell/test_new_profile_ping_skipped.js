/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests that the new profile ping is not submitted when already sent.
 */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async () => {
  let hash = xreDirProvider.getInstallHash();

  let profileData = {
    options: {
      startWithLastProfile: true,
    },
    profiles: [
      {
        name: "Profile1",
        path: "Path1",
      },
    ],
    installs: {
      [hash]: {
        default: "Path1",
      },
    },
  };

  writeProfilesIni(profileData);

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", true);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);

  let { profile, didCreate } = selectStartupProfile();
  checkStartupReason("default");

  let service = getProfileService();
  checkProfileService(profileData);

  Assert.ok(!didCreate, "Should not have created a new profile.");
  Assert.equal(
    profile,
    service.defaultProfile,
    "Should have returned the default profile."
  );
  Assert.equal(
    profile.name,
    "Profile1",
    "Should have selected the right profile"
  );

  await ProfileMetrics.init();

  await Assert.rejects(
    GleanPings.newProfile.testSubmission(
      () => {},
      () => {
        AsyncShutdown.profileBeforeChange._trigger();
      }
    ),
    /Ping did not submit immediately/
  );
});
