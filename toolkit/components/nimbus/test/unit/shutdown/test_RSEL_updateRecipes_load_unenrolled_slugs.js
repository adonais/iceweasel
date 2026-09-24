/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

add_setup(function () {
  // We don't bother resetting these prefs after the test because there is a
  // single test per-process.
  NimbusTestUtils.enableNimbusEnrollments({ read: true, sync: true });
});

add_task(async function test() {
  const { sandbox, loader, cleanup } = await NimbusTestUtils.setupTest();

  Services.prefs.setBoolPref("nimbus.firstUpdateComplete", false);

  // Stub loadUnenrolledExperimentSlugsFromOtherProfiles() so that it will never
  // resolve. The returned promise will resolve once updateRecipes()
  // loadUnenrolledExperimentSLugsFromOtherProfiles() was called, allowing us to
  // test #raceShutdown().
  const blocker = promiseLoadUnenrolledSlugsBlocks(sandbox);
  const updatePromise = loader.updateRecipes("test");

  // Wait for loadUenrolledExperimentSlugsFromOtherProfiles() to be called.
  await blocker;

  // Advance shutdown, which should trip #raceShutdown() and cause
  // updateRecipes() to throw.
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );

  await Assert.rejects(updatePromise, /Shutdown started/);

  Assert.equal(
    Services.prefs.getBoolPref("nimbus.firstUpdateComplete"),
    false,
    "Update was not completed"
  );

  await cleanup();
});
