/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const RECEIVE_PUSH_MESSAGES_CONTRACT_ID =
  "@mozilla.org/push/receive-push-messages-clh;1";

add_task(async function test_command_line_handler_is_registered() {
  is(
    Services.catMan.getCategoryEntry(
      "command-line-handler",
      "m-push-receive-push-messages"
    ),
    RECEIVE_PUSH_MESSAGES_CONTRACT_ID,
    "The command-line handler is registered"
  );
});

add_task(async function test_argument_is_handled() {
  let cmdLine = Cu.createCommandLine(
    ["--receive-push-messages"],
    null,
    Ci.nsICommandLine.STATE_INITIAL_LAUNCH
  );

  is(
    cmdLine.findFlag("receive-push-messages", false),
    0,
    "The argument is present"
  );

  let receivePushMessages = sinon
    .stub(CommandLineHandler.prototype, "receivePushMessages")
    .resolves();

  try {
    Cc[RECEIVE_PUSH_MESSAGES_CONTRACT_ID].getService(
      Ci.nsICommandLineHandler
    ).handle(cmdLine);
  } finally {
    receivePushMessages.restore();
  }

  is(
    cmdLine.findFlag("receive-push-messages", false),
    -1,
    "The argument is handled"
  );
});

const { CommandLineHandler } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/push/PushCommandLineHandler.sys.mjs"
);

function pushMessagesAreReceived(commandLineState) {
  let receivePushMessages = sinon
    .stub(CommandLineHandler.prototype, "receivePushMessages")
    .resolves();

  try {
    Cc[RECEIVE_PUSH_MESSAGES_CONTRACT_ID].getService(
      Ci.nsICommandLineHandler
    ).handle(
      Cu.createCommandLine(["--receive-push-messages"], null, commandLineState)
    );
  } finally {
    receivePushMessages.restore();
  }

  return receivePushMessages.called;
}

add_task(async function test_push_messages_received_without_firefox_running() {
  ok(
    pushMessagesAreReceived(Ci.nsICommandLine.STATE_INITIAL_LAUNCH),
    "Push messages are received"
  );
});

add_task(async function test_push_messages_not_received_with_firefox_running() {
  ok(
    !pushMessagesAreReceived(Ci.nsICommandLine.STATE_REMOTE_AUTO),
    "Push messages are not received"
  );
});

function windowIsDisplayed(commandLineState) {
  let cmdLine = Cu.createCommandLine(
    ["--receive-push-messages"],
    null,
    commandLineState
  );

  let receivePushMessages = sinon
    .stub(CommandLineHandler.prototype, "receivePushMessages")
    .resolves();

  try {
    Cc[RECEIVE_PUSH_MESSAGES_CONTRACT_ID].getService(
      Ci.nsICommandLineHandler
    ).handle(cmdLine);
  } finally {
    receivePushMessages.restore();
  }

  return !cmdLine.preventDefault;
}

add_task(async function test_window_not_displayed_if_firefox_is_not_running() {
  ok(
    !windowIsDisplayed(Ci.nsICommandLine.STATE_INITIAL_LAUNCH),
    "No window is displayed"
  );
});

add_task(async function test_window_not_displayed_if_firefox_is_running() {
  ok(
    !windowIsDisplayed(Ci.nsICommandLine.STATE_REMOTE_AUTO),
    "No window is displayed"
  );
});

const BROWSER_GLUE =
  Cc["@mozilla.org/browser/browserglue;1"].getService().wrappedJSObject;

function createsBlankWindow(commandLineArguments) {
  // The blank window is only created if width and height already have a value
  const CHROME_URL = AppConstants.BROWSER_CHROME_URL;
  for (let [attribute, value] of [
    ["width", "1000"],
    ["height", "800"],
  ]) {
    Services.xulStore.setValue(CHROME_URL, "main-window", attribute, value);
    registerCleanupFunction(() =>
      Services.xulStore.removeValue(CHROME_URL, "main-window", attribute)
    );
  }

  // Prevents a real blank window from being created during the test
  const OPEN_WINDOW_CALLED = new Error("Services.ww.openWindow called");
  let openWindow = sinon.stub().throws(OPEN_WINDOW_CALLED);
  let windowWatcher = sinon.stub(Services, "ww").value({ openWindow });

  try {
    BROWSER_GLUE._earlyBlankFirstPaint(
      Cu.createCommandLine(
        commandLineArguments,
        null,
        Ci.nsICommandLine.STATE_INITIAL_LAUNCH
      )
    );
  } catch (e) {
    if (e != OPEN_WINDOW_CALLED) {
      throw e;
    }
  } finally {
    windowWatcher.restore();
  }

  return openWindow.called;
}

