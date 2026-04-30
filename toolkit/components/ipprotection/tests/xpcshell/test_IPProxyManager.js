/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { scheduleCallback } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPProxyManager.sys.mjs"
);
const { IPPStartupCache } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPPStartupCache.sys.mjs"
);
const { IPProtectionServerlist } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/IPProtectionServerlist.sys.mjs"
);

add_setup(async function () {
  await putServerInRemoteSettings();
});

/**
 * Tests that starting the service gets a state changed event.
 */
add_task(async function test_IPPProxyManager_start() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  let readyEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();

  await readyEventPromise;

  Assert.ok(
    !IPPProxyManager.activatedAt,
    "IP Protection service should not be active initially"
  );

  let startedEventPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE
  );

  IPPProxyManager.start();

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVATING,
    "Proxy activation"
  );
  await startedEventPromise;

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVE,
    "IP Protection service should be active after starting"
  );
  Assert.ok(
    !!IPPProxyManager.activatedAt,
    "IP Protection service should have an activation timestamp"
  );
  Assert.ok(
    IPPProxyManager.active,
    "IP Protection service should have an active connection"
  );

  Assert.notEqual(
    IPPProxyManager.usageInfo,
    null,
    "IP Protection service should have usage info after starting"
  );
  Assert.ok(
    IPPProxyManager.usageInfo instanceof ProxyUsage,
    "usageInfo should be an instance of ProxyUsage"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that stopping the service gets stop events.
 */
add_task(async function test_IPPProxyManager_stop() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  const waitForReady = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();
  await waitForReady;

  await IPPProxyManager.start();

  let stoppedEventPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.READY
  );
  await IPPProxyManager.stop();

  await stoppedEventPromise;
  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.READY,
    "IP Protection service should not be active after stopping"
  );
  Assert.ok(
    !IPPProxyManager.activatedAt,
    "IP Protection service should not have an activation timestamp after stopping"
  );
  Assert.ok(
    !IPProtectionService.connection,
    "IP Protection service should not have an active connection"
  );
  Assert.notEqual(
    IPPProxyManager.usageInfo,
    null,
    "IP Protection service should still have usage info after stopping"
  );
  Assert.ok(
    IPPProxyManager.usageInfo instanceof ProxyUsage,
    "usageInfo should be an instance of ProxyUsage"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that the proxy manager gets proxy pass and connection on starting
 * and removes the connection after after stop.
 */
add_task(async function test_IPPProxyManager_start_stop_reset() {
  const sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  let readyEvent = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();
  await readyEvent;

  await IPPProxyManager.start();

  Assert.ok(IPPProxyManager.active, "Should be active after starting");

  Assert.ok(
    IPPProxyManager.isolationKey,
    "Should have an isolationKey after starting"
  );

  Assert.ok(
    IPPProxyManager.hasValidProxyPass,
    "Should have a valid proxy pass after starting"
  );

  await IPPProxyManager.stop();

  Assert.ok(!IPPProxyManager.active, "Should not be active after starting");

  Assert.ok(
    !IPPProxyManager.isolationKey,
    "Should not have an isolationKey after stopping"
  );

  sandbox.restore();
});

/**
 * Tests that the proxy manager gets proxy pass and connection on starting
 * and removes them after stop / reset.
 */
add_task(async function test_IPPProxyManager_reset() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").returns({
    status: 200,
    error: undefined,
    pass: new ProxyPass(createProxyPassToken()),
    usage: new ProxyUsage(
      "5368709120",
      "4294967296",
      "3026-02-01T00:00:00.000Z"
    ),
  });

  await IPPProxyManager.start();

  Assert.ok(IPPProxyManager.active, "Should be active after starting");

  Assert.ok(
    IPPProxyManager.isolationKey,
    "Should have an isolationKey after starting"
  );

  Assert.ok(
    IPPProxyManager.hasValidProxyPass,
    "Should have a valid proxy pass after starting"
  );

  await IPPProxyManager.reset();

  Assert.ok(!IPPProxyManager.active, "Should not be active after reset");

  Assert.ok(
    !IPPProxyManager.isolationKey,
    "Should not have an isolationKey after reset"
  );

  Assert.ok(
    !IPPProxyManager.hasValidProxyPass,
    "Should not have a proxy pass after reset"
  );
  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that usage info is refreshed after reset, so stale data from a
 * previous account doesn't carry over when using the same profile.
 */
