/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* globals promiseSyncReady, setupSendTabMocks, UIState, sinon */

Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/browser/base/content/test/sync/head.js",
  this
);

const TEST_URL = "https://example.com/";

const FXA_DEVICES = [
  {
    id: "phone-id",
    name: "My Phone",
    type: "mobile",
    availableCommands: { "https://identity.mozilla.com/cmd/open-uri": "1" },
    lastAccessTime: Date.now(),
  },
  {
    id: "desktop-id",
    name: "My Desktop",
    type: "desktop",
    availableCommands: { "https://identity.mozilla.com/cmd/open-uri": "2" },
    lastAccessTime: Date.now() + 60000,
  },
];

add_setup(async function () {
  await promiseSyncReady();
  // gSync.init() is called in a requestIdleCallback. Force its initialization.
  gSync.init();
});

async function openDeviceSubview(panel) {
  const sendButton = panel.querySelector("#share-panel-send-to-device");
  const deviceView = document.getElementById("share-panel-deviceView");
  const viewShown = BrowserTestUtils.waitForEvent(deviceView, "ViewShown");
  EventUtils.synthesizeMouseAtCenter(sendButton, {});
  await viewShown;
  return deviceView;
}

function assertSendToMobileButtonState(panel) {
  const sendButton = panel.querySelector("#share-panel-send-to-device");
  is(
    sendButton.getAttribute("data-l10n-id"),
    "share-panel-send-to-mobile",
    "Button is labeled send to mobile"
  );
  ok(
    !sendButton.classList.contains("subviewbutton-nav"),
    "Button has no subview arrow"
  );
  ok(!sendButton.hasAttribute("disabled"), "Button is enabled");
  return sendButton;
}

