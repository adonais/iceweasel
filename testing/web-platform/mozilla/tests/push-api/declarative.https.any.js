// META: global=window-module
// META: script=/_mozilla/resources/GleanTest.js
// META: script=/resources/testdriver.js
// META: script=/resources/testdriver-vendor.js
// META: script=/notifications/resources/helpers.js
// META: script=/_mozilla/notifications/resources/MockAlertsService.js

import { encrypt } from "/push-api/resources/helpers.js"

// Tests for Declarative Web Push
// https://w3c.github.io/push-api/#declarative-push-message

const OPEN_URI = new URL("/_mozilla/notifications/resources/broadcast-when-opened.html", location).href;

let registration;
let subscription;

promise_setup(async () => {
  await trySettingPermission("granted");
  registration = await prepareActiveServiceWorker("push-sw.js");
  subscription = await registration.pushManager.subscribe();
});

async function sendPush(t, message, actionToClick) {
  await MockAlertsService.register(t);
  await MockAlertsService.enableAutoClick(actionToClick);

  const {promise, resolve} = Promise.withResolvers();
  const signal = t.get_signal();

  new BroadcastChannel("broadcast-when-opened").addEventListener("message", async e => {
    const notifications = await MockAlertsService.getNotificationData();
    assert_equals(notifications.length, 1,
                  "Should have exactly one notification.");
    const notificationData = notifications[0];
    assert_equals(e.data, "opened");
    const swrNotifications = await registration.getNotifications();
    assert_equals(swrNotifications.length, 1,
                  "ServiceWorkerRegistration.getNotifications() should return exactly 1 notification.");
    const swrNotification = swrNotifications[0];
    // (Not checking tag here since it's not exposed to nsIAlertNotification.
    //  There's a separate test that tag does the expected thing below.)
    for (let property of ["title", "dir", "lang", "silent", "requireInteraction", "body"]) {
      let got = swrNotification[property];
      let expected = notificationData[property];
      assert_equals(got, expected,
                    `${property} given in ServiceWorkerRegistration.getNotifications() should be consistent with alert data.`);
    }
    assert_object_equals(swrNotification.actions,
                         Array.from(notificationData.actions).map(action => ({
                           action: action.action,
                           title: action.title,
                           navigate: action.navigate,
                         })),
                         "Actions in ServiceWorkerRegistration.getNotifications() should be consistent with alert data.");
    resolve({dwp: swrNotification});
  }, {signal});
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data.data) {
      resolve({swPush: true});
    }
  }, {signal});


  const result = await encrypt(
    message instanceof Uint8Array ? message : new TextEncoder().encode(message),
    subscription.getKey("p256dh"),
    subscription.getKey("auth")
  );

  await fetch(subscription.endpoint, {
    method: "post",
    ...result
  });
  return promise;
}

async function testNonDWP(t, message) {
  const result = await sendPush(t, message);
  assert_true(result.swPush, "Should receive a service worker push event.");
}

// Array of [option name, expected default value, value for testing]
const kNotificationOptions = [
  ["silent", false, true],
  ["requireInteraction", false, true],
  ["lang", "", "pt"],
  ["dir", "auto", "rtl"],
  ["body", "", "Body text"],
  ["tag", "", "test-tag"],
  ["data", null, {foo: ["test", 1, false, null]}],
];

async function testDWP(t, pushData, actionToClick) {
  const result = await sendPush(t, JSON.stringify(pushData), actionToClick);
  assert_true(!!result.dwp, "Should be interpreted as a DWP.");
  assert_equals(result.dwp.title, pushData.notification.title,
                "Notification title should be set correctly.");
  assert_equals(result.dwp.navigate, new URL(pushData.notification.navigate, location).href,
                "Notification navigate should be set correctly.");
  for (let [option, defaultValue] of kNotificationOptions) {
    let expected = pushData.notification[option];
    // If option is not set or has the wrong type, the default value should be used.
    if (expected === undefined || typeof expected !== typeof defaultValue) {
      expected = defaultValue;
    }
    (typeof expected === "object" && expected !== null
        ? assert_object_equals : assert_equals)(
      result.dwp[option], expected, `Notification ${option} should be set correctly.`);
  }
  let expectedActions = pushData.notification.actions;
  if (Array.isArray(expectedActions)) {
    expectedActions = expectedActions.filter(action => {
      // Action should be ignored if any of the action/title/navigate properties
      // doesn't exist or isn't a string.
      return typeof action.action === "string" &&
        typeof action.title === "string" &&
        typeof action.navigate === "string";
    });
  } else {
    expectedActions = [];
  }
  assert_object_equals(result.dwp.actions,
                       expectedActions,
                       "Notification actions should be set correctly.");
}