add_task(async function test_IPPProxyManager_reset_clears_usage() {
  let sandbox = sinon.createSandbox();
  const oldUsage = new ProxyUsage(
    "5368709120",
    "4294967296",
    "3026-02-01T00:00:00.000Z"
  );
  const newUsage = new ProxyUsage(
    "1073741824",
    "1073741824",
    "3026-03-01T00:00:00.000Z"
  );
  setupStubs(sandbox, { proxyUsage: oldUsage });

  const readyEvent = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );
  IPProtectionService.init();
  await readyEvent;

  await IPPProxyManager.start();

  Assert.equal(
    IPPProxyManager.usageInfo,
    oldUsage,
    "Should have old account's usage info after starting"
  );

  // Simulate an account switch: the next fetchProxyUsage call returns new data.
  let usageRefreshed = new Promise(resolve => {
    IPProtectionService.guardian.fetchProxyUsage.callsFake(() => {
      resolve();
      return Promise.resolve(newUsage);
    });
  });

  await IPPProxyManager.reset();
  await usageRefreshed;

  Assert.equal(
    IPPProxyManager.usageInfo,
    newUsage,
    "Usage info should be refreshed after reset, not carry over old account's data"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests the error state.
 * - When the proxy is active, the ERROR state is set on errors.
 * - Stopping the proxy clears the ERROR state and returns the proxy to READY.
 */
add_task(async function test_IPPProxyStates_error() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox, { validProxyPass: true });

  const readyPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );
  IPProtectionService.init();
  await readyPromise;

  const activeEvent = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE
  );
  IPPProxyManager.start();
  await activeEvent;

  sandbox.restore();
  sandbox = sinon.createSandbox();
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 500,
    error: undefined,
    pass: undefined,
    usage: undefined,
  });

  const errorPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.ERROR
  );
  await IPPProxyManager.rotateProxyPass();
  await errorPromise;
  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ERROR,
    "Proxy should be in ERROR state after rotation failure while ACTIVE"
  );

  const resetPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.READY
  );
  await IPPProxyManager.stop();
  await resetPromise;

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.READY,
    "Proxy should return to READY state after stop() from ERROR"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that activation failures reset the proxy state to the previous state.
 */
add_task(async function test_IPPProxyManager_activation_failure() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox.stub(IPPEnrollAndEntitleManager, "isLinkedToGuardian").resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: undefined,
    entitlement: createTestEntitlement(),
  });
  sandbox
    .stub(IPPEnrollAndEntitleManager, "maybeEnrollAndEntitle")
    .resolves({ isEnrolledAndEntitled: false });

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be ready"
  );

  await IPPProxyManager.start(false);

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.READY,
    "Proxy should return to READY state after activation failure"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that usage data is preserved when quota is exceeded.
 */
add_task(async function test_IPPProxyManager_quota_exceeded() {
  Services.fog.testResetFOG();
  let sandbox = sinon.createSandbox();

  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox.stub(IPPEnrollAndEntitleManager, "isLinkedToGuardian").resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: undefined,
    entitlement: createTestEntitlement(),
  });
  await putServerInRemoteSettings();

  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 429,
    error: "quota_exceeded",
    pass: undefined,
    usage: new ProxyUsage("5368709120", "0", "3026-02-02T00:00:00.000Z"),
  });

  // Initialize service and wait for READY state
  const readyEvent = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();
  await readyEvent;

  // Setup event listener to capture usage change
  let usageChanged = false;
  let capturedUsage = null;
  const usageListener = event => {
    usageChanged = true;
    capturedUsage = event.detail.usage;
  };
  IPPProxyManager.addEventListener(
    "IPPProxyManager:UsageChanged",
    usageListener
  );

  // Try to start - should pause due to quota exhaustion
  const pausedEventPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.PAUSED
  );

  IPPProxyManager.start();
  await pausedEventPromise;

  // Verify usage was set before pausing
  Assert.ok(usageChanged, "UsageChanged event should have fired");
  Assert.notEqual(capturedUsage, null, "Usage should be captured");
  Assert.equal(
    capturedUsage.remaining,
    BigInt("0"),
    "Usage remaining should be 0"
  );
  Assert.equal(
    capturedUsage.max,
    BigInt("5368709120"),
    "Usage max should be set"
  );

  // Verify the proxy is in PAUSED state because quota is exhausted
  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.PAUSED,
    "Should be in PAUSED state"
  );

  let pausedEvent = Glean.ipprotection.paused.testGetValue();
  Assert.equal(pausedEvent.length, 1, "Should have recorded the paused event");
  Assert.equal(
    pausedEvent[0].extra.wasActive,
    "false",
    "Previous state was not active"
  );

  // Verify usage is still accessible in manager
  Assert.notEqual(IPPProxyManager.usageInfo, null, "Usage should be stored");
  Assert.equal(
    IPPProxyManager.usageInfo.remaining,
    BigInt("0"),
    "Stored usage remaining should be 0"
  );
  Assert.equal(
    IPPProxyManager.usageInfo.max,
    BigInt("5368709120"),
    "Stored usage max should be set"
  );

  // Cleanup
  IPPProxyManager.removeEventListener(
    "IPPProxyManager:UsageChanged",
    usageListener
  );
  IPProtectionService.uninit();
  sandbox.restore();
  Services.fog.testResetFOG();
});

