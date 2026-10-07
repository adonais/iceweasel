/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { MonitorAgent } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/MonitorAgent.sys.mjs"
);

const { MONITOR_ERROR_CODES, TOTAL_NUM_MONITORS } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs"
);

const MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF =
  "browser.smartwindow.monitorStore.removeDatabaseOnStartup";

async function resetMonitorAgentForTesting() {
  await MonitorAgent._resetForTesting();
  if (
    Services.prefs.prefHasUserValue(
      MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF
    )
  ) {
    Services.prefs.clearUserPref(MONITOR_STORE_REMOVE_DATABASE_ON_STARTUP_PREF);
  }
}

add_task(async function test_limit_number_of_active_monitors() {
  const watchUrls = Array.from(
    { length: 2 },
    (_, i) => `https://example.com/page${i}`
  );
  const createMonitor = () =>
    MonitorAgent.createMonitor({
      prompt: "Check if any product price is below $300.",
      watchUrls,
      schedule: { type: "interval", hours: 1 },
      source: "test",
    });
  const activeCount = async () =>
    (await MonitorAgent.listMonitors()).filter(m => m.enabled).length;
  const limitError = error =>
    error.code === MONITOR_ERROR_CODES.ACTIVE_LIMIT &&
    error.limit === TOTAL_NUM_MONITORS &&
    /Cannot have more than \d+ active monitors\./.test(error.message);

  try {
    await resetMonitorAgentForTesting();
    const ids = [];
    for (let i = 0; i < TOTAL_NUM_MONITORS; i++) {
      ids.push(await createMonitor());
    }
    await Assert.rejects(
      createMonitor(),
      limitError,
      `Creating past ${TOTAL_NUM_MONITORS} active monitors should be rejected`
    );
    Assert.equal(await activeCount(), TOTAL_NUM_MONITORS);

    // Pausing a monitor frees a slot: paused monitors don't count.
    await MonitorAgent.pauseMonitor(ids[0], true);
    Assert.equal(await activeCount(), TOTAL_NUM_MONITORS - 1);
    const extraId = await createMonitor();
    Assert.equal(
      (await MonitorAgent.listMonitors()).length,
      TOTAL_NUM_MONITORS + 1,
      "Paused monitors can exceed the active limit"
    );
    Assert.equal(await activeCount(), TOTAL_NUM_MONITORS);

    // Resuming the paused monitor would exceed the active limit.
    await Assert.rejects(
      MonitorAgent.pauseMonitor(ids[0], false),
      limitError,
      "Resuming past the active limit should be rejected"
    );
    const paused = (await MonitorAgent.listMonitors()).find(
      m => m.id === ids[0]
    );
    Assert.ok(!paused.enabled, "Rejected resume leaves the monitor paused");

    // Pausing another monitor makes room to resume.
    await MonitorAgent.pauseMonitor(extraId, true);
    await MonitorAgent.pauseMonitor(ids[0], false);
    Assert.equal(await activeCount(), TOTAL_NUM_MONITORS);
  } finally {
    await resetMonitorAgentForTesting();
  }
});
