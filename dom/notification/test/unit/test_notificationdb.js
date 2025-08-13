"use strict";

/**
 * @import {NotificationDB} from "../../NotificationDB.sys.mjs"
 * @type {NotificationDB}
 */
let db;

/** @type {NotificationDB} */
let memoryDb;

add_setup(async function run_test() {
  do_get_profile();

  db = ChromeUtils.importESModule(
    "moz-src:///dom/notification/NotificationDB.sys.mjs"
  ).db;

  let { MemoryNotificationDB } = ChromeUtils.importESModule(
    "moz-src:///dom/notification/MemoryNotificationDB.sys.mjs"
  );
  memoryDb = new MemoryNotificationDB();
});

// Get one notification, none exists
add_task(async function test_get_none() {
  let notifications = await db.queueTask("getall", {
    origin: systemNotification.origin,
  });

  Assert.equal(0, notifications.length);
});

add_task(async function test_send_and_get_one() {
  // Store one notification
  await db.queueTask("save", {
    origin: systemNotification.origin,
    notification: systemNotification,
  });

  // Get one notification, one exists
  let notifications = await db.queueTask("getall", {
    origin: systemNotification.origin,
  });

  Assert.equal(1, notifications.length);
  // compare the content
  compareNotification(systemNotification, notifications[0]);
});

add_task(async function test_delete_one_get_none_again() {
  // Delete one notification
  await db.queueTask("delete", {
    origin: systemNotification.origin,
    id: systemNotification.id,
  });

  // Get one notification, none exists
  let notifications = await db.queueTask("getall", {
    origin: systemNotification.origin,
  });
  Assert.equal(0, notifications.length);
});

// Delete one notification that do not exists anymore
add_task(async function test_delete_one_nonexistent() {
  await db.queueTask("delete", {
    origin: systemNotification.origin,
    id: systemNotification.id,
  });
});

// Store two notifications with the same id
add_task(async function test_send_two_get_one() {
  await db.queueTask("save", {
    origin: systemNotification.origin,
    notification: systemNotification,
  });

  await db.queueTask("save", {
    origin: systemNotification.origin,
    notification: systemNotification,
  });

  let notifications = await db.queueTask("getall", {
    origin: systemNotification.origin,
  });
  Assert.equal(1, notifications.length);
  // compare the content
  compareNotification(systemNotification, notifications[0]);
});

// Delete previous notification
add_task(async function test_delete_previous() {
  await db.queueTask("delete", {
    origin: systemNotification.origin,
    id: systemNotification.id,
  });
});

// Store two notifications from same origin with the same tag
add_task(async function test_send_two_get_one() {
  let tag = "voicemail";

  let systemNotification1 = getNotificationObject(
    "system",
    "{f271f9ee-3955-4c10-b1f2-af552fb270ee}",
    tag
  );
  let systemNotification2 = getNotificationObject(
    "system",
    "{8ef9a628-f0f4-44b4-820d-c117573c33e3}",
    tag
  );

  await db.queueTask("save", {
    origin: systemNotification1.origin,
    notification: systemNotification1,
  });

  await db.queueTask("save", {
    origin: systemNotification2.origin,
    notification: systemNotification2,
  });

  let notifications = await db.queueTask("getall", {
    origin: systemNotification1.origin,
  });
  Assert.equal(1, notifications.length);
  // compare the content
  compareNotification(systemNotification2, notifications[0]);
});

// Delete previous notification
add_task(async function test_delete_previous() {
  await db.queueTask("delete", {
    origin: systemNotification.origin,
    id: "{8ef9a628-f0f4-44b4-820d-c117573c33e3}",
  });
});

// Store two notifications from two origins with the same tag
add_task(async function test_send_two_get_two() {
  let tag = "voicemail";

  let systemNotification1 = systemNotification;
  systemNotification1.tag = tag;

  let calendarNotification2 = calendarNotification;
  calendarNotification2.tag = tag;

  await db.queueTask("save", {
    origin: systemNotification1.origin,
    notification: systemNotification1,
  });

  await db.queueTask("save", {
    origin: calendarNotification2.origin,
    notification: calendarNotification2,
  });

  // Trigger getall for each origin
  let notifications = await db.queueTask("getall", {
    origin: systemNotification1.origin,
  });

  // one notification per origin
  Assert.equal(1, notifications.length);
  // first call should be system notification
  compareNotification(systemNotification1, notifications[0]);

  notifications = await db.queueTask("getall", {
    origin: calendarNotification2.origin,
  });

  // one notification per origin
  Assert.equal(1, notifications.length);
  // second and last call should be calendar notification
  compareNotification(calendarNotification2, notifications[0]);
});

// Cleanup previous notification
add_task(async function test_delete_previous() {
  await db.queueTask("delete", {
    origin: systemNotification.origin,
    id: "{2bc883bf-2809-4432-b0f4-f54e10372764}",
  });
});

add_task(async function test_notification_onDiskPersistence() {
  let verifyDisk = async function (expectedId) {
    const NOTIFICATION_STORE_PATH = PathUtils.join(
      PathUtils.profileDir,
      "notificationstore.json"
    );

    const onDiskNotificationStr = await IOUtils.readUTF8(
      NOTIFICATION_STORE_PATH
    );
    return onDiskNotificationStr.includes(expectedId);
  };

  let persistedNotification = getNotificationObject(
    systemNotification.origin,
    "{315aaf98-6c72-48fe-8e2c-a841e1b00027}",
    "" /* tag */,
    true /* scope */
  );

  await db.queueTask("save", {
    origin: persistedNotification.origin,
    notification: persistedNotification,
  });
  Assert.ok(await verifyDisk(persistedNotification.id));

  let nonPersistedNotification = getNotificationObject(
    systemNotification.origin,
    "{8110ed62-303f-4f9b-a257-a62487aaa09c}",
    "" /* tag */,
    true /* scope */
  );

  await memoryDb.queueTask("save", {
    origin: nonPersistedNotification.origin,
    notification: nonPersistedNotification,
  });

  // memoryonly notification must not exist on disk.
  Assert.ok(!(await verifyDisk(nonPersistedNotification.id)));

  let verifyMemory = function (notifications, expectedId) {
    return notifications.some(notification => {
      return notification.id == expectedId;
    });
  };

  let notifications = await db.queueTask("getall", {
    origin: persistedNotification.origin,
    scope: persistedNotification.origin,
  });
  Assert.ok(verifyMemory(notifications, persistedNotification.id));

  notifications = await memoryDb.queueTask("getall", {
    origin: persistedNotification.origin,
    scope: persistedNotification.origin,
  });
  // memoryonly notification must exist in-memory
  Assert.ok(verifyMemory(notifications, nonPersistedNotification.id));
});
