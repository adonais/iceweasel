/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPProtectionServerlist } = ChromeUtils.importESModule(
  "moz-src:///browser/components/ipprotection/IPProtectionServerlist.sys.mjs"
);

add_task(async function test_IPPProxyManager_handleProxyErrorEvent() {
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });

  IPProtectionService.updateState();

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

  cleanupService();
});

/**
 * Test for Bug 1999946 - When having an issue in IPPProxyManager.start
 * we must make sure we don't have an invalid connection left running.
 */
add_task(async function test_IPPProxyManager_bug_1999946() {
  const { IPPChannelFilter } = ChromeUtils.importESModule(
    "moz-src:///browser/components/ipprotection/IPPChannelFilter.sys.mjs"
  );

  Services.prefs.clearUserPref("browser.ipProtection.enabled");

  // Hook the Call to create to capture the created channel filter
  let channelFilterRef = null;
  const sandbox = sinon.createSandbox();
  const originalCreate = IPPChannelFilter.create.bind(IPPChannelFilter);
  sandbox.stub(IPPChannelFilter, "create").callsFake(function () {
    channelFilterRef = originalCreate();
    sandbox.spy(channelFilterRef, "stop");
    return channelFilterRef;
  });

  STUBS.fetchProxyPass.rejects(new Error("Simulate a Fail"));

  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.enabled", true]],
  });

  await IPProtectionServerlist.maybeFetchList();

  await IPPProxyManager.start();

  Assert.ok(channelFilterRef, "Channel filter should have been created");
  Assert.ok(
    channelFilterRef.stop.calledOnce,
    "Channel filter stop should be called when fetchProxyPass fails"
  );

  await IPPProxyManager.stop();

  sandbox.restore();
  cleanupService();
});

/**
 * Tests that opening the panel when the IPPProxyManager state is PAUSED shows the paused view.
 */
add_task(async function test_IPPProxyManager_paused_shown() {
  const sandbox = sinon.createSandbox();
  IPPProxyManager.reset();

  const usage = makeUsage("5368709120", "0", "2027-01-01T00:00:00.000Z");
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
    usageInfo: usage,
  });
  IPProtectionService.updateState();

  let content = await openPanel();

  await waitForProxyState(IPPProxyStates.PAUSED);

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.PAUSED,
    "IPPProxyManager state should be paused when bandwidth quota is exceeded"
  );

  Assert.ok(content.upgradeEl, "Paused upgrade content should be shown");

  await closePanel();
  sandbox.restore();
  cleanupService();
});

/**
 * Tests that setting usage with remaining > 0 unpauses the IPPProxyManager and shows the main view.
 */
add_task(async function test_IPPProxyManager_unpause_on_available() {
  const sandbox = sinon.createSandbox();
  IPPProxyManager.reset();
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });

  IPProtectionService.updateState();
  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "Should be in READY state"
  );

  // Pause the service
  const quotaExceededUsage = makeUsage(
    "5368709120",
    "0",
    "2027-01-01T00:00:00.000Z"
  );

  setupService({
    usageInfo: quotaExceededUsage,
  });

  let content = await openPanel();

  await waitForProxyState(IPPProxyStates.PAUSED);

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.PAUSED,
    "IPPProxyManager state should be paused when bandwidth quota is exceeded"
  );

  Assert.ok(content.upgradeEl, "Paused upgrade content should be shown");

  // Reset usage to unpause
  const restoredUsage = makeUsage(
    "5368709120",
    "4294967296",
    "2027-01-01T00:00:00.000Z"
  );
  setupService({
    usageInfo: restoredUsage,
  });

  IPPProxyManager.refreshUsage();
  await waitForProxyState(IPPProxyStates.READY);

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.READY,
    "IPPProxyManager state should be READY after bandwidth is restored"
  );

  let statusCard = content.statusCardEl;
  let turnOnButton = statusCard.actionButtonEl;

  Assert.ok(turnOnButton, "Turn on button should be shown when un-paused");

  await closePanel();
  sandbox.restore();
  cleanupService();
});