add_task(async function test_blank_window_not_displayed_with_the_argument() {
  ok(!createsBlankWindow(["--receive-push-messages"]), "No blank window");
});

add_task(async function test_blank_window_displayed_without_the_argument() {
  ok(createsBlankWindow([]), "The blank window is displayed");
});

async function survivalAreaUsage(commandLineState) {
  let survivalAreaExited = Promise.withResolvers();
  let enterLastWindowClosingSurvivalArea = sinon.stub();
  let exitLastWindowClosingSurvivalArea = sinon
    .stub()
    .callsFake(() => survivalAreaExited.resolve());
  let startup = sinon.stub(Services, "startup").value({
    enterLastWindowClosingSurvivalArea,
    exitLastWindowClosingSurvivalArea,
  });

  let receivePushMessages = sinon
    .stub(CommandLineHandler.prototype, "receivePushMessages")
    .resolves();

  try {
    Cc[RECEIVE_PUSH_MESSAGES_CONTRACT_ID].getService(
      Ci.nsICommandLineHandler
    ).handle(
      Cu.createCommandLine(["--receive-push-messages"], null, commandLineState)
    );

    if (enterLastWindowClosingSurvivalArea.called) {
      // Waits until exitLastWindowClosingSurvivalArea is called
      await survivalAreaExited.promise;
    }
  } finally {
    receivePushMessages.restore();
    startup.restore();
  }

  return {
    entered: enterLastWindowClosingSurvivalArea.called,
    exited: exitLastWindowClosingSurvivalArea.called,
  };
}

add_task(async function test_kept_alive_if_firefox_is_not_running() {
  Assert.deepEqual(
    await survivalAreaUsage(Ci.nsICommandLine.STATE_INITIAL_LAUNCH),
    { entered: true, exited: true },
    "Firefox is kept alive while receiving push messages"
  );
});

add_task(async function test_not_kept_alive_if_firefox_is_running() {
  Assert.deepEqual(
    await survivalAreaUsage(Ci.nsICommandLine.STATE_REMOTE_AUTO),
    { entered: false, exited: false },
    "Firefox is not kept alive"
  );
});

const PUSH_SERVICE = Cc["@mozilla.org/push/Service;1"].getService(
  Ci.nsIPushService
);

async function startsPushService(pushServiceError) {
  let ensureReady = sinon
    .stub(PUSH_SERVICE.wrappedJSObject, "ensureReady")
    .resolves();
  if (pushServiceError) {
    ensureReady.throws(pushServiceError);
  }

  try {
    return await CommandLineHandler.prototype.ensurePushServiceReady();
  } finally {
    ensureReady.restore();
  }
}

add_task(async function test_push_service_ready() {
  ok(await startsPushService(), "The Push Service is ready");
});

add_task(async function test_push_service_disabled() {
  ok(
    !(await startsPushService(
      Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE)
    )),
    "The Push Service is disabled"
  );
});

add_task(async function test_push_service_broken() {
  let pushServiceError = new Error("The Push Service is broken");

  await Assert.rejects(
    startsPushService(pushServiceError),
    e => e == pushServiceError,
    "The Push Service is broken"
  );
});

function countObservers(topic) {
  return [...Services.obs.enumerateObservers(topic)].length;
}

function countPushTopicObservers() {
  return countObservers(PUSH_SERVICE.pushTopic);
}

add_task(async function test_push_messages_not_observed_without_push_service() {
  let pushService = sinon
    .stub(CommandLineHandler.prototype, "ensurePushServiceReady")
    .resolves(false);

  try {
    let receiving = CommandLineHandler.prototype.receivePushMessages();
    is(countPushTopicObservers(), 0, "No observer while receiving");
    await receiving;
  } finally {
    pushService.restore();
  }
});

const OBSERVED_TIMEOUT_MS = 100;

