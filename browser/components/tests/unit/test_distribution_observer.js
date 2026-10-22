/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that distribution correctly imports preferences from distribution.ini.
 */

const TOPIC_PREFERENCES_COMPLETE = "distribution-preferences-complete";

var gTestDir = do_get_cwd();

function run_test() {
  // Set special pref to load distribution.ini from the profile folder.
  Services.prefs.setBoolPref("distribution.testing.loadFromProfile", true);

  // Copy distribution.ini file to the profile dir.
  let distroDir = ensureDistributionDir();
  let iniFile = distroDir.clone();
  iniFile.append("distribution.ini");
  if (iniFile.exists()) {
    iniFile.remove(false);
    print("distribution.ini already exists, did some test forget to cleanup?");
  }

  let testDistributionFile = gTestDir.clone();
  testDistributionFile.append("distribution.ini");
  testDistributionFile.copyTo(distroDir, "distribution.ini");
  Assert.ok(testDistributionFile.exists());

  run_next_test();
}

registerCleanupFunction(function () {
  let iniFile = gProfD.clone();
  iniFile.append("distribution");
  iniFile.append("distribution.ini");
  if (iniFile.exists()) {
    iniFile.remove(false);
  }
  Assert.ok(!iniFile.exists());
});

add_task(async function test_preferences_observer() {
  print("test_preferences_observer()");
  let { DistributionManagement } = ChromeUtils.importESModule(
    "moz-src:///browser/components/distribution.sys.mjs"
  );

  const observerPromise = new Promise(resolve => {
    Services.obs.addObserver(function observe(
      aObsSubject,
      aObsTopic,
      aObsData
    ) {
      Services.obs.removeObserver(observe, aObsTopic);
      resolve([aObsSubject, aObsData]);
    }, TOPIC_PREFERENCES_COMPLETE);
  });

  // Force distribution.
  DistributionManagement.applyCustomizations();

  await observerPromise;

  // Test succeeds when topic is observed
});
