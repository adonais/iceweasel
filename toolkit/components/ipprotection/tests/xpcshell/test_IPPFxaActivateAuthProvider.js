/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { IPPFxaActivateAuthProvider, IPPFxaActivateAuthProviderSingleton } =
  ChromeUtils.importESModule(
    "moz-src:///toolkit/components/ipprotection/fxa/IPPFxaActivateAuthProvider.sys.mjs"
  );
const { IPPSignInWatcher } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/ipprotection/fxa/IPPSignInWatcher.sys.mjs"
);

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
  IPProtectionActivator.setAuthProvider(IPPFxaActivateAuthProvider);
  await putServerInRemoteSettings();
  IPProtectionService.uninit();

  registerCleanupFunction(async () => {
    IPProtectionActivator.setAuthProvider(IPPDummyAuthProvider);
    await IPProtectionService.init();
  });
});

/**
 * Opt-in for tests that need the real IPPFxaActivateAuthProvider as the
 * registered provider (e.g. tests exercising enrollment, entitlement update via
 * Guardian, or FxA-specific state transitions). Mirrors `setupStubs` but targets
 * the FxA singleton instead of the dummy.
 *
 * @param {object} sandbox - sinon sandbox used to install (and later restore)
 *   the stubs.
 * @param {object} [aOptions] - same shape as defaultStubOptions.
 */
function useFxaAuthProvider(
  sandbox,
  aOptions = {
    ...defaultStubOptions,
  }
) {
  IPProtectionActivator.setAuthProvider(IPPFxaActivateAuthProvider);
  const options = { ...defaultStubOptions, ...aOptions };
  sandbox.stub(IPPSignInWatcher, "isSignedIn").get(() => options.signedIn);
  sandbox
    .stub(IPPFxaActivateAuthProvider, "getEntitlement")
    .resolves({ entitlement: options.entitlement });
  sandbox.stub(IPPFxaActivateAuthProvider, "fetchProxyPass").resolves({
    status: 200,
    error: undefined,
    pass: new ProxyPass(
      options.validProxyPass
        ? createProxyPassToken()
        : createExpiredProxyPassToken()
    ),
    usage: options.proxyUsage,
  });
  sandbox
    .stub(IPPFxaActivateAuthProvider, "fetchProxyUsage")
    .resolves(options.proxyUsage);
}

function makeProvider(sandbox) {
  const provider = new IPPFxaActivateAuthProviderSingleton();
  const removeToken = sandbox.spy();
  sandbox.stub(provider, "getToken").resolves({
    token: "fake-token",
    [Symbol.dispose]: removeToken,
  });
  return { provider, removeToken };
}

// Bug 2036792
for (const method of ["fetchProxyPass", "fetchProxyUsage"]) {
  add_task(async function test_removes_token_after_guardian_resolves() {
    const sandbox = sinon.createSandbox();
    const { provider, removeToken } = makeProvider(sandbox);

    let resolveGuardian;
    sandbox
      .stub(provider.guardian, method)
      .returns(new Promise(r => (resolveGuardian = r)));

    const fetchPromise = provider[method]();
    await Promise.resolve();
    await Promise.resolve();

    Assert.ok(
      !removeToken.called,
      `${method}: token not removed while guardian is pending`
    );

    resolveGuardian({ status: 200 });
    await fetchPromise;

    Assert.ok(
      removeToken.calledOnce,
      `${method}: token removed after guardian resolves`
    );

    sandbox.restore();
  });
}

/**
 * Tests that updateEntitlement refreshes usage when an entitlement is found.
 */