add_task(async function test_push_messages_observed_with_push_service() {
  let pushService = sinon
    .stub(CommandLineHandler.prototype, "ensurePushServiceReady")
    .resolves(true);

  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "app.backgroundNotifications.receivePushMessages.perMessageTimeoutMs",
        OBSERVED_TIMEOUT_MS,
      ],
      [
        "app.backgroundNotifications.receivePushMessages.totalTimeoutMs",
        OBSERVED_TIMEOUT_MS,
      ],
    ],
  });

  const handledTopic = PUSH_SERVICE.pushMessageHandledTopic;

  try {
    is(countPushTopicObservers(), 0, "No observer before receiving");
    is(countObservers(handledTopic), 0, "No handled observer before receiving");

    let receiving = CommandLineHandler.prototype.receivePushMessages();

    // The observer is added after the Push Service check resolves
    await TestUtils.waitForCondition(
      () => countPushTopicObservers() == 1,
      "One observer while receiving",
      10
    );

    is(countObservers(handledTopic), 1, "One handled observer while receiving");

    await receiving;

    is(countPushTopicObservers(), 0, "No observer after receiving");
    is(countObservers(handledTopic), 0, "No handled observer after receiving");
  } finally {
    pushService.restore();
    await SpecialPowers.popPrefEnv();
  }
});

function sendPushMessage(messageId = "") {
  Cc["@mozilla.org/push/Notifier;1"]
    .getService(Ci.nsIPushNotifier)
    .notifyPush(
      "chrome://push-receive-push-messages",
      Services.scriptSecurityManager.getSystemPrincipal(),
      messageId
    );
}

const INTERVAL_MS = 20;

async function receivePushMessagesDurationMs({
  perMessageTimeoutMs,
  totalTimeoutMs,
  messagesToSend,
}) {
  let pushService = sinon
    .stub(CommandLineHandler.prototype, "ensurePushServiceReady")
    .resolves(true);

  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "app.backgroundNotifications.receivePushMessages.perMessageTimeoutMs",
        perMessageTimeoutMs,
      ],
      [
        "app.backgroundNotifications.receivePushMessages.totalTimeoutMs",
        totalTimeoutMs,
      ],
    ],
  });

  let sending = setInterval(() => {
    if (messagesToSend > 0) {
      sendPushMessage();
      messagesToSend--;
    }
  }, INTERVAL_MS);
  registerCleanupFunction(() => clearInterval(sending));

  let startedAt = ChromeUtils.now();

  try {
    await CommandLineHandler.prototype.receivePushMessages();

    return ChromeUtils.now() - startedAt;
  } finally {
    clearInterval(sending);
    pushService.restore();
    await SpecialPowers.popPrefEnv();
  }
}

const PER_MESSAGE_TIMEOUT_MS = 100;
const TOTAL_TIMEOUT_MS = 500;
const MESSAGES_TO_SEND = 10;
const TOLERANCE_MS = 100;

add_task(async function test_receive_push_messages_when_none_arrive() {
  let durationMs = await receivePushMessagesDurationMs({
    perMessageTimeoutMs: PER_MESSAGE_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
    messagesToSend: 0,
  });

  isfuzzy(
    durationMs,
    PER_MESSAGE_TIMEOUT_MS,
    TOLERANCE_MS,
    "Push messages are received until the per message timeout"
  );
});

add_task(async function test_receive_push_messages_until_all_arrive() {
  let durationMs = await receivePushMessagesDurationMs({
    perMessageTimeoutMs: PER_MESSAGE_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
    messagesToSend: MESSAGES_TO_SEND,
  });

  isfuzzy(
    durationMs,
    (MESSAGES_TO_SEND - 1) * INTERVAL_MS + PER_MESSAGE_TIMEOUT_MS,
    TOLERANCE_MS,
    "Push messages are received until all arrive"
  );
});

add_task(async function test_receive_push_messages_until_total_timeout() {
  let durationMs = await receivePushMessagesDurationMs({
    perMessageTimeoutMs: PER_MESSAGE_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
    messagesToSend: Infinity,
  });

  isfuzzy(
    durationMs,
    TOTAL_TIMEOUT_MS,
    TOLERANCE_MS,
    "Push messages are received until the total timeout"
  );
});

