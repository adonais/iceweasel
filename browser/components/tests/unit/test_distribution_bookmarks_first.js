/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that distribution customizations can be applied *after* distribution
 * bookmarks have been applied, which is the ordering used by startup
 * migration (bug 2045223).
 */

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { DistributionManagement } = ChromeUtils.importESModule(
  "resource:///modules/distribution.sys.mjs"
);

const TOPIC_CUSTOMIZATION_COMPLETE = "distribution-customization-complete";
const PREF_BMPROCESSED = "distribution.disttest.bookmarksProcessed";

registerCleanupFunction(async function () {
  let folderPath = PathUtils.join(PathUtils.profileDir, "distribution");
  await IOUtils.remove(folderPath, { ignoreAbsent: true, recursive: true });
  Services.prefs.clearUserPref("distribution.testing.loadFromProfile");
});

add_setup(async function setup() {
  // Set special pref to load distribution.ini from the profile folder.
  Services.prefs.setBoolPref("distribution.testing.loadFromProfile", true);

  // Copy distribution.ini file to the profile dir.
  let distroDir = gProfD.clone();
  distroDir.leafName = "distribution";
  let iniFile = distroDir.clone();
  iniFile.append("distribution.ini");
  if (iniFile.exists()) {
    iniFile.remove(false);
    print("distribution.ini already exists, did some test forget to cleanup?");
  }

  let testDistributionFile = do_get_cwd().clone();
  testDistributionFile.append("distribution.ini");
  testDistributionFile.copyTo(distroDir, "distribution.ini");
  Assert.ok(testDistributionFile.exists());
});

add_task(async function test_customizations_after_bookmarks() {
  // Startup migration applies the distribution bookmarks first, and waits for
  // them to be done, before "final-ui-startup" triggers applyCustomizations().
  await DistributionManagement.applyBookmarks();
  Assert.ok(
    Services.prefs.getBoolPref(PREF_BMPROCESSED, false),
    "Distribution bookmarks applied."
  );

  let customizationComplete = TestUtils.topicObserved(
    TOPIC_CUSTOMIZATION_COMPLETE
  );

  DistributionManagement.applyCustomizations();

  await customizationComplete;

  let defaultBranch = Services.prefs.getDefaultBranch(null);
  Assert.equal(
    defaultBranch.getCharPref("distribution.id"),
    "disttest",
    "Distribution preferences were still applied"
  );
  Assert.equal(
    defaultBranch.getCharPref("distribution.test.locale"),
    "en-US",
    "Localizable distribution preferences were still applied"
  );
});