async function clickSendToMobileButton(sendButton) {
  const sharePanel = document.getElementById("share-panel");
  const panelHidden = BrowserTestUtils.waitForEvent(sharePanel, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(sendButton, {});
  await panelHidden;
}

add_task(async function test_sendToMobileSignedOut() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  const sandbox = setupSendTabMocks({
    fxaDevices: null,
    state: UIState.STATUS_NOT_CONFIGURED,
  });
  const openSignInStub = sandbox.stub(gSync, "openSignInAgainPage");
  try {
    await BrowserTestUtils.withNewTab(TEST_URL, async () => {
      const panel = await openSharePanel(window);
      const sendButton = assertSendToMobileButtonState(panel);
      await clickSendToMobileButton(sendButton);
      ok(
        openSignInStub.calledOnceWith("share-panel"),
        "Opened the sign in page"
      );

      const expectedEvents = [
        { extra: { action: "connect-or-sign-in", is_shareable: "true" } },
      ];
      await assertTelemetryEvents(expectedEvents);
    });
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_sendToMobileSignedInNoDevices() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  const sandbox = setupSendTabMocks({ fxaDevices: [] });
  const openConnectStub = sandbox.stub(gSync, "openConnectAnotherDevice");
  try {
    await BrowserTestUtils.withNewTab(TEST_URL, async () => {
      const panel = await openSharePanel(window);
      const sendButton = assertSendToMobileButtonState(panel);
      await clickSendToMobileButton(sendButton);
      ok(
        openConnectStub.calledOnceWith("share-panel"),
        "Opened the connect another device flow"
      );

      const expectedEvents = [
        { extra: { action: "connect-or-sign-in", is_shareable: "true" } },
      ];
      await assertTelemetryEvents(expectedEvents);
    });
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_deviceSubview() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  const sandbox = setupSendTabMocks({ fxaDevices: FXA_DEVICES });
  try {
    await BrowserTestUtils.withNewTab(TEST_URL, async () => {
      const panel = await openSharePanel(window);
      const sendButton = panel.querySelector("#share-panel-send-to-device");

      is(
        sendButton.getAttribute("data-l10n-id"),
        "share-panel-send-to-device",
        "Button is labeled send to device"
      );
      ok(
        sendButton.classList.contains("subviewbutton-nav"),
        "Button has a subview arrow"
      );

      const deviceView = await openDeviceSubview(panel);
      const deviceButtons = [
        ...deviceView.querySelectorAll(".share-panel-device"),
      ];

      is(deviceButtons.length, 2, "There is an entry per device");
      // Devices are sorted by last use, most recent first.
      is(
        deviceButtons[0].getAttribute("label"),
        "My Desktop",
        "First entry is the most recently used device"
      );
      is(
        deviceButtons[0].getAttribute("clientType"),
        "desktop",
        "Desktop entry has the desktop client type"
      );
      is(
        deviceButtons[1].getAttribute("label"),
        "My Phone",
        "Second entry is the other device"
      );
      is(
        deviceButtons[1].getAttribute("clientType"),
        "phone",
        "Mobile entry has the phone client type"
      );

      ok(
        deviceView.querySelector("#share-panel-connect-device"),
        "Connect another device entry is present"
      );
      ok(
        deviceView.querySelector("#share-panel-device-help"),
        "Missing device help entry is present"
      );

      await closeSharePanel(window);

      const expectedEvents = [{ extra: { action: "", is_shareable: "true" } }];
      await assertTelemetryEvents(expectedEvents);
    });
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_sendToDevice() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  const pageTitle = "Share Panel Test Page";
  const pageUrl = `https://example.com/document-builder.sjs?html=${encodeURIComponent(
    `<title>${pageTitle}</title>Hello`
  )}`;
  const sandbox = setupSendTabMocks({ fxaDevices: FXA_DEVICES });
  const sendStub = sandbox.stub(gSync, "sendTabsAndConfirm");
  try {
    await BrowserTestUtils.withNewTab(pageUrl, async () => {
      const panel = await openSharePanel(window);
      const deviceView = await openDeviceSubview(panel);
      const [desktopButton] = deviceView.querySelectorAll(
        ".share-panel-device"
      );

      const sharePanel = document.getElementById("share-panel");
      const panelHidden = BrowserTestUtils.waitForEvent(
        sharePanel,
        "popuphidden"
      );
      EventUtils.synthesizeMouseAtCenter(desktopButton, {});
      await panelHidden;

      ok(sendStub.calledOnce, "A tab was sent");
      const [tabs, targets] = sendStub.firstCall.args;
      Assert.deepEqual(
        tabs,
        [{ url: pageUrl, title: pageTitle, private: false }],
        "Sent the current page"
      );
      is(targets.length, 1, "Sent to a single device");
      is(targets[0].id, "desktop-id", "Sent to the clicked device");

      const expectedEvents = [
        { extra: { action: "send-to-device", is_shareable: "true" } },
      ];
      await assertTelemetryEvents(expectedEvents);
    });
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_deviceSubviewActions() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  const sandbox = setupSendTabMocks({ fxaDevices: FXA_DEVICES });
  const pairStub = sandbox.stub(gSync, "openPairDevice");
  const helpStub = sandbox.stub(gSync, "openSendTabHelp");
  try {
    await BrowserTestUtils.withNewTab(TEST_URL, async () => {
      let panel = await openSharePanel(window);
      let deviceView = await openDeviceSubview(panel);

      const sharePanel = document.getElementById("share-panel");
      let panelHidden = BrowserTestUtils.waitForEvent(
        sharePanel,
        "popuphidden"
      );
      EventUtils.synthesizeMouseAtCenter(
        deviceView.querySelector("#share-panel-connect-device"),
        {}
      );
      await panelHidden;
      ok(
        pairStub.calledOnceWith(null, "share-panel"),
        "Opened the pairing flow"
      );

      panel = await openSharePanel(window);
      deviceView = await openDeviceSubview(panel);
      panelHidden = BrowserTestUtils.waitForEvent(sharePanel, "popuphidden");
      EventUtils.synthesizeMouseAtCenter(
        deviceView.querySelector("#share-panel-device-help"),
        {}
      );
      await panelHidden;
      ok(helpStub.calledOnce, "Opened the missing device help page");

      const expectedEvents = [
        { extra: { action: "connect-device", is_shareable: "true" } },
        { extra: { action: "device-help", is_shareable: "true" } },
      ];
      await assertTelemetryEvents(expectedEvents);
    });
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_loadingDeviceList() {
  const sandbox = sinon.createSandbox();
  let deviceList = null;
  let resolveRefresh;
  sandbox.stub(fxAccounts.device, "recentDeviceList").get(() => deviceList);
  sandbox
    .stub(UIState, "get")
    .returns({ status: UIState.STATUS_SIGNED_IN, syncEnabled: true });
  sandbox.stub(BrowserUtils, "getShareableURL").returnsArg(0);
  sandbox.stub(fxAccounts.device, "refreshDeviceList").callsFake(
    () =>
      new Promise(resolve => {
        resolveRefresh = resolve;
      })
  );

  try {
    await BrowserTestUtils.withNewTab(TEST_URL, async () => {
      const panel = await openSharePanel(window);
      const sendButton = panel.querySelector("#share-panel-send-to-device");

      ok(
        sendButton.hasAttribute("disabled"),
        "Button is disabled while the device list loads"
      );
      is(
        sendButton.getAttribute("data-l10n-id"),
        "share-panel-send-to-mobile",
        "Button is labeled send to mobile while the device list loads"
      );

      deviceList = FXA_DEVICES;
      resolveRefresh(true);
      await TestUtils.waitForCondition(
        () => !sendButton.hasAttribute("disabled"),
        "Wait for the button to be enabled"
      );
      is(
        sendButton.getAttribute("data-l10n-id"),
        "share-panel-send-to-device",
        "Button is labeled send to device once the device list is loaded"
      );
      ok(
        sendButton.classList.contains("subviewbutton-nav"),
        "Button has a subview arrow once the device list is loaded"
      );

      await closeSharePanel(window);
    });
  } finally {
    sandbox.restore();
  }
});
