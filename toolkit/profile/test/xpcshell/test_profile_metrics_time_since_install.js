/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

const { ProfileMetrics } = ChromeUtils.importESModule(
  "moz-src:///toolkit/profile/ProfileMetrics.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);

add_task(async function test_days_since_install() {
  Services.fog.testResetFOG();

  let greDir = Services.dirsvc.get("GreD", Ci.nsIFile);
  let installPath = PathUtils.join(greDir.path, "installation_telemetry.json");

  registerCleanupFunction(async () => {
    await IOUtils.remove(installPath, { ignoreAbsent: true });
  });

  // Convert 5 days ago to a Windows FILETIME (100ns intervals since
  // Jan 1 1601 UTC).
  let fiveDaysAgoMs = Date.now() - 5 * 24 * 60 * 60 * 1000;
  let epochOffset = 116444736000000000;
  let filetime = fiveDaysAgoMs * 10000 + epochOffset;

  let json = JSON.stringify({ install_timestamp: String(filetime) });
  let utf8 = new TextEncoder().encode(json);
  let u16 = new Uint8Array(utf8.length * 2);
  for (let i = 0; i < utf8.length; i++) {
    u16[i * 2] = utf8[i];
    u16[i * 2 + 1] = 0;
  }
  await IOUtils.write(installPath, u16);

  selectStartupProfile();

  Services.prefs.setBoolPref("toolkit.profiles.newProfileSubmitted", false);
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  await ProfileMetrics.init();

  await GleanPings.newProfile.testSubmission(
    () => {
      let value = Glean.profiles.daysSinceInstall.testGetValue();
      Assert.equal(value, 5, "Should be 5 days since install");
    },
    () => {
      AsyncShutdown.profileBeforeChange._trigger();
    }
  );
});
