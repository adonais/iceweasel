/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for how the Smartbar mentions panel and the suggestions view coexist:
 * the suggestions view closes when the mentions panel opens, and comes back
 * once the @ trigger or the inline mention is gone.
 */

"use strict";

let providerStub;
const DEFAULT_PROVIDER_STUB_RETURN = [
  {
    url: "https://example.com/1",
    title: "Page 1",
    icon: "",
    type: MENTION_TYPE.TAB_OPEN,
    timestamp: Date.now(),
  },
  {
    url: "https://example.com/2",
    title: "Page 2",
    icon: "",
    type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
    timestamp: Date.now(),
  },
  {
    url: "https://example.com/3",
    title: "Page 3",
    icon: "",
    type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
    timestamp: Date.now() - 1000,
  },
  {
    url: "https://example.com/4",
    title: "Page 4",
    icon: "",
    type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
    timestamp: Date.now() - 2000,
  },
];

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.search.suggest.enabled", false],
      ["browser.smartwindow.endpoint", "http://localhost:0/v1"],
    ],
  });

  providerStub = sinon.stub(
    SmartbarMentionsPanelSearch.prototype,
    "startQuery"
  );
  providerStub.returns(DEFAULT_PROVIDER_STUB_RETURN);

  registerCleanupFunction(() => {
    providerStub.restore();
  });
});

add_task(async function test_suggestions_closes_when_mentions_panel_opens() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await promiseSmartbarSuggestionsOpen(browser, () =>
    typeInSmartbar(browser, "test")
  );

  await typeInSmartbar(browser, " @");
  await waitForMentionsOpen(browser);

  await promiseSmartbarSuggestionsClose(browser);

  await BrowserTestUtils.closeWindow(win);
});

add_task(
  async function test_suggestions_reopens_after_mentions_trigger_removed() {
    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    await typeInSmartbar(browser, "test @");
    await waitForMentionsOpen(browser);

    await promiseSmartbarSuggestionsClose(browser);

    await promiseSmartbarSuggestionsOpen(browser, async () => {
      await BrowserTestUtils.synthesizeKey("KEY_Backspace", {}, browser);
    });

    await BrowserTestUtils.closeWindow(win);
  }
);

add_task(async function test_suggestions_hidden_when_inline_mentions_exists() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await typeInSmartbar(browser, "@");
  await waitForMentionsOpen(browser);

  await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const panelList = smartbar.querySelector("smartwindow-panel-list");
    const panel = panelList.shadowRoot.querySelector("panel-list");
    const firstItem = panel.querySelector(
      "panel-item:not(.panel-section-header)"
    );
    firstItem.click();
  });

  await waitForMentionInserted(browser);
  await typeInSmartbar(browser, " test query");

  await promiseSmartbarSuggestionsClose(browser);

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_suggestions_show_after_inline_mentions_removed() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const mentionsOpen = waitForMentionsOpen(browser);
  await typeInSmartbar(browser, "test @");
  await mentionsOpen;

  await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const panelList = smartbar.querySelector("smartwindow-panel-list");
    const panel = panelList.shadowRoot.querySelector("panel-list");
    const firstItem = panel.querySelector(
      "panel-item:not(.panel-section-header)"
    );
    firstItem.click();
  });

  await waitForMentionInserted(browser);
  await BrowserTestUtils.synthesizeKey("KEY_Backspace", {}, browser);

  await promiseSmartbarSuggestionsOpen(browser, async () => {
    await BrowserTestUtils.synthesizeKey("KEY_Backspace", {}, browser);
  });

  await BrowserTestUtils.closeWindow(win);
});
