/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { InfoBar } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/InfoBar.sys.mjs"
);

const { systemDelay } = ChromeUtils.importESModule(
  "resource://testing-common/SystemDelay.sys.mjs"
);

const {
  testingOnly_getTaskStatus,
  testingOnly_resetTasks,
  getCompulsoryRestartPolicy,
  UpdatePolicyEnforcer,
} = ChromeUtils.importESModule(
  "resource:///modules/UpdatePolicyEnforcer.sys.mjs"
);

const prefName = "app.update.compulsory_restart";

const prefValue = {
  NotificationPeriodHours: 0,
  RestartTimeOfDay: {
    Hour: 0,
    Minute: 30,
  },
};

function pushPrefs(...aPrefs) {
  return SpecialPowers.pushPrefEnv({ set: aPrefs });
}

function popPrefs() {
  return SpecialPowers.popPrefEnv();
}

add_task(async function test_compulsoryRestartNotification() {
  await pushPrefs([prefName, JSON.stringify(prefValue)]);
  let win = Services.wm.getMostRecentBrowserWindow("navigator:browser");
  Assert.ok(win, "Expected to get a window");
  try {
    Assert.equal(
      0,
      win.gNotificationBox.allNotifications.length,
      "expected no notifications yet"
    );
    const notificationPromise = BrowserTestUtils.waitForGlobalNotificationBar(
      win,
      "COMPULSORY_RESTART_SCHEDULED"
    );
    Services.obs.notifyObservers(null, "update-downloaded");
    await notificationPromise;

    // First, check to see that the notification bar is displayed as expected
    Assert.equal(
      1,
      win.gNotificationBox.allNotifications.length,
      "Expected to see a notification"
    );
    Assert.equal(
      "COMPULSORY_RESTART_SCHEDULED",
      win.gNotificationBox.allNotifications[0].getAttribute("value"),
      "Expected the correct notification"
    );

    // Then simulate sleeping and waking, and verify that the
    // notification bar is still visible
    Services.obs.notifyObservers(null, "sleep_notification");
    await systemDelay(1);
    Services.obs.notifyObservers(null, "wake_notification");
    await systemDelay(1);
    Assert.equal(
      1,
      win.gNotificationBox.allNotifications.length,
      "expected the notification to stick around after sleep/wake"
    );
    Assert.equal(
      "COMPULSORY_RESTART_SCHEDULED",
      win.gNotificationBox.allNotifications[0].getAttribute("value"),
      "expected notification value after sleep/wake to be correct"
    );
  } finally {
    testingOnly_resetTasks();
    win.gNotificationBox.removeAllNotifications();
    await popPrefs();
  }
});
