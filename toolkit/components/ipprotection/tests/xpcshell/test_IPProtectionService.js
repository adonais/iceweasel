/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
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

add_setup(async function () {
  await putServerInRemoteSettings();
  IPProtectionService.uninit();

  registerCleanupFunction(async () => {
    await IPProtectionService.init();
  });
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
  sandbox
    .stub(IPPEnrollAndEntitleManager, "isEnrolledAndEntitled")
    .get(() => true);

  await IPProtectionService.init();

  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => false);

  let signedOutEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    () => IPProtectionService.state === IPProtectionStates.UNAUTHENTICATED
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
 * Tests that updateEntitlement refreshes usage when an entitlement is found.
 */
add_task(
  async function test_IPProtectionService_updateEntitlement_refreshes_usage() {
    const sandbox = sinon.createSandbox();
    setupStubs(sandbox);

    IPProtectionService.init();
    IPPEnrollAndEntitleManager.resetEntitlement();

    const refreshUsageStub = sandbox.stub(IPPProxyManager, "refreshUsage");

    await IPPEnrollAndEntitleManager.updateEntitlement();

    Assert.ok(
      IPPEnrollAndEntitleManager.isEnrolledAndEntitled,
      "Should be entitled after updateEntitlement"
    );

    Assert.ok(
      refreshUsageStub.calledOnce,
      "refreshUsage should be called when entitlement is found"
    );

    IPProtectionService.uninit();
    sandbox.restore();
  }
);

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
    await IPPEnrollAndEntitleManager.maybeEnrollAndEntitle();
    IPProtectionService.updateState();

    await waitForReady;

    IPProtectionService.guardian.fetchUserInfo.resolves({
      status: 200,
      error: null,
      entitlement: createTestEntitlement({ subscribed: true }),
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
    await IPPEnrollAndEntitleManager.maybeEnrollAndEntitle();
    IPProtectionService.updateState();

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
  await IPPEnrollAndEntitleManager.maybeEnrollAndEntitle();
  IPProtectionService.updateState();

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

/**
 * Tests that changing the guardian endpoint preference and reinitializing
 * the service correctly updates the guardian's endpoint configuration.
 */
add_task(async function test_guardian_endpoint_updates_on_reinit() {
  await IPProtectionService.init();

  let guardian1 = IPProtectionService.guardian;
  Assert.equal(
    guardian1.guardianEndpoint,
    "https://vpn.mozilla.org/",
    "Initial guardian should have default endpoint"
  );

  Services.prefs.setCharPref(
    "browser.ipProtection.guardian.endpoint",
    "https://test.example.com/"
  );

  IPProtectionService.uninit();
  await IPProtectionService.init();

  let guardian2 = IPProtectionService.guardian;
  Assert.equal(
    guardian2.guardianEndpoint,
    "https://test.example.com/",
    "Guardian should have updated endpoint after reinit"
  );

  Assert.notStrictEqual(
    guardian1,
    guardian2,
    "Guardian instances should be different after reinit"
  );

  IPProtectionService.uninit();
  Services.prefs.clearUserPref("browser.ipProtection.guardian.endpoint");
});

/**
 * Tests that isCheckingEntitlement is true while updateEntitlement is in
 * progress and false once it completes.
 */
add_task(async function test_isCheckingEntitlement_during_updateEntitlement() {
  const sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  await IPProtectionService.init();

  let resolveEntitlement;
  // Slow down fetching entitlement info so that we can properly test
  // isCheckingEntitlement. The promise only resolves when we call resolveEntitlement().
  IPProtectionService.guardian.fetchUserInfo.returns(
    new Promise(resolve => {
      resolveEntitlement = resolve;
    })
  );

  Assert.ok(
    !IPPEnrollAndEntitleManager.isCheckingEntitlement,
    "isCheckingEntitlement should be false before updateEntitlement"
  );

  let updatePromise = IPPEnrollAndEntitleManager.updateEntitlement(true);

  Assert.ok(
    IPPEnrollAndEntitleManager.isCheckingEntitlement,
    "isCheckingEntitlement should be true while updateEntitlement is in progress"
  );

  resolveEntitlement({
    status: 200,
    error: null,
    entitlement: createTestEntitlement(),
  });
  await updatePromise;

  Assert.ok(
    !IPPEnrollAndEntitleManager.isCheckingEntitlement,
    "isCheckingEntitlement should be false after updateEntitlement completes"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that StateChanged fires after updateEntitlement even when entitlement
 * is already cached.
 */
add_task(
  async function test_updateEntitlement_fires_StateChanged_when_cached() {
    const sandbox = sinon.createSandbox();
    setupStubs(sandbox);

    await IPProtectionService.init();
    await IPPEnrollAndEntitleManager.updateEntitlement();

    let stateChangedFired = false;
    IPPEnrollAndEntitleManager.addEventListener(
      "IPPEnrollAndEntitleManager:StateChanged",
      () => {
        stateChangedFired = true;
      },
      { once: true }
    );

    await IPPEnrollAndEntitleManager.updateEntitlement();

    Assert.ok(
      stateChangedFired,
      "StateChanged should fire even when entitlement is already cached"
    );

    IPProtectionService.uninit();
    sandbox.restore();
  }
);

/**
 * Tests that isEnrolling is true while maybeEnrollAndEntitle is in progress and
 * false once it completes.
 */
add_task(async function test_isEnrolling_during_maybeEnrollAndEntitle() {
  const sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  await IPProtectionService.init();

  let resolveEnroll;
  // Slow down enrolling step info so that we can properly test
  // isEnrolling. The promise only resolves when we call resolveEnroll().
  IPProtectionService.guardian.enrollWithFxa.returns(
    new Promise(resolve => {
      resolveEnroll = resolve;
    })
  );

  Assert.ok(
    !IPPEnrollAndEntitleManager.isEnrolling,
    "isEnrolling should be false before maybeEnrollAndEntitle"
  );

  let enrollPromise = IPPEnrollAndEntitleManager.maybeEnrollAndEntitle();

  Assert.ok(
    IPPEnrollAndEntitleManager.isEnrolling,
    "isEnrolling should be true while maybeEnrollAndEntitle is in progress"
  );

  let stateChangedFired = false;
  IPPEnrollAndEntitleManager.addEventListener(
    "IPPEnrollAndEntitleManager:StateChanged",
    () => {
      stateChangedFired = true;
    },
    { once: true }
  );

  resolveEnroll({ status: 200, error: null, ok: true });
  await enrollPromise;

  Assert.ok(
    !IPPEnrollAndEntitleManager.isEnrolling,
    "isEnrolling should be false after maybeEnrollAndEntitle completes"
  );
  Assert.ok(
    stateChangedFired,
    "StateChanged should fire after maybeEnrollAndEntitle completes"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});
