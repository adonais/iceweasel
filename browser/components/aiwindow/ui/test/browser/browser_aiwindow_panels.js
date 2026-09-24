/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

async function getFullpageAiWindow(browser) {
  const aiWindow = await TestUtils.waitForCondition(
    () => browser.contentDocument?.querySelector("ai-window"),
    "Wait for the fullpage ai-window element"
  );
  await TestUtils.waitForCondition(
    () => aiWindow.shadowRoot,
    "Wait for the ai-window shadow root"
  );
  return aiWindow;
}

async function getChatHeaderMenuRoot(aiWindow) {
  await TestUtils.waitForCondition(
    () =>
      aiWindow.shadowRoot.querySelector("smartwindow-history-menu")?.shadowRoot,
    "Wait for the chat header menu to render"
  );
  return aiWindow.shadowRoot.querySelector("smartwindow-history-menu")
    .shadowRoot;
}

async function getSmartbarCta(aiWindow) {
  const inputCta = aiWindow.shadowRoot
    .querySelector("#ai-window-smartbar")
    .querySelector("input-cta");
  const mozButton = await TestUtils.waitForCondition(
    () => inputCta.shadowRoot.querySelector("moz-button"),
    "Wait for the CTA button"
  );
  const chevron = await TestUtils.waitForCondition(
    () => mozButton.shadowRoot.querySelector("#chevron-button"),
    "Wait for the CTA split button chevron"
  );
  return { panel: inputCta.shadowRoot.querySelector("panel-list"), chevron };
}

/**
 * Opening the smartbar's CTA dropdown closes a panel left open in the chat
 * header. The chevron is the press that matters: moz-button stops propagation
 * there, so panel-list's own dismiss listener never sees it, and the popover
 * API evicts the header's panel from the top layer without panel-list
 * clearing `open` - leaving it painted at a position that no longer resolves.
 */
add_task(async function test_smartbar_cta_closes_chat_header_panel() {
  const sb = this.sinon.createSandbox();
  let aiWin;

  try {
    sb.stub(this.openAIEngine, "build");

    aiWin = await openAIWindow();
    const browser = aiWin.gBrowser.selectedBrowser;
    const contentWin = browser.contentWindow;
    const aiWindow = await getFullpageAiWindow(browser);

    // The chat header is only visible once a chat is under way.
    aiWindow.classList.add("chat-active");

    await typeInSmartbar(browser, "tell me a joke");
    const { panel: ctaPanel, chevron } = await getSmartbarCta(aiWindow);
    const menuRoot = await getChatHeaderMenuRoot(aiWindow);

    const headerPanel = menuRoot.querySelector("#fullpage-more-menu");
    const headerShown = BrowserTestUtils.waitForEvent(headerPanel, "shown");
    EventUtils.synthesizeMouseAtCenter(
      menuRoot.querySelector("[data-l10n-id='aiwindow-fullpage-more']"),
      {},
      contentWin
    );
    await headerShown;
    Assert.ok(headerPanel.open, "The chat header panel should be open");

    const ctaShown = BrowserTestUtils.waitForEvent(ctaPanel, "shown");
    EventUtils.synthesizeMouseAtCenter(chevron, {}, contentWin);
    await ctaShown;

    Assert.ok(
      !headerPanel.open,
      "The chat header panel should close when the CTA dropdown opens"
    );
    Assert.ok(ctaPanel.open, "The CTA dropdown should be open");
  } finally {
    if (aiWin) {
      await BrowserTestUtils.closeWindow(aiWin);
    }
    sb.restore();
  }
});
