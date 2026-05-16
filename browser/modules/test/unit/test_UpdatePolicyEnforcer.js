/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

"use strict";

const UpdatePolicyEnforcer = ChromeUtils.importESModule(
  "resource:///modules/UpdatePolicyEnforcer.sys.mjs"
);

const PREF_APP_UPDATE_COMPULSORY_RESTART = "app.update.compulsory_restart";

add_task(function test_calculateDelay_shouldUpdateTonight() {
  const now = Temporal.ZonedDateTime.from({
    timeZone: Temporal.Now.timeZoneId(),
    year: 1970,
    month: 1,
    day: 1,
    hour: 13,
    minute: 15,
    second: 0,
  });
  const notificationPeriodHours = 4;
  const restartTimeOfDay = { Hour: 18, Minute: 15 };
  const taskSchedule = UpdatePolicyEnforcer.calculateDelay(
    now,
    notificationPeriodHours,
    restartTimeOfDay
  );
  Assert.ok(taskSchedule, "Expcted non-null taskSchedule");
  Assert.equal(
    0,
    Temporal.Duration.compare(
      Temporal.Duration.from({ hours: 4 }),
      taskSchedule.notificationDelay
    ),
    "Expected notification delay to be 4 hours"
  );
  Assert.equal(
    0,
    Temporal.Duration.compare(
      Temporal.Duration.from({ hours: 5 }),
      taskSchedule.restartDelay
    ),
    "Expect restart delay to be 5 hours"
  );
});

add_task(function test_calculateDelay_shouldUpdateTomorrow() {
  const now = Temporal.ZonedDateTime.from({
    timeZone: Temporal.Now.timeZoneId(),
    year: 1970,
    month: 1,
    day: 1,
    hour: 13,
    minute: 16,
    second: 0,
  });
  const notificationPeriodHours = 4;
  const restartTimeOfDay = { Hour: 18, Minute: 15 };
  const taskSchedule = UpdatePolicyEnforcer.calculateDelay(
    now,
    notificationPeriodHours,
    restartTimeOfDay
  );
  Assert.ok(taskSchedule, "Expcted non-null taskSchedule");
  Assert.equal(
    0,
    Temporal.Duration.compare(
      Temporal.Duration.from({ hours: 4 }),
      taskSchedule.notificationDelay
    ),
    "Expected notification delay to be 4 hours"
  );
  Assert.equal(
    0,
    Temporal.Duration.compare(
      Temporal.Duration.from({ hours: 28, minutes: 59 }),
      taskSchedule.restartDelay
    ),
    "Expect restart delay to be 28 hours, 59 minutes"
  );
});

add_task(function test_createDeferredRestartTasks() {
  const notificationDelay = Temporal.Duration.from({ hours: 48 });
  const restartDelay = Temporal.Duration.from({ hours: 49 });
  const { deferredNotificationTask, deferredRestartTask } =
    UpdatePolicyEnforcer.createDeferredRestartTasks(
      restartDelay,
      notificationDelay
    );
  Assert.ok(deferredNotificationTask);
  Assert.ok(deferredRestartTask);
  Assert.ok(deferredNotificationTask.isArmed);
  Assert.ok(deferredRestartTask.isArmed);
  deferredNotificationTask.disarm();
  deferredRestartTask.disarm();
});

add_task(function test_getCompulsoryRestartPolicy_has_setting() {
  Services.prefs.setStringPref(
    PREF_APP_UPDATE_COMPULSORY_RESTART,
    JSON.stringify({
      NotificationPeriodHours: 6,
      RestartTimeOfDay: {
        Hour: 19,
        Minute: 0,
      },
    })
  );
  const policy = UpdatePolicyEnforcer.getCompulsoryRestartPolicy();
  Assert.equal(6, policy.NotificationPeriodHours);
  Assert.equal(19, policy.RestartTimeOfDay.Hour);
  Assert.equal(0, policy.RestartTimeOfDay.Minute);
});

add_task(function test_getCompulsoryRestartPolicy_no_setting() {
  Services.prefs.clearUserPref(PREF_APP_UPDATE_COMPULSORY_RESTART);
  const policy = UpdatePolicyEnforcer.getCompulsoryRestartPolicy();
  Assert.equal(null, policy);
});

add_task(function test_handleCompulsoryUpdatePolicy_has_setting() {
  Assert.equal(null, UpdatePolicyEnforcer.testingOnly_getTaskStatus());
  Services.prefs.setStringPref(
    PREF_APP_UPDATE_COMPULSORY_RESTART,
    JSON.stringify({
      NotificationPeriodHours: 27,
      RestartTimeOfDay: {
        Hour: 10,
        Minute: 0,
      },
    })
  );
  UpdatePolicyEnforcer.handleCompulsoryUpdatePolicy();
  Assert.equal(
    true,
    UpdatePolicyEnforcer.testingOnly_getTaskStatus().notificationTask
  );
  Assert.equal(
    true,
    UpdatePolicyEnforcer.testingOnly_getTaskStatus().restartTask
  );
  UpdatePolicyEnforcer.testingOnly_resetTasks();
});

add_task(function test_handleCompulsoryUpdatePolicy_no_setting() {
  Assert.equal(null, UpdatePolicyEnforcer.testingOnly_getTaskStatus());
  Services.prefs.clearUserPref(PREF_APP_UPDATE_COMPULSORY_RESTART);
  UpdatePolicyEnforcer.handleCompulsoryUpdatePolicy();
  Assert.equal(null, UpdatePolicyEnforcer.testingOnly_getTaskStatus());
  // Just in case
  UpdatePolicyEnforcer.testingOnly_resetTasks();
});

add_task(function test_handleCompulsoryUpdatePolicy_invalid_setting() {
  Assert.equal(null, UpdatePolicyEnforcer.testingOnly_getTaskStatus());
  Services.prefs.setStringPref(
    PREF_APP_UPDATE_COMPULSORY_RESTART,
    JSON.stringify({ hello: "there" })
  );
  UpdatePolicyEnforcer.handleCompulsoryUpdatePolicy();
  // There should not be any tasks in this case
  Assert.equal(null, UpdatePolicyEnforcer.testingOnly_getTaskStatus());
  UpdatePolicyEnforcer.testingOnly_resetTasks();
});