async function inChildProcess(callback) {
  let appinfo = sinon.stub(Services, "appinfo").value({
    processType: Ci.nsIXULRuntime.PROCESS_TYPE_CONTENT,
  });

  try {
    return await callback();
  } finally {
    appinfo.restore();
  }
}

add_task(async function test_push_messages_not_received_in_child_process() {
  ok(
    !(await inChildProcess(() =>
      pushMessagesAreReceived(Ci.nsICommandLine.STATE_INITIAL_LAUNCH)
    )),
    "Push messages are not received"
  );
});

add_task(async function test_not_kept_alive_in_child_process() {
  Assert.deepEqual(
    await inChildProcess(() =>
      survivalAreaUsage(Ci.nsICommandLine.STATE_INITIAL_LAUNCH)
    ),
    { entered: false, exited: false },
    "Firefox is not kept alive"
  );
});

add_task(async function test_argument_not_handled_in_child_process() {
  let cmdLine = Cu.createCommandLine(
    ["--receive-push-messages"],
    null,
    Ci.nsICommandLine.STATE_INITIAL_LAUNCH
  );

  await inChildProcess(() =>
    Cc[RECEIVE_PUSH_MESSAGES_CONTRACT_ID].getService(
      Ci.nsICommandLineHandler
    ).handle(cmdLine)
  );

  is(
    cmdLine.findFlag("receive-push-messages", false),
    0,
    "The argument is left unhandled"
  );
});

function backgroundHelperWakes(commandLineState) {
  Services.fog.testResetFOG();

  let receivePushMessages = sinon
    .stub(CommandLineHandler.prototype, "receivePushMessages")
    .resolves();

  try {
    Cc[RECEIVE_PUSH_MESSAGES_CONTRACT_ID].getService(
      Ci.nsICommandLineHandler
    ).handle(
      Cu.createCommandLine(["--receive-push-messages"], null, commandLineState)
    );
  } finally {
    receivePushMessages.restore();
  }

  return Glean.backgroundNotificationHelper.wake.testGetValue() ?? 0;
}

add_task(async function test_wake_recorded_without_firefox_running() {
  is(
    backgroundHelperWakes(Ci.nsICommandLine.STATE_INITIAL_LAUNCH),
    1,
    "The wake is recorded"
  );
});

// Firefox was already awake, so the helper handing the argument to the running
// instance is not a wake.
add_task(async function test_wake_not_recorded_with_firefox_running() {
  is(
    backgroundHelperWakes(Ci.nsICommandLine.STATE_REMOTE_AUTO),
    0,
    "No wake is recorded"
  );
});

// The samples a distribution recorded, one entry per wake, so that a wake
// recording zero is distinguishable from no wake recording anything.
function samples(distribution) {
  let { values = {} } = distribution.testGetValue() ?? {};

  return Object.entries(values)
    .filter(([, count]) => count > 0)
    .flatMap(([bucket, count]) => Array(count).fill(Number(bucket)))
    .sort((a, b) => a - b);
}

function messagesSampled() {
  return samples(Glean.backgroundNotificationHelper.wakeMessages);
}

add_task(async function test_messages_are_counted() {
  Services.fog.testResetFOG();

  await receivePushMessagesDurationMs({
    perMessageTimeoutMs: PER_MESSAGE_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
    messagesToSend: MESSAGES_TO_SEND,
  });

  Assert.deepEqual(
    messagesSampled(),
    [MESSAGES_TO_SEND],
    "The wake records every message that arrived"
  );
});

// A wake that delivers nothing is the case the metric exists to expose, so it
// has to be distinguishable rather than simply absent.
add_task(async function test_no_messages_counted_when_none_arrive() {
  Services.fog.testResetFOG();

  await receivePushMessagesDurationMs({
    perMessageTimeoutMs: PER_MESSAGE_TIMEOUT_MS,
    totalTimeoutMs: TOTAL_TIMEOUT_MS,
    messagesToSend: 0,
  });

  Assert.deepEqual(
    messagesSampled(),
    [0],
    "A wake that received nothing records zero messages"
  );
});

