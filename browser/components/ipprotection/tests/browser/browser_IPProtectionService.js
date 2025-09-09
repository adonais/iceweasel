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
  Assert.ok(IPProtectionService.isEligible, "Should be in the experiment");
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
  Assert.ok(!IPProtectionService.isEligible, "Should not be in the experiment");
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
    isEnrolled: true,
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.enabled", true]],
  });

  // hasEnrolled / isEnrolled is async so wait for widget.
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
 * Tests a user in the experiment can enroll with Guardian on sign-in.
 */
add_task(async function test_IPProtectionService_enroll() {
  setupService({
    isEnrolled: false,
    canEnroll: true,
  });

  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await waitForWidgetAdded();

  setupService({
    isSignedIn: true,
  });

  await IPProtectionService.updateSignInStatus();

  Assert.ok(IPProtectionService.isEnrolled, "User should now be enrolled");

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
      isEnrolled: false,
      isSignedIn: true,
      canEnroll: true,
    });

    let cleanupAlpha = await setupExperiment({
      enabled: true,
      variant: "alpha",
    });

    await waitForWidgetAdded();

    await IPProtectionService.updateSignInStatus();

    Assert.ok(IPProtectionService.isEnrolled, "User should now be enrolled");

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
      isEnrolled: false,
      isSignedIn: true,
      canEnroll: true,
    });

    let cleanupAlpha = await setupExperiment({
      enabled: true,
      variant: "alpha",
    });

    await waitForWidgetAdded();

    await IPProtectionService.updateSignInStatus();

    Assert.equal(
      IPProtectionService.isEntitled,
      true,
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
    isEnrolled: true,
  });

  await SpecialPowers.pushPrefEnv({
    set: [["browser.ipProtection.enabled", true]],
  });

  await waitForWidgetAdded();

  Assert.equal(
    IPProtectionService.isEntitled,
    true,
    "Entitlement set the user as entitled"
  );

  cleanupService();
  await SpecialPowers.popPrefEnv();
});

/**
 * Tests a user with a valid proxy pass and can start the proxy.
 */
