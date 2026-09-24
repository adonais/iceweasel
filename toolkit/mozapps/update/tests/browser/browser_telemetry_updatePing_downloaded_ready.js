/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test that UpdatePing telemetry with a payload reason of ready is sent for a
 * staged update.
 *
 * Please note that this is really a Telemetry test, not an
 * "update UI" test like the rest of the tests in this directory.
 * This test does not live in toolkit/components/telemetry/tests to prevent
 * duplicating the code for all the test dependencies. Unfortunately, due
 * to a limitation in the build system, we were not able to simply reference
 * the dependencies as "support-files" in the test manifest.
 */
add_task(async function telemetry_updatePing_ready() {
  await GleanPings.update.testSubmission(
    reason => {
      Assert.equal("ready", reason);
      Assert.equal("20080811053724", Glean.update.targetBuildId.testGetValue());
      // We don't have specific target values for these, so just make sure they're set.
      Assert.ok(!!Glean.update.targetVersion.testGetValue());
      Assert.ok(!!Glean.update.targetChannel.testGetValue());
      Assert.ok(!!Glean.update.targetDisplayVersion.testGetValue());
    },
    async () => {
      await runTelemetryUpdateTest("", "update-downloaded");
    },
    50 // The "update" ping is submitted asynchronously within update-downloaded.
  );
});