/**
 * Tests the active state.
 */
add_task(async function test_IPPProxytates_active() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox.stub(IPPEnrollAndEntitleManager, "isLinkedToGuardian").resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: undefined,
    entitlement: createTestEntitlement(),
  });
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 200,
    error: undefined,
    pass: new ProxyPass(
      options.validProxyPass
        ? createProxyPassToken()
        : createExpiredProxyPassToken()
    ),
    usage: new ProxyUsage(
      "5368709120",
      "4294967296",
      "3026-02-01T00:00:00.000Z"
    ),
  });

  const waitForReady = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();

  await waitForReady;

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be ready"
  );

  const startPromise = IPPProxyManager.start(false);

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVATING,
    "Proxy activation"
  );

  await startPromise;

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be in ready state"
  );

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVE,
    "IP Protection service should be active"
  );

  await IPPProxyManager.stop(false);

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be ready again"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests the quick start/stop calls.
 */
add_task(async function test_IPPProxytates_start_stop() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox.stub(IPPEnrollAndEntitleManager, "isLinkedToGuardian").resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: undefined,
    entitlement: createTestEntitlement(),
  });
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 200,
    error: undefined,
    pass: new ProxyPass(
      options.validProxyPass
        ? createProxyPassToken()
        : createExpiredProxyPassToken()
    ),
    usage: new ProxyUsage(
      "5368709120",
      "123456789",
      "3026-02-01T00:00:00.000Z"
    ),
  });

  const waitForReady = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();

  await waitForReady;

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be ready"
  );

  IPPProxyManager.start(false);
  IPPProxyManager.start(false);
  IPPProxyManager.start(false);

  IPPProxyManager.stop(false);
  IPPProxyManager.stop(false);
  IPPProxyManager.stop(false);
  IPPProxyManager.stop(false);

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVATING,
    "Proxy activation"
  );

  // We should expect the Stop to cancel the activation
  using fail = {
    listener: () => {
      if (IPPProxyManager.state === IPPProxyStates.ACTIVE) {
        Assert.ok(false, "We must abort the activation when calling stop.");
      }
    },
    [Symbol.dispose]: () => {
      IPPProxyManager.removeEventListener(
        "IPPProxyManager:StateChanged",
        fail.listener
      );
    },
  };
  IPPProxyManager.addEventListener(
    "IPPProxyManager:StateChanged",
    fail.listener
  );

  await waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.READY
  );

  IPProtectionService.uninit();
  IPPProxyManager.uninit();
  sandbox.restore();
});

add_task(
  async function test_IPPProxyManager_paused_on_activation_with_zero_quota() {
    let sandbox = sinon.createSandbox();
    setupStubs(sandbox, {
      validProxyPass: false,
      proxyUsage: new ProxyUsage("1000000", "0", "3026-02-05T00:00:00.000Z"),
    });

    const readyEvent = waitForEvent(
      IPProtectionService,
      "IPProtectionService:StateChanged",
      () => IPProtectionService.state === IPProtectionStates.READY
    );

    IPProtectionService.init();
    await readyEvent;

    const pausedEventPromise = waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:StateChanged",
      () => IPPProxyManager.state === IPPProxyStates.PAUSED
    );

    IPPProxyManager.start();

    await pausedEventPromise;

    Assert.equal(
      IPPProxyManager.state,
      IPPProxyStates.PAUSED,
      "Proxy should be in PAUSED state when quota exhausted during activation"
    );
    Assert.equal(
      IPPProxyManager.isolationKey,
      null,
      "Should not have an isolationKey when paused, as the connection is paused"
    );
    Assert.notEqual(
      IPPProxyManager.usageInfo,
      null,
      "Usage info should be set even in PAUSED state"
    );
    Assert.equal(
      IPPProxyManager.usageInfo.remaining,
      BigInt("0"),
      "Usage remaining should be 0"
    );
    IPProtectionService.uninit();
    sandbox.restore();
  }
);

