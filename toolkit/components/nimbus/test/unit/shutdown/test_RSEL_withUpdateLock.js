/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

add_task(async function test() {
  const { loader, cleanup } = await NimbusTestUtils.setupTest();

  // Stub RemoteSettingsClient.get() so that it will never resolve. The returned
  // promise will resolve once get() was called, allowing us to test
  // #raceShutdown().
  const blocker = promiseGetRecipesBlocks(loader);
  const updatePromise = loader.updateRecipes("test");

  // Wait for get() to be called.
  await blocker;

  // Call withUpdateLock(). The provided function will never be called because
  // the lock is held.
  const updateLockPromise = loader.withUpdateLock(() =>
    Assert.ok(false, "Should not be reached")
  );

  // Advance shutdown. This will trigger withUpdateLock() to abort the request
  // and reject with a ShutdownStartedError. Likewise, updateRecipes() will also
  // reject.
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );

  await Assert.rejects(updateLockPromise, /Shutdown started/);
  await Assert.rejects(updatePromise, /Shutdown started/);

  await cleanup();
});
