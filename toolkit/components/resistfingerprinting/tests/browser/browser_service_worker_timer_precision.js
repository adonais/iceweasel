/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Timer precision reduction under resistFingerprinting is covered for windows
// and for dedicated and shared workers (browser_performanceAPIWorkers.js,
// browser_reduceTimePrecision_iframes.js) but not for ServiceWorkerGlobalScope,
// which has its own performance and Date. The window scope is measured
// alongside as a control.

"use strict";

// Above the RFP time atom (16.667ms), so the clamped values are unambiguous
// multiples.
const PRECISION_MS = 100;

// What unconditional reduction clamps to when left enabled
// (RFP_TIMER_UNCONDITIONAL_VALUE); a 100ms check cannot see it.
const UNCONDITIONAL_PRECISION_MS = 0.02;

// Stringified and evaluated in the target scope, so it must be self-contained.
async function collectTimerSamples() {
  const perf = [];
  const date = [];
  for (let i = 0; i < 5; i++) {
    // Busy-spinning cannot advance a clamped clock, it keeps returning the same
    // value until real time crosses the next boundary.
    const start = self.performance.now();
    do {
      await new Promise(resolve => self.setTimeout(resolve, 10));
    } while (self.performance.now() === start);
    perf.push(self.performance.now());
    date.push(Date.now());
  }
  return { perf, date };
}

function collectInWindow(browser) {
  return SpecialPowers.spawn(
    browser,
    [collectTimerSamples.toString()],
    async fnStr => content.eval(`(${fnStr})`)()
  );
}

function checkClamped(samples, scope) {
  // The checks below run per sample, so an empty or partial set would pass them
  // all without testing anything.
  Assert.greater(samples.perf.length, 0, `${scope} collected timer samples`);
  Assert.equal(
    samples.date.length,
    samples.perf.length,
    `${scope} collected a Date.now() sample per performance.now() sample`
  );
  Assert.equal(
    new Set(samples.perf).size,
    samples.perf.length,
    `${scope} performance.now() advanced between samples`
  );

  for (const value of samples.perf) {
    ok(
      isTimeValueRounded(value, PRECISION_MS),
      `${scope} performance.now() ${value} should be a multiple of ${PRECISION_MS}ms`
    );
  }
  for (const value of samples.date) {
    ok(
      isTimeValueRounded(value, PRECISION_MS),
      `${scope} Date.now() ${value} should be a multiple of ${PRECISION_MS}ms`
    );
  }
}

add_task(async function test_sw_timer_precision_clamped() {
  await withServiceWorkerTab(
    [
      ["privacy.resistFingerprinting", true],
      [
        "privacy.resistFingerprinting.reduceTimerPrecision.microseconds",
        PRECISION_MS * 1000,
      ],
    ],
    TEST_EMPTY_PAGE,
    async browser => {
      checkClamped(await collectInWindow(browser), "window");
      checkClamped(
        await runFunctionInServiceWorker(browser, collectTimerSamples),
        "SW"
      );
    }
  );
});

// Proves the clamping above comes from the prefs and not from a coarse worker
// clock.
add_task(async function test_sw_timer_precision_disabled() {
  await withServiceWorkerTab(
    [
      ["privacy.resistFingerprinting", false],
      ["privacy.reduceTimerPrecision", false],
      ["privacy.reduceTimerPrecision.unconditional", false],
    ],
    TEST_EMPTY_PAGE,
    async browser => {
      const swSamples = await runFunctionInServiceWorker(
        browser,
        collectTimerSamples
      );

      ok(
        swSamples.perf.some(value => !isTimeValueRounded(value, PRECISION_MS)),
        "SW performance.now() should expose unclamped values when timer precision reduction is disabled"
      );
      ok(
        swSamples.perf.some(
          value => !isTimeValueRounded(value, UNCONDITIONAL_PRECISION_MS)
        ),
        "SW performance.now() should not be clamped by unconditional reduction either"
      );
      ok(
        swSamples.date.some(value => !isTimeValueRounded(value, PRECISION_MS)),
        "SW Date.now() should expose unclamped values when timer precision reduction is disabled"
      );
    }
  );
});
