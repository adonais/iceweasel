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
    .stub(IPPFxaAuthProvider, "entitlement")
    .get(() => createTestEntitlement());

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
    .stub(IPPFxaAuthProvider, "entitlement")
    .get(() => createTestEntitlement());

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
    IPPFxaAuthProvider.resetEntitlement();

    const refreshUsageStub = sandbox.stub(IPPProxyManager, "refreshUsage");

    await IPPFxaAuthProvider.updateEntitlement();

    Assert.ok(
      IPPFxaAuthProvider.entitlement,
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
 * Tests that checkForUpgrade works as expected if a linked VPN is found and sends an event.
 */
add_task(
  async function test_IPProtectionService_checkForUpgrade_has_vpn_linked() {
    const sandbox = sinon.createSandbox();
    setupStubs(sandbox);

    const waitForReady = waitForEvent(
      IPProtectionService,
      "IPProtectionService:StateChanged",
      () => IPProtectionService.state === IPProtectionStates.READY
    );

    IPProtectionService.init();
    await IPPFxaAuthProvider.enroll();
    IPProtectionService.updateState();

    await waitForReady;

    IPPFxaAuthProvider.getEntitlement.resolves({
      entitlement: createTestEntitlement({ subscribed: true }),
    });

    let hasUpgradedEventPromise = waitForEvent(
      IPProtectionService.authProvider,
      "IPPAuthProvider:StateChanged",
      () => IPProtectionService.authProvider.hasUpgraded
    );

    await IPProtectionService.authProvider.checkForUpgrade();

    await hasUpgradedEventPromise;

    Assert.ok(
      IPProtectionService.authProvider.hasUpgraded,
      "hasUpgraded should be true"
    );

    IPProtectionService.uninit();
    sandbox.restore();
  }
);

/**
 * Tests that checkForUpgrade returns errors if no linked VPN is found and
 * sends an event.
 */
add_task(
  async function test_IPProtectionService_checkForUpgrade_no_vpn_linked() {
    const sandbox = sinon.createSandbox();
    setupStubs(sandbox);

    await IPProtectionService.init();
    await IPPFxaAuthProvider.enroll();
    IPProtectionService.updateState();

    IPPFxaAuthProvider.getEntitlement.resolves({ error: "invalid_response" });

    let hasUpgradedEventPromise = waitForEvent(
      IPProtectionService.authProvider,
      "IPPAuthProvider:StateChanged"
    );

    await IPProtectionService.authProvider.checkForUpgrade();

    await hasUpgradedEventPromise;

    Assert.ok(
      !IPProtectionService.authProvider.hasUpgraded,
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
  await IPPFxaAuthProvider.enroll();
  IPProtectionService.updateState();

  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => false);

  let signedOutEventPromise = waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged"
  );
  IPProtectionService.updateState();

  await signedOutEventPromise;

  Assert.ok(
    !IPProtectionService.authProvider.hasUpgraded,
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

  Assert.equal(
    IPPFxaAuthProvider.guardian.guardianEndpoint,
    "https://vpn.mozilla.org/",
    "Guardian should have default endpoint"
  );

  Services.prefs.setCharPref(
    "browser.ipProtection.guardian.endpoint",
    "https://test.example.com/"
  );

  Assert.equal(
    IPPFxaAuthProvider.guardian.guardianEndpoint,
    "https://test.example.com/",
    "Guardian should reflect updated endpoint after pref change"
  );

  IPProtectionService.uninit();
  Services.prefs.clearUserPref("browser.ipProtection.guardian.endpoint");
});

/**
 * Tests that isEnrolling is true while updateEntitlement is in
 * progress and false once it completes.
 */
add_task(async function test_isEnrolling_during_updateEntitlement() {
  const sandbox = sinon.createSandbox();
  setupStubs(sandbox);

  await IPProtectionService.init();

  let resolveEntitlement;
  // Slow down fetching entitlement info so that we can properly test
  // isEnrolling. The promise only resolves when we call resolveEntitlement().
  IPPFxaAuthProvider.getEntitlement.returns(
    new Promise(resolve => {
      resolveEntitlement = resolve;
    })
  );

  Assert.ok(
    !IPProtectionService.authProvider.isEnrolling,
    "isEnrolling should be false before updateEntitlement"
  );

  let updatePromise = IPPFxaAuthProvider.updateEntitlement(true);

  Assert.ok(
    IPProtectionService.authProvider.isEnrolling,
    "isEnrolling should be true while updateEntitlement is in progress"
  );

  resolveEntitlement({ entitlement: createTestEntitlement() });
  await updatePromise;

  Assert.ok(
    !IPProtectionService.authProvider.isEnrolling,
    "isEnrolling should be false after updateEntitlement completes"
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
    await IPPFxaAuthProvider.updateEntitlement();

    let stateChangedFired = false;
    IPProtectionService.authProvider.addEventListener(
      "IPPAuthProvider:StateChanged",
      () => {
        stateChangedFired = true;
      },
      { once: true }
    );

    await IPPFxaAuthProvider.updateEntitlement();

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

  // initOnStartupCompleted() runs updateEntitlement() which sets the
  // entitlement via the stubbed getEntitlement(). Reset it so that enroll()
  // takes the slow path and isEnrolling stays true while in progress.
  IPPFxaAuthProvider.resetEntitlement();

  let resolveEnroll;
  // Slow down enrolling step info so that we can properly test
  // isEnrolling. The promise only resolves when we call resolveEnroll().
  IPPFxaAuthProvider.enrollAndEntitle.returns(
    new Promise(resolve => {
      resolveEnroll = resolve;
    })
  );

  Assert.ok(
    !IPPFxaAuthProvider.isEnrolling,
    "isEnrolling should be false before maybeEnrollAndEntitle"
  );

  let enrollPromise = IPPFxaAuthProvider.enroll();

  Assert.ok(
    IPPFxaAuthProvider.isEnrolling,
    "isEnrolling should be true while maybeEnrollAndEntitle is in progress"
  );

  let stateChangedFired = false;
  IPProtectionService.authProvider.addEventListener(
    "IPPAuthProvider:StateChanged",
    () => {
      stateChangedFired = true;
    },
    { once: true }
  );

  resolveEnroll({ isEnrolledAndEntitled: true });
  await enrollPromise;

  Assert.ok(
    !IPPFxaAuthProvider.isEnrolling,
    "isEnrolling should be false after maybeEnrollAndEntitle completes"
  );
  Assert.ok(
    stateChangedFired,
    "StateChanged should fire after maybeEnrollAndEntitle completes"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});
