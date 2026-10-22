// META: global=window-module
// META: script=/_mozilla/resources/GleanTest.js
// META: script=/resources/testdriver.js
// META: script=/resources/testdriver-vendor.js
// META: script=/notifications/resources/helpers.js
// META: script=/_mozilla/notifications/resources/MockAlertsService.js

import { pushMessageAndWait } from "./resources/helpers.js"

let subscription;

promise_setup(async () => {
  await trySettingPermission("granted");
  subscription = await pushManager.subscribe();
  add_completion_callback(() => subscription.unsubscribe());
});

const DWP = {
  web_push: 8030,
  notification: {
    title: "test title",
    navigate: "/_mozilla/notifications/resources/broadcast-when-opened.html",
  }
};

async function sendDWP(t) {
  const result = await pushMessageAndWait(t, subscription, {
    message: JSON.stringify(DWP)
  });
  assert_true(result.dwp, "Should allow sending DWP via window.pushManager.");
  const notifications = await MockAlertsService.getNotificationData();
  assert_equals(notifications.length, 1,
                "Should show a notification.");
  assert_equals(notifications[0].title, DWP.notification.title,
                "Notification should have the correct title.");
}

promise_test(async t => {
  const registration = await prepareActiveServiceWorkerForTest(t, "push-sw.js");
  await sendDWP(t);
  assert_equals((await registration.getNotifications()).length, 0,
                "ServiceWorkerRegistration.getNotifications() should be empty since its scope isn't /");
}, "Send DWP using window.pushManager with service worker not in window scope.");

promise_test(async t => {
  const registration = await prepareActiveServiceWorkerForTest(t, "push-sw.js", {scope: "/"});
  await sendDWP(t);
  const notifications = await registration.getNotifications();
  assert_equals(notifications.length, 1,
                "ServiceWorkerRegistration.getNotifications() should return the notification since its scope is /");
  assert_equals(notifications[0].title, DWP.notification.title,
                "Notification returned in getNotifications() should have the correct title.");
}, "Send DWP using window.pushManager with service worker in window scope.");
