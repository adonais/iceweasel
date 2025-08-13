"use strict";

/**
 * @import {NotificationDB} from "../../NotificationDB.sys.mjs"
 * @type {NotificationDB}
 */
let db;

add_setup(async function run_test() {
  do_get_profile();

  db = ChromeUtils.importESModule(
    "moz-src:///dom/notification/NotificationDB.sys.mjs"
  ).db;
});

// For bug 1024090: test edge case of notificationstore.json
add_task(async function test_bug1024090() {
  const NOTIFICATION_STORE_PATH = PathUtils.join(
    PathUtils.profileDir,
    "notificationstore"
  );
  await IOUtils.remove(NOTIFICATION_STORE_PATH, {
    recursive: true,
  });
  ok(true, "Notification database cleaned.");
  info("Cleanup steps completed: " + NOTIFICATION_STORE_PATH);

  // Store one notification
  await db.queueTask("save", {
    origin: systemNotification.origin,
    notification: systemNotification,
  });

  let notifications = await db.queueTask("getall", {
    origin: systemNotification.origin,
  });

  equal(1, notifications.length, "One notification stored");
});
