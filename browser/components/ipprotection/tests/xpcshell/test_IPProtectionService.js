/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
const { IPProtectionService, IPProtectionStates } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionService.sys.mjs"
);
const { IPPSignInWatcher } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs"
);
const { IPPEnrollAndEntitleManager } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPEnrollAndEntitleManager.sys.mjs"
);

do_get_profile();

AddonTestUtils.init(this);
AddonTestUtils.createAppInfo(
  "xpcshell@tests.mozilla.org",
  "XPCShell",
  "1",
  "1"
);

ExtensionTestUtils.init(this);

function setupStubs(
  sandbox,
  options = {
    signedIn: true,
    isLinkedToGuardian: true,
    validProxyPass: true,
    entitlement: {
      subscribed: false,
      uid: 42,
      created_at: "2023-01-01T12:00:00.000Z",
    },
  }
) {
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => options.signedIn);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(options.isLinkedToGuardian);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: null,
    entitlement: options.entitlement,
  });
  sandbox.stub(IPProtectionService.guardian, "enroll").resolves({
    status: 200,
    error: null,
  });
  sandbox.stub(IPProtectionService.guardian, "fetchProxyPass").resolves({
    status: 200,
    error: undefined,
    pass: {
      isValid: () => options.validProxyPass,
      asBearerToken: () => "Bearer helloworld",
    },
  });
}

add_setup(async function () {
  await putServerInRemoteSettings();
  IPProtectionService.uninit();

  registerCleanupFunction(async () => {
    await IPProtectionService.init();
  });
});

/**
 * Tests that starting the service gets a state changed event.
 */
add_task(async function test_IPProtectionService_start() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  IPProtectionService.init();

  await waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  Assert.ok(
    !IPProtectionService.activatedAt,
    "IP Protection service should not be active initially"
  );

  let startedEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.ACTIVE
  );

  IPProtectionService.start();

  await startedEventPromise;

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.ACTIVE,
    "IP Protection service should be active after starting"
  );
  Assert.ok(
    IPProtectionService.activatedAt,
    "IP Protection service should have an activation timestamp"
  );
  Assert.ok(
    IPProtectionService.proxyManager.active,
    "IP Protection service should have an active connection"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that stopping the service gets stop events.
 */
add_task(async function test_IPProtectionService_stop() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  const waitForReady = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.init();
  await waitForReady;

  await IPProtectionService.start();

  let stoppedEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state !== IPProtectionStates.ACTIVE
  );
  IPProtectionService.stop();

  await stoppedEventPromise;
  Assert.notEqual(
    IPProtectionService.state,
    IPProtectionStates.ACTIVE,
    "IP Protection service should not be active after stopping"
  );
  Assert.ok(
    !IPProtectionService.activatedAt,
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
 * Tests that a signed in status sends a status changed event.
 */
add_task(async function test_IPProtectionService_updateState_signedIn() {
  let sandbox = sinon.createSandbox();
  sandbox
    .stub(IPPEnrollAndEntitleManager, "isEnrolledAndEntitled")
    .get(() => true);

  await IPProtectionService.init();

  setupStubs(sandbox);

  let signedInEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.READY
  );

  IPProtectionService.updateState();

  await signedInEventPromise;

  Assert.ok(IPPSignInWatcher.isSignedIn, "Should be signed in after update");

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that any other status sends a changed event event.
 */
add_task(async function test_IPProtectionService_updateState_signedOut() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  await IPProtectionService.init();

  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => false);

  let signedOutEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.UNAVAILABLE
  );

  IPProtectionService.updateState();

  await signedOutEventPromise;

  Assert.ok(
    !IPPSignInWatcher.isSignedIn,
    "Should not be signed in after update"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that refetchEntitlement works as expected if a linked VPN is found and sends an event.
 */
add_task(
  async function test_IPProtectionService_refetchEntitlement_has_vpn_linked() {
    const sandbox = sinon.createSandbox();
    setupStubs(sandbox);

    const waitForReady = waitForEvent(
      IPProtectionService,
      "IPProtectionService:StateChanged",
      () => IPProtectionService.state === IPProtectionStates.READY
    );

    IPProtectionService.init();
    await waitForReady;

    IPProtectionService.guardian.fetchUserInfo.resolves({
      status: 200,
      error: null,
      entitlement: {
        subscribed: true,
        uid: 42,
        created_at: "2023-01-01T12:00:00.000Z",
      },
    });

    let hasUpgradedEventPromise = waitForEvent(
      IPPEnrollAndEntitleManager,
      "IPPEnrollAndEntitleManager:StateChanged",
      () => IPPEnrollAndEntitleManager.hasUpgraded
    );

    await IPPEnrollAndEntitleManager.refetchEntitlement();

    await hasUpgradedEventPromise;

    Assert.ok(
      IPPEnrollAndEntitleManager.hasUpgraded,
      "hasUpgraded should be true"
    );

    IPProtectionService.uninit();
    sandbox.restore();
  }
);

/**
 * Tests that refetchEntitlement returns errors if no linked VPN is found and
 * sends an event.
 */
add_task(
  async function test_IPProtectionService_refetchEntitlement_no_vpn_linked() {
    const sandbox = sinon.createSandbox();
    setupStubs(sandbox);

    await IPProtectionService.init();

    IPProtectionService.guardian.fetchUserInfo.resolves({
      status: 404,
      error: "invalid_response",
      validEntitlement: false,
    });

    let hasUpgradedEventPromise = waitForEvent(
      IPPEnrollAndEntitleManager,
      "IPPEnrollAndEntitleManager:StateChanged"
    );

    await IPPEnrollAndEntitleManager.refetchEntitlement();

    await hasUpgradedEventPromise;

    Assert.ok(
      !IPPEnrollAndEntitleManager.hasUpgraded,
      "hasUpgraded should be false"
    );

    IPProtectionService.uninit();
    sandbox.restore();
  }
);

/**
 * Tests that signing off generates a reset of the entitlement and the sending
 * of an event.
 */
add_task(async function test_IPProtectionService_hasUpgraded_signed_out() {
  let sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  await IPProtectionService.init();

  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => false);

  let signedOutEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged"
  );
  IPProtectionService.updateState();

  await signedOutEventPromise;

  Assert.ok(
    !IPPEnrollAndEntitleManager.hasUpgraded,
    "hasUpgraded should be false in after signing out"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});
