/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

add_task(async function test() {
  const { sandbox, loader, cleanup } = await NimbusTestUtils.setupTest();

  Services.prefs.setBoolPref("nimbus.firstUpdateComplete", false);
  sandbox.spy(loader, "_partitionRecipes");

  // Stub RemoteSettingsClient.get() so that it will never resolve. The returned
  // promise will resolve once get() was called, allowing us to test
  // #raceShutdown().
  const blocker = promiseGetRecipesBlocks(loader);
  const updatePromise = loader.updateRecipes("test");

  // Wait for get() to be called.
  await blocker;

  // Advance shutdown, which should trip #raceShutdown and cause updateRecipes()
  // to reject with a ShutdownStartedError.
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );

  await Assert.rejects(updatePromise, /Shutdown started/);

  // _partitionRecipes() is called only after all recipes are collected.
  Assert.ok(
    loader._partitionRecipes.notCalled,
    "Did not progress to recipe partitioning"
  );

  Assert.equal(
    Services.prefs.getBoolPref("nimbus.firstUpdateComplete"),
    false,
    "Update was not completed"
  );

  await cleanup();
});
