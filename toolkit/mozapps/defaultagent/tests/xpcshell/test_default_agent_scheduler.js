/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { DefaultAgentScheduler } = ChromeUtils.importESModule(
  "resource://gre/modules/DefaultAgentScheduler.sys.mjs"
);
// Same singleton the module resolves via its lazy getter, so stubbing its
// methods here intercepts the module's calls.
const { TaskScheduler } = ChromeUtils.importESModule(
  "resource://gre/modules/TaskScheduler.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

// Kept in sync with the module's internal constant.
const REGISTERED_PARAMS_PREF = "default-browser-agent.msix.registered-params";

function stubScheduler({ exists = false } = {}) {
  return {
    registerTask: sinon.stub(TaskScheduler, "registerTask").resolves({}),
    deleteTask: sinon.stub(TaskScheduler, "deleteTask").resolves(),
    taskExists: sinon.stub(TaskScheduler, "taskExists").resolves(exists),
  };
}

function stubEnv({ applies = true, disabled = false } = {}) {
  sinon.stub(DefaultAgentScheduler, "appliesToThisInstall").get(() => applies);
  sinon.stub(DefaultAgentScheduler, "disabled").get(() => disabled);
}

function resetState() {
  sinon.restore();
  DefaultAgentScheduler._initialized = false;
  Services.prefs.clearUserPref(REGISTERED_PARAMS_PREF);
  Services.prefs.removeObserver(
    "default-browser-agent.enabled",
    DefaultAgentScheduler
  );
}

registerCleanupFunction(resetState);

add_task(async function test_not_applicable_is_noop() {
  const s = stubScheduler();
  stubEnv({ applies: false });

  const scheduled = await DefaultAgentScheduler.maybeScheduleDefaultAgentTask();

  Assert.equal(scheduled, false, "does nothing when not a packaged install");
  Assert.ok(s.registerTask.notCalled, "no task registered");
  Assert.ok(s.deleteTask.notCalled, "no task deleted");
  resetState();
});

add_task(async function test_enabled_registers() {
  const s = stubScheduler();
  stubEnv({ applies: true, disabled: false });

  const scheduled = await DefaultAgentScheduler.maybeScheduleDefaultAgentTask();

  Assert.equal(scheduled, true, "reports a task is scheduled");
  Assert.ok(s.registerTask.calledOnce, "registered exactly one task");
  const [id, , intervalSeconds] = s.registerTask.firstCall.args;
  Assert.equal(
    id,
    DefaultAgentScheduler.TASK_ID,
    "registered with the task id"
  );
  Assert.equal(
    intervalSeconds,
    DefaultAgentScheduler.INTERVAL_SECONDS,
    "registered with the daily interval"
  );
  Assert.ok(s.deleteTask.notCalled, "did not delete");
  Assert.ok(
    Services.prefs.prefHasUserValue(REGISTERED_PARAMS_PREF),
    "recorded the registered task parameters"
  );
  resetState();
});

add_task(async function test_disabled_deletes_existing() {
  const s = stubScheduler({ exists: true });
  stubEnv({ applies: true, disabled: true });
  Services.prefs.setStringPref(REGISTERED_PARAMS_PREF, "stale");

  const scheduled = await DefaultAgentScheduler.maybeScheduleDefaultAgentTask();

  Assert.equal(scheduled, false, "reports no task scheduled");
  Assert.ok(
    s.deleteTask.calledOnceWith(DefaultAgentScheduler.TASK_ID),
    "deleted the existing task"
  );
  Assert.ok(s.registerTask.notCalled, "did not register");
  Assert.ok(
    !Services.prefs.prefHasUserValue(REGISTERED_PARAMS_PREF),
    "cleared the recorded task parameters"
  );
  resetState();
});

add_task(async function test_disabled_without_existing_task_is_noop() {
  const s = stubScheduler({ exists: false });
  stubEnv({ applies: true, disabled: true });

  const scheduled = await DefaultAgentScheduler.maybeScheduleDefaultAgentTask();

  Assert.equal(scheduled, false, "reports no task scheduled");
  Assert.ok(s.deleteTask.notCalled, "nothing to delete");
  Assert.ok(s.registerTask.notCalled, "did not register");
  resetState();
});

add_task(async function test_existing_with_unchanged_params_skips_register() {
  // First run has no task, so it registers and records the parameters.
  let s = stubScheduler({ exists: false });
  stubEnv({ applies: true, disabled: false });
  await DefaultAgentScheduler.maybeScheduleDefaultAgentTask();
  Assert.ok(s.registerTask.calledOnce, "first run registered the task");
  sinon.restore();

  // Second run: the task now exists and the parameters are unchanged, so we
  // must leave the existing registration (and its trigger schedule) alone.
  s = stubScheduler({ exists: true });
  stubEnv({ applies: true, disabled: false });
  const scheduled = await DefaultAgentScheduler.maybeScheduleDefaultAgentTask();

  Assert.equal(scheduled, true, "reports a task is scheduled");
  Assert.ok(
    s.registerTask.notCalled,
    "did not re-register when parameters were unchanged"
  );
  Assert.ok(s.deleteTask.notCalled, "did not delete");
  resetState();
});

add_task(async function test_existing_with_changed_params_reregisters() {
  const s = stubScheduler({ exists: true });
  stubEnv({ applies: true, disabled: false });
  // Simulate a task registered by a prior build with different parameters.
  Services.prefs.setStringPref(REGISTERED_PARAMS_PREF, "stale-params");

  const scheduled = await DefaultAgentScheduler.maybeScheduleDefaultAgentTask();

  Assert.equal(scheduled, true, "reports a task is scheduled");
  Assert.ok(
    s.registerTask.calledOnce,
    "re-registered because the parameters changed"
  );
  resetState();
});
