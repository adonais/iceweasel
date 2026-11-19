/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "ipProtectionLocalization", () => {
  return new Localization(["browser/ipProtection.ftl"], true);
});
const { BANDWIDTH } = ChromeUtils.importESModule(
  "chrome://browser/content/ipprotection/ipprotection-constants.mjs"
);

function setState(state) {
  IPPProxyManager.dispatchEvent(
    new CustomEvent("IPPProxyManager:StateChanged", {
      bubbles: true,
      composed: true,
      detail: {
        state,
      },
    })
  );
}

DEFAULT_EXPERIMENT = null;

add_task(async function test_ipprotection_prompts() {
  IPProtectionAlertManager.init();
  setupService({
    isReady: true,
    canEnroll: true,
  });

  IPProtectionService.updateState();

  await IPPProxyManager.start();
  await TestUtils.waitForCondition(
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE,
    "Wait for the proxy state to be active"
  );

  const usage = makeUsage();
  const maxUsage = Number(usage.max) / BANDWIDTH.BYTES_IN_GB;

  const [
    pausedTitle,
    pausedBody,
    closeTabsButton,
    continueButton,
    errorTitle,
    errorBody,
  ] = lazy.ipProtectionLocalization.formatMessagesSync([
    { id: "vpn-paused-alert-title" },
    { id: "vpn-paused-alert-body", args: { maxUsage } },
    { id: "vpn-paused-alert-close-tabs-button" },
    { id: "vpn-paused-alert-continue-wo-vpn-button" },
    { id: "vpn-error-alert-title-1" },
    { id: "vpn-error-alert-body-1" },
  ]);

  const localizationMessages = {
    pausedTitle: pausedTitle.value,
    pausedBody: pausedBody.value,
    closeTabsButton: closeTabsButton.value,
    continueButton: continueButton.value,
    errorTitle: errorTitle.value,
    errorBody: errorBody.value,
  };

  setState(IPPProxyStates.PAUSED);

  await TestUtils.waitForCondition(
    () => window.gDialogBox.isOpen,
    "Wait for the dialog to exist"
  );

  Assert.ok(window.gDialogBox.isOpen, "Dialog exists and is open");

  await TestUtils.waitForCondition(
    () =>
      window.gDialogBox.dialog._frame.contentDocument.getElementById(
        "titleContainer"
      ),
    "Wait for the dialog to load"
  );

  let dialogDoc = window.gDialogBox.dialog._frame.contentDocument;

  Assert.equal(
    dialogDoc.getElementById("titleContainer").textContent,
    localizationMessages.pausedTitle,
    "Dialog has paused title"
  );

  Assert.equal(
    dialogDoc.getElementById("infoBody").textContent,
    localizationMessages.pausedBody,
    "Dialog has paused body"
  );

  Assert.equal(
    dialogDoc
      .getElementById("commonDialog")
      .shadowRoot.querySelector("button[dlgtype='accept']").label,
    localizationMessages.continueButton,
    "Dialog has continue button label"
  );

  Assert.equal(
    dialogDoc
      .getElementById("commonDialog")
      .shadowRoot.querySelector("button[dlgtype='cancel']").label,
    localizationMessages.closeTabsButton,
    "Dialog has cancel button label"
  );

  await IPPProxyManager.stop();

  await TestUtils.waitForCondition(
    () => !window.gDialogBox.isOpen,
    "Wait for the dialog to not exist"
  );

  Assert.ok(!window.gDialogBox.isOpen, "Dialog disappears when in ready state");

  await TestUtils.waitForTick();

  await IPPProxyManager.start();
  await TestUtils.waitForCondition(
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE,
    "Wait for the proxy state to be active"
  );

  setState(IPPProxyStates.ERROR);

  await TestUtils.waitForCondition(
    () => window.gDialogBox.isOpen,
    "Wait for the dialog to exist"
  );

  Assert.ok(window.gDialogBox.isOpen, "Dialog exists and is open");

  await TestUtils.waitForCondition(
    () =>
      window.gDialogBox.dialog._frame.contentDocument.getElementById(
        "titleContainer"
      ),
    "Wait for the dialog to load"
  );

  dialogDoc = window.gDialogBox.dialog._frame.contentDocument;

  Assert.equal(
    dialogDoc.getElementById("titleContainer").textContent,
    localizationMessages.errorTitle,
    "Dialog has error title"
  );

  Assert.equal(
    dialogDoc.getElementById("infoBody").textContent,
    localizationMessages.errorBody,
    "Dialog has error body"
  );

  Assert.equal(
    dialogDoc
      .getElementById("commonDialog")
      .shadowRoot.querySelector("button[dlgtype='accept']").label,
    localizationMessages.continueButton,
    "Dialog has continue button label"
  );

  Assert.equal(
    dialogDoc
      .getElementById("commonDialog")
      .shadowRoot.querySelector("button[dlgtype='cancel']").label,
    localizationMessages.closeTabsButton,
    "Dialog has cancel button label"
  );

  await IPPProxyManager.stop();
  cleanupService();
  IPProtectionAlertManager.uninit();
});

