/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Since various migrations in ProfileDataUpgrader are sometimes trivial,
 * e.g. just clearing a pref, it does not feel necessary to write tests for
 * each of those.
 *
 * However, ensuring we have at least some coverage to check for errors, e.g.
 * typos, is a good idea, hence this test.
 *
 * If your migration is more complex that clearing a couple of prefs, you
 * should consider adding your own ProfileDataUpgrader test.
 */
const { ProfileDataUpgrader } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ProfileDataUpgrader.sys.mjs"
);

// Use an existing version of 1 and a new version well above any current
// migration threshold, so that this doesn't need updating every time we
// add or obsolete migrations.
const OLD_VERSION = 1;
const NEW_VERSION = 999999;

add_task(async function test_no_errors() {
  // Simulate a migration.
  ProfileDataUpgrader.upgrade(OLD_VERSION, NEW_VERSION);

  Assert.ok(true, "should have run the migration with no errors");
});