const SIMPLE_DWP = { "web_push": 8030, notification: { title: "test title", navigate: OPEN_URI } };
const DWP_WITH_ACTIONS = { "web_push": 8030, notification: {
  title: "test title",
  navigate: "about:blank",
  actions: [
    { action: "action1", title: "Title 1", navigate: OPEN_URI },
    { action: "action2", title: "Title 2", navigate: "about:blank" },
  ]
} };

promise_test(t => testDWP(t, SIMPLE_DWP), "Declarative web push works");

promise_test(async t => {
  const pushData = structuredClone(SIMPLE_DWP);
  pushData.notification.navigate = new URL(OPEN_URI).pathname;
  await testDWP(t, pushData);
}, "DWP allows relative URLs for notification.navigate");

promise_test(async t => {
  const pushString = JSON.stringify(SIMPLE_DWP);
  const pushBytes = new TextEncoder().encode(pushString);
  pushBytes[pushString.indexOf("test title")] = 0xff;
  const result = await sendPush(t, pushBytes);
  assert_true(!!result.dwp, "Should be interpreted as DWP.");
  assert_equals(result.dwp.title, "\uFFFDest title",
                "Invalid UTF-8 should be replaced with U+FFFD replacement character in title.");
}, "DWP accepts invalid UTF-8 and uses replacement character");

promise_test(async t => {
  const pushData = structuredClone(SIMPLE_DWP);
  for (let [option, _, testValue] of kNotificationOptions) {
    pushData.notification[option] = testValue;
  }
  await testDWP(t, pushData);
}, "DWP accepts various Notification options.");

promise_test(async t => {
  const pushData = structuredClone(SIMPLE_DWP);
  for (let [option, defaultValue] of kNotificationOptions) {
    if (option === "data") {
      // any JSON is valid for data.
      continue;
    }
    pushData.notification[option] = typeof defaultValue === "string" ? 3 : "hello";
  }
  pushData.notification.actions = 3;
  await testDWP(t, pushData);
}, "DWP ignores Notification options if they're the wrong type.");

promise_test(async t => {
  await testDWP(t, DWP_WITH_ACTIONS, "action1");
}, "DWP accepts notification actions");

for (const property of ["action", "title", "navigate"]) {
  promise_test(async t => {
    const pushData = structuredClone(DWP_WITH_ACTIONS);
    delete pushData.notification.actions[1][property];
    await testDWP(t, pushData, "action1");
  }, `Notification action with no ${property} is ignored.`);
  promise_test(async t => {
    const pushData = structuredClone(DWP_WITH_ACTIONS);
    pushData.notification.actions[1][property] = 3;
    await testDWP(t, pushData, "action1");
  }, `Notification action with wrong type for ${property} is ignored.`);
}

promise_test(async t => {
  registration.showNotification("hello", {tag: "test-tag"});
  const pushData = structuredClone(SIMPLE_DWP);
  pushData.notification.tag = "test-tag";
  // This will assert that there's only 1 notification.
  await testDWP(t, pushData);
}, "DWP with same tag replaces old notification.");

promise_test(async t => {
  await testNonDWP(t, JSON.stringify(SIMPLE_DWP).slice(1));
}, "Invalid JSON is not treated as DWP");

promise_test(async t => {
  await testNonDWP(t, JSON.stringify([SIMPLE_DWP]));
}, "JSON with top-level array is not treated as DWP");

promise_test(async t => {
  await testNonDWP(t, JSON.stringify({x: SIMPLE_DWP}));
}, "JSON with DWP data embedded in another object is not treated as DWP");

promise_test(async t => {
  const pushData = structuredClone(SIMPLE_DWP);
  pushData.web_push = 8031;
  await testNonDWP(t, JSON.stringify(pushData));
}, "JSON with web_push ≠ 8030 is not treated as DWP");

promise_test(async t => {
  const pushData = structuredClone(SIMPLE_DWP);
  delete pushData.notification.title;
  await testNonDWP(t, JSON.stringify(pushData));
}, "JSON with no notification.title is not treated as DWP");

promise_test(async t => {
  const pushData = structuredClone(SIMPLE_DWP);
  delete pushData.notification.navigate;
  await testNonDWP(t, JSON.stringify(pushData));
}, "JSON with no notification.navigate is not treated as DWP");


promise_test(async t => {
  const pushData = structuredClone(SIMPLE_DWP);
  pushData.notification.navigate = "http://999.999";
  await testNonDWP(t, JSON.stringify(pushData));
}, "JSON with invalid notification.navigate is not treated as DWP");

promise_test(async t => {
  const pushData = structuredClone(DWP_WITH_ACTIONS);
  pushData.notification.actions[0].navigate = "http://999.999";
  await testNonDWP(t, JSON.stringify(pushData));
}, "JSON with invalid navigate URL for notification action is not treated as DWP.");