add_task(async function test_continue_without_vpn() {
  IPProtectionAlertManager.init();
  setupService({
    isReady: true,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });
  IPPProxyManager.updateState();

  await TestUtils.waitForCondition(
    () => IPPProxyManager.state === IPPProxyStates.READY,
    "Wait for the proxy state to be ready"
  );

  await IPPProxyManager.start();

  await TestUtils.waitForCondition(
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE,
    "Wait for the proxy state to be active"
  );

  Assert.equal(IPPProxyManager.state, IPPProxyStates.ACTIVE, "Proxy is active");

  BrowserTestUtils.addTab(gBrowser, "about:robots");
  BrowserTestUtils.addTab(gBrowser, "about:robots");
  BrowserTestUtils.addTab(gBrowser, "about:robots");

  // Force paused prompt to open
  setState(IPPProxyStates.PAUSED);

  await TestUtils.waitForCondition(
    () => window.gDialogBox.isOpen,
    "Wait for the dialog to exist"
  );

  Assert.ok(window.gDialogBox.isOpen, "Dialog exists and is open");

  await TestUtils.waitForCondition(
    () =>
      window.gDialogBox.dialog._frame.contentDocument.getElementById(
        "titleContainer"
      ),
    "Wait for the dialog to load"
  );

  let dialogDoc = window.gDialogBox.dialog._frame.contentDocument;

  dialogDoc
    .getElementById("commonDialog")
    .shadowRoot.querySelector("button[dlgtype='accept']")
    .click();

  await TestUtils.waitForCondition(
    () => !window.gDialogBox.isOpen,
    "Wait for the dialog to not exist"
  );

  Assert.ok(!window.gDialogBox.isOpen, "Dialog disappears after button click");

  await TestUtils.waitForCondition(() => {
    info(`State is: ${IPPProxyManager.state}`);
    return IPPProxyManager.state === IPPProxyStates.READY;
  }, "Wait for the proxy state to be ready");

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.READY,
    "IPPProxyManager is in the ready state"
  );

  await TestUtils.waitForTick();

  await TestUtils.waitForCondition(
    () => gBrowser.tabs.length === 4,
    "Should have 4 tabs"
  );

  Assert.equal(gBrowser.tabs.length, 4, "Should have 4 tabs");

  await cleanupAlpha();
  await cleanupExperiment();
  cleanupService();
});