// Each wake is its own sample, rather than one total spanning both.
add_task(async function test_each_wake_is_counted_separately() {
  Services.fog.testResetFOG();

  for (let messagesToSend of [0, MESSAGES_TO_SEND]) {
    await receivePushMessagesDurationMs({
      perMessageTimeoutMs: PER_MESSAGE_TIMEOUT_MS,
      totalTimeoutMs: TOTAL_TIMEOUT_MS,
      messagesToSend,
    });
  }

  Assert.deepEqual(
    messagesSampled(),
    [0, MESSAGES_TO_SEND],
    "Every wake records its own messages"
  );
});

function showNotification() {
  Services.obs.notifyObservers(null, "web-notification-shown");
}

function notificationsSampled() {
  return samples(Glean.backgroundNotificationHelper.wakeNotifications);
}

add_task(async function test_notifications_shown_are_counted() {
  let pushService = sinon
    .stub(CommandLineHandler.prototype, "ensurePushServiceReady")
    .resolves(true);

  await using _pref = await SpecialPowers.prefEnv({
    set: [
      [
        "app.backgroundNotifications.receivePushMessages.perMessageTimeoutMs",
        PER_MESSAGE_TIMEOUT_MS,
      ],
      [
        "app.backgroundNotifications.receivePushMessages.totalTimeoutMs",
        TOTAL_TIMEOUT_MS,
      ],
    ],
  });

  Services.fog.testResetFOG();

  try {
    let receiving = CommandLineHandler.prototype.receivePushMessages();

    // The observers are added after the Push Service check resolves
    await TestUtils.waitForCondition(
      () => countPushTopicObservers() == 1,
      "Receiving has started",
      10
    );

    showNotification();
    showNotification();

    await receiving;

    Assert.deepEqual(
      notificationsSampled(),
      [2],
      "The wake records the notifications shown while receiving"
    );

    // Receiving has stopped, so this one belongs to no wake.
    showNotification();

    Assert.deepEqual(
      notificationsSampled(),
      [2],
      "Notifications shown afterwards are not recorded"
    );
  } finally {
    pushService.restore();
  }
});

add_task(async function test_push_message_handled_notification() {
  is(
    PUSH_SERVICE.pushMessageHandledTopic,
    "push-message-handled",
    "The handled topic is exposed on the Push Service"
  );

  let handled = TestUtils.topicObserved(
    PUSH_SERVICE.pushMessageHandledTopic,
    (subject, data) => data == "test-message-id"
  );

  sendPushMessage("test-message-id");

  await handled;
  ok(true, "The push message is reported as handled");
});

// Stops the total timer from reaching the real Push Service
const ignoreNewMessages = sinon.stub(
  PUSH_SERVICE.wrappedJSObject,
  "ignoreNewMessages"
);
registerCleanupFunction(() => ignoreNewMessages.restore());

async function receivePushEventsDurationMs({
  events,
  perMessageTimeoutMs = PER_MESSAGE_TIMEOUT_MS,
  totalTimeoutMs = TOTAL_TIMEOUT_MS,
}) {
  let pushService = sinon
    .stub(CommandLineHandler.prototype, "ensurePushServiceReady")
    .resolves(true);
  ignoreNewMessages.resetHistory();

  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "app.backgroundNotifications.receivePushMessages.perMessageTimeoutMs",
        perMessageTimeoutMs,
      ],
      [
        "app.backgroundNotifications.receivePushMessages.totalTimeoutMs",
        totalTimeoutMs,
      ],
    ],
  });

  let timers = [];

  try {
    let receiving = CommandLineHandler.prototype.receivePushMessages();

    // The observers are added after the Push Service check resolves
    await TestUtils.waitForCondition(
      () => countPushTopicObservers() == 1,
      "One observer while receiving",
      10
    );

    let startedAt = ChromeUtils.now();

    // Simulates push messages and their handling, without going through the
    // real Push Notifier
    for (let { atMs, topic, data } of events) {
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      let timer = setTimeout(
        () => Services.obs.notifyObservers(null, topic, data),
        atMs
      );
      timers.push(timer);
    }

    await receiving;

    return ChromeUtils.now() - startedAt;
  } finally {
    timers.forEach(clearTimeout);
    pushService.restore();
    await SpecialPowers.popPrefEnv();
  }
}

