/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const TEST_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const TEST_PAGE_NORMAL = TEST_PATH + "empty.html";
const TEST_PAGE_FINGERPRINTER = TEST_PATH + "font-fingerprinter.html";

// Glean labeled counter labels for font_fingerprinting_per_tab.
const KEY_NO_FINGERPRINTING = "false";
const KEY_FINGERPRINTING = "true";

async function clearTelemetry() {
  // Clear Glean metrics between tests to ensure isolation.
  Services.fog.testResetFOG();
}

async function getLabeledCounter(label, checkCntFn) {
  // Wait until the labeled counter appears with a value.
  let value = 0;
  await TestUtils.waitForCondition(() => {
    value =
      Glean.contentblocking.fontFingerprintingPerTab[label].testGetValue();
    return checkCntFn ? checkCntFn(value) : value > 0;
  });
  return value;
}

async function checkLabeledCounter(label, expectedCnt) {
  let cnt = await getLabeledCounter(label, v => {
    return (v ?? 0) == expectedCnt;
  });
  is(cnt, expectedCnt, "Expected count in Glean labeled counter.");
}

add_setup(async function () {
  await clearTelemetry();
});

add_task(async function test_font_fingerprinting_telemetry_normal() {
  let promiseWindowDestroyed = BrowserUtils.promiseObserved(
    "window-global-destroyed"
  );

  // First, we open a page without any font fingerprinters
  await BrowserTestUtils.withNewTab(TEST_PAGE_NORMAL, async _ => {});

  // Make sure the tab was closed properly before checking Telemetry.
  await promiseWindowDestroyed;

  // Check that the telemetry has been record properly for normal page. The
  // telemetry should show there was no font fingerprinting attempt.
  await checkLabeledCounter(KEY_NO_FINGERPRINTING, 1);

  await clearTelemetry();
});

add_task(async function test_font_fingerprinting_telemetry_fingerprinter() {
  let promiseWindowDestroyed = BrowserUtils.promiseObserved(
    "window-global-destroyed"
  );

  // Now open a page with a font fingerprinter
  await BrowserTestUtils.withNewTab(TEST_PAGE_FINGERPRINTER, async _ => {});

  // Make sure the tab was closed properly before checking Telemetry.
  await promiseWindowDestroyed;

  // The telemetry should show one font fingerprinting attempt.
  await checkLabeledCounter(KEY_FINGERPRINTING, 1);

  await clearTelemetry();
});