add_task(async function test_close_all_tabs() {
  IPProtectionAlertManager.init();
  setupService({
    isReady: true,
    canEnroll: true,
  });
  let cleanupAlpha = await setupExperiment({ enabled: true, variant: "alpha" });
  IPPProxyManager.updateState();

  await TestUtils.waitForCondition(
    () => IPPProxyManager.state === IPPProxyStates.READY,
    "Wait for the proxy state to be ready"
  );

  await IPPProxyManager.start();

  await TestUtils.waitForCondition(
    () => IPPProxyManager.state === IPPProxyStates.ACTIVE,
    "Wait for the proxy state to be active"
  );

  Assert.equal(IPPProxyManager.state, IPPProxyStates.ACTIVE, "Proxy is active");

  BrowserTestUtils.addTab(gBrowser, "about:robots");
  BrowserTestUtils.addTab(gBrowser, "about:robots");
  BrowserTestUtils.addTab(gBrowser, "about:robots");

  // Force paused prompt to open
  setState(IPPProxyStates.PAUSED);

  await TestUtils.waitForCondition(
    () => window.gDialogBox.isOpen,
    "Wait for the dialog to exist"
  );

  Assert.ok(window.gDialogBox.isOpen, "Dialog exists and is open");

  await TestUtils.waitForCondition(
    () =>
      window.gDialogBox.dialog._frame.contentDocument.getElementById(
        "titleContainer"
      ),
    "Wait for the dialog to load"
  );

  let dialogDoc = window.gDialogBox.dialog._frame.contentDocument;

  dialogDoc
    .getElementById("commonDialog")
    .shadowRoot.querySelector("button[dlgtype='cancel']")
    .click();

  await TestUtils.waitForCondition(
    () => !window.gDialogBox.isOpen,
    "Wait for the dialog to not exist"
  );

  Assert.ok(!window.gDialogBox.isOpen, "Dialog disappears after button click");

  await TestUtils.waitForCondition(() => {
    info(`State is: ${IPPProxyManager.state}`);
    return IPPProxyManager.state === IPPProxyStates.READY;
  }, "Wait for the proxy state to be ready");

  Assert.equal(
    IPPProxyManager.state,
    IPPProxyStates.READY,
    "IPPProxyManager is in the ready state"
  );

  await TestUtils.waitForCondition(
    () => gBrowser.tabs.length === 1,
    "Wait for only 1 tab open"
  );
  await TestUtils.waitForCondition(
    () => gBrowser.currentURI.displaySpec === "about:home",
    "Wait for currentURI to be about:home"
  );

  Assert.equal(gBrowser.tabs.length, 1, "Only 1 tab remains open");
  Assert.equal(
    gBrowser.currentURI.displaySpec,
    "about:home",
    "The current uri is about:home"
  );

  await cleanupAlpha();
  await cleanupExperiment();
  cleanupService();
});

add_task(
  async function test_telemetry_alert_button_clicked_error_close_all_tabs() {
    Services.fog.testResetFOG();
    await Services.fog.testFlushAllChildren();

    IPProtectionAlertManager.init();
    setupService({
      isReady: true,
      canEnroll: true,
    });

    IPProtectionService.updateState();

    await IPPProxyManager.start();
    await TestUtils.waitForCondition(
      () => IPPProxyManager.state === IPPProxyStates.ACTIVE,
      "Wait for the proxy state to be active"
    );

    setState(IPPProxyStates.ERROR);

    await TestUtils.waitForCondition(
      () => window.gDialogBox.isOpen,
      "Wait for the dialog to exist"
    );

    await TestUtils.waitForCondition(
      () =>
        window.gDialogBox.dialog._frame.contentDocument.getElementById(
          "titleContainer"
        ),
      "Wait for the dialog to load"
    );

    let dialogDoc = window.gDialogBox.dialog._frame.contentDocument;

    dialogDoc
      .getElementById("commonDialog")
      .shadowRoot.querySelector("button[dlgtype='cancel']")
      .click();

    await TestUtils.waitForCondition(
      () => !window.gDialogBox.isOpen,
      "Wait for the dialog to close"
    );

    await Services.fog.testFlushAllChildren();

    let alertEvents = Glean.ipprotection.alertButtonClicked.testGetValue();
    Assert.equal(
      alertEvents.length,
      1,
      "Should have recorded one alertButtonClicked event"
    );
    Assert.equal(alertEvents[0].category, "ipprotection");
    Assert.equal(alertEvents[0].name, "alert_button_clicked");
    Assert.equal(alertEvents[0].extra.reason, "error");
    Assert.equal(alertEvents[0].extra.buttonType, "1");

    await TestUtils.waitForCondition(
      () => gBrowser.tabs.length === 1,
      "Wait for only 1 tab open"
    );

    cleanupService();
    IPProtectionAlertManager.uninit();
    Services.fog.testResetFOG();
  }
);