const pushMessage = (atMs, data = "scope") => ({
  atMs,
  topic: PUSH_SERVICE.pushTopic,
  data,
});
const pushMessageHandled = (atMs, data = "message-id") => ({
  atMs,
  topic: PUSH_SERVICE.pushMessageHandledTopic,
  data,
});

// Timers can fire late on slow machines but never early, so these tests only
// use one-sided bounds: an exact lower bound with a small slack for timer
// resolution, and a total timeout too far away to be reached by lateness
const HANDLED_DELAY_MS = 300;
const LONG_TOTAL_TIMEOUT_MS = 5000;
const TIMER_SLACK_MS = 20;

add_task(async function test_receive_push_messages_until_message_handled() {
  let durationMs = await receivePushEventsDurationMs({
    events: [pushMessage(0), pushMessageHandled(HANDLED_DELAY_MS)],
    totalTimeoutMs: LONG_TOTAL_TIMEOUT_MS,
  });

  Assert.greaterOrEqual(
    durationMs,
    HANDLED_DELAY_MS - TIMER_SLACK_MS,
    "Receiving continues past the per message timeout until the message is handled"
  );
  Assert.less(
    durationMs,
    LONG_TOTAL_TIMEOUT_MS - TOLERANCE_MS,
    "Receiving stops before the total timeout"
  );
  ok(!ignoreNewMessages.called, "New messages are still accepted");
});

add_task(async function test_receive_push_messages_handled_immediately() {
  let durationMs = await receivePushEventsDurationMs({
    events: [pushMessage(0), pushMessageHandled(0)],
    totalTimeoutMs: LONG_TOTAL_TIMEOUT_MS,
  });

  Assert.greaterOrEqual(
    durationMs,
    PER_MESSAGE_TIMEOUT_MS - TIMER_SLACK_MS,
    "A handled message doesn't stop receiving before the per message timeout"
  );
  Assert.less(
    durationMs,
    LONG_TOTAL_TIMEOUT_MS - TOLERANCE_MS,
    "Receiving stops before the total timeout"
  );
});

add_task(
  async function test_receive_push_messages_handled_after_total_timeout() {
    const handledAtMs = TOTAL_TIMEOUT_MS + HANDLED_DELAY_MS;
    let durationMs = await receivePushEventsDurationMs({
      events: [pushMessage(0), pushMessageHandled(handledAtMs)],
    });

    Assert.greaterOrEqual(
      durationMs,
      handledAtMs - TIMER_SLACK_MS,
      "A pending message keeps receiving past the total timeout until it is handled"
    );
    ok(
      ignoreNewMessages.calledOnce,
      "New messages are ignored after the total timeout"
    );
  }
);

add_task(
  async function test_receive_push_messages_ignored_after_total_timeout() {
    // With a long per message timeout, a message arriving after the total
    // timeout would keep receiving for a long time if it restarted that timer
    const lateMessageAtMs = TOTAL_TIMEOUT_MS + 100;
    const handledAtMs = TOTAL_TIMEOUT_MS + 200;
    let durationMs = await receivePushEventsDurationMs({
      events: [
        pushMessage(0),
        pushMessage(lateMessageAtMs),
        pushMessageHandled(handledAtMs),
        pushMessageHandled(handledAtMs),
      ],
      perMessageTimeoutMs: LONG_TOTAL_TIMEOUT_MS,
    });

    Assert.greaterOrEqual(
      durationMs,
      handledAtMs - TIMER_SLACK_MS,
      "A message arriving after the total timeout is still waited for"
    );
    Assert.less(
      durationMs,
      LONG_TOTAL_TIMEOUT_MS - TOLERANCE_MS,
      "A message arriving after the total timeout doesn't restart the per message timer"
    );
  }
);

add_task(async function test_stray_handled_notification_is_ignored() {
  let durationMs = await receivePushEventsDurationMs({
    events: [
      pushMessageHandled(0, "stray-message-id"),
      pushMessage(0),
      pushMessageHandled(HANDLED_DELAY_MS),
    ],
    totalTimeoutMs: LONG_TOTAL_TIMEOUT_MS,
  });

  Assert.greaterOrEqual(
    durationMs,
    HANDLED_DELAY_MS - TIMER_SLACK_MS,
    "A stray handled notification doesn't end the wait for a pending message"
  );
});
