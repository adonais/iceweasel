// META: global=window-module
// META: script=/resources/testdriver.js
// META: script=/resources/testdriver-vendor.js
// META: script=/notifications/resources/helpers.js

// Test reporting of push-message-handled for DWP.

import { pushMessage } from "/push-api/resources/helpers.js"

let subscription;

promise_setup(async () => {
  await trySettingPermission("granted");
  const registration = await prepareActiveServiceWorker("push-sw.js");
  subscription = await registration.pushManager.subscribe();
  add_completion_callback(() => subscription.unsubscribe());
});

const DWP = { web_push: 8030, notification: { title: "test", navigate: "about:blank" } };

function pushMessageHandledObserver() {
  const { sendAsyncMessage } = this;
  const PUSH_MESSAGE_HANDLED_TOPIC = "push-message-handled";
  const WEB_NOTIFICATION_SHOWN_TOPIC = "web-notification-shown";
  const topics = [];
  function observer(subject, topic) {
    topics.push(topic);
    Services.obs.removeObserver(observer, topic);
    if (topics.length === 2) {
      sendAsyncMessage("push-message-handled-observer:results", topics);
    }
  };
  Services.obs.addObserver(observer, PUSH_MESSAGE_HANDLED_TOPIC);
  Services.obs.addObserver(observer, WEB_NOTIFICATION_SHOWN_TOPIC);
  sendAsyncMessage("push-message-handled-observer:registered");
}

promise_test(async t => {
  const chromeScript = SpecialPowers.loadChromeScript(pushMessageHandledObserver);
  t.add_cleanup(() => chromeScript.destroy());
  await chromeScript.promiseOneMessage("push-message-handled-observer:registered");
  await pushMessage(subscription, { message: JSON.stringify(DWP) });
  const results = await chromeScript.promiseOneMessage("push-message-handled-observer:results");
  assert_array_equals(results, ["web-notification-shown", "push-message-handled"]);
}, "Should wait until notification is shown before notifying of push-message-handled.");
