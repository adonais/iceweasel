/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/* import-globals-from ../../../serviceworkers/test/browser_head.js */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/dom/serviceworkers/test/browser_head.js",
  this
);

const TEST_ORIGIN = "https://test1.example.org";
const CHANNEL_NAME = "push-message-handled";

const PUSH_NOTIFIER = Cc["@mozilla.org/push/Notifier;1"].getService(
  Ci.nsIPushNotifier
);

const PUSH_MESSAGE_HANDLED_TOPIC = Cc["@mozilla.org/push/Service;1"].getService(
  Ci.nsIPushService
).pushMessageHandledTopic;

add_task(async function test_push_message_handled_after_push_event_settles() {
  const swDesc = {
    origin: TEST_ORIGIN,
    scope: "push-handled",
    script: "push_message_handled_worker.js",
  };

  registerCleanupFunction(async () => {
    await clear_qm_origin_group_via_clearData(TEST_ORIGIN);
  });

  await install_sw(swDesc);

  const scope = `${TEST_ORIGIN}/${DIR_PATH}/${swDesc.scope}`;
  const principal = getPrincipal(scope);

  const helperTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `${TEST_ORIGIN}/${DIR_PATH}/empty_with_utils.html`
  );
  registerCleanupFunction(() => BrowserTestUtils.removeTab(helperTab));

  // Starts listening before the push is sent, so the worker's reply cannot be
  // missed
  await SpecialPowers.spawn(helperTab.linkedBrowser, [CHANNEL_NAME], name => {
    const utils = content.wrappedJSObject;
    utils.setupMessagingChannel(name);
    utils.pushReceived = utils.waitForBroadcastMessage(name, "push-received");
  });

  const handledMessages = [];
  const observer = (subject, topic, data) => handledMessages.push(data);
  Services.obs.addObserver(observer, PUSH_MESSAGE_HANDLED_TOPIC);
  registerCleanupFunction(() =>
    Services.obs.removeObserver(observer, PUSH_MESSAGE_HANDLED_TOPIC)
  );

  const notified = PUSH_NOTIFIER.notifyPush(scope, principal, "message-1");

  await SpecialPowers.spawn(
    helperTab.linkedBrowser,
    [],
    () => content.wrappedJSObject.pushReceived
  );

  // Give a wrongly early notification a chance to arrive
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 100));

  ok(
    !handledMessages.includes("message-1"),
    "The message should not be handled while its push event is pending"
  );

  await SpecialPowers.spawn(helperTab.linkedBrowser, [CHANNEL_NAME], name =>
    content.wrappedJSObject.broadcastAndWaitFor(name, "release", "released")
  );

  await TestUtils.waitForCondition(
    () => handledMessages.includes("message-1"),
    "Waiting for the message to be reported as handled"
  );

  ok(true, "The message should be handled once its push event settles");

  await notified;
  ok(true, "The notifyPush promise should resolve once the message is handled");
});

add_task(async function test_push_message_handled_without_service_worker() {
  const scope = `${TEST_ORIGIN}/${DIR_PATH}/no-such-scope`;
  const principal = getPrincipal(scope);

  const handled = TestUtils.topicObserved(
    PUSH_MESSAGE_HANDLED_TOPIC,
    (subject, data) => data == "message-2"
  );

  await Assert.rejects(
    PUSH_NOTIFIER.notifyPush(scope, principal, "message-2"),
    /NS_ERROR_FAILURE/,
    "The notifier should fail without a matching registration"
  );

  await handled;
  ok(true, "The message should be handled right away without a service worker");
});

add_task(async function test_push_message_handled_when_worker_shuts_down() {
  const swDesc = {
    origin: TEST_ORIGIN,
    scope: "push-handled-hang",
    script: "push_message_handled_worker.js?hang-activate",
  };

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `${TEST_ORIGIN}/${DIR_PATH}/empty.html`
  );
  registerCleanupFunction(() => BrowserTestUtils.removeTab(tab));

  // Registers the worker and waits until it hangs in its activate event
  await SpecialPowers.spawn(
    tab.linkedBrowser,
    [swDesc.script, swDesc.scope],
    async (script, swScope) => {
      const reg = await content.navigator.serviceWorker.register(script, {
        scope: swScope,
      });
      const worker = reg.installing || reg.waiting || reg.active;
      await new Promise(resolve => {
        const check = () => {
          if (worker.state == "activating") {
            worker.removeEventListener("statechange", check);
            resolve();
          }
        };
        worker.addEventListener("statechange", check);
        check();
      });
    }
  );

  const scope = `${TEST_ORIGIN}/${DIR_PATH}/${swDesc.scope}`;

  const handled = TestUtils.topicObserved(
    PUSH_MESSAGE_HANDLED_TOPIC,
    (subject, data) => data == "message-3"
  );

  // The message is queued until the worker finishes activating, which it
  // never does. Dropping it later rejects the promise, which we don't care
  // about here
  PUSH_NOTIFIER.notifyPush(scope, getPrincipal(scope), "message-3").catch(
    () => {}
  );

  // Shutting the worker down drops the queued message
  const reg = swm_lookup_reg(swDesc);
  await reg.activeWorker.terminateWorker();

  await handled;
  ok(true, "A dropped message should still be reported as handled");
});

add_task(async function test_push_message_handled_with_unresponsive_worker() {
  const IDLE_TIMEOUT_MS = 1000;
  const TIMER_SLACK_MS = 20;

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.serviceWorkers.idle_timeout", IDLE_TIMEOUT_MS],
      ["dom.serviceWorkers.idle_extended_timeout", IDLE_TIMEOUT_MS],
    ],
  });

  const swDesc = {
    origin: TEST_ORIGIN,
    scope: "push-handled-unresponsive",
    script: "push_message_handled_worker.js",
  };

  await install_sw(swDesc);

  const scope = `${TEST_ORIGIN}/${DIR_PATH}/${swDesc.scope}`;

  const handled = TestUtils.topicObserved(
    PUSH_MESSAGE_HANDLED_TOPIC,
    (subject, data) => data == "message-4"
  );

  const startedAt = ChromeUtils.now();

  // Nothing ever releases the push event of this worker, so only the worker's
  // own idle timers can end it
  PUSH_NOTIFIER.notifyPush(scope, getPrincipal(scope), "message-4").catch(
    () => {}
  );

  await handled;

  Assert.greaterOrEqual(
    ChromeUtils.now() - startedAt,
    IDLE_TIMEOUT_MS - TIMER_SLACK_MS,
    "The message should be handled once the worker's idle timers end the push event"
  );

  await SpecialPowers.popPrefEnv();
});
