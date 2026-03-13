/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests for disclaimer label.
 */

async function openFullScreenAIWindow() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.smartwindow.enabled", true]],
  });

  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  return { win, browser };
}

add_task(async function test_smartwindow_disclaimer_visibility() {
  const { win, browser } = await openFullScreenAIWindow();

  try {
    await SpecialPowers.spawn(browser, [], async () => {
      const smartWindowElement = content.document.querySelector("ai-window");
      Assert.ok(smartWindowElement, "ai-window element should exist");

      const disclaimer =
        smartWindowElement.shadowRoot?.querySelector(".disclaimer");
      // Initially should be visible in full page mode
      Assert.strictEqual(
        disclaimer,
        null,
        "Disclaimer should NOT exist in full page mode"
      );

      // Verify disclaimer appears when showDisclaimer is true
      smartWindowElement.showDisclaimer = true;
      await ContentTaskUtils.waitForCondition(
        () => smartWindowElement.shadowRoot?.querySelector(".disclaimer"),
        "Disclaimer should appear when showDisclaimer is true"
      );

      // Verify disclaimer is removed when showDisclaimer is false
      smartWindowElement.showDisclaimer = false;
      await ContentTaskUtils.waitForCondition(
        () =>
          smartWindowElement.shadowRoot?.querySelector(".disclaimer") === null,
        "Disclaimer should be removed when showDisclaimer is false"
      );
    });
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
});
