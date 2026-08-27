/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Regression test for bug 2056818.
//
// Async widget touch events are dispatched through the parent process, so the
// parent's chrome PresShell captures the touch point in the process-global
// TouchManager::sCaptureTouchList. If a touch session never receives a matching
// touchend (here we deliberately omit it), that captured touch point (with id
// nsIDOMWindowUtils.DEFAULT_TOUCH_POINTER_ID) is left behind because the chrome
// PresShell is not torn down. A subsequent single-touch touchstart, even in a
// different tab, must not reuse that stale captured target: it is the start of a
// brand new touch session and has to be hit-tested afresh.

const PAGE =
  "data:text/html,<!DOCTYPE html><html><body style='margin:0;height:100vh'></body></html>";

async function armTouchLog(browser) {
  await SpecialPowers.spawn(browser, [], () => {
    const win = content.wrappedJSObject;
    win.__touchLog = [];
    const record = event => win.__touchLog.push(event.type);
    for (const type of ["touchstart", "touchmove", "touchend"]) {
      content.document.addEventListener(type, record, { passive: true });
    }
  });
}

function getTouchLog(browser) {
  return SpecialPowers.spawn(browser, [], () =>
    content.wrappedJSObject.__touchLog.slice()
  );
}

function waitForTouchStartAndTouchMoveInContent(aBrowser, aMsg) {
  return TestUtils.waitForCondition(async () => {
    const log = await getTouchLog(aBrowser);
    return log.includes("touchstart") && log.includes("touchmove")
      ? log
      : false;
  }, aMsg);
}

// Synthesize a touchstart followed by a touchmove over the content area of
// `browser`, without a touchend, using async widget events (the code path the
// Remote Agent uses, which routes through the parent process).
async function synthesizeTouchStartAndMove(browser) {
  await new Promise(resolve =>
    EventUtils.synthesizeTouch(
      browser,
      50,
      50,
      { type: "touchstart", asyncEnabled: true },
      window,
      resolve
    )
  );
  await new Promise(resolve =>
    EventUtils.synthesizeTouch(
      browser,
      50,
      70,
      { type: "touchmove", asyncEnabled: true },
      window,
      resolve
    )
  );
}

add_task(async function test_touch_target_for_new_session() {
  const tab1 = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  registerCleanupFunction(async function () {
    await BrowserTestUtils.removeTab(tab1);
  });

  const browser1 = tab1.linkedBrowser;
  await armTouchLog(browser1);

  // First tab: touchstart + touchmove, deliberately no touchend.
  await synthesizeTouchStartAndMove(browser1);

  const log1 = await waitForTouchStartAndTouchMoveInContent(
    browser1,
    "First tab should receive touchstart and touchmove"
  );
  ok(log1.includes("touchstart"), "First tab received touchstart");
  ok(log1.includes("touchmove"), "First tab received touchmove");
  ok(!log1.includes("touchend"), "First tab did not receive touchend");

  // Open a new tab in the foreground. The previous touch session was never
  // ended, so the parent process still holds a captured touch point (id
  // DEFAULT_TOUCH_POINTER_ID) whose target lives in the first tab.
  const tab2 = await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE);
  registerCleanupFunction(async function () {
    await BrowserTestUtils.removeTab(tab2);
  });

  const browser2 = tab2.linkedBrowser;
  await armTouchLog(browser2);

  // Second tab: a new single-touch session. It must be delivered here rather
  // than to the stale captured target from the first tab.
  await synthesizeTouchStartAndMove(browser2);

  const log2 = await waitForTouchStartAndTouchMoveInContent(
    browser2,
    "Second tab should receive touchstart and touchmove"
  );
  ok(log2.includes("touchstart"), "Second tab received touchstart");
  ok(log2.includes("touchmove"), "Second tab received touchmove");
  ok(!log2.includes("touchend"), "Second tab did not receive touchend");

  // Clear the leftover captured touch so it does not affect later tests that
  // share this parent process.
  await new Promise(resolve =>
    EventUtils.synthesizeTouch(
      browser2,
      50,
      70,
      { type: "touchend", asyncEnabled: true },
      window,
      resolve
    )
  );
});
