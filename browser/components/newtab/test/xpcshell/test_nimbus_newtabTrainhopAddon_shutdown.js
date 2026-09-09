/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../../../extensions/newtab/test/xpcshell/head.js */

/* import-globals-from head_nimbus_trainhop.js */

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { AsyncShutdown } = ChromeUtils.importESModule(
  "resource://gre/modules/AsyncShutdown.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

/**
 * Triggers the `appShutdownConfirmed` AsyncShutdown barrier. This spins the
 * event loop until every blocker registered on the barrier has been resolved,
 * so it never returns while a blocker is stalled.
 */
function triggerAppShutdownConfirmed() {
  Services.prefs.setBoolPref("toolkit.asyncshutdown.testing", true);
  try {
    AsyncShutdown.appShutdownConfirmed._trigger();
  } finally {
    // Reset the barrier so the rest of the test file (and the harness shutdown)
    // is not left with a closed phase.
    AsyncShutdown.appShutdownConfirmed._reset();
    Services.prefs.clearUserPref("toolkit.asyncshutdown.testing");
  }
}

/**
 * Ensures that a stalled download of an XPI does not cause an AsyncShutdown
 * blocker to be added.
 */
add_task(
  {
    pref_set: [
      [TRAINHOP_SCHEDULED_UPDATE_STATE_TIMEOUT_PREF, 100],
      [TRAINHOP_SCHEDULED_UPDATE_STATE_DELAY_PREF, 100],
    ],
  },
  async function test_no_asyncshutdown_blocker_on_stalled_trainhop() {
    const sandbox = sinon.createSandbox();

    // Simulate a train-hop install that never settles (e.g. a download whose
    // channel stalled and that never got cancelled).
    const neverResolves = Promise.withResolvers();
    sandbox
      .stub(AboutNewTabResourceMapping, "_installTrainhopAddon")
      .callsFake(() => neverResolves.promise);

    const updateAddonVersion = `${BUILTIN_ADDON_VERSION}.111`;
    const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
      updateAddonVersion,
    });

    AboutNewTabResourceMapping.scheduleUpdateTrainhopAddonState();
    const deferredTask =
      AboutNewTabResourceMapping._updateAddonStateDeferredTask;
    Assert.ok(deferredTask, "Got the _updateAddonStateDeferredTask instance");

    // Let the DeferredTask fire and get stuck inside _installTrainhopAddon.
    await TestUtils.waitForCondition(
      () => deferredTask.isArmed === false && deferredTask.isRunning,
      "Wait for the train-hop deferred task to be running"
    );
    Assert.ok(
      AboutNewTabResourceMapping._installTrainhopAddon.called,
      "Expect the stalled _installTrainhopAddon to have been reached"
    );

    // We now simulate a shutdown and ensure we're not blocking it.
    triggerAppShutdownConfirmed();

    Assert.ok(
      deferredTask.isRunning,
      "Expect the stalled train-hop task to still be running, and shutdown to not have waited for it"
    );
    Assert.ok(
      !deferredTask.isFinalized,
      "Expect no AsyncShutdown blocker to have finalized the train-hop deferred task"
    );

    // Unblock and tear down.
    neverResolves.resolve();
    await deferredTask._runningPromise;
    sandbox.restore();
    await nimbusFeatureCleanup();
    await deferredTask.finalize();
    AboutNewTabResourceMapping._updateAddonStateDeferredTask = null;
  }
);

/**
 * Tests that once the application is shutting down, the deferred task must bail
 * out without being able to start a new train-hop download.
 */
add_task(
  {
    pref_set: [
      [TRAINHOP_SCHEDULED_UPDATE_STATE_TIMEOUT_PREF, 100],
      [TRAINHOP_SCHEDULED_UPDATE_STATE_DELAY_PREF, 100],
    ],
  },
  async function test_no_download_started_while_shutting_down() {
    const sandbox = sinon.createSandbox();
    sandbox
      .stub(AboutNewTabResourceMapping, "_isAppShuttingDown")
      .callsFake(() => true);
    const installSpy = sandbox.spy(
      AboutNewTabResourceMapping,
      "_installTrainhopAddon"
    );

    const updateAddonVersion = `${BUILTIN_ADDON_VERSION}.222`;
    const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
      updateAddonVersion,
    });

    AboutNewTabResourceMapping.scheduleUpdateTrainhopAddonState();
    const deferredTask =
      AboutNewTabResourceMapping._updateAddonStateDeferredTask;
    await TestUtils.waitForCondition(
      () => !deferredTask.isArmed && !deferredTask.isRunning,
      "Wait for the train-hop deferred task to have run"
    );

    Assert.ok(
      !installSpy.called,
      "Expect no train-hop install to be attempted while shutting down"
    );
    Assert.deepEqual(
      await AddonManager.getAllInstalls(),
      [],
      "Expect no AddonInstall to have been created while shutting down"
    );

    // The same must hold when updateTrainhopAddonState is called directly (e.g.
    // from the FirstStartup hook) and reaches _installTrainhopAddon.
    await AboutNewTabResourceMapping.updateTrainhopAddonState();
    Assert.ok(
      installSpy.called,
      "Sanity check: _installTrainhopAddon was reached"
    );
    Assert.deepEqual(
      await AddonManager.getAllInstalls(),
      [],
      "Expect _installTrainhopAddon to not start a download while shutting down"
    );

    sandbox.restore();
    await nimbusFeatureCleanup();
    await deferredTask.finalize();
    AboutNewTabResourceMapping._updateAddonStateDeferredTask = null;
  }
);

/**
 * If shutdown starts after the XPI has been downloaded, we must leave the
 * install staged for the next startup instead of forcing a restartless
 * install.
 */
add_task(async function test_no_restartless_install_while_shutting_down() {
  const sandbox = sinon.createSandbox();

  // Reset the resource mapping state so the forceRestartlessInstall path (which
  // requires `initialized` to be false) is taken, as on FirstStartup.
  mockAboutNewTabUninit();

  // Only report "shutting down" once the XPI has finished downloading, so that
  // the download itself is allowed to start.
  let shuttingDown = false;
  sandbox
    .stub(AboutNewTabResourceMapping, "_isAppShuttingDown")
    .callsFake(() => shuttingDown);
  const downloadEndedListener = {
    onDownloadEnded() {
      shuttingDown = true;
    },
  };
  AddonManager.addInstallListener(downloadEndedListener);

  const updateAddonVersion = `${BUILTIN_ADDON_VERSION}.333`;
  const { nimbusFeatureCleanup } = await setupNimbusTrainhopAddon({
    updateAddonVersion,
  });

  await AboutNewTabResourceMapping.updateTrainhopAddonState(
    true /* forceRestartlessInstall */
  );

  Assert.ok(shuttingDown, "Sanity check: the XPI download did complete");

  // The train-hop add-on must NOT have been installed restartlessly.
  await asyncAssertNewTabAddon({
    locationName: BUILTIN_LOCATION_NAME,
    version: BUILTIN_ADDON_VERSION,
  });
  const { pendingInstall } = await asyncAssertNimbusTrainhopAddonStaged({
    updateAddonVersion,
  });

  AddonManager.removeInstallListener(downloadEndedListener);
  await cancelPendingInstall(pendingInstall);
  sandbox.restore();
  await nimbusFeatureCleanup();
  await AboutNewTabResourceMapping._updateAddonStateDeferredTask?.finalize();
  AboutNewTabResourceMapping._updateAddonStateDeferredTask = null;
});