add_task(
  async function test_IPPProxyManager_restart_after_pause_during_activation() {
    await IPPProxyManager.reset();

    let sandbox = sinon.createSandbox();
    setupStubs(sandbox);

    const readyEvent = waitForEvent(
      IPProtectionService,
      "IPProtectionService:StateChanged",
      () => IPProtectionService.state === IPProtectionStates.READY
    );

    IPProtectionService.init();
    await readyEvent;

    // Starting with no bandwidth remaining will pause the proxy during activation.
    const pausedEventPromise = waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:StateChanged",
      () => IPPProxyManager.state === IPPProxyStates.PAUSED
    );

    sandbox.restore();
    setupStubs(sandbox, {
      validProxyPass: false,
      proxyUsage: new ProxyUsage("1000000", "0", "3026-02-05T00:00:00.000Z"),
    });

    IPPProxyManager.start();
    await pausedEventPromise;

    Assert.equal(
      IPPProxyManager.state,
      IPPProxyStates.PAUSED,
      "Should be PAUSED after activation with no bandwidth remaining"
    );

    // Refresh usage with available bandwidth to unpause the proxy.
    sandbox.restore();
    setupStubs(sandbox, {
      validProxyPass: true,
      proxyUsage: new ProxyUsage(
        "1000000",
        "500000",
        "3026-02-06T00:00:00.000Z"
      ),
    });

    const readyAfterRefresh = waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:StateChanged",
      () => IPPProxyManager.state === IPPProxyStates.READY
    );

    await IPPProxyManager.refreshUsage();
    await readyAfterRefresh;

    Assert.equal(
      IPPProxyManager.state,
      IPPProxyStates.READY,
      "Should be READY after refreshing usage with available bandwidth"
    );

    // Start again, should activate successfully
    const activeEventPromise = waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:StateChanged",
      () => IPPProxyManager.state === IPPProxyStates.ACTIVE
    );

    await IPPProxyManager.start();
    await activeEventPromise;

    Assert.equal(
      IPPProxyManager.state,
      IPPProxyStates.ACTIVE,
      "Should be ACTIVE after restarting with available bandwidth"
    );
    Assert.ok(IPPProxyManager.active, "Should have an active connection");

    IPProtectionService.uninit();
    sandbox.restore();
  }
);

add_task(
  async function test_IPPProxyManager_paused_on_rotation_with_zero_quota() {
    Services.fog.testResetFOG();
    IPPProxyManager.uninit();
    let sandbox = sinon.createSandbox();
    setupStubs(sandbox, {
      validProxyPass: true,
      proxyUsage: new ProxyUsage(
        "1000000",
        "500000",
        "3026-02-05T00:00:00.000Z"
      ),
    });

    const readyEvent = waitForEvent(
      IPProtectionService,
      "IPProtectionService:StateChanged",
      () => IPProtectionService.state === IPProtectionStates.READY
    );

    IPProtectionService.init();
    await readyEvent;

    const activeEventPromise = waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:StateChanged",
      () => IPPProxyManager.state === IPPProxyStates.ACTIVE
    );

    IPPProxyManager.start();
    await activeEventPromise;

    Assert.equal(
      IPPProxyManager.state,
      IPPProxyStates.ACTIVE,
      "Proxy should be active after initial start"
    );

    // Replace the Sandbox with a new one that now returns a zero quota to simulate quota exhaustion on rotation
    sandbox.restore();
    sandbox = sinon.createSandbox();
    setupStubs(sandbox, {
      validProxyPass: false,
      proxyUsage: new ProxyUsage("1000000", "0", "3026-02-05T00:00:00.000Z"),
    });

    const pausedEventPromise = waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:StateChanged",
      () => IPPProxyManager.state === IPPProxyStates.PAUSED
    );
    IPPProxyManager.rotateProxyPass();
    await pausedEventPromise;

    Assert.equal(
      IPPProxyManager.state,
      IPPProxyStates.PAUSED,
      "Proxy should be in PAUSED state when quota exhausted during rotation"
    );
    Assert.equal(
      IPPProxyManager.isolationKey,
      null,
      "Should not have an isolationKey when paused, as the connection is paused"
    );

    let pausedEvent = Glean.ipprotection.paused.testGetValue();
    Assert.equal(
      pausedEvent.length,
      1,
      "Should have recorded the paused event"
    );
    Assert.equal(
      pausedEvent[0].extra.wasActive,
      "true",
      "Previous state was active"
    );

    await IPPProxyManager.stop();
    Assert.equal(
      IPPProxyManager.state,
      IPPProxyStates.PAUSED,
      "Proxy should remain in the PAUSED state when stopping from PAUSED state"
    );

    IPProtectionService.uninit();
    sandbox.restore();
    Services.fog.testResetFOG();
  }
);