add_task(
  async function test_IPProtectionService_updateEntitlement_refreshes_usage() {
    const sandbox = sinon.createSandbox();
    useFxaAuthProvider(sandbox);

    IPProtectionService.init();
    // Drop to a non-READY baseline so updateEntitlement drives the transition
    // into READY, which is what triggers a usage refresh.
    IPPFxaActivateAuthProvider._setEntitlement(null);
    IPProtectionService.updateState();

    const refreshUsageStub = sandbox.stub(IPPProxyManager, "refreshUsage");

    await IPPFxaActivateAuthProvider.updateEntitlement();

    Assert.ok(
      IPPFxaActivateAuthProvider.entitlement,
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
 * Tests that updateEntitlement preserves a cached entitlement on failures.
 */
add_task(
  async function test_updateEntitlement_preserves_entitlement_on_error() {
    const sandbox = sinon.createSandbox();
    useFxaAuthProvider(sandbox);

    await IPProtectionService.init();

    const cachedEntitlement = createTestEntitlement({ subscribed: true });
    IPPFxaActivateAuthProvider.getEntitlement.resolves({
      entitlement: cachedEntitlement,
    });
    await IPPFxaActivateAuthProvider.updateEntitlement();

    Assert.equal(
      IPPFxaActivateAuthProvider.entitlement,
      cachedEntitlement,
      "Cached entitlement should be set before the failing refresh"
    );

    IPPFxaActivateAuthProvider.getEntitlement.resolves({
      error: "network_error",
    });

    await IPPFxaActivateAuthProvider.updateEntitlement();

    Assert.equal(
      IPPFxaActivateAuthProvider.entitlement,
      cachedEntitlement,
      "Cached entitlement should be preserved when refresh fails"
    );

    IPProtectionService.uninit();
    sandbox.restore();
  }
);

/**
 * Tests that updateEntitlement clears the cached entitlement when Guardian
 * sends no entitlement.
 */
add_task(async function test_updateEntitlement_clears_cached_entitlement() {
  const sandbox = sinon.createSandbox();
  useFxaAuthProvider(sandbox);

  await IPProtectionService.init();

  const cachedEntitlement = createTestEntitlement({ subscribed: true });
  IPPFxaActivateAuthProvider.getEntitlement.resolves({
    entitlement: cachedEntitlement,
  });
  await IPPFxaActivateAuthProvider.updateEntitlement();

  Assert.ok(
    IPPFxaActivateAuthProvider.entitlement,
    "Cached entitlement should be set before the no-entitlement refresh"
  );

  IPPFxaActivateAuthProvider.getEntitlement.resolves({ entitlement: null });

  await IPPFxaActivateAuthProvider.updateEntitlement();

  Assert.equal(
    IPPFxaActivateAuthProvider.entitlement,
    null,
    "Cached entitlement should be cleared when the server confirms no entitlement"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that checkForUpgrade sets the entitlement and dispatches an event when
 * Guardian reports a linked VPN.
 */
add_task(
  async function test_IPProtectionService_checkForUpgrade_has_vpn_linked() {
    const sandbox = sinon.createSandbox();
    useFxaAuthProvider(sandbox);

    await IPProtectionService.init();
    IPPFxaActivateAuthProvider._setEntitlement(null);

    sandbox.stub(IPPFxaActivateAuthProvider, "getToken").resolves({
      token: "fake-token",
      [Symbol.dispose]() {},
    });
    sandbox
      .stub(IPPFxaActivateAuthProvider.guardian, "fetchUserInfo")
      .resolves({
        status: 200,
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
 * Tests that checkForUpgrade leaves the entitlement untouched when Guardian
 * reports no linked VPN.
 */
add_task(
  async function test_IPProtectionService_checkForUpgrade_no_vpn_linked() {
    const sandbox = sinon.createSandbox();
    useFxaAuthProvider(sandbox);

    await IPProtectionService.init();
    IPPFxaActivateAuthProvider._setEntitlement(null);

    sandbox.stub(IPPFxaActivateAuthProvider, "getToken").resolves({
      token: "fake-token",
      [Symbol.dispose]() {},
    });
    sandbox
      .stub(IPPFxaActivateAuthProvider.guardian, "fetchUserInfo")
      .resolves({ status: 200, error: "invalid_response" });

    await IPProtectionService.authProvider.checkForUpgrade();

    Assert.ok(
      !IPProtectionService.authProvider.hasUpgraded,
      "hasUpgraded should be false"
    );
    Assert.equal(
      IPPFxaActivateAuthProvider.entitlement,
      null,
      "Entitlement should remain unset when no VPN is linked"
    );

    IPProtectionService.uninit();
    sandbox.restore();
  }
);

/**
 * Tests that enroll stores the entitlement returned by Guardian's activate
 * endpoint.
 */
add_task(async function test_enroll_success() {
  const sandbox = sinon.createSandbox();
  useFxaAuthProvider(sandbox);

  await IPProtectionService.init();
  IPPFxaActivateAuthProvider._setEntitlement(null);

  sandbox.stub(IPPFxaActivateAuthProvider, "getToken").resolves({
    token: "fake-token",
    [Symbol.dispose]() {},
  });
  const entitlement = createTestEntitlement({ subscribed: true });
  sandbox
    .stub(IPPFxaActivateAuthProvider.guardian, "activate")
    .resolves({ ok: true, entitlement });

  const result = await IPPFxaActivateAuthProvider.enroll();

  Assert.ok(result.isEnrolledAndEntitled, "enroll should report success");
  Assert.equal(
    IPPFxaActivateAuthProvider.entitlement,
    entitlement,
    "Entitlement should be set after a successful enroll"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that a failed activation surfaces the error and leaves the user
 * unentitled.
 */
add_task(async function test_enroll_failure() {
  const sandbox = sinon.createSandbox();
  useFxaAuthProvider(sandbox);

  await IPProtectionService.init();
  IPPFxaActivateAuthProvider._setEntitlement(null);

  sandbox.stub(IPPFxaActivateAuthProvider, "getToken").resolves({
    token: "fake-token",
    [Symbol.dispose]() {},
  });
  sandbox
    .stub(IPPFxaActivateAuthProvider.guardian, "activate")
    .resolves({ ok: false, error: "login_needed" });

  const result = await IPPFxaActivateAuthProvider.enroll();

  Assert.ok(
    !result.isEnrolledAndEntitled,
    "enroll should report failure when activate fails"
  );
  Assert.equal(result.error, "login_needed", "enroll should surface the error");
  Assert.equal(
    IPPFxaActivateAuthProvider.entitlement,
    null,
    "Entitlement should remain unset after a failed enroll"
  );

  IPProtectionService.uninit();
  sandbox.restore();
});

/**
 * Tests that isEnrolling is true while enroll is in progress and false once it
 * completes.
 */
add_task(async function test_isEnrolling_during_enroll() {
  const sandbox = sinon.createSandbox();
  useFxaAuthProvider(sandbox);

  await IPProtectionService.init();
  IPPFxaActivateAuthProvider._setEntitlement(null);

  sandbox.stub(IPPFxaActivateAuthProvider, "getToken").resolves({
    token: "fake-token",
    [Symbol.dispose]() {},
  });

  let resolveActivate;
  // Slow down the activate call so that we can observe isEnrolling. The promise
  // only resolves when we call resolveActivate().
  sandbox
    .stub(IPPFxaActivateAuthProvider.guardian, "activate")
    .returns(new Promise(resolve => (resolveActivate = resolve)));

  Assert.ok(
    !IPPFxaActivateAuthProvider.isEnrolling,
    "isEnrolling should be false before enroll"
  );

  let enrollPromise = IPPFxaActivateAuthProvider.enroll();

  Assert.ok(
    IPPFxaActivateAuthProvider.isEnrolling,
    "isEnrolling should be true while enroll is in progress"
  );

  resolveActivate({ ok: true, entitlement: createTestEntitlement() });
  await enrollPromise;

  Assert.ok(
    !IPPFxaActivateAuthProvider.isEnrolling,
    "isEnrolling should be false after enroll completes"
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
    IPPFxaActivateAuthProvider.guardian.guardianEndpoint,
    "https://vpn.mozilla.org/",
    "Guardian should have default endpoint"
  );

  Services.prefs.setCharPref(
    "browser.ipProtection.guardian.endpoint",
    "https://test.example.com/"
  );

  Assert.equal(
    IPPFxaActivateAuthProvider.guardian.guardianEndpoint,
    "https://test.example.com/",
    "Guardian should reflect updated endpoint after pref change"
  );

  IPProtectionService.uninit();
  Services.prefs.clearUserPref("browser.ipProtection.guardian.endpoint");
});
