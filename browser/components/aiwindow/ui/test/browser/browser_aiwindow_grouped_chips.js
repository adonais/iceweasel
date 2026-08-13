/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for grouped context chips in the chat bubble.
 *
 * The chat bubble shows one `ai-website-chip` per context website until there
 * are 3 or more, at which point `website-chip-container` collapses them into a
 * single `ai-grouped-chip-container` (the ".grouped-chips" trigger button that
 * opens a panel). These tests cover the 1 / 2 / 3 chip boundary and the panel
 * open/close toggle.
 */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);

const { MockEngineManager } = ChromeUtils.importESModule(
  "resource://testing-common/AIWindowTestUtils.sys.mjs"
);

// AI chat content loads Fluent strings asynchronously, which may not complete
// before the test finishes.
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Missing message.*smartwindow-messages-document-title/
);

const CHIPS = [
  { url: "https://example.com/1", label: "Page 1" },
  { url: "https://example.com/2", label: "Page 2" },
  { url: "https://example.com/3", label: "Page 3" },
];

const GROUPED_CHIPS_PAGE =
  "chrome://mochitests/content/browser/browser/components/aiwindow/ui/test/browser/test_grouped_chips_page.html";

/**
 * Adds `count` context mentions to the smartbar, submits a chat message, and
 * lets the mock engine complete the turn. We use fullpage mode (openAIWindow)
 * so there is no implicit current-tab chip skewing the count.
 *
 * @param {MozBrowser} browser
 * @param {MockEngineManager} mockEngineManager
 * @param {number} count - How many context mentions to add (1-3).
 */
async function sendMessageWithChips(browser, mockEngineManager, count) {
  const chips = CHIPS.slice(0, count);
  const smartbar = BrowserTestUtils.querySelectorDeep(
    browser.contentDocument,
    "#ai-window-smartbar"
  );

  for (const chip of chips) {
    smartbar.addContextMention({
      type: "tab",
      url: chip.url,
      label: chip.label,
    });
  }
  Assert.equal(
    smartbar.querySelector(".smartbar-context-chips-header").websites.length,
    chips.length,
    "All context mentions should be in the smartbar header"
  );

  await typeInSmartbar(browser, "summarize these");
  await submitSmartbar(browser);
  await mockEngineManager.respondTo({
    purpose: "chat",
    response: "Hello from mock.",
  });
}

/**
 * Reads the chip layout of the last user bubble's `website-chip-container`.
 *
 * @param {MozBrowser} browser
 * @returns {Promise<{websiteChipCount: number, hasGroupedChips: boolean}>}
 */
async function getBubbleChipInfo(browser) {
  const aiChatBrowser = await getAIChatBrowser(browser);

  return spawnBounded(
    aiChatBrowser,
    [],
    async () => {
      const contentEl = content.document.querySelector("ai-chat-content");
      await ContentTaskUtils.waitForMutationCondition(
        contentEl.shadowRoot,
        { childList: true, subtree: true },
        () =>
          contentEl.shadowRoot.querySelector(
            ".chat-bubble-user website-chip-container"
          )
      );
      const container = [
        ...contentEl.shadowRoot.querySelectorAll(
          ".chat-bubble-user website-chip-container"
        ),
      ].at(-1);

      // The container renders its chips (individual or grouped) asynchronously.
      await ContentTaskUtils.waitForMutationCondition(
        container.shadowRoot,
        { childList: true, subtree: true },
        () =>
          container.shadowRoot.querySelector("ai-website-chip") ||
          container.shadowRoot.querySelector("ai-grouped-chip-container")
      );

      return {
        websiteChipCount:
          container.shadowRoot.querySelectorAll("ai-website-chip").length,
        hasGroupedChips: !!container.shadowRoot.querySelector(
          "ai-grouped-chip-container"
        ),
      };
    },
    "user bubble chip container"
  );
}

