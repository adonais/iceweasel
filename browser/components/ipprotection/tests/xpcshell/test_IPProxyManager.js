/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPEnrollAndEntitleManager } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPEnrollAndEntitleManager.sys.mjs"
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

  IPProtectionService.init();

  await waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

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
    pass: {
      isValid: () => true,
      asBearerToken: () => "Bearer hello world",
    },
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

  Assert.ok(!IPPProxyManager.active, "Should not be active after starting");

  Assert.ok(
    !IPPProxyManager.isolationKey,
    "Should not have an isolationKey after stopping"
  );

  Assert.ok(
    !IPPProxyManager.hasValidProxyPass,
    "Should not have a proxy pass after stopping"
  );

  sandbox.restore();
});

/**
 * Tests the error state.
 */
add_task(async function test_IPPProxyStates_error() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: undefined,
    entitlement: { uid: 42 },
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
    IPPProxyStates.ERROR,
    "IP Protection service should be active"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests the active state.
 */
add_task(async function test_IPPProxytates_active() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: undefined,
    entitlement: { uid: 42 },
  });
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 200,
    error: undefined,
    pass: {
      isValid: () => options.validProxyPass,
      asBearerToken: () => "Bearer helloworld",
    },
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
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: undefined,
    entitlement: { uid: 42 },
  });
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 200,
    error: undefined,
    pass: {
      isValid: () => options.validProxyPass,
      asBearerToken: () => "Bearer helloworld",
    },
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

  await waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE
  );

  await waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    () => IPPProxyManager.state === IPPProxyStates.READY
  );

  IPProtectionService.uninit();
  sandbox.restore();
});
