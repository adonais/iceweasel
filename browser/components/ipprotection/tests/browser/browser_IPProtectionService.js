/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { ASRouter } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouter.sys.mjs"
);

const { ERRORS } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);

const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

AddonTestUtils.initMochitest(this);

// Don't add an experiment so we can test adding and removing it.
DEFAULT_EXPERIMENT = null;

/**
 * Tests getting eligibility from a Nimbus experiment and
 * creating and destroying the widget.
 */
add_task(async function test_IPProtectionService_updateEligibility() {
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });
  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.UNAUTHENTICATED,
    "Should be in the experiment"
  );
  let buttonOn = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(buttonOn),
    "IP Protection widget should be added to the navbar"
  );
  await cleanupAlpha();

  let cleanupControl = await setupExperiment({
    enabled: true,
    variant: "control",
  });
  Assert.notStrictEqual(
    IPProtectionService.state,
    IPProtectionStates.UNAUTHENTICATED,
    "Should not be in the experiment"
  );
  let buttonOff = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    !buttonOff,
    "IP Protection widget should not be added to the navbar"
  );
  await cleanupControl();
});

/**
 * Tests a user who was previously enrolled will be shown the widget.
 */
add_task(async function test_IPProtectionService_updateEnrollment() {
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.enabled", true]],
  });

  // isEnrolledAndEntitled is async so wait for widget.
  await waitForWidgetAdded();

  let button = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(button),
    "IP Protection widget should be added to the navbar"
  );

  cleanupService();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests a user in the experiment can enroll with Guardian on opening the panel.
 */
add_task(async function test_IPProtectionService_enroll() {
  setupService({
    isEnrolledAndEntitled: false,
    canEnroll: true,
  });

  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await waitForWidgetAdded();

  setupService({
    isSignedIn: true,
  });

  IPProtectionService.updateState();
  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "User should now be enrolling"
  );

  setupService({
    isEnrolledAndEntitled: true,
  });
  await openPanel();
  await IPProtectionService.enrolling;

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "User should now be enrolled"
  );

  cleanupService();
  await cleanupAlpha();
});

/**
 * Tests a user who has signed in is enrolled when enrolled in the experiment.
 * This state is only likely when testing the experiment.
 */
add_task(
  async function test_IPProtectionService_enroll_when_enrolled_in_experiment() {
    setupService({
      isEnrolledAndEntitled: false,
      isSignedIn: true,
      canEnroll: true,
    });

    let cleanupAlpha = await setupExperiment({
      enabled: true,
      variant: "alpha",
    });

    await waitForWidgetAdded();

    setupService({
      isEnrolledAndEntitled: true,
    });
    let content = await openPanel();

    await IPProtectionService.enrolling;

    Assert.equal(
      IPProtectionService.state,
      IPProtectionStates.READY,
      "User should now be enrolled"
    );

    let statusCard = content.statusCardEl;

    // User is already signed in so the toggle should be available.
    Assert.ok(
      statusCard?.connectionToggleEl,
      "Status card connection toggle should be present"
    );

    cleanupService();
    await cleanupAlpha();
  }
);

/**
 *  Tests the entitlement updates when in the experiment.
 */
add_task(
  async function test_IPProtectionService_updateEntitlement_in_experiment() {
    setupService({
      isEnrolledAndEntitled: false,
      isSignedIn: true,
      canEnroll: true,
    });

    let cleanupAlpha = await setupExperiment({
      enabled: true,
      variant: "alpha",
    });

    await waitForWidgetAdded();

    setupService({
      isEnrolledAndEntitled: true,
    });
    await openPanel();
    await IPProtectionService.enrolling;

    Assert.equal(
      IPProtectionService.state,
      IPProtectionStates.READY,
      "Entitlement set the user as entitled"
    );

    cleanupService();
    await cleanupAlpha();
  }
);

/**
 * Tests the entitlement updates when not in the experiment.
 */