add_task(async function test_IPPProxyManager_rotateProxyPass_changes_pass() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox, { validProxyPass: true });

  const readyEvent = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();
  await readyEvent;

  const activeEventPromise = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE
  );

  IPPProxyManager.start();
  await activeEventPromise;

  sandbox.restore();
  sandbox = sinon.createSandbox();
  setupStubs(sandbox, { validProxyPass: false });

  const firstPass = await IPPProxyManager.rotateProxyPass();
  Assert.ok(firstPass, "First rotation should return a pass");
  Assert.ok(!firstPass.isValid(), "First pass should be invalid/expired");

  sandbox.restore();
  sandbox = sinon.createSandbox();
  setupStubs(sandbox, { validProxyPass: true });

  const secondPass = await IPPProxyManager.rotateProxyPass();
  Assert.ok(secondPass, "Second rotation should return a pass");
  Assert.ok(secondPass.isValid(), "Second pass should be valid");

  Assert.notEqual(
    firstPass.token,
    secondPass.token,
    "Pass tokens should be different after rotation"
  );
  Assert.ok(
    !firstPass.isValid() && secondPass.isValid(),
    "Pass validity should change from invalid to valid"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

add_task(async function test_IPPProxyManager_restores_cached_usage() {
  Services.prefs.setBoolPref("browser.ipProtection.cacheDisabled", false);

  const { ProxyUsage } = ChromeUtils.importESModule(
    "moz-src:///toolkit/components/ipprotection/GuardianClient.sys.mjs"
  );

  const cachedUsage = new ProxyUsage(
    "5000000000",
    "2500000000",
    "2026-03-01T00:00:00Z"
  );
  IPPStartupCache.storeUsageInfo(cachedUsage);

  const { IPPProxyManager } = ChromeUtils.importESModule(
    "moz-src:///toolkit/components/ipprotection/IPPProxyManager.sys.mjs"
  );
  IPPProxyManager.init();

  const loadedUsage = IPPProxyManager.usageInfo;
  Assert.notEqual(loadedUsage, null, "Manager loaded usage from cache");
  Assert.equal(
    loadedUsage.max.toString(),
    cachedUsage.max.toString(),
    "Cached max loaded correctly"
  );
  Assert.equal(
    loadedUsage.remaining.toString(),
    cachedUsage.remaining.toString(),
    "Cached remaining loaded correctly"
  );
  Assert.equal(
    loadedUsage.reset.toString(),
    cachedUsage.reset.toString(),
    "Cached reset loaded correctly"
  );

  Services.prefs.setBoolPref("browser.ipProtection.cacheDisabled", true);
  Services.prefs.clearUserPref("browser.ipProtection.usageCache");
  Services.prefs.clearUserPref("browser.ipProtection.stateCache");
  IPPProxyManager.uninit();
});

const refreshUsageTestCases = [
  {
    name: "paused -> paused",
    initialState: IPPProxyStates.PAUSED,
    initialUsage: new ProxyUsage("1000000", "0", "3026-02-05T00:00:00.000Z"),
    refreshedUsage: new ProxyUsage("1000000", "0", "3026-02-06T00:00:00.000Z"),
    expectedState: IPPProxyStates.PAUSED,
    expectedRemaining: BigInt("0"),
  },
  {
    name: "paused -> ready",
    initialState: IPPProxyStates.PAUSED,
    initialUsage: new ProxyUsage("1000000", "0", "3026-02-05T00:00:00.000Z"),
    refreshedUsage: new ProxyUsage(
      "1000000",
      "500000",
      "3026-02-06T00:00:00.000Z"
    ),
    expectedState: IPPProxyStates.READY,
    expectedRemaining: BigInt("500000"),
  },
  {
    name: "Active -> paused",
    initialState: IPPProxyStates.ACTIVE,
    initialUsage: new ProxyUsage(
      "1000000",
      "500000",
      "3026-02-05T00:00:00.000Z"
    ),
    refreshedUsage: new ProxyUsage("1000000", "0", "3026-02-06T00:00:00.000Z"),
    expectedState: IPPProxyStates.PAUSED,
    expectedRemaining: BigInt("0"),
  },
  {
    name: "Active -> active (connection still active)",
    initialState: IPPProxyStates.ACTIVE,
    initialUsage: new ProxyUsage(
      "1000000",
      "500000",
      "3026-02-05T00:00:00.000Z"
    ),
    refreshedUsage: new ProxyUsage(
      "1000000",
      "400000",
      "3026-02-06T00:00:00.000Z"
    ),
    expectedState: IPPProxyStates.ACTIVE,
    expectedRemaining: BigInt("400000"),
  },
];

refreshUsageTestCases.forEach(testCase => {
  add_task(
    async function test_IPPProxyManager_refreshUsage_state_transitions() {
      info(`Running test: ${testCase.name}`);
      IPPStartupCache.storeUsageInfo(testCase.initialUsage);
      let sandbox = sinon.createSandbox();
      setupStubs(sandbox, {
        validProxyPass: testCase.initialState === IPPProxyStates.READY,
        proxyUsage: testCase.initialUsage,
      });

      const readyEvent = waitForEvent(
        IPProtectionService,
        "IPProtectionService:StateChanged",
        () => IPProtectionService.state === IPProtectionStates.READY
      );

      IPProtectionService.init();
      await readyEvent;

      if (testCase.initialState === IPPProxyStates.ACTIVE) {
        const pausedEventPromise = waitForEvent(
          IPPProxyManager,
          "IPPProxyManager:StateChanged",
          () => IPPProxyManager.state === testCase.initialState
        );
        IPPProxyManager.start();
        await pausedEventPromise;
      }

      Assert.equal(
        IPPProxyManager.state,
        testCase.initialState,
        `Initial state should be ${testCase.initialState}`
      );

      sandbox.restore();
      sandbox = sinon.createSandbox();
      setupStubs(sandbox, {
        proxyUsage: testCase.refreshedUsage,
      });

      const stateChangePromise =
        testCase.initialState !== testCase.expectedState
          ? waitForEvent(
              IPPProxyManager,
              "IPPProxyManager:StateChanged",
              () => IPPProxyManager.state === testCase.expectedState
            )
          : Promise.resolve();

      await IPPProxyManager.refreshUsage();
      await stateChangePromise;

      Assert.equal(
        IPPProxyManager.state,
        testCase.expectedState,
        `${testCase.name}: Final state should be ${testCase.expectedState}`
      );
      Assert.equal(
        IPPProxyManager.usageInfo.remaining,
        testCase.expectedRemaining,
        `${testCase.name}: Usage remaining should be ${testCase.expectedRemaining}`
      );

      IPProtectionService.uninit();
      sandbox.restore();
    }
  );
});

add_task(async function test_scheduleCallback_basic() {
  const now = Temporal.Now.instant();
  const triggerTime = now.add({ milliseconds: 100 });
  const abortController = new AbortController();

  let callbackTriggered = false;
  const callback = () => {
    callbackTriggered = true;
  };

  const schedulePromise = scheduleCallback(
    callback,
    triggerTime,
    abortController.signal
  );

  await schedulePromise;

  Assert.ok(
    callbackTriggered,
    "Callback should be triggered after the timepoint"
  );
});

add_task(async function test_scheduleCallback_abort_before_trigger() {
  const now = Temporal.Now.instant();
  const triggerTime = now.add({ milliseconds: 200 });
  const abortController = new AbortController();

  let callbackTriggered = false;
  const callback = () => {
    callbackTriggered = true;
  };

  const schedulePromise = scheduleCallback(
    callback,
    triggerTime,
    abortController.signal
  );

  abortController.abort();

  await schedulePromise;

  Assert.ok(
    !callbackTriggered,
    "Callback should not be triggered if aborted before timepoint"
  );
});

add_task(async function test_scheduleCallback_abort_during_wait() {
  const now = Temporal.Now.instant();
  const triggerTime = now.add({ milliseconds: 500 });
  const abortController = new AbortController();

  let callbackTriggered = false;
  const callback = () => {
    callbackTriggered = true;
  };

  const schedulePromise = scheduleCallback(
    callback,
    triggerTime,
    abortController.signal
  );

  await new Promise(resolve => {
    do_timeout(100, resolve);
  });

  abortController.abort();

  await schedulePromise;

  Assert.ok(
    !callbackTriggered,
    "Callback should not be triggered if aborted during wait"
  );
});

add_task(async function test_scheduleCallback_timepoint_in_past() {
  const now = Temporal.Now.instant();
  const triggerTime = now.subtract({ milliseconds: 100 });
  const abortController = new AbortController();

  let callbackTriggered = false;
  const callback = () => {
    callbackTriggered = true;
  };

  const schedulePromise = scheduleCallback(
    callback,
    triggerTime,
    abortController.signal
  );

  await schedulePromise;

  Assert.ok(
    callbackTriggered,
    "Callback should be triggered immediately if timepoint is in the past"
  );
});

add_task(async function test_scheduleCallback_long_delay_clamping() {
  const sandbox = sinon.createSandbox();
  const maxSetTimeoutMs = 2147483647;

  const startTime = Temporal.Instant.fromEpochMilliseconds(0);
  const triggerTime = startTime.add({ milliseconds: maxSetTimeoutMs + 5000 });

  let currentTime = startTime;

  const setTimeoutStub = sandbox.stub();
  let timeoutResolvers = [];
  setTimeoutStub.callsFake((callback, ms) => {
    timeoutResolvers.push({ callback, ms });
    return timeoutResolvers.length - 1;
  });

  const clearTimeoutStub = sandbox.stub();

  const mockImports = {
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
    getNow: () => currentTime,
  };

  const abortController = new AbortController();
  let callbackTriggered = false;
  const callback = () => {
    callbackTriggered = true;
  };

  const schedulePromise = scheduleCallback(
    callback,
    triggerTime,
    abortController.signal,
    mockImports
  );

  await new Promise(resolve => do_timeout(0, resolve));

  Assert.ok(
    setTimeoutStub.calledOnce,
    "setTimeout should be called once initially"
  );
  Assert.equal(
    setTimeoutStub.firstCall.args[1],
    maxSetTimeoutMs,
    "First setTimeout should be clamped to max value"
  );

  currentTime = startTime.add({ milliseconds: maxSetTimeoutMs });
  timeoutResolvers[0].callback();

  // Yield again to allow scheduleCallback to process the timeout and loop back
  await new Promise(resolve => do_timeout(0, resolve));

  Assert.ok(
    setTimeoutStub.calledTwice,
    "setTimeout should be called again after first timeout"
  );
  Assert.equal(
    setTimeoutStub.secondCall.args[1],
    5000,
    "Second setTimeout should use remaining time"
  );

  currentTime = triggerTime;
  timeoutResolvers[1].callback();

  await schedulePromise;

  Assert.ok(callbackTriggered, "Callback should be triggered after all waits");

  sandbox.restore();
});

add_task(async function test_scheduleCallback_abort_stops_loop_promptly() {
  const sandbox = sinon.createSandbox();
  const maxSetTimeoutMs = 2147483647;

  const startTime = Temporal.Instant.fromEpochMilliseconds(0);
  const triggerTime = startTime.add({ milliseconds: maxSetTimeoutMs + 5000 });

  let currentTime = startTime;

  const setTimeoutStub = sandbox.stub();
  let timeoutResolvers = [];
  setTimeoutStub.callsFake((callback, ms) => {
    timeoutResolvers.push({ callback, ms });
    return timeoutResolvers.length - 1;
  });

  const clearTimeoutStub = sandbox.stub();

  const mockImports = {
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
    getNow: () => currentTime,
  };

  const abortController = new AbortController();
  let callbackTriggered = false;
  const callback = () => {
    callbackTriggered = true;
  };

  const schedulePromise = scheduleCallback(
    callback,
    triggerTime,
    abortController.signal,
    mockImports
  );

  await new Promise(resolve => do_timeout(0, resolve));

  Assert.ok(
    setTimeoutStub.calledOnce,
    "setTimeout should be called once initially"
  );

  // Abort the signal while the first timeout is still pending.
  abortController.abort();

  // The abort handler clears the first timeout and resolves the promise.
  // The loop should now exit promptly without scheduling another setTimeout.
  await new Promise(resolve => do_timeout(0, resolve));

  await schedulePromise;

  Assert.ok(!callbackTriggered, "Callback should not be triggered after abort");
  Assert.ok(
    clearTimeoutStub.calledOnce,
    "clearTimeout should be called once when the abort handler fires"
  );
  Assert.ok(
    setTimeoutStub.calledOnce,
    "setTimeout should only be called once - the loop should exit after abort " +
      "instead of scheduling another timeout"
  );

  sandbox.restore();
});

[401, 403, 407].forEach(httpStatus => {
  add_task(async function test_handleProxyErrorEvent_triggers_rotation() {
    info(`Running test for HTTP ${httpStatus} proxy error`);
    let sandbox = sinon.createSandbox();
    setupStubs(sandbox, { validProxyPass: true });

    const readyEvent = waitForEvent(
      IPProtectionService,
      "IPProtectionService:StateChanged",
      () => IPProtectionService.state === IPProtectionStates.READY
    );

    IPProtectionService.init();
    await readyEvent;

    const activeEvent = waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:StateChanged",
      () => IPPProxyManager.state === IPPProxyStates.ACTIVE
    );

    await IPPProxyManager.start();
    await activeEvent;

    const isolationKey = IPPProxyManager.isolationKey;

    sandbox.restore();
    sandbox = sinon.createSandbox();
    setupStubs(sandbox, { validProxyPass: true });

    const oldIsolationKey = IPPProxyManager.isolationKey;
    IPPProxyManager.handleProxyErrorEvent(
      new CustomEvent("proxy-http-error", {
        detail: { level: "error", isolationKey, httpStatus },
      })
    );

    await waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:UsageChanged",
      () => true
    );

    Assert.notEqual(
      IPPProxyManager.isolationKey,
      oldIsolationKey,
      `Isolation key should change after ${httpStatus} triggers rotation`
    );
    Assert.equal(
      IPPProxyManager.state,
      IPPProxyStates.ACTIVE,
      `Should remain active after ${httpStatus} rotation`
    );

    IPProtectionService.uninit();
    sandbox.restore();
  });
});

