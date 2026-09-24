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

  // Acquire the update lock and never release it. The timer should never be
  // able to enter #updateImpl.
  loader.withUpdateLock(() => new Promise(() => {}));

  Services.prefs.setBoolPref("nimbus.firstUpdateComplete", false);
  sandbox.spy(loader, "_partitionRecipes");
  sandbox.spy(loader, "updateRecipes");

  // Block the call to withUpdateLock() from updateRecipes(). The returned
  // promise will resolve once the timer has requested the lock.
  const blocker = promiseWithUpdateLock(sandbox, loader);

  // When we update this pref, setTimer will be called and the update will be
  // queued.
  Services.prefs.setIntPref("app.normandy.run_interval_seconds", 1);

  // Wait until the timer has triggered and the callback is calling
  // withUpdateLock from updateRecipes.
  await blocker;

  // Advance shutdown. withUpdateLock() will abort the lock request and reject
  // with a ShutdownStartedError().
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );

  Assert.ok(
    loader.updateRecipes.calledOnceWithExactly("timer"),
    "updateRecipes triggered by timer"
  );
  await Assert.rejects(
    loader.withUpdateLock.getCall(0).returnValue,
    /Shutdown started/,
    "updateRecipes() rejected with ShutdownStartedError"
  );

  Assert.equal(
    Services.prefs.getBoolPref("nimbus.firstUpdateComplete"),
    false,
    "Update was not completed"
  );

  await cleanup();
});
