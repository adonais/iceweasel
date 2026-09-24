/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_no_install_data_files() {
  Services.fog.testResetFOG();

  selectStartupProfile();

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      Assert.equal(
        Glean.profiles.daysSinceUpdate.testGetValue(),
        undefined,
        "Should not set days_since_update when file is missing"
      );
      Assert.equal(
        Glean.profiles.daysSinceInstall.testGetValue(),
        undefined,
        "Should not set days_since_install when file is missing"
      );
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );
});
