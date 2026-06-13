/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for the Smartbar's suggestions view in the Smart Window: when it
 * opens, when it stays closed, and click-through behavior. Split out from
 * browser_aiwindow_smartbar.js to keep each file's runtime under the per-file
 * mochitest timeout (bug 2026508).
 */

"use strict";

add_setup(async function () {
  // Prevent network requests for remote search suggestions during testing.
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.search.suggest.enabled", false],
      ["browser.smartwindow.endpoint", "http://localhost:0/v1"],
    ],
  });

  const fakeIntentEngine = {
    run({ args: [[query]] }) {
      const searchKeywords = ["search", "find", "look up"];
      const navigateKeywords = ["https://", "www.", ".com"];
      const formattedPrompt = query.toLowerCase();

      const isSearch = searchKeywords.some(keyword =>
        formattedPrompt.includes(keyword)
      );
      const isNavigate = navigateKeywords.some(keyword =>
        formattedPrompt.includes(keyword)
      );

      if (isNavigate) {
        return [
          { label: "navigate", score: 0.95 },
          { label: "chat", score: 0.05 },
        ];
      }
      if (isSearch) {
        return [
          { label: "search", score: 0.95 },
          { label: "chat", score: 0.05 },
        ];
      }
      return [
        { label: "chat", score: 0.95 },
        { label: "search", score: 0.05 },
      ];
    },
  };

  gIntentEngineStub.resolves(fakeIntentEngine);
});

/**
 * Dispatch a `smartbar-commit` event.
 *
 * @param {MozBrowser} browser - The browser element
 * @param {string} value - The value to submit
 * @param {string} action - The action type
 */
async function dispatchSmartbarCommit(browser, value, action) {
  await SpecialPowers.spawn(browser, [value, action], async (val, act) => {
    const aiWindowElement = content.document.querySelector("ai-window");

    const smartbar = await ContentTaskUtils.waitForCondition(
      () => aiWindowElement.shadowRoot.querySelector("#ai-window-smartbar"),
      "Wait for Smartbar to be rendered"
    );
    const commitEvent = new content.CustomEvent("smartbar-commit", {
      detail: {
        value: val,
        action: act,
      },
      bubbles: true,
      composed: true,
    });

    smartbar.ownerDocument.dispatchEvent(commitEvent);
  });
}

add_task(
  async function test_smartbar_shows_suggestions_on_input_below_in_fullpage() {
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    await promiseSmartbarSuggestionsOpen(browser, () =>
      typeInSmartbar(browser, "test")
    );
    await assertSmartbarSuggestionsVisible(browser, true, "bottom");

    await BrowserTestUtils.closeWindow(win);
  }
);

add_task(
  async function test_smartbar_shows_suggestions_on_input_above_in_sidebar() {
    const { win, sidebarBrowser } = await openAIWindowWithSidebar();

    await promiseSmartbarSuggestionsOpen(sidebarBrowser, () =>
      typeInSmartbar(sidebarBrowser, "test")
    );
    await assertSmartbarSuggestionsVisible(sidebarBrowser, true, "top");

    await BrowserTestUtils.closeWindow(win);
  }
);

add_task(
  async function test_smartbar_hides_suggestions_on_submitting_initial_prompt() {
    const sb = this.sinon.createSandbox();

    try {
      sb.stub(this.Chat, "fetchWithHistory");
      sb.stub(this.openAIEngine, "build");

      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      await promiseSmartbarSuggestionsOpen(browser, () =>
        typeInSmartbar(browser, "test")
      );
      await assertSmartbarSuggestionsVisible(browser, true);
      await submitSmartbar(browser);
      await promiseSmartbarSuggestionsClose(browser);
      await assertSmartbarSuggestionsVisible(browser, false);

      await BrowserTestUtils.closeWindow(win);
    } finally {
      sb.restore();
    }
  }
);