add_task(async function test_grouped_chips_single_chip() {
  const restoreSignIn = skipSignIn();
  const mockEngineManager = new MockEngineManager();
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  try {
    await sendMessageWithChips(browser, mockEngineManager, 1);

    const info = await getBubbleChipInfo(browser);
    Assert.equal(
      info.websiteChipCount,
      1,
      "One context website should render a single ai-website-chip"
    );
    Assert.ok(!info.hasGroupedChips, "A single chip should not be grouped");
  } finally {
    mockEngineManager.rejectAllRequests();
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    mockEngineManager.cleanupMocks();
  }
});

add_task(async function test_grouped_chips_two_chips() {
  const restoreSignIn = skipSignIn();
  const mockEngineManager = new MockEngineManager();
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  try {
    await sendMessageWithChips(browser, mockEngineManager, 2);

    const info = await getBubbleChipInfo(browser);
    Assert.equal(
      info.websiteChipCount,
      2,
      "Two context websites should render two ai-website-chip elements"
    );
    Assert.ok(!info.hasGroupedChips, "Two chips should not be grouped");
  } finally {
    mockEngineManager.rejectAllRequests();
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    mockEngineManager.cleanupMocks();
  }
});

add_task(async function test_grouped_chips_three_chips_group() {
  const restoreSignIn = skipSignIn();
  const mockEngineManager = new MockEngineManager();
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  try {
    await sendMessageWithChips(browser, mockEngineManager, 3);

    const info = await getBubbleChipInfo(browser);
    Assert.ok(
      info.hasGroupedChips,
      "Three or more chips should collapse into ai-grouped-chip-container"
    );
    Assert.equal(
      info.websiteChipCount,
      0,
      "Grouped chips should not render individual ai-website-chip elements"
    );
  } finally {
    mockEngineManager.rejectAllRequests();
    await BrowserTestUtils.closeWindow(win);
    restoreSignIn();
    mockEngineManager.cleanupMocks();
  }
});

// The toggle is tested with a component page rather than the chat bubble
// because ai-chat-content autoscrolls when messages render, and panel-list
// dismisses on any scroll outside it, which would race our assertions.
// A static page keeps the panel reliably open.
add_task(async function test_grouped_chips_panel_toggle() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    GROUPED_CHIPS_PAGE
  );
  const browser = tab.linkedBrowser;
  const contentWin = browser.contentWindow;
  const contentDoc = browser.contentDocument;

  try {
    await contentWin.customElements.whenDefined("ai-grouped-chip-container");
    const grouped = contentDoc.createElement("ai-grouped-chip-container");
    // Set chips before connecting so the first render shows the grouped chips,
    // not the panel's empty state.
    grouped.chips = CHIPS;
    contentDoc.body.appendChild(grouped);
    await grouped.updateComplete;

    const trigger = grouped.shadowRoot.querySelector("#grouped-chips-trigger");
    const panelList = BrowserTestUtils.querySelectorDeep(
      grouped.shadowRoot,
      "panel-list"
    );

    Assert.ok(!panelList.hasAttribute("open"), "Panel should start closed");

    const shownPromise = BrowserTestUtils.waitForEvent(
      panelList,
      "shown",
      false,
      null,
      true
    );
    trigger.click();
    await shownPromise;
    await grouped.updateComplete;

    Assert.ok(
      panelList.hasAttribute("open"),
      "Panel should open on the first click"
    );
    Assert.ok(
      grouped.shadowRoot.querySelector(
        ".grouped-chips[data-is-smartwindow-panel-open]"
      ),
      "Trigger should reflect the open state via its data attribute"
    );

    const hiddenPromise = BrowserTestUtils.waitForEvent(
      panelList,
      "hidden",
      false,
      null,
      true
    );
    trigger.click();
    await hiddenPromise;
    await grouped.updateComplete;

    Assert.ok(
      !panelList.hasAttribute("open"),
      "Panel should close on the second click"
    );
    Assert.ok(
      !grouped.shadowRoot.querySelector(
        ".grouped-chips[data-is-smartwindow-panel-open]"
      ),
      "Trigger should no longer reflect the open state"
    );
  } finally {
    BrowserTestUtils.removeTab(tab);
  }
});