add_task(async function test_IPProtectionService_proxyPass() {
  setupService({
    isSignedIn: true,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  IPProtectionService.isSignedIn = false;
  await IPProtectionService.updateSignInStatus();

  Assert.ok(IPProtectionService.isEnrolled, "User should be enrolled");
  Assert.equal(IPProtectionService.isEntitled, true, "User should be entitled");

  let content = await openPanel();

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(
    content.connectionToggleEl,
    "Status card connection toggle should be present"
  );

  let startedEventPromise = BrowserTestUtils.waitForEvent(
    IPProtectionService,
    "IPProtectionService:Started"
  );
  content.connectionToggleEl.click();

  await startedEventPromise;

  Assert.ok(IPProtectionService.hasProxyPass, "User has a proxyPass");

  await closePanel();
  await cleanupAlpha();
  cleanupService();
});

add_task(async function test_ipprotection_ready() {
  setupService({
    isSignedIn: true,
    isEnrolled: true,
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
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await IPProtectionService.updateSignInStatus();

  let content = await openPanel();

  let messageBarLoadedPromise = BrowserTestUtils.waitForMutationCondition(
    content.shadowRoot,
    { childList: true, subtree: true },
    () => content.shadowRoot.querySelector("ipprotection-message-bar")
  );
  // Mock a failure
  IPProtectionService.isEntitled = false;

  content.connectionToggleEl.click();

  Assert.ok(!IPProtectionService.isActive, "Proxy is not active");

  await messageBarLoadedPromise;

  let messageBar = content.shadowRoot.querySelector("ipprotection-message-bar");

  Assert.ok(!content.connectionToggleEl.pressed, "Toggle is off");
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

  await cleanupAlpha();
  cleanupService();
});

/**
 * Tests retry after an error.
 */
add_task(async function test_IPProtectionService_retry_errors() {
  setupService({
    isSignedIn: true,
    isEnrolled: false,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await IPProtectionService.updateSignInStatus();

  let content = await openPanel();

  // Mock a failure
  IPProtectionService.isEnrolled = false;
  IPProtectionService.hasError = true;

  let startedEventPromise = BrowserTestUtils.waitForEvent(
    IPProtectionService,
    "IPProtectionService:Started"
  );
  content.connectionToggleEl.click();

  await startedEventPromise;

  Assert.ok(IPProtectionService.isActive, "Proxy is active");
  Assert.ok(IPProtectionService.isEnrolled, "User is now enrolled");
  Assert.ok(!IPProtectionService.hasError, "There is no longer an error");

  IPProtectionService.stop();

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

  await IPProtectionService.updateSignInStatus();

  let content = await openPanel();

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(
    content.connectionToggleEl,
    "Status card connection toggle should be present"
  );

  let startedEventPromise = BrowserTestUtils.waitForEvent(
    IPProtectionService,
    "IPProtectionService:Started"
  );
  content.connectionToggleEl.click();

  await startedEventPromise;

  Assert.ok(IPProtectionService.isActive, "Proxy is active");

  let vpnOffPromise = BrowserTestUtils.waitForEvent(
    IPProtectionService,
    "IPProtectionService:Stopped"
  );

  setupService({
    isSignedIn: false,
  });
  let signedOut = IPProtectionService.updateSignInStatus();
  await Promise.all([signedOut, vpnOffPromise]);

  Assert.ok(!IPProtectionService.isActive, "Proxy has stopped");

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

  IPProtectionService.isSignedIn = false;
  await IPProtectionService.updateSignInStatus();

  Assert.ok(IPProtectionService.isEnrolled, "User should be enrolled");
  Assert.equal(IPProtectionService.isEntitled, true, "User should be entitled");

  let content = await openPanel();

  Assert.ok(
    BrowserTestUtils.isVisible(content),
    "ipprotection content component should be present"
  );
  Assert.ok(
    content.connectionToggleEl,
    "Status card connection toggle should be present"
  );

  let tabReloaded = waitForTabReloaded(gBrowser.selectedTab);
  content.connectionToggleEl.click();
  await tabReloaded;

  Assert.ok(IPProtectionService.isActive, "Proxy is active");

  tabReloaded = waitForTabReloaded(gBrowser.selectedTab);
  content.connectionToggleEl.click();
  await tabReloaded;

  Assert.ok(!IPProtectionService.isActive, "Proxy is not active");

  await closePanel();
  await cleanupAlpha();
  cleanupService();
});

/**
 * Tests the add-on manager interaction
 */
add_task(async function test_IPProtectionService_addon() {
  let widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  let prevPosition = CustomizableUI.getPlacementOfWidget(
    IPProtectionWidget.WIDGET_ID
  ).position;

  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP-Protection toolbaritem is enabled"
  );

  IPProtectionService.hasUpgraded = true;

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

  // Reset to the toolbar
  CustomizableUI.addWidgetToArea(
    IPProtectionWidget.WIDGET_ID,
    CustomizableUI.AREA_NAVBAR,
    prevPosition
  );

  widget = document.getElementById(IPProtectionWidget.WIDGET_ID);
  Assert.ok(
    BrowserTestUtils.isVisible(widget),
    "IP-Protection toolbaritem is re-added"
  );

  await extension.unload();

  IPProtectionService.hasUpgraded = false;

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
});

add_task(async function test_IPProtectionService_handleProxyErrorEvent() {
  setupService({
    isSignedIn: true,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await IPProtectionService.start();

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
    const originalIsolationKey = IPProtectionService.connection?.isolationKey;
    // Create the error event
    const errorEvent = new CustomEvent("proxy-http-error", {
      detail: {
        isolationKey: testCase.isolationKey || originalIsolationKey,
        level: testCase.level,
        httpStatus: testCase.httpStatus,
      },
    });

    console.log(`Testing: ${testCase.name}`);

    const result = IPProtectionService.handleProxyErrorEvent(errorEvent);

    if (testCase.shouldRotate) {
      Assert.ok(
        result,
        `${testCase.name}: Should return a promise when rotation is triggered`
      );

      await result;

      const newIsolationKey = IPProtectionService.connection?.isolationKey;
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

      const unchangedIsolationKey =
        IPProtectionService.connection?.isolationKey;
      Assert.equal(
        originalIsolationKey,
        unchangedIsolationKey,
        `${testCase.name}: Isolation key should not change when rotation is not triggered`
      );
    }
  }

  // Test inactive connection
  const isolationKeyBeforeStop = IPProtectionService.connection?.isolationKey;
  IPProtectionService.connection.stop();

  const inactiveErrorEvent = new CustomEvent("proxy-http-error", {
    detail: {
      isolationKey: isolationKeyBeforeStop,
      level: "error",
      httpStatus: 401,
    },
  });

  const inactiveResult =
    IPProtectionService.handleProxyErrorEvent(inactiveErrorEvent);
  Assert.equal(
    inactiveResult,
    undefined,
    "Should not return a promise when connection is inactive"
  );

  await cleanupAlpha();
  cleanupService();
});

/**
 * Tests that exposure events will be sent for branches and control
 */
add_task(async function test_IPProtectionService_exposure() {
  Services.telemetry.clearEvents();

  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });

  await cleanupAlpha();

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
