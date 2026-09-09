/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL = "https://example.com/";

add_task(async function test_QRCode() {
  await BrowserTestUtils.withNewTab(TEST_URL, async browser => {
    const panel = await openSharePanel(window);
    const qrCodeButton = panel.querySelector("#share-panel-qr-code");

    ok(BrowserTestUtils.isVisible(qrCodeButton), "QR Code button is visible");

    const sharePanel = document.getElementById("share-panel");
    const panelHidden = BrowserTestUtils.waitForEvent(
      sharePanel,
      "popuphidden"
    );

    EventUtils.synthesizeMouseAtCenter(qrCodeButton, {});

    await panelHidden;
    is(sharePanel.state, "closed", "Share panel is closed");

    await waitForQrCodeDialog(browser);
  });
});
