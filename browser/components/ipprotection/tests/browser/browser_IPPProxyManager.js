/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPProtectionServerlist } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionServerlist.sys.mjs"
);

// Don't add an experiment so we can test adding and removing it.
DEFAULT_EXPERIMENT = null;

add_task(async function test_IPPProxyManager_handleProxyErrorEvent() {
  setupService({
    isSignedIn: true,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await IPProtectionServerlist.maybeFetchList();

  await IPPProxyManager.start();

  const cases = [
    {
      name: "Non-401 HTTP status - should not rotate",
      httpStatus: 500,
      level: "error",
      shouldRotate: false,
    },
    {
      name: "Different isolation key - should not rotate",
      httpStatus: 401,
      level: "error",
      isolationKey: "different-key",
      shouldRotate: false,
    },
    {
      name: "401 with warning level - accepts whatever shouldRotate returns",
      httpStatus: 401,
      level: "warning",
      shouldRotate: false, // This will depend on the actual shouldRotate implementation
    },
    {
      name: "401 with error level - should rotate",
      httpStatus: 401,
      level: "error",
      shouldRotate: true,
    },
  ];

  for (const testCase of cases) {
    const originalIsolationKey = IPPProxyManager.isolationKey;
    // Create the error event
    const errorEvent = new CustomEvent("proxy-http-error", {
      detail: {
        isolationKey: testCase.isolationKey || originalIsolationKey,
        level: testCase.level,
        httpStatus: testCase.httpStatus,
      },
    });

    console.log(`Testing: ${testCase.name}`);

    const result = IPPProxyManager.handleProxyErrorEvent(errorEvent);

    if (testCase.shouldRotate) {
      Assert.ok(
        result,
        `${testCase.name}: Should return a promise when rotation is triggered`
      );

      await result;

      const newIsolationKey = IPPProxyManager.isolationKey;
      Assert.notEqual(
        originalIsolationKey,
        newIsolationKey,
        `${testCase.name}: Isolation key should change after token rotation`
      );
    } else {
      Assert.equal(
        result,
        undefined,
        `${testCase.name}: Should not return a promise when rotation is not triggered`
      );

      const unchangedIsolationKey = IPPProxyManager.isolationKey;
      Assert.equal(
        originalIsolationKey,
        unchangedIsolationKey,
        `${testCase.name}: Isolation key should not change when rotation is not triggered`
      );
    }
  }

  // Test inactive connection
  const isolationKeyBeforeStop = IPPProxyManager.isolationKey;
  await IPPProxyManager.stop();

  const inactiveErrorEvent = new CustomEvent("proxy-http-error", {
    detail: {
      isolationKey: isolationKeyBeforeStop,
      level: "error",
      httpStatus: 401,
    },
  });

  const inactiveResult =
    IPPProxyManager.handleProxyErrorEvent(inactiveErrorEvent);
  Assert.equal(
    inactiveResult,
    undefined,
    "Should not return a promise when connection is inactive"
  );

  await cleanupAlpha();
  cleanupService();
});
