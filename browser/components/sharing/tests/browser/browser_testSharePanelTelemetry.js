/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SHAREABLE_URL = "https://example.com";
const NON_SHAREABLE_URL = "about:robots";

SharingUtils.testOnlyMockUIUtils({
  shareUrl() {},
  QueryInterface: ChromeUtils.generateQI([Ci.nsIWindowsUIUtils]),
});
SharingUtils.testOnlyMockExternalProtocolService({
  loadURI() {},
});

registerCleanupFunction(function () {
  SharingUtils.testOnlyMockUIUtils(null);
  SharingUtils.testOnlyMockExternalProtocolService(null);
});

add_task(async function test_shareablePage() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  await BrowserTestUtils.withNewTab(SHAREABLE_URL, async browser => {
    const buttonVisibility = [
      { id: "share-panel-copy-link", visible: true },
      {
        id: "share-panel-os-share",
        visible: AppConstants.platform === "win", // Bug 2058695: Make this visible onces bug 2009747 lands.
      },
      {
        id: "share-panel-mail",
        visible: AppConstants.platform === "linux",
      },
      { id: "share-panel-screenshot", visible: true },
      { id: "share-panel-qr-code", visible: true },
    ];

    for (let { id, visible } of buttonVisibility) {
      if (!visible) {
        continue;
      }

      const panel = await openSharePanel(window);

      let hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");

      let button = panel.querySelector(`#${id}`);
      EventUtils.synthesizeMouseAtCenter(button, {});

      await hidden;
      if (id === "share-panel-qr-code") {
        await waitForQrCodeDialog(browser);
      } else if (id === "share-panel-screenshot") {
        await waitForScreenshotsOpen(window);
      }
    }

    const panel = await openSharePanel(window);

    let hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    const button = window.document.getElementById(SHARE_BUTTON_ID);
    EventUtils.synthesizeMouseAtCenter(button, {});

    await hidden;

    const expectedEvents = [
      { extra: { action: "copy-link", is_shareable: "true" } },
    ];

    if (AppConstants.platform !== "macosx") {
      expectedEvents.push({
        extra: {
          action: AppConstants.platform === "linux" ? "mail" : "os-share",
          is_shareable: "true",
        },
      });
    }

    expectedEvents.push(
      { extra: { action: "screenshot", is_shareable: "true" } },
      { extra: { action: "qr-code", is_shareable: "true" } },
      { extra: { action: "", is_shareable: "true" } }
    );
    await assertTelemetryEvents(expectedEvents);
  });
});

add_task(async function test_nonShareablePage() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  await BrowserTestUtils.withNewTab(NON_SHAREABLE_URL, async () => {
    let panel = await openSharePanel(window);

    let hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    let button = window.document.getElementById(SHARE_BUTTON_ID);
    EventUtils.synthesizeMouseAtCenter(button, {});

    await hidden;

    panel = await openSharePanel(window);

    hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    button = panel.querySelector("#share-panel-screenshot");
    EventUtils.synthesizeMouseAtCenter(button, {});

    await hidden;

    const expectedEvents = [
      { extra: { action: "", is_shareable: "false" } },
      { extra: { action: "screenshot", is_shareable: "false" } },
    ];
    await assertTelemetryEvents(expectedEvents);
  });
});