add_task(async function test_smartbar_click_on_suggestion_is_registered() {
  const sb = this.sinon.createSandbox();

  try {
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    await promiseSmartbarSuggestionsOpen(browser, () =>
      typeInSmartbar(browser, "test")
    );

    // TODO (Bug 2016696): `SpecialPowers.spawn` would be more reliable and is
    // preferred over accessing content via cross-process wrappers like
    // `browser.contentWindow`.
    const aiWindowElement =
      browser.contentWindow.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const pickElementStub = sb.stub(smartbar, "pickElement");
    const firstSuggestion = smartbar.querySelector(".urlbarView-row");

    EventUtils.synthesizeMouseAtCenter(
      firstSuggestion,
      {},
      browser.contentWindow
    );

    Assert.ok(
      pickElementStub.calledOnce,
      "pickElement should be called when clicking a suggestion"
    );

    await BrowserTestUtils.closeWindow(win);
  } finally {
    sb.restore();
  }
});

add_task(async function test_smartbar_click_on_suggestion_navigates() {
  const sb = sinon.createSandbox();

  try {
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    const testUrl = "https://example.com/";
    await promiseSmartbarSuggestionsOpen(browser, () =>
      typeInSmartbar(browser, testUrl)
    );

    const aiWindowElement =
      browser.contentWindow.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const loadURLStub = sb.stub(smartbar, "_loadURL");
    const firstSuggestion = smartbar.querySelector(".urlbarView-row");

    EventUtils.synthesizeMouseAtCenter(
      firstSuggestion,
      {},
      browser.contentWindow
    );

    Assert.ok(
      loadURLStub.calledOnce,
      "_loadURL should be called when clicking a suggestion"
    );
    Assert.equal(
      loadURLStub.firstCall.args[0],
      testUrl,
      "Should navigate to the test URL"
    );

    await BrowserTestUtils.closeWindow(win);
  } finally {
    sb.restore();
  }
});

add_task(
  async function test_smartbar_suggestions_suppressed_on_typing_when_chat_active() {
    const sb = this.sinon.createSandbox();

    try {
      sb.stub(this.Chat, "fetchWithHistory");
      sb.stub(this.openAIEngine, "build").resolves({
        loadPrompt: () => Promise.resolve("Mock system prompt"),
      });

      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      await dispatchSmartbarCommit(browser, "initial prompt", "chat");
      await TestUtils.waitForTick();

      await typeInSmartbar(browser, "follow up");

      const viewIsOpen = await SpecialPowers.spawn(browser, [], async () => {
        const aiWindowElement = content.document.querySelector("ai-window");
        const smartbar = aiWindowElement.shadowRoot.querySelector(
          "#ai-window-smartbar"
        );
        return smartbar.view.isOpen;
      });

      Assert.ok(
        !viewIsOpen,
        "Suggestions view should not open when chat is active"
      );

      await BrowserTestUtils.closeWindow(win);
    } finally {
      sb.restore();
    }
  }
);

add_task(
  async function test_smartbar_suggestions_suppressed_on_focus_when_chat_active() {
    const sb = this.sinon.createSandbox();

    try {
      sb.stub(this.Chat, "fetchWithHistory");
      sb.stub(this.openAIEngine, "build").resolves({
        loadPrompt: () => Promise.resolve("Mock system prompt"),
      });

      const win = await openAIWindow();
      const browser = win.gBrowser.selectedBrowser;

      await dispatchSmartbarCommit(browser, "initial prompt", "chat");
      await TestUtils.waitForTick();

      const viewIsOpen = await SpecialPowers.spawn(browser, [], async () => {
        const aiWindowElement = content.document.querySelector("ai-window");
        const smartbar = aiWindowElement.shadowRoot.querySelector(
          "#ai-window-smartbar"
        );
        smartbar.inputField.blur();
        smartbar.dispatchEvent(
          new content.MouseEvent("mousedown", { bubbles: true })
        );
        smartbar.inputField.focus();
        return smartbar.view.isOpen;
      });

      Assert.ok(
        !viewIsOpen,
        "Suggestions view should not open on focus when chat is active"
      );

      await BrowserTestUtils.closeWindow(win);
    } finally {
      sb.restore();
    }
  }
);
