/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

add_task(async function test() {
  const { sandbox, loader, cleanup } = await NimbusTestUtils.setupTest();

  Services.prefs.setBoolPref("nimbus.firstUpdateComplete", false);
  sandbox.spy(loader, "withUpdateLock");

  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );

  // Attempt to update recipes after shutdown has begun. The function should
  // return immediately without attempting to do any update logic.
  await loader.updateRecipes("test");

  Assert.ok(loader.withUpdateLock.notCalled, "Never called withUpdateLock()");

  Assert.equal(
    Services.prefs.getBoolPref("nimbus.firstUpdateComplete"),
    false,
    "Update was not completed"
  );

  await cleanup();
});
