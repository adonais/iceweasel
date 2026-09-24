/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_days_since_update() {
  Services.fog.testResetFOG();

  let greDir = Services.dirsvc.get("GreD", Ci.nsIFile);
  let updatePath = PathUtils.join(greDir.path, "update_telemetry.json");

  registerCleanupFunction(async () => {
    await IOUtils.remove(updatePath, { ignoreAbsent: true });
  });

  let fiveDaysAgoMs = Date.now() - 5 * 24 * 60 * 60 * 1000;
  await IOUtils.writeUTF8(
    updatePath,
    JSON.stringify({ install_timestamp: String(fiveDaysAgoMs) })
  );

  selectStartupProfile();

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      let value = Glean.profiles.daysSinceUpdate.testGetValue();
      Assert.equal(value, 5, "Should be 5 days since update");
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );
});
