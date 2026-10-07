/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for Smartbar inline @mention functionality.
 *
 * These tests verify that users can trigger and insert inline mention
 * suggestions into the Smartbar editor via the @ trigger.
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

add_task(async function test_mentions_trigger_zero_prefix() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const mentionsOpen = waitForMentionsOpen(browser);
  await typeInSmartbar(browser, "@");
  await mentionsOpen;

  Assert.ok(
    mentionsOpen,
    "Mentions should open after typing @ without leading text"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_mentions_trigger_after_text() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const mentionsOpen = waitForMentionsOpen(browser);
  await typeInSmartbar(browser, "test @");
  await mentionsOpen;

  Assert.ok(
    mentionsOpen,
    "Mentions should open after typing @ with leading text"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_mentions_suggestions_panel_shows() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const panelVisible = waitForMentionsOpen(browser);
  await typeInSmartbar(browser, "@");
  await panelVisible;

  Assert.ok(
    panelVisible,
    "Panel list should show mention suggestions after typing @"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_mentions_insert_on_click() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const waitMention = waitForMentionInserted(browser);
  await typeInSmartbar(browser, "@");
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

  const hasMention = await waitMention;
  Assert.ok(
    hasMention,
    "Editor should contain a mention after clicking on a suggestion"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_mentions_insert_on_enter() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await typeInSmartbar(browser, "@");
  await waitForMentionsOpen(browser);

  await BrowserTestUtils.synthesizeKey("KEY_ArrowDown", {}, browser);
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  const hasMention = await waitForMentionInserted(browser);
  Assert.ok(hasMention, "Editor should contain a mention after pressing Enter");

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_panel_shows_unified_group() {
  providerStub.returns([
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
      type: MENTION_TYPE.TAB_OPEN,
      timestamp: Date.now() - 500,
    },
    {
      url: "https://example.com/3",
      title: "Page 3",
      icon: "",
      type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
      timestamp: Date.now() - 1000,
    },
  ]);

  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await typeInSmartbar(browser, "@");
  await waitForMentionsOpen(browser);

  const groupInfo = await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const panelList = smartbar.querySelector("smartwindow-panel-list");
    const panel = panelList.shadowRoot.querySelector("panel-list");

    const headers = Array.from(panel.querySelectorAll(".panel-section-header"));
    return {
      headerCount: headers.length,
      headerL10nId: headers[0]?.getAttribute("data-l10n-id"),
    };
  });

  Assert.equal(
    groupInfo.headerCount,
    1,
    "Panel should show single unified group"
  );
  Assert.equal(
    groupInfo.headerL10nId,
    "smartbar-mentions-list-recent-tabs-label",
    "Group should have 'Recent tabs' header"
  );

  await BrowserTestUtils.closeWindow(win);
  providerStub.returns(DEFAULT_PROVIDER_STUB_RETURN);
});

add_task(async function test_deduplication_by_url() {
  // Simulate duplicate URLs across open and closed tabs
  providerStub.returns([
    {
      url: "https://example.com/duplicate",
      title: "Open Tab (Duplicate)",
      icon: "",
      type: MENTION_TYPE.TAB_OPEN,
      timestamp: Date.now(),
    },
    {
      url: "https://example.com/unique1",
      title: "Unique Open Tab",
      icon: "",
      type: MENTION_TYPE.TAB_OPEN,
      timestamp: Date.now() - 500,
    },
    {
      url: "https://example.com/duplicate",
      title: "Closed Tab (Duplicate)",
      icon: "",
      type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
      timestamp: Date.now() - 1000,
    },
    {
      url: "https://example.com/unique2",
      title: "Unique Closed Tab",
      icon: "",
      type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
      timestamp: Date.now() - 2000,
    },
  ]);

  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await typeInSmartbar(browser, "@");
  await waitForMentionsOpen(browser);

  const itemInfo = await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const panelList = smartbar.querySelector("smartwindow-panel-list");
    const items = panelList.groups[0]?.items || [];

    return {
      itemCount: items.length,
      urls: items.map(item => item.id),
    };
  });

  Assert.equal(
    itemInfo.itemCount,
    3,
    "Should deduplicate by URL (3 unique URLs from 4 results)"
  );
  Assert.ok(
    itemInfo.urls.includes("https://example.com/duplicate"),
    "Should keep first occurrence of duplicate (open tab)"
  );
  Assert.ok(
    itemInfo.urls.includes("https://example.com/unique1"),
    "Should include unique open tab"
  );
  Assert.ok(
    itemInfo.urls.includes("https://example.com/unique2"),
    "Should include unique closed tab"
  );

  await BrowserTestUtils.closeWindow(win);
  providerStub.returns(DEFAULT_PROVIDER_STUB_RETURN);
});

add_task(async function test_maxResults_total_limit() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.mentions.maxResults", 3]],
  });

  const tabs = [];
  for (let i = 1; i <= 5; i++) {
    tabs.push({
      url: `https://example.com/tab${i}`,
      title: `Tab ${i}`,
      icon: "",
      type: MENTION_TYPE.TAB_OPEN,
      timestamp: Date.now() - i * 1000,
    });
  }
  for (let i = 1; i <= 5; i++) {
    tabs.push({
      url: `https://example.com/closed${i}`,
      title: `Closed ${i}`,
      icon: "",
      type: MENTION_TYPE.TAB_RECENTLY_CLOSED,
      timestamp: Date.now() - (i + 10) * 1000,
    });
  }

  providerStub.returns(tabs);

  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await typeInSmartbar(browser, "@");
  await waitForMentionsOpen(browser);

  const itemInfo = await SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const panelList = smartbar.querySelector("smartwindow-panel-list");
    const groups = panelList.groups;

    const items = groups[0]?.items || [];

    return {
      totalCount: items.length,
      groupCount: groups.length,
    };
  });

  Assert.equal(itemInfo.groupCount, 1, "Should have single unified group");
  Assert.equal(
    itemInfo.totalCount,
    3,
    "Should limit total results to maxResults (3) after deduplication"
  );

  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
  providerStub.returns(DEFAULT_PROVIDER_STUB_RETURN);
});

add_task(async function test_mentions_filter_letter_reaches_editor() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  const mentionsOpen = waitForMentionsOpen(browser);
  await typeInSmartbar(browser, "@");
  await mentionsOpen;

  // The suggestion titles all start with "P", so a panel-list that picked an
  // item by the first letter of its label would swallow this keystroke.
  let state = await SpecialPowers.spawn(browser, [], async () => {
    const aiWindow = content.document.querySelector("ai-window");
    const smartbar = aiWindow.shadowRoot.querySelector("#ai-window-smartbar");
    const panel = smartbar
      .querySelector("smartwindow-panel-list")
      .shadowRoot.querySelector("panel-list");
    const before = smartbar.value;

    EventUtils.sendString("p", content);
    await new Promise(resolve => content.requestAnimationFrame(resolve));

    let active = content.document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }

    return {
      before,
      after: smartbar.value,
      stillOpen: panel.hasAttribute("open"),
      activeInPanel: panel.contains(active),
      activeLocalName: active?.localName,
    };
  });

  info(`active element while the panel is open: ${state.activeLocalName}`);
  Assert.equal(
    state.after,
    state.before + "p",
    "A filter letter reaches the editor while the mention panel is open"
  );
  Assert.ok(state.stillOpen, "The mention panel stays open");
  Assert.ok(!state.activeInPanel, "Focus stays outside the mention panel");

  await BrowserTestUtils.closeWindow(win);
});