add_task(async function test_IPProtectionService_updateEntitlement() {
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.enabled", true]],
  });

  await waitForWidgetAdded();

  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "Entitlement set the user as entitled"
  );

  cleanupService();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_ipprotection_ready() {
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
  });

  const sandbox = sinon.createSandbox();
  const receivedTrigger = new Promise(resolve => {
    sandbox.stub(ASRouter, "sendTriggerMessage").callsFake(({ id }) => {
      if (id === "ipProtectionReady") {
        resolve(true);
      }
    });
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.enabled", true]],
  });

  let ipProtectionReadyTrigger = await receivedTrigger;
  Assert.ok(ipProtectionReadyTrigger, "ipProtectionReady trigger sent");

  sandbox.restore();
  cleanupService();
});

/**
 * Tests showing an error and dismissing it on panel close.
 */
add_task(async function test_IPProtectionService_pass_errors() {
  setupService({
    isSignedIn: true,
    proxyPass: {
      status: 403,
    },
  });

  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  IPProtectionService.updateState();

  let content = await openPanel();

  let messageBarLoadedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => content.shadowRoot.querySelector("ipprotection-message-bar")
  );

  let statusCard = content.statusCardEl;

  let toggleChangedPromise = BrowserTestUtils.waitForMutationCondition(
    statusCard.shadowRoot,
    { childList: true, subtree: true },
    () => !statusCard.toggleEnabled
  );

  statusCard.connectionToggleEl.click();

  await messageBarLoadedPromise;
  await toggleChangedPromise;

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.ERROR,
    "Proxy is not active"
  );

  let messageBar = content.shadowRoot.querySelector("ipprotection-message-bar");

  Assert.ok(
    !statusCard.connectionToggleEl.pressed,
    "Toggle is still turned off because of an error"
  );
  Assert.ok(messageBar, "Message bar should be present");
  Assert.equal(
    content.state.error,
    ERRORS.GENERIC,
    "Should have a generic error"
  );

  let button = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    button.classList.contains("ipprotection-error"),
    "Toolbar icon should show the error status"
  );

  await closePanel();

  Assert.equal(content.state.error, "", "Should have no error");

  // Reset the errors
  IPPProxyManager.errors = [];

  await cleanupAlpha();
  cleanupService();
});

/**
 * Tests retry after an error.
 */
