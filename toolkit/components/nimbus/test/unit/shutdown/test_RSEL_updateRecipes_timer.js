/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

add_setup(async function setup() {
  Services.prefs.setIntPref("app.update.timerMinimumDelay", 1);
  Services.prefs.setIntPref("app.update.timerFirstInterval", 1000);

  Cc["@mozilla.org/updates/timer-manager;1"]
    .getService(Ci.nsIUpdateTimerManager)
    .QueryInterface(Ci.nsIObserver)
    .observe(null, "utm-test-init", "");
});

add_task(async function test() {
  const { sandbox, loader, cleanup } = await NimbusTestUtils.setupTest();

  Services.prefs.setBoolPref("nimbus.firstUpdateComplete", false);
  sandbox.spy(loader, "_partitionRecipes");
  sandbox.spy(loader, "updateRecipes");

  // Stub RemoteSettingsClient.get() so that it will never resolve. The returned
  // promise will resolve once get() was called, allowing us to test
  // #raceShutdown().
  const blocker = promiseGetRecipesBlocks(loader);

  // When we update this pref, setTimer will be called and the update will be
  // queued.
  Services.prefs.setIntPref("app.normandy.run_interval_seconds", 1);

  // Advance updateRecipes to getRecipesFromCollection, which will now block.
  await blocker;

  // Advance shutdown, which will trip #raceShutdown() and cause updateRecipes()
  // to reject.
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );

  Assert.ok(
    loader.updateRecipes.calledOnceWithExactly("timer"),
    "updateRecipes triggered by timer"
  );
  await Assert.rejects(
    loader.updateRecipes.getCall(0).returnValue,
    /Shutdown started/,
    "updateRecipes rejected with ShutdownStartedError"
  );

  // _partitionRecipes is only called after all recipes are collected.
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
