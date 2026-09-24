/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { systemDelay } = ChromeUtils.importESModule(
  "resource://testing-common/SystemDelay.sys.mjs"
);

let lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ScheduledTask: "resource://gre/modules/ScheduledTask.sys.mjs",
});

function delay(delayMilliseconds, callback = null) {
  const { promise, resolve } = Promise.withResolvers();
  const cb = () => {
    console.error(`Resolving`);
    if (callback) {
      callback();
    }
    resolve();
  };
  const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  timer.initWithCallback(cb, delayMilliseconds, Ci.nsITimer.TYPE_ONE_SHOT);
  return promise;
}

add_task(async function testDelay() {
  const before = Date.now();
  await delay(100);
  const after = Date.now();
  Assert.greaterOrEqual(after, before + 100);
});

add_task(async function testRunArmedAccordingToSchedule() {
  let isCalled = false;
  const scheduledTime = Date.now() + 1000;
  const task = new lazy.ScheduledTask(async () => {
    isCalled = true;
  }, scheduledTime).arm();
  await task.asPromise();
  Assert.greaterOrEqual(Date.now(), scheduledTime);
  Assert.ok(isCalled);
});

add_task(async function testNeverArmed() {
  let isCalled = false;
  const scheduledTime = Date.now() + 1000;
  const task = new lazy.ScheduledTask(async () => {
    isCalled = true;
  }, scheduledTime);
  await task.asPromise();
  Assert.ok(!isCalled);
});

add_task(async function testArmThenDisarm() {
  let isCalled = false;
  const scheduledTime = Date.now() + 1000;
  const task = new lazy.ScheduledTask(async () => {
    isCalled = true;
  }, scheduledTime)
    .arm()
    .disarm();
  await task.asPromise();
  Assert.ok(!isCalled);
});

add_task(async function testSleepWakeHandlingNoPostWakeDelay() {
  let isCalled = false;
  const scheduledTime = Date.now() + 500;
  const task = new lazy.ScheduledTask(async () => {
    isCalled = true;
  }, scheduledTime).arm();
  const taskPromise = task.asPromise();
  const before = Date.now();
  Services.obs.notifyObservers(null, "sleep_notification");
  await systemDelay(1);
  Assert.ok(!isCalled);
  const wakeTime = Date.now();
  Services.obs.notifyObservers(null, "wake_notification");
  await taskPromise;
  const after = Date.now();
  Assert.greaterOrEqual(after - before, 500);
  Assert.lessOrEqual(after - wakeTime, 50);
  Assert.ok(isCalled);
});

add_task(async function testSleepWakeHandlingWithPostWakeDelay() {
  let isCalled = false;
  const scheduledTime = Date.now() + 500;
  const task = new lazy.ScheduledTask(
    async () => {
      isCalled = true;
    },
    scheduledTime,
    100
  ).arm();
  const taskPromise = task.asPromise();
  const before = Date.now();
  Services.obs.notifyObservers(null, "sleep_notification");
  await systemDelay(1);
  Assert.ok(!isCalled);
  const wakeTime = Date.now();
  Services.obs.notifyObservers(null, "wake_notification");
  await taskPromise;
  const after = Date.now();
  Assert.greaterOrEqual(after - before, 500);
  Assert.greaterOrEqual(after - wakeTime, 100);
  Assert.ok(isCalled);
});