add_task(
  async function test_telemetry_alert_button_clicked_paused_continue_without_vpn() {
    Services.fog.testResetFOG();
    await Services.fog.testFlushAllChildren();

    IPProtectionAlertManager.init();
    setupService({
      isReady: true,
      canEnroll: true,
    });

    IPProtectionService.updateState();

    await IPPProxyManager.start();

    await TestUtils.waitForCondition(
      () => IPPProxyManager.state === IPPProxyStates.ACTIVE,
      "Wait for the proxy state to be active"
    );

    setState(IPPProxyStates.PAUSED);

    await TestUtils.waitForCondition(
      () => window.gDialogBox.isOpen,
      "Wait for the dialog to exist"
    );

    await TestUtils.waitForCondition(
      () =>
        window.gDialogBox.dialog._frame.contentDocument.getElementById(
          "titleContainer"
        ),
      "Wait for the dialog to load"
    );

    let dialogDoc = window.gDialogBox.dialog._frame.contentDocument;

    dialogDoc
      .getElementById("commonDialog")
      .shadowRoot.querySelector("button[dlgtype='accept']")
      .click();

    await TestUtils.waitForCondition(
      () => !window.gDialogBox.isOpen,
      "Wait for the dialog to close"
    );

    await Services.fog.testFlushAllChildren();

    let alertEvents = Glean.ipprotection.alertButtonClicked.testGetValue();
    Assert.equal(
      alertEvents.length,
      1,
      "Should have recorded one alertButtonClicked event"
    );
    Assert.equal(alertEvents[0].category, "ipprotection");
    Assert.equal(alertEvents[0].name, "alert_button_clicked");
    Assert.equal(alertEvents[0].extra.reason, "paused");
    Assert.equal(alertEvents[0].extra.buttonType, "0");

    cleanupService();
    IPProtectionAlertManager.uninit();
    Services.fog.testResetFOG();
  }
);

const INCLUDED_SITE = "https://example.org";

function stubInclusionMode(sandbox) {
  sandbox.stub(IPPProxyManager, "active").value(true);
  sandbox.stub(IPPProxyManager, "mode").value(IPPMode.MODE_INCLUSION);
  sandbox
    .stub(IPPSiteRuleManager, "getRule")
    .callsFake(principal =>
      principal?.origin === INCLUDED_SITE
        ? IPPPrincipalRules.INCLUDED
        : IPPPrincipalRules.DEFAULT
    );
}

add_task(async function test_error_only_for_included_sites_in_inclusion_mode() {
  const sandbox = sinon.createSandbox();
  stubInclusionMode(sandbox);
  IPProtectionAlertManager.init();

  let otherTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com"
  );
  setState(IPPProxyStates.ERROR);
  await TestUtils.waitForTick();
  Assert.ok(
    !window.gDialogBox.isOpen,
    "Error dialog does not open for a site the connection does not carry"
  );

  let includedTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    INCLUDED_SITE
  );
  setState(IPPProxyStates.ERROR);
  await TestUtils.waitForCondition(
    () =>
      window.gDialogBox.dialog?._frame.contentDocument.getElementById(
        "commonDialog"
      ),
    "Error dialog opens for an included site"
  );

  let stopStub = sandbox.stub(IPPProxyManager, "stop");
  await acceptErrorDialog(stopStub);

  BrowserTestUtils.removeTab(includedTab);
  BrowserTestUtils.removeTab(otherTab);
  IPProtectionAlertManager.uninit();
  sandbox.restore();
});

async function waitForErrorDialog(message) {
  await TestUtils.waitForCondition(
    () =>
      window.gDialogBox.dialog?._frame.contentDocument.getElementById(
        "commonDialog"
      ),
    message
  );
}

async function acceptErrorDialog(stopStub) {
  window.gDialogBox.dialog._frame.contentDocument
    .getElementById("commonDialog")
    .shadowRoot.querySelector("button[dlgtype='accept']")
    .click();
  await TestUtils.waitForCondition(
    () => !window.gDialogBox.isOpen,
    "Wait for the dialog to close"
  );
  await TestUtils.waitForCondition(
    () => stopStub.called,
    "Wait for the answer to be handled"
  );
}