add_task(async function test_IPPProxyManager_start_forwards_country() {
  await IPPProxyManager.reset();
  await putServerInRemoteSettings();

  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  const getLocationSpy = sandbox.spy(IPProtectionServerlist, "getLocation");
  const getRecommendedSpy = sandbox.spy(
    IPProtectionServerlist,
    "getRecommendedLocation"
  );

  const readyEvent = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );
  IPProtectionService.init();
  await readyEvent;

  const activeEvent = waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE
  );
  await IPPProxyManager.start(true, false, "US");
  await activeEvent;

  Assert.ok(
    getLocationSpy.calledWith("US"),
    "getLocation should be called with the requested country code"
  );
  Assert.ok(
    getRecommendedSpy.notCalled,
    "getRecommendedLocation should not be called when a country is provided"
  );

  await IPPProxyManager.stop();
  IPProtectionService.uninit();
  sandbox.restore();
});

add_task(
  async function test_IPPProxyManager_start_without_country_uses_recommended() {
    await IPPProxyManager.reset();
    await putServerInRemoteSettings();

    let sandbox = sinon.createSandbox();
    setupStubs(sandbox);

    const getRecommendedSpy = sandbox.spy(
      IPProtectionServerlist,
      "getRecommendedLocation"
    );

    const readyEvent = waitForEvent(
      IPProtectionService,
      "IPProtectionService:StateChanged",
      () => IPProtectionService.state === IPProtectionStates.READY
    );
    IPProtectionService.init();
    await readyEvent;

    const activeEvent = waitForEvent(
      IPPProxyManager,
      "IPPProxyManager:StateChanged",
      () => IPPProxyManager.state === IPPProxyStates.ACTIVE
    );
    await IPPProxyManager.start(true, false);
    await activeEvent;

    Assert.ok(
      getRecommendedSpy.calledOnce,
      "Omitting the country should fall back to getRecommendedLocation"
    );

    await IPPProxyManager.stop();
    IPProtectionService.uninit();
    sandbox.restore();
  }
);
