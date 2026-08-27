/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL = "https://example.com/";

add_task(async function test_copyLink() {
  await BrowserTestUtils.withNewTab(TEST_URL, async () => {
    const panel = await openSharePanel(window);
    const copyLinkButton = panel.querySelector("#share-panel-copy-link");

    ok(
      BrowserTestUtils.isVisible(copyLinkButton),
      "Copy link button is visible"
    );

    const sharePanel = document.getElementById("share-panel");
    const panelHidden = BrowserTestUtils.waitForEvent(
      sharePanel,
      "popuphidden"
    );
    const hintShown = BrowserTestUtils.waitForEvent(
      ConfirmationHint._panel,
      "popupshown"
    );

    await SimpleTest.promiseClipboardChange(TEST_URL, () => {
      EventUtils.synthesizeMouseAtCenter(copyLinkButton, {});
    });

    await panelHidden;
    is(sharePanel.state, "closed", "Share panel is closed");

    await hintShown;
    is(
      ConfirmationHint._panel.anchorNode.id,
      "share-button",
      "Hint is anchored to the share button"
    );
    is(
      ConfirmationHint._message.getAttribute("data-l10n-id"),
      "confirmation-hint-link-copied",
      "Shown 'Link copied' hint"
    );

    const hintHidden = BrowserTestUtils.waitForEvent(
      ConfirmationHint._panel,
      "popuphidden"
    );
    ConfirmationHint._panel.hidePopup();
    await hintHidden;
  });
});
