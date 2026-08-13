/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

const { DefaultBrowserHelper } = ChromeUtils.importESModule(
  "chrome://browser/content/preferences/DefaultBrowserHelper.mjs",
  { global: "current" }
);

// The poll schedules its next run with window.setTimeout(() =>
// window.requestIdleCallback(check), backoff). We stub those timers so the
// scheduled callback is captured instead of waiting on real timers.
let pendingPoll = null;

// Runs exactly one poll evaluation synchronously: the captured setTimeout
// callback hands off to requestIdleCallback (stubbed to run inline), which
// checks the default-browser state, notifies subscribers on a change, and
// reschedules (re-capturing the next callback).
function pumpPoll() {
  let cb = pendingPoll;
  pendingPoll = null;
  cb();
}

add_setup(async function () {
  // The poll only runs while the window is visible, so make sure it is focused.
  await SimpleTest.promiseFocus(window);

  registerCleanupFunction(() => {
    // Never leave a poll timer running past the test.
    DefaultBrowserHelper._changeListeners.clear();
    DefaultBrowserHelper.clearPollingForDefaultChanges();
  });
});

add_task(function test_poll_notifies_all_subscribers() {
  let isDefault = false;
  let aCount = 0;
  let bCount = 0;

  let sandbox = sinon.createSandbox();
  sandbox.stub(ShellService, "isDefaultBrowser").callsFake(() => isDefault);

  let nextTimerId = 1;
  sandbox.stub(window, "setTimeout").callsFake(cb => {
    pendingPoll = cb;
    return nextTimerId++;
  });
  sandbox.stub(window, "clearTimeout").callsFake(() => {
    pendingPoll = null;
  });
  sandbox.stub(window, "requestIdleCallback").callsFake(cb => cb());

  try {
    ok(
      DefaultBrowserHelper.canCheck,
      "The browser can check its default state"
    );

    // The first subscriber starts the polling timer.
    let unsubA = DefaultBrowserHelper.pollForDefaultChanges(() => aCount++);
    let timer = DefaultBrowserHelper._pollingTimer;
    ok(timer, "Subscribing starts the polling timer");
    is(
      DefaultBrowserHelper._changeListeners.size,
      1,
      "One subscriber registered"
    );

    // A second subscriber reuses the same timer rather than starting another.
    let unsubB = DefaultBrowserHelper.pollForDefaultChanges(() => bCount++);
    is(
      DefaultBrowserHelper._pollingTimer,
      timer,
      "A second subscriber reuses the existing timer"
    );
    is(
      DefaultBrowserHelper._changeListeners.size,
      2,
      "Two subscribers registered"
    );

    // Becoming default notifies every subscriber on the next poll.
    is(aCount, 0, "First subscriber not yet notified");
    is(bCount, 0, "Second subscriber not yet notified");
    isDefault = true;
    pumpPoll();
    is(aCount, 1, "First subscriber notified when the browser becomes default");
    is(
      bCount,
      1,
      "Second subscriber notified when the browser becomes default"
    );

    // A poll with no state change notifies nobody.
    pumpPoll();
    is(aCount, 1, "No extra notification when the state is unchanged");
    is(bCount, 1, "No extra notification when the state is unchanged");

    // After removing the first subscriber, only the second is notified, and
    // polling continues while a subscriber remains.
    unsubA();
    is(
      DefaultBrowserHelper._changeListeners.size,
      1,
      "One subscriber left after unsubscribing the first"
    );
    ok(
      DefaultBrowserHelper._pollingTimer,
      "Polling continues while a subscriber remains"
    );

    isDefault = false;
    pumpPoll();
    is(
      bCount,
      2,
      "Remaining subscriber notified when the default changes again"
    );
    is(aCount, 1, "The unsubscribed callback is not notified again");

    // Removing the last subscriber stops the poll.
    unsubB();
    is(
      DefaultBrowserHelper._changeListeners.size,
      0,
      "No subscribers left after unsubscribing the last"
    );
    is(
      DefaultBrowserHelper._pollingTimer,
      undefined,
      "Polling stops once the last subscriber unsubscribes"
    );
  } finally {
    sandbox.restore();
    pendingPoll = null;
  }
});