add_task(async function test_IPProtectionService_retry_errors() {
  setupService({
    isSignedIn: true,
    isEnrolledAndEntitled: true,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  IPPProxyManager.updateState();

  let content = await openPanel();
  let statusCard = content.statusCardEl;

  // Mock a failure
  IPPEnrollAndEntitleManager.resetEntitlement();
  IPPProxyManager.setErrorState(ERRORS.GENERIC);

  let startedEventPromise = BrowserTestUtils.waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => !!IPPProxyManager.activatedAt
  );
  statusCard.connectionToggleEl.click();

  await startedEventPromise;

  Assert.equal(IPPProxyManager.state, IPPProxyStates.ACTIVE, "Proxy is active");

  await IPPProxyManager.stop();

  await closePanel();
  await cleanupAlpha();
  cleanupService();
});

/**
 * Tests the proxy is stopped if user signs out with it active.
 */
add_task(async function test_IPProtectionService_stop_on_signout() {
  setupService({
    isSignedIn: true,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  IPProtectionService.updateState();

  let content = await openPanel();
  let statusCard = content.statusCardEl;

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(
    statusCard.connectionToggleEl,
    "Status card connection toggle should be present"
  );

  let startedEventPromise = BrowserTestUtils.waitForEvent(
    IPPProxyManager,
    "IPPProxyManager:StateChanged",
    false,
    () => !!IPPProxyManager.activatedAt
  );
  statusCard.connectionToggleEl.click();

  await startedEventPromise;

  Assert.equal(IPPProxyManager.state, IPPProxyStates.ACTIVE, "Proxy is active");

  let vpnOffPromise = BrowserTestUtils.waitForEvent(
    IPProtectionService,
    "IPProtectionService:StateChanged",
    false,
    () => !IPPProxyManager.activatedAt
  );

  setupService({
    isSignedIn: false,
  });
  IPProtectionService.updateState();
  await vpnOffPromise;

  Assert.notStrictEqual(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVE,
    "Proxy has stopped"
  );

  await closePanel();
  await cleanupAlpha();
  cleanupService();
});

function waitForTabReloaded(tab) {
  return new Promise(resolve => {
    gBrowser.addTabsProgressListener({
      async onLocationChange(aBrowser) {
        if (tab.linkedBrowser == aBrowser) {
          gBrowser.removeTabsProgressListener(this);
          await Promise.resolve();
          resolve();
        }
      },
    });
  });
}

/**
 * Tests a user start or stopping the proxy reloads the current tab.
 */
add_task(async function test_IPProtectionService_reload() {
  setupService({
    isSignedIn: true,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  setupService({
    isEnrolledAndEntitled: true,
  });

  let content = await openPanel();
  let statusCard = content.statusCardEl;
  await IPProtectionService.enrolling;
  Assert.equal(
    IPProtectionService.state,
    IPProtectionStates.READY,
    "Proxy is ready"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(
    statusCard.connectionToggleEl,
    "Status card connection toggle should be present"
  );

  let tabReloaded = waitForTabReloaded(gBrowser.selectedTab);
  statusCard.connectionToggleEl.click();
  await tabReloaded;

  Assert.equal(IPPProxyManager.state, IPPProxyStates.ACTIVE, "Proxy is active");

  tabReloaded = waitForTabReloaded(gBrowser.selectedTab);
  statusCard.connectionToggleEl.click();
  await tabReloaded;

  Assert.notStrictEqual(
    IPPProxyManager.state,
    IPPProxyStates.ACTIVE,
    "Proxy is not active"
  );

  await closePanel();
  await cleanupAlpha();
  cleanupService();
});

/**
 * Tests the add-on manager interaction
 */
add_task(async function test_IPProtectionService_addon() {
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });
  let widget = document.getElementById(IPProtectionWidget.WIDGET_ID);

  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP-Protection toolbaritem is enabled"
  );

  setupService({
    isEnrolledAndEntitled: true,
    isSignedIn: true,
    entitlement: {
      status: 200,
      error: undefined,
      entitlement: {
        subscribed: true, // hasUpgraded=true
        uid: 42,
        created_at: "2023-01-01T12:00:00.000Z",
      },
    },
  });
  await IPPEnrollAndEntitleManager.refetchEntitlement();

  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      name: "Test VPN",
      version: "1.0",
      applications: { gecko: { id: "vpn@mozilla.com" } },
    },
  });

  await extension.startup();

  Assert.ok(
    !BrowserTestUtils.isVisible(widget),
    "IP-Protection toolbaritem is removed"
  );

  await extension.unload();

  widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP-Protection toolbaritem is re-added"
  );

  cleanupService(); // hasUpgraded=false
  await IPPEnrollAndEntitleManager.refetchEntitlement();

  const extension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      name: "Test VPN",
      version: "2.0",
      applications: { gecko: { id: "vpn@mozilla.com" } },
    },
  });

  await extension2.startup();

  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP-Protection toolbaritem does not change when user has not upgraded"
  );

  await extension2.unload();
  await cleanupAlpha();
});

/**
 * Tests that exposure events will be sent for branches and control
 */
add_task(async function test_IPProtectionService_exposure() {
  Services.telemetry.clearEvents();
  NimbusFeatures.ipProtection._didSendExposureEvent = false;

  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await cleanupAlpha();

  // Reset to allow sending another exposure event.
  NimbusFeatures.ipProtection._didSendExposureEvent = false;

  let cleanupControl = await setupExperiment({
    enabled: true,
    variant: "control",
  });

  await cleanupControl();

  TelemetryTestUtils.assertEvents(
    [
      {
        method: "expose",
        object: "nimbus_experiment",
        value: "vpn-test",
        extra: {
          branchSlug: "alpha",
          featureId: "ipProtection",
        },
      },
      {
        method: "expose",
        object: "nimbus_experiment",
        value: "vpn-test",
        extra: {
          branchSlug: "control",
          featureId: "ipProtection",
        },
      },
    ],
    { method: "expose" }
  );
});
