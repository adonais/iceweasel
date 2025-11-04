/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPProtectionService, IPProtectionStates } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionService.sys.mjs"
);
const { IPPSignInWatcher } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPSignInWatcher.sys.mjs"
);

do_get_profile();

add_setup(async function () {
  await putServerInRemoteSettings();
  IPProtectionService.uninit();

  registerCleanupFunction(async () => {
    await IPProtectionService.init();
  });
});

/**
 * Tests the uninitialized state.
 */
add_task(async function test_IPProtectionStates_uninitialized() {
  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNINITIALIZED,
    "IP Protection service should not be initialized yet"
  );

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNAVAILABLE,
    "IP Protection service should be initialized"
  );

  IPProtectionService.uninit();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNINITIALIZED,
    "IP Protection service should not be uninitialized"
  );
});

/**
 * Tests the unavailable state.
 */
add_task(async function test_IPProtectionStates_uninitialized() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => false);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(false);

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNAVAILABLE,
    "IP Protection service should be unavailable"
  );

  sandbox.stub(IPProtectionService, "isEligible").get(() => true);

  await IPProtectionService.updateState();

  Assert.notStrictEqual(
    IPProtectionService.state,
    IPProtectionStates.UNAVAILABLE,
    "IP Protection service should be available"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests the unauthenticated state.
 */
add_task(async function test_IPProtectionStates_unauthenticated() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(false);

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNAVAILABLE,
    "IP Protection service should be unavailable"
  );

  sandbox.stub(IPProtectionService, "isEligible").get(() => true);

  await IPProtectionService.updateState();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.ENROLLING,
    "IP Protection service should no longer be unauthenticated"
  );

  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => false);

  await IPProtectionService.updateState();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNAUTHENTICATED,
    "IP Protection service should be unauthenticated"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests the enrolling state.
 */
add_task(async function test_IPProtectionStates_enrolling() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(false);
  sandbox.stub(IPProtectionService, "isEligible").get(() => true);
  sandbox.stub(IPProtectionService.guardian, "enroll").resolves({ ok: true });
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: null,
    entitlement: { uid: 42 },
  });

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.ENROLLING,
    "IP Protection service should be enrolling"
  );

  IPProtectionService.guardian.isLinkedToGuardian.resolves(true);

  await IPProtectionService.maybeEnroll();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should have enrolled and be ready"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests the ready state.
 */
add_task(async function test_IPProtectionStates_ready() {
  let sandbox = sinon.createSandbox();
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => true);
  sandbox
    .stub(IPProtectionService.guardian, "isLinkedToGuardian")
    .resolves(true);
  sandbox.stub(IPProtectionService.guardian, "fetchUserInfo").resolves({
    status: 200,
    error: null,
    entitlement: { uid: 42 },
  });

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be ready"
  );

  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => false);

  await IPProtectionService.updateState();

  Assert.notStrictEqual(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should not be ready"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests the active state.
 */
add_task(async function test_IPProtectionStates_active() {
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

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be ready"
  );

  await IPProtectionService.start(false);

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.ACTIVE,
    "IP Protection service should be active"
  );

  await IPProtectionService.stop(false);

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be ready again"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests the error state.
 */
add_task(async function test_IPProtectionStates_error() {
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
    status: 403,
  });

  await IPProtectionService.init();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "IP Protection service should be ready"
  );

  await IPProtectionService.start(false);

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.ERROR,
    "IP Protection service should be active"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});
