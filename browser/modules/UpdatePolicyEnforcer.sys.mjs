/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
const PREF_APP_UPDATE_COMPULSORY_RESTART = "app.update.compulsory_restart";
let deferredRestartTasks = null;

ChromeUtils.defineESModuleGetters(lazy, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
  InfoBar: "resource:///modules/asrouter/InfoBar.sys.mjs",
});

// Forcibly close Firefox, without waiting for beforeunload handlers.
function forceRestart() {
  Services.startup.quit(
    Services.startup.eForceQuit | Services.startup.eRestart
  );
}

function infobarDispatchCallback(action, _selectedBrowser) {
  if (action?.type === "USER_ACTION" && action.data?.type === "RESTART_APP") {
    forceRestart();
  }
}

// Display the notification message
function showNotificationToolbar(restartZonedDateTime) {
  const datetime = restartZonedDateTime.epochMilliseconds;

  const message = {
    weight: 100,
    id: "COMPULSORY_RESTART_SCHEDULED",
    content: {
      priority: 3,
      type: "universal",
      dismissable: false,
      text: {
        string_id: "compulsory-restart-message",
      },
      buttons: [
        {
          label: {
            string_id: "policy-update-now",
          },
          action: {
            type: "RESTART_APP",
            dismiss: false,
          },
        },
      ],
      attributes: {
        datetime,
      },
    },
    template: "infobar",
    targeting: "true",
    groups: [],
  };

  const win = Services.wm.getMostRecentBrowserWindow();
  if (!win) {
    return;
  }
  lazy.InfoBar.showInfoBarMessage(win, message, infobarDispatchCallback);
}

/**
 * Disarm deferred tasks and clear the state for the next test.
 */
export function testingOnly_resetTasks() {
  if (!Cu.isInAutomation) {
    throw new Error("this method only usable in testing");
  }
  deferredRestartTasks?.deferredNotificationTask?.disarm();
  deferredRestartTasks?.deferredRestartTask?.disarm();
  deferredRestartTasks = null;
}

/**
 * Check on whether the deferred tasks have been created and armed.
 */
export function testingOnly_getTaskStatus() {
  if (!Cu.isInAutomation) {
    throw new Error("this method only usable in testing");
  }
  if (deferredRestartTasks) {
    const res = {
      notificationTask: deferredRestartTasks.deferredNotificationTask?.isArmed,
      restartTask: deferredRestartTasks.deferredRestartTask?.isArmed,
    };
    return res;
  }
  return null;
}

// Example settings:
// {NotificationPeriodHours: 72, RestartTimeOfDay: {Hour: 18, Minute: 45}}

/**
 * Params:
 * now: A Temporal.ZonedDateTime object representing the current time.
 * notificationPeriodHours: The minimum amount of time in hours between when an update has been staged and when a warning will be displayed
 * restartTimeOfDay: The time of day, in local time, that the restart will take place
 *
 * Returns:
 * {
 *  notificationDelayMillis: the number of milliseconds before a warning is displayed
 *  restartDelayMillis: the number of milliseconds before the current Firefox instance will forcibly quit
 *  restartTimeOfDay: the wall-clock time of day when restart will happen.
 * }
 */
export function calculateDelay(now, notificationPeriodHours, restartTimeOfDay) {
  const delayBeforeNotification = Temporal.Duration.from({
    hours: notificationPeriodHours,
  });

  // Figure out how long until compulsory restart time. The earliest is 1 hour past the notification time, the latest is 25 hours past the notification time.
  // restart time = if (there is an upcoming `restartTimeOfDay` on the notification day, an it's more than an hour in the future) then (notification day at restart time) else (notification day + 1 at restart time)
  const notificationDateTime = now.add(delayBeforeNotification);
  const restartTime = Temporal.PlainTime.from({
    hour: restartTimeOfDay.Hour,
    minute: restartTimeOfDay.Minute,
  });
  let scheduledRestartZonedDateTime =
    Temporal.ZonedDateTime.from(notificationDateTime).withPlainTime(
      restartTime
    );
  // if (restartTimeOnNotificationDay - notificationDateTime < 1 hour) then restartTimeOnNotificationDay += 1 day
  if (
    Temporal.Duration.compare(
      notificationDateTime.until(scheduledRestartZonedDateTime),
      Temporal.Duration.from({ hours: 1 })
    ) < 0
  ) {
    // it's less than 1 hour until the restart time.
    scheduledRestartZonedDateTime = scheduledRestartZonedDateTime.add(
      Temporal.Duration.from({ days: 1 })
    );
  }
  const restartDelay = now.until(scheduledRestartZonedDateTime);
  const notificationDelay = now.until(notificationDateTime);
  return { restartDelay, notificationDelay, scheduledRestartZonedDateTime };
}

// Create deferred tasks with requested delays
export function createDeferredRestartTasks(
  restartDelay,
  notificationDelay,
  scheduledRestartZonedDateTime
) {
  const deferredNotificationTask = new lazy.DeferredTask(() => {
    showNotificationToolbar(scheduledRestartZonedDateTime);
  }, notificationDelay.total("milliseconds"));
  const deferredRestartTask = new lazy.DeferredTask(
    forceRestart,
    restartDelay.total("milliseconds")
  );
  deferredNotificationTask.arm();
  deferredRestartTask.arm();
  return { deferredNotificationTask, deferredRestartTask };
}

// Read the policy from prefs and parse the JSON.
export function getCompulsoryRestartPolicy() {
  const compulsoryRestartSettingStr = Services.prefs.getStringPref(
    PREF_APP_UPDATE_COMPULSORY_RESTART,
    null
  );
  if (compulsoryRestartSettingStr) {
    const compulsoryRestartSetting = JSON.parse(compulsoryRestartSettingStr);
    if (
      typeof compulsoryRestartSetting?.NotificationPeriodHours === "number" &&
      typeof compulsoryRestartSetting?.RestartTimeOfDay === "object" &&
      typeof compulsoryRestartSetting.RestartTimeOfDay.Hour === "number" &&
      typeof compulsoryRestartSetting.RestartTimeOfDay.Minute === "number"
    ) {
      return compulsoryRestartSetting;
    }
  }
  return null;
}

// This is the main entry point into this module.
// This function is called when an update is staged, to set timers for
// when to show the notification and when to force a restart.
export function handleCompulsoryUpdatePolicy() {
  if (!deferredRestartTasks) {
    const compulsoryRestartSetting = getCompulsoryRestartPolicy();
    if (compulsoryRestartSetting) {
      const now = Temporal.Now.zonedDateTimeISO();
      const { restartDelay, notificationDelay, scheduledRestartZonedDateTime } =
        calculateDelay(
          now,
          compulsoryRestartSetting.NotificationPeriodHours,
          compulsoryRestartSetting.RestartTimeOfDay
        );
      deferredRestartTasks = createDeferredRestartTasks(
        restartDelay,
        notificationDelay,
        scheduledRestartZonedDateTime
      );
    }
  }
}

const observer = {
  observe: (_subject, topic, _data) => {
    switch (topic) {
      case "update-downloaded":
      case "update-staged":
        handleCompulsoryUpdatePolicy();
    }
  },
};

export const UpdatePolicyEnforcer = {
  registerObservers() {
    Services.obs.addObserver(observer, "update-downloaded");
    Services.obs.addObserver(observer, "update-staged");
  },
};
