/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The existing ServiceWorkerGlobalScope coverage only checks
// navigator.hardwareConcurrency (browser_fpiServiceWorkers_fingerprinting.js).
// Each property is compared against the controlling window, and the userAgent is
// also pinned to the value nsIRFPService spoofs, because on desktop the spoofed
// platform strings match the real ones and a comparison alone would pass even if
// the worker stopped spoofing.

"use strict";

const spoofedUserAgent = Services.rfp.getSpoofedUserAgent(false);

// oscpu, buildID and doNotTrack are Navigator-only, so they cannot be read from
// worker scope. Stringified and evaluated in the target scope, so it must be
// self-contained.
async function readNavigatorIdentity() {
  const result = {};
  for (const name of [
    "userAgent",
    "appVersion",
    "platform",
    "hardwareConcurrency",
  ]) {
    result[name] = self.navigator[name];
  }
  return result;
}

// navigator.language and navigator.languages are not spoofed by
// resistFingerprinting: accept-language spoofing is driven by
// privacy.spoof_english, which rewrites intl.accept_languages (RFPHelper).
async function readNavigatorLanguages() {
  return {
    language: self.navigator.language,
    languages: self.navigator.languages.join(","),
  };
}

// The reader has to run in page scope: SpecialPowers.spawn's sandbox has a
// system principal, and userAgent, appVersion and platform are
// [NeedsCallerType], so a system caller reads them unspoofed.
function readInWindow(browser, fn) {
  return SpecialPowers.spawn(browser, [fn.toString()], async fnStr =>
    content.eval(`(${fnStr})`)()
  );
}

async function runIdentityTest(resistFingerprinting) {
  await withServiceWorkerTab(
    [["privacy.resistFingerprinting", resistFingerprinting]],
    TEST_EMPTY_PAGE,
    async browser => {
      const windowValues = await readInWindow(browser, readNavigatorIdentity);
      const workerValues = await runFunctionInServiceWorker(
        browser,
        readNavigatorIdentity
      );

      const names = Object.keys(windowValues);
      Assert.greater(names.length, 0, "navigator properties were read");
      Assert.deepEqual(
        Object.keys(workerValues),
        names,
        "the service worker reported the same navigator properties as the window"
      );

      for (const name of names) {
        is(
          workerValues[name],
          windowValues[name],
          `navigator.${name} in the service worker should match the window ` +
            `(resistFingerprinting=${resistFingerprinting})`
        );
      }

      if (resistFingerprinting) {
        is(
          workerValues.userAgent,
          spoofedUserAgent,
          "navigator.userAgent in the service worker should be spoofed"
        );
        is(
          workerValues.hardwareConcurrency,
          SpecialPowers.Services.appinfo.OS == "Darwin" ? 8 : 4,
          "navigator.hardwareConcurrency in the service worker should be spoofed"
        );
      }
    }
  );
}

add_task(async function test_sw_navigator_spoofing_enabled() {
  await runIdentityTest(true);
});

add_task(async function test_sw_navigator_consistency_disabled() {
  await runIdentityTest(false);
});

// A non-English accept-language list makes the spoofed value observable: with
// spoofing off the service worker must expose the configured list, with spoofing
// on the English one.
add_task(async function test_sw_navigator_language_spoofing() {
  for (const [spoofEnglish, expected] of [
    [1, { language: "de-DE", languages: "de-DE,de" }],
    [2, { language: "en-US", languages: "en-US,en" }],
  ]) {
    await withServiceWorkerTab(
      [
        ["intl.accept_languages", "de-DE, de"],
        ["privacy.resistFingerprinting", true],
        ["privacy.spoof_english", spoofEnglish],
      ],
      TEST_EMPTY_PAGE,
      async browser => {
        const windowValues = await readInWindow(
          browser,
          readNavigatorLanguages
        );
        const workerValues = await runFunctionInServiceWorker(
          browser,
          readNavigatorLanguages
        );

        for (const name of Object.keys(expected)) {
          is(
            workerValues[name],
            expected[name],
            `navigator.${name} in the service worker (spoof_english=${spoofEnglish})`
          );
          is(
            workerValues[name],
            windowValues[name],
            `navigator.${name} in the service worker should match the window ` +
              `(spoof_english=${spoofEnglish})`
          );
        }
      }
    );
  }
});
