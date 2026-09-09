/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const PREF_ACCESSIBILITY_FORCE_DISABLED = "accessibility.force_disabled";

const { CommonUtils } = ChromeUtils.importESModule(
  "chrome://mochitests/content/browser/accessible/tests/browser/Common.sys.mjs"
);

function initAccService() {
  return [
    CommonUtils.addAccServiceInitializedObserver(),
    CommonUtils.observeAccServiceInitialized(),
  ];
}

function shutdownAccService() {
  return [
    CommonUtils.addAccServiceShutdownObserver(),
    CommonUtils.observeAccServiceShutdown(),
  ];
}

add_setup(async function () {
  // Load an in-process chrome document, so that when we query via the
  // platform API below, the embedded document is available synchronously,
  // rather than needing to wait for a remote (content process) document to
  // be embedded.
  BrowserTestUtils.startLoadingURIString(
    gBrowser.selectedBrowser,
    "about:mozilla"
  );
  await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
});

add_task(async function testAutoStartsOnPlatformQuery() {
  // common.js eagerly instantiated the service via XPCOM as soon as this
  // test file's head.js loaded. Force disable to guarantee a real shutdown
  // regardless of that or any other outstanding consumer, then go back to
  // auto (0), so we have a clean starting point to test that case.
  info("Shutting down accessibility");
  let [a11yShutdownObserver, a11yShutdown] = shutdownAccService();
  await a11yShutdownObserver;
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_ACCESSIBILITY_FORCE_DISABLED, 1]],
  });
  await a11yShutdown;
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_ACCESSIBILITY_FORCE_DISABLED, 0]],
  });
  ok(
    !Services.appinfo.accessibilityEnabled,
    "Accessibility is not running with force_disabled=0 and no platform query"
  );

  info("Executing platform API query");
  let [a11yInitObserver, a11yInit] = initAccService();
  await a11yInitObserver;
  const role = await runPython(`
    global doc
    doc = getDocIa2()
    return doc.role()
  `);
  await a11yInit;
  is(typeof role, "number", "Got a role for the document via IA2");
  ok(
    Services.appinfo.accessibilityEnabled,
    "Accessibility started because the platform API was used"
  );
});

add_task(async function testForceDisabledBlocksPlatformQuery() {
  info("Force disabling accessibility");
  let [a11yShutdownObserver, a11yShutdown] = shutdownAccService();
  await a11yShutdownObserver;
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_ACCESSIBILITY_FORCE_DISABLED, 1]],
  });
  await a11yShutdown;
  ok(
    !Services.appinfo.accessibilityEnabled,
    "Accessibility is disabled by force_disabled=1"
  );

  info("Executing platform API query");
  let failed = false;
  try {
    await runPython(`getDocIa2()`);
  } catch (e) {
    failed = true;
  }
  ok(failed, "The platform API can't reach the document while force disabled");
  ok(
    !Services.appinfo.accessibilityEnabled,
    "Accessibility is still disabled after the failed platform query"
  );
});

add_task(async function testForceEnabledStartsAtRuntime() {
  info("Force enabling accessibility");
  let [a11yInitObserver, a11yInit] = initAccService();
  await a11yInitObserver;
  await SpecialPowers.pushPrefEnv({
    set: [[PREF_ACCESSIBILITY_FORCE_DISABLED, -1]],
  });
  await a11yInit;
  ok(
    Services.appinfo.accessibilityEnabled,
    "Accessibility was force enabled at runtime"
  );

  info("Executing platform API query");
  const role = await runPython(`
    global doc
    doc = getDocIa2()
    return doc.role()
  `);
  is(typeof role, "number", "Could still query the document via IA2");
});