add_task(async function test_pending_error_shown_on_switch_to_included_tab() {
  const sandbox = sinon.createSandbox();
  stubInclusionMode(sandbox);
  sandbox.stub(IPPProxyManager, "state").value(IPPProxyStates.ERROR);
  let stopStub = sandbox.stub(IPPProxyManager, "stop");
  IPProtectionAlertManager.init();

  let otherTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com"
  );
  let includedTab = BrowserTestUtils.addTab(gBrowser, INCLUDED_SITE);
  let secondIncludedTab = BrowserTestUtils.addTab(gBrowser, INCLUDED_SITE);
  await Promise.all([
    BrowserTestUtils.browserLoaded(includedTab.linkedBrowser),
    BrowserTestUtils.browserLoaded(secondIncludedTab.linkedBrowser),
  ]);

  setState(IPPProxyStates.ERROR);
  await TestUtils.waitForTick();
  Assert.ok(
    !window.gDialogBox.isOpen,
    "Error dialog does not open while a non-included site is selected"
  );

  await BrowserTestUtils.switchTab(gBrowser, includedTab);
  await waitForErrorDialog(
    "Error dialog opens on switching to an included tab"
  );
  await acceptErrorDialog(stopStub);

  await BrowserTestUtils.switchTab(gBrowser, secondIncludedTab);
  setState(IPPProxyStates.ERROR);
  await TestUtils.waitForTick();
  Assert.ok(
    !window.gDialogBox.isOpen,
    "Error dialog does not open again once the user answered it"
  );

  BrowserTestUtils.removeTab(secondIncludedTab);
  BrowserTestUtils.removeTab(includedTab);
  BrowserTestUtils.removeTab(otherTab);
  IPProtectionAlertManager.uninit();
  sandbox.restore();
});

add_task(
  async function test_pending_error_shown_on_navigation_to_included_site() {
    const sandbox = sinon.createSandbox();
    stubInclusionMode(sandbox);
    sandbox.stub(IPPProxyManager, "state").value(IPPProxyStates.ERROR);
    let stopStub = sandbox.stub(IPPProxyManager, "stop");
    IPProtectionAlertManager.init();

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com"
    );

    setState(IPPProxyStates.ERROR);
    await TestUtils.waitForTick();
    Assert.ok(
      !window.gDialogBox.isOpen,
      "Error dialog does not open while a non-included site is loaded"
    );

    BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, INCLUDED_SITE);
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
    await waitForErrorDialog(
      "Error dialog opens on navigating to an included site"
    );
    await acceptErrorDialog(stopStub);

    BrowserTestUtils.removeTab(tab);
    IPProtectionAlertManager.uninit();
    sandbox.restore();
  }
);

add_task(async function test_error_shown_again_after_recovery() {
  const sandbox = sinon.createSandbox();
  sandbox.stub(IPPProxyManager, "active").value(true);
  let stopStub = sandbox.stub(IPPProxyManager, "stop");
  IPProtectionAlertManager.init();

  for (let recoveryState of [IPPProxyStates.ACTIVE, IPPProxyStates.READY]) {
    stopStub.resetHistory();
    setState(IPPProxyStates.ERROR);
    await waitForErrorDialog("Error dialog opens for the first failure");
    await acceptErrorDialog(stopStub);

    setState(recoveryState);
    stopStub.resetHistory();
    setState(IPPProxyStates.ERROR);
    await waitForErrorDialog(
      `Error dialog opens again for a failure after ${recoveryState}`
    );
    await acceptErrorDialog(stopStub);

    setState(recoveryState);
  }

  IPProtectionAlertManager.uninit();
  sandbox.restore();
  Services.fog.testResetFOG();
});

add_task(async function test_only_when_proxy_active() {
  IPProtectionAlertManager.init();

  setState(IPPProxyStates.PAUSED);

  await TestUtils.waitForTick();

  Assert.ok(
    !window.gDialogBox.isOpen,
    "Paused dialog does not open when proxy is not active"
  );

  setState(IPPProxyStates.ERROR);

  await TestUtils.waitForTick();

  Assert.ok(
    !window.gDialogBox.isOpen,
    "Error dialog does not open when proxy is not active"
  );

  IPProtectionAlertManager.uninit();
});
