/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { GenAI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/genai/GenAI.sys.mjs"
);
const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);
const { AIWindowUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AIWindowUI.sys.mjs"
);
const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

/**
 * Check that shortcuts aren't shown by default
 */
add_task(async function test_no_shortcuts() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.chat.provider", ""]],
  });
  await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
    browser.focus();
    goDoCommand("cmd_selectAll");

    const selectionShortcutActionPanel = document.getElementById(
      "selection-shortcut-action-panel"
    );

    Assert.ok(
      !selectionShortcutActionPanel.hasAttribute("panelopen"),
      "No shortcuts found"
    );
  });
});

async function selectAllAndMouseUp(
  browser,
  { win = window, releaseX = 60, releaseY = 10 } = {}
) {
  await SimpleTest.promiseFocus(browser);
  await BrowserTestUtils.synthesizeMouse(
    browser,
    10,
    10,
    { type: "mousedown" },
    browser
  );
  const selectPromise = SpecialPowers.spawn(browser, [], () =>
    ContentTaskUtils.waitForCondition(() => content.getSelection().toString())
  );
  win.goDoCommand("cmd_selectAll");
  await selectPromise;
  await BrowserTestUtils.synthesizeMouse(
    browser,
    releaseX,
    releaseY,
    { type: "mouseup" },
    browser
  );
}

async function showSelectionMenu(browser) {
  const panel = document.getElementById("selection-shortcut-action-panel");
  Assert.ok(!panel.hasAttribute("panelopen"), "Menu starts closed");

  await selectAllAndMouseUp(browser);
  await TestUtils.waitForCondition(
    () => panel.getAttribute("panelopen") === "true",
    "Selection menu opened"
  );
  return panel;
}

/**
 * Check that the menu opens with no chatbot provider configured, so that
 * clicking the AI action can start onboarding.
 */
add_task(async function test_show_menu_without_provider() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.ml.chat.provider", ""],
    ],
  });

  const panel = document.getElementById("selection-shortcut-action-panel");

  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      await showSelectionMenu(browser);

      Assert.ok(
        panel.hasAttribute("panelopen"),
        "Menu opens without a chat provider"
      );
    });
  } finally {
    if (panel.state != "closed") {
      const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
      panel.hidePopup();
      await hidden;
    }
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_selection_menu_position_with_rtl_app_locale() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["intl.l10n.pseudo", "bidi"],
    ],
  });
  Assert.ok(Services.locale.isAppLocaleRTL, "app locale is RTL for this task");

  const panel = document.getElementById("selection-shortcut-action-panel");

  await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
    await TestUtils.waitForCondition(
      () => getComputedStyle(browser).direction == "rtl",
      "Anchor resolved to RTL"
    );

    const clickX = 150;
    await selectAllAndMouseUp(browser, { releaseX: clickX, releaseY: 20 });
    await TestUtils.waitForCondition(
      () => panel.getAttribute("panelopen") === "true",
      "Selection menu opened"
    );

    const browserRect = browser.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const clickViewportX = browserRect.left + clickX;
    const margin = 10;
    Assert.ok(
      clickViewportX >= panelRect.left - margin &&
        clickViewportX <= panelRect.right + margin,
      `Popup (left=${panelRect.left}, right=${panelRect.right}) spans the click position (${clickViewportX}) even with an RTL app locale`
    );

    const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    panel.hidePopup();
    await hidden;
  });

  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(
    () => getComputedStyle(document.documentElement).direction == "ltr",
    "UI reverted to LTR"
  );
});

/**
 * Check that a blocked chatbot leaves the menu open with just the Search
 * action, now that Search exists independently of the chatbot.
 */
add_task(async function test_no_menu_when_chatbot_blocked() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.ml.chat.enabled", false],
    ],
  });

  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      const panel = await showSelectionMenu(browser);

      Assert.ok(
        document.getElementById("ai-action-button").hidden,
        "AI action is hidden when the chatbot is blocked"
      );
      Assert.ok(
        !document.getElementById("search-action-button").hidden,
        "Search still has an action to offer"
      );

      panel.hide();
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that a blocked chatbot and an unavailable search service together
 * leave no menu to show at all.
 */
add_task(async function test_no_menu_when_nothing_available() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.ml.chat.enabled", false],
    ],
  });
  const spy = sinon.spy(GenAI, "handleShortcutsMessage");
  const panel = document.getElementById("selection-shortcut-action-panel");

  // "failed" rather than the other statuses because it is the one that makes
  // the default engine getters throw.
  SearchService.forceInitializationStatusForTests("failed");
  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      await selectAllAndMouseUp(browser);
      await TestUtils.waitForCondition(
        () => spy.called,
        "Actor offered shortcuts to the parent"
      );

      // openPopup() sets state synchronously, while the panelopen attribute
      // only lands on popupshown, too late for this assertion.
      Assert.equal(
        panel.state,
        "closed",
        "Menu stays closed with neither chatbot nor search available"
      );
    });
  } finally {
    SearchService.forceInitializationStatusForTests("success");
    spy.restore();
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that turning the setting off hides the menu with the feature gate on,
 * even when a chatbot has already been chosen.
 */
add_task(async function test_no_menu_when_setting_off() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.highlightToSearch.enabled", false],
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });
  const spy = sinon.spy(GenAI, "handleShortcutsMessage");

  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      const panel = document.getElementById("selection-shortcut-action-panel");
      await selectAllAndMouseUp(browser);
      await TestUtils.waitForCondition(
        () => spy.called,
        "Actor offered shortcuts to the parent"
      );

      Assert.equal(
        panel.state,
        "closed",
        "Menu stays closed with the setting off"
      );
    });
  } finally {
    spy.restore();
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that a new selection with nothing left to offer closes the menu
 * opened for the previous selection.
 */
add_task(async function test_menu_closes_when_nothing_left_to_offer() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.highlightToSearch.enabled", true],
      ["browser.highlightToSearch.search.enabled", true],
      ["browser.ml.chat.enabled", false],
    ],
  });
  const spy = sinon.spy(GenAI, "handleShortcutsMessage");

  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      const panel = await showSelectionMenu(browser);

      SearchService.forceInitializationStatusForTests("failed");
      spy.resetHistory();
      await BrowserTestUtils.synthesizeMouse(
        browser,
        60,
        10,
        { type: "mouseup" },
        browser
      );
      await TestUtils.waitForCondition(
        () => spy.called,
        "Actor offered shortcuts to the parent again"
      );

      Assert.equal(panel.state, "closed", "Stale menu is closed");
    });
  } finally {
    SearchService.forceInitializationStatusForTests("success");
    spy.restore();
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that Search stays hidden for an existing chatbot user while the
 * Highlight to Search feature gate is off, so release users see no change.
 */
add_task(async function test_search_hidden_without_feature_gate() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", false],
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });

  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      const panel = await showSelectionMenu(browser);

      Assert.ok(
        document.getElementById("search-action-button").hidden,
        "Search stays hidden for an existing chatbot user while the gate is off"
      );

      panel.hide();
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that clicking Search opens the selection in a new tab with the
 * default engine, tagged with the text_selection SAP, and records the click.
 */
add_task(async function test_search_action_click() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.highlightToSearch.enabled", true],
      ["browser.highlightToSearch.search.enabled", true],
      ["browser.ml.chat.provider", ""],
    ],
  });
  const loadSearchStub = sinon.stub(SearchUIUtils, "loadSearch");

  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      const panel = await showSelectionMenu(browser);
      const searchButton = document.getElementById("search-action-button");
      Assert.ok(!searchButton.hidden, "Search is offered without a chatbot");
      Assert.deepEqual(
        Glean.sapImpressionCounts.textSelection.testGetValue(),
        { [SearchService.defaultEngine.id]: 1 },
        "Showing Search records one impression, for the default engine"
      );

      const panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
      searchButton.click();
      await panelHidden;

      Assert.ok(loadSearchStub.calledOnce, "loadSearch was called");
      const args = loadSearchStub.firstCall.args[0];
      Assert.equal(args.searchText, "hi", "Searches the selection");
      Assert.equal(args.where, "tab", "Opens in a new tab");
      Assert.equal(args.sapSource, "text_selection", "Tags the new SAP");
      Assert.ok(args.triggeringPrincipal, "Carries a triggering principal");
      Assert.ok(
        "policyContainer" in args,
        "Passes the policy container through"
      );

      const clicks = Glean.selectionMenu.actionClick.testGetValue();
      Assert.equal(clicks.length, 1, "One action clicked");
      Assert.equal(
        clicks[0].extra.action,
        "search",
        "Clicked the search action"
      );
      Assert.equal(clicks[0].extra.selection, "2", "Records selection length");
      Assert.equal(
        clicks[0].extra.smart_window,
        "false",
        "Not a Smart Window click"
      );
    });
  } finally {
    loadSearchStub.restore();
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that with the chatbot available but Search turned off, only the AI
 * action is offered.
 */
add_task(async function test_search_disabled_keeps_ai_action() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.highlightToSearch.enabled", true],
      ["browser.highlightToSearch.search.enabled", false],
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });

  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      const panel = await showSelectionMenu(browser);

      Assert.ok(
        !document.getElementById("ai-action-button").hidden,
        "AI action is offered"
      );
      Assert.ok(
        document.getElementById("search-action-button").hidden,
        "Search is hidden when turned off"
      );
      Assert.deepEqual(
        Glean.sapImpressionCounts.textSelection.testGetValue(),
        {},
        "No impression is recorded while Search is hidden"
      );

      panel.hide();
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});

async function doPrivateWindowImpressionTest(shouldRecordCounts) {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.highlightToSearch.enabled", true],
      ["browser.highlightToSearch.search.enabled", true],
      ["browser.ml.chat.provider", ""],
      // This pref is the opposite of what it seems like it should be.
      ["browser.engagement.search_counts.pbm", !shouldRecordCounts],
    ],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });

  try {
    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "data:text/plain,hi"
    );
    const browser = win.gBrowser.selectedBrowser;
    await SimpleTest.promiseFocus(browser);

    const selectPromise = SpecialPowers.spawn(browser, [], () =>
      ContentTaskUtils.waitForCondition(() => content.getSelection().toString())
    );
    win.goDoCommand("cmd_selectAll");
    await selectPromise;
    await BrowserTestUtils.synthesizeMouse(
      browser,
      60,
      10,
      { type: "mouseup" },
      browser
    );

    const panel = win.document.getElementById(
      "selection-shortcut-action-panel"
    );
    await TestUtils.waitForCondition(
      () => panel.getAttribute("panelopen") === "true",
      "Selection menu opened in a private window"
    );
    Assert.ok(
      !win.document.getElementById("search-action-button").hidden,
      "Search is offered in a private window"
    );
    Assert.deepEqual(
      Glean.sapImpressionCounts.textSelection.testGetValue(),
      shouldRecordCounts ? { [SearchService.defaultPrivateEngine.id]: 1 } : {},
      "The impression follows the private browsing counts pref"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
}

/**
 * Check that the Search impression is recorded in a private window, using the
 * private default engine, unless private browsing counts are turned off.
 */
add_task(async function test_private_window_impression_counts_enabled() {
  await doPrivateWindowImpressionTest(true);
});

add_task(async function test_private_window_impression_counts_disabled() {
  await doPrivateWindowImpressionTest(false);
});

/**
 * Check that Smart Window never offers the Search action.
 */
add_task(async function test_smart_window_hides_search() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.highlightToSearch.featureGate", true],
      ["browser.highlightToSearch.enabled", true],
      ["browser.highlightToSearch.search.enabled", true],
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.shortcuts.smartwindow", true],
    ],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow();

  try {
    win.document.documentElement.setAttribute("ai-window", "");

    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "data:text/plain,hi"
    );
    const browser = win.gBrowser.selectedBrowser;
    await selectAllAndMouseUp(browser, { win });

    const panel = win.document.getElementById(
      "selection-shortcut-action-panel"
    );
    await TestUtils.waitForCondition(
      () => panel.getAttribute("panelopen") === "true",
      "Selection menu opened in Smart Window"
    );
    Assert.ok(
      win.document.getElementById("search-action-button").hidden,
      "Search is not offered in Smart Window"
    );
    Assert.deepEqual(
      Glean.sapImpressionCounts.textSelection.testGetValue(),
      {},
      "No impression is recorded in Smart Window"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that the menu refuses the contexts that refuse chat entrypoints, such
 * as extension pages, Document Picture-in-Picture and popup windows.
 */
add_task(async function test_no_menu_in_unsupported_context() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.highlightToSearch.featureGate", true]],
  });
  const sandbox = sinon.createSandbox();
  const spy = sandbox.spy(GenAI, "handleShortcutsMessage");
  sandbox.stub(GenAI, "isSupportedContext").returns(false);

  try {
    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      const panel = document.getElementById("selection-shortcut-action-panel");
      await selectAllAndMouseUp(browser);
      await TestUtils.waitForCondition(
        () => spy.called,
        "Actor offered shortcuts to the parent"
      );

      Assert.equal(
        panel.state,
        "closed",
        "Menu stays closed in an unsupported context"
      );
    });
  } finally {
    sandbox.restore();
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that shortcuts in Smart Window submit to Smart Window
 */
add_task(async function test_smart_window_ask_chat() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.shortcuts.smartwindow", true],
    ],
  });

  const submitChatMessage = sinon.stub();
  const isSidebarOpenStub = sinon
    .stub(AIWindowUI, "isSidebarOpen")
    .returns(true);
  const getSidebarAiWindowStub = sinon
    .stub(AIWindowUI, "_getSidebarAiWindow")
    .returns({ submitChatMessage });

  const win = await BrowserTestUtils.openNewBrowserWindow();

  try {
    win.document.documentElement.setAttribute("ai-window", "");

    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "data:text/plain,hi"
    );
    const browser = win.gBrowser.selectedBrowser;
    await selectAllAndMouseUp(browser, { win });

    const selectionPanel = win.document.getElementById(
      "selection-shortcut-action-panel"
    );
    await TestUtils.waitForCondition(
      () => selectionPanel.getAttribute("panelopen") === "true"
    );
    Assert.ok(
      selectionPanel.hasAttribute("panelopen"),
      "Shortcuts shown in Smart Window"
    );

    const popup = win.document.getElementById("chat-shortcuts-options-panel");
    const shortcuts = win.document.getElementById("ai-action-button");
    shortcuts.click();
    await BrowserTestUtils.waitForEvent(popup, "popupshown");

    popup.querySelector("toolbarbutton").click();

    await TestUtils.waitForCondition(() => submitChatMessage.calledOnce);
    Assert.equal(
      submitChatMessage.firstCall.args[0].text,
      "Summarize: hi",
      "Prompt is label + selection"
    );
    Assert.equal(
      submitChatMessage.firstCall.args[0].submitType,
      "shortcuts",
      "submitType is shortcuts"
    );

    const events = Glean.genaiChatbot.promptClick.testGetValue();
    Assert.equal(events.length, 1, "One prompt click");
    Assert.equal(events[0].extra.smart_window, "true", "Is smart window");

    // The selection menu is one shared panel, so its probes have to mark the
    // Smart Window flow to keep it out of Highlight to Search analysis.
    const displayed = Glean.selectionMenu.displayed.testGetValue();
    Assert.equal(
      displayed.at(-1).extra.smart_window,
      "true",
      "Menu displayed in Smart Window"
    );
    const clicks = Glean.selectionMenu.actionClick.testGetValue();
    Assert.equal(
      clicks.at(-1).extra.smart_window,
      "true",
      "AI action clicked in Smart Window"
    );
  } finally {
    isSidebarOpenStub.restore();
    getSidebarAiWindowStub.restore();
    await BrowserTestUtils.closeWindow(win);
  }

  await SpecialPowers.popPrefEnv();
});

/**
 * Check that Smart Window shortcuts show even when classic window
 * shortcuts have been hidden via browser.ml.chat.shortcuts.
 */
add_task(async function test_smart_window_ask_chat_ignores_classic_toggle() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", false],
      ["browser.ml.chat.shortcuts.smartwindow", true],
    ],
  });

  const win = await BrowserTestUtils.openNewBrowserWindow();

  try {
    win.document.documentElement.setAttribute("ai-window", "");

    await BrowserTestUtils.openNewForegroundTab(
      win.gBrowser,
      "data:text/plain,hi"
    );
    const browser = win.gBrowser.selectedBrowser;
    await selectAllAndMouseUp(browser, { win });

    const selectionPanel = win.document.getElementById(
      "selection-shortcut-action-panel"
    );
    await TestUtils.waitForCondition(
      () => selectionPanel.getAttribute("panelopen") === "true"
    );
    Assert.ok(
      selectionPanel.hasAttribute("panelopen"),
      "Shortcuts shown in Smart Window even with classic shortcuts disabled"
    );
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }

  await SpecialPowers.popPrefEnv();
});

/**
 * Check the AI action reads as a dropdown: one button carrying a caret, with
 * the popup state on the button itself, opening the prompts submenu on click.
 */
add_task(async function test_ai_action_dropdown() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.shortcut.onboardingMouseoverCount", 2],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });

  await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
    await selectAllAndMouseUp(browser);

    const panel = document.getElementById("selection-shortcut-action-panel");
    await TestUtils.waitForCondition(
      () => panel.getAttribute("panelopen") === "true"
    );

    const aiActionButton = document.getElementById("ai-action-button");
    await aiActionButton.updateComplete;

    Assert.ok(
      !aiActionButton.isSplitButton,
      "AI action is a single target, not a split button"
    );
    Assert.ok(
      !aiActionButton.chevronButtonEl,
      "No separate chevron half renders"
    );

    const background = aiActionButton.shadowRoot.querySelector(
      "#main-button .button-background"
    );
    Assert.notEqual(
      getComputedStyle(background, "::after").backgroundImage,
      "none",
      "A caret is drawn on the AI action"
    );

    const mainButton = aiActionButton.shadowRoot.querySelector("#main-button");
    Assert.equal(
      mainButton.getAttribute("aria-haspopup"),
      "menu",
      "The AI action reports it has a popup"
    );
    Assert.equal(
      mainButton.getAttribute("aria-expanded"),
      "false",
      "Submenu starts collapsed"
    );

    const popup = document.getElementById("chat-shortcuts-options-panel");
    const shown = BrowserTestUtils.waitForEvent(popup, "popupshown");
    aiActionButton.click();
    await shown;

    await TestUtils.waitForCondition(
      () => mainButton.getAttribute("aria-expanded") === "true"
    );
    Assert.equal(
      mainButton.getAttribute("aria-expanded"),
      "true",
      "The AI action reports the submenu is open"
    );

    const hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
    popup.hidePopup();
    await hidden;

    await TestUtils.waitForCondition(
      () => mainButton.getAttribute("aria-expanded") === "false"
    );
    Assert.equal(
      mainButton.getAttribute("aria-expanded"),
      "false",
      "The AI action reports the submenu is closed again"
    );

    await aiActionButton.updateComplete;
    Assert.notEqual(
      getComputedStyle(background, "::after").backgroundImage,
      "none",
      "The caret survives the active-state flip"
    );

    // browser.nova.enabled's default varies by test configuration, so flip
    // whatever the current value is to force an actual state change. A
    // -moz-pref() media query re-evaluates asynchronously after the pref
    // changes, so wait for the style to catch up rather than reading it
    // right away.
    const novaEnabled = Services.prefs.getBoolPref("browser.nova.enabled");
    const borderRadiusBefore = getComputedStyle(background).borderRadius;
    await SpecialPowers.pushPrefEnv({
      set: [["browser.nova.enabled", !novaEnabled]],
    });
    await TestUtils.waitForCondition(
      () => getComputedStyle(background).borderRadius !== borderRadiusBefore,
      "Toggling the nova pref changes the button border radius"
    );
    Assert.notEqual(
      getComputedStyle(background, "::after").backgroundImage,
      "none",
      "The caret is still drawn with the nova pref toggled"
    );
    await SpecialPowers.popPrefEnv();
    await TestUtils.waitForCondition(
      () => getComputedStyle(background).borderRadius === borderRadiusBefore,
      "The border radius returns to its original value"
    );
    const panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    panel.hide();
    await panelHidden;
  });

  await SpecialPowers.popPrefEnv();
});

/**
 * Check that the menu's on/off state is reported as a state metric that
 * follows both the feature gate and the setting.
 */
add_task(async function test_enabled_metric() {
  for (const [gate, enabled] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.highlightToSearch.featureGate", gate],
        ["browser.highlightToSearch.enabled", enabled],
      ],
    });
    Assert.strictEqual(
      Glean.selectionMenu.enabled.testGetValue(),
      gate && enabled,
      `Reports the menu with the gate ${gate} and the setting ${enabled}`
    );
    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check that the AI submenu keeps its hide item until the Highlight to Search
 * feature gate is on, when Settings takes over turning the shortcut off.
 */
add_task(async function test_hide_item_follows_feature_gate() {
  for (const gate of [false, true]) {
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.highlightToSearch.featureGate", gate],
        ["browser.ml.chat.shortcuts", true],
        ["browser.ml.chat.shortcut.onboardingMouseoverCount", 2],
        ["browser.ml.chat.provider", "http://localhost:8080"],
      ],
    });

    await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
      const panel = await showSelectionMenu(browser);

      const popup = document.getElementById("chat-shortcuts-options-panel");
      const shown = BrowserTestUtils.waitForEvent(popup, "popupshown");
      EventUtils.synthesizeMouseAtCenter(
        document.getElementById("ai-action-button"),
        {},
        window
      );
      await shown;

      Assert.equal(
        !!popup.querySelector("[data-l10n-id='genai-shortcuts-hide']"),
        !gate,
        `The hide item is ${gate ? "absent" : "present"} with the gate ${
          gate ? "on" : "off"
        }`
      );

      const popupHidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
      popup.hidePopup();
      await popupHidden;
      const panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
      panel.hide();
      await panelHidden;
      await TestUtils.waitForCondition(
        () => !panel.hasAttribute("panelopen"),
        "The selection menu closed"
      );
    });

    await SpecialPowers.popPrefEnv();
  }
});

/**
 * Check the selection menu records its own display and action click events,
 * separately from the chatbot-scoped shortcuts probes.
 */
add_task(async function test_selection_menu_events() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.shortcut.onboardingMouseoverCount", 2],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });

  await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
    const panel = await showSelectionMenu(browser);

    const displayed = Glean.selectionMenu.displayed.testGetValue();
    Assert.equal(displayed.length, 1, "Menu displayed once");
    Assert.ok(displayed[0].extra.delay, "Waited some time");
    Assert.equal(displayed[0].extra.selection, 2, "Selected hi");
    Assert.equal(
      displayed[0].extra.smart_window,
      "false",
      "Not a Smart Window menu"
    );

    Assert.equal(
      Glean.selectionMenu.actionClick.testGetValue(),
      null,
      "No action clicked yet"
    );

    const popup = document.getElementById("chat-shortcuts-options-panel");
    document.getElementById("ai-action-button").click();
    await BrowserTestUtils.waitForEvent(popup, "popupshown");

    const clicks = Glean.selectionMenu.actionClick.testGetValue();
    Assert.equal(clicks.length, 1, "One action clicked");
    Assert.equal(clicks[0].extra.action, "ai", "Clicked the AI action");
    Assert.equal(clicks[0].extra.selection, 2, "Selected hi");
    Assert.equal(
      clicks[0].extra.smart_window,
      "false",
      "Not a Smart Window click"
    );

    const panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    panel.hide();
    await panelHidden;
  });

  await SpecialPowers.popPrefEnv();
});

/**
 * Check that shortcuts get shown on selection and open popup and sidebar
 */
add_task(async function test_show_shortcuts() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.shortcut.onboardingMouseoverCount", 0],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });

  await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
    await selectAllAndMouseUp(browser);

    await TestUtils.waitForCondition(() => {
      const panelElement = document.getElementById(
        "selection-shortcut-action-panel"
      );
      return panelElement.getAttribute("panelopen") === "true";
    });

    const shortcuts = document.querySelector("#ai-action-button");
    Assert.ok(shortcuts, "Shortcuts added on select");
    let events = Glean.genaiChatbot.shortcutsDisplayed.testGetValue();
    Assert.equal(events.length, 1, "Shortcuts shown once");
    Assert.ok(events[0].extra.delay, "Waited some time");
    Assert.equal(events[0].extra.inputType, "", "Not in input");
    Assert.equal(events[0].extra.selection, 2, "Selected hi");

    const popup = document.getElementById("chat-shortcuts-options-panel");
    Assert.equal(popup.state, "closed", "Popup is closed");

    Assert.equal(
      Services.prefs.getIntPref(
        "browser.ml.chat.shortcut.onboardingMouseoverCount"
      ),
      0,
      "Pref should start at 0"
    );

    EventUtils.sendMouseEvent({ type: "mouseover" }, shortcuts);
    await BrowserTestUtils.waitForEvent(popup, "popupshown");
    Assert.equal(
      Services.prefs.getIntPref(
        "browser.ml.chat.shortcut.onboardingMouseoverCount"
      ),
      1,
      "Pref should be 1 after mouseover"
    );
    Assert.equal(
      popup.state,
      "open",
      "Popup is open with mouseover the first time"
    );
    const hidePopup = BrowserTestUtils.waitForEvent(popup, "popuphidden");
    popup.hidePopup();
    await hidePopup;

    EventUtils.sendMouseEvent({ type: "mouseover" }, shortcuts);
    await BrowserTestUtils.waitForEvent(popup, "popupshown");
    Assert.equal(
      Services.prefs.getIntPref(
        "browser.ml.chat.shortcut.onboardingMouseoverCount"
      ),
      2,
      "Pref should be 2 after second mouseover"
    );

    Assert.equal(
      popup.state,
      "open",
      "Popup is open with mouseover the second time"
    );
    const hidePopupSecondTime = BrowserTestUtils.waitForEvent(
      popup,
      "popuphidden"
    );
    popup.hidePopup();
    await hidePopupSecondTime;

    EventUtils.sendMouseEvent({ type: "mouseover" }, shortcuts);
    Assert.equal(
      Services.prefs.getIntPref(
        "browser.ml.chat.shortcut.onboardingMouseoverCount"
      ),
      2,
      "Pref should still be 2 after third mouseover"
    );
    Assert.equal(
      popup.state,
      "closed",
      "Popup doesn't open with mouseover after the second time"
    );

    let beforeClick = Glean.genaiChatbot.shortcutsExpanded.testGetValue();
    shortcuts.click();
    await BrowserTestUtils.waitForEvent(popup, "popupshown");
    Assert.equal(popup.state, "open", "Popup open with click");

    let afterClick = Glean.genaiChatbot.shortcutsExpanded.testGetValue();
    Assert.equal(
      afterClick.length,
      beforeClick.length + 1,
      "One shortcuts opened"
    );
    const lastEvent = afterClick[afterClick.length - 1];
    Assert.equal(lastEvent.extra.selection, 2, "Selected hi");
    Assert.equal(
      lastEvent.extra.warning,
      "false",
      "Warning lable value is correct"
    );

    const custom = popup.querySelector("textarea");
    Assert.ok(custom, "Got custom prompt entry");
    Assert.ok(custom.style.height, "Dynamic height for custom");

    Assert.ok(!SidebarController.isOpen, "Sidebar is closed");
    popup.querySelector("toolbarbutton").click();
    const isOpen = await TestUtils.waitForCondition(
      () => SidebarController.isOpen
    );

    Assert.ok(isOpen, "Chat opened sidebar");
    events = Glean.genaiChatbot.shortcutsPromptClick.testGetValue();
    Assert.equal(events.length, 1, "One shortcut clicked");
    Assert.equal(events[0].extra.prompt, "summarize", "Picked summarize");
    Assert.equal(events[0].extra.provider, "localhost", "With localhost");
    Assert.equal(events[0].extra.selection, 2, "Selected hi");

    events = Glean.genaiChatbot.promptClick.testGetValue();
    Assert.equal(events.length, 1, "One shortcut clicked");
    Assert.equal(events[0].extra.content_type, "selection", "Using selection");
    Assert.equal(events[0].extra.prompt, "summarize", "Picked summarize");
    Assert.equal(events[0].extra.provider, "localhost", "With localhost");
    Assert.equal(events[0].extra.selection, 2, "Selected hi");
    Assert.equal(events[0].extra.smart_window, "false", "Not smart window");
    Assert.equal(events[0].extra.source, "shortcuts", "From shortcuts menu");

    SidebarController.hide();
  });
});

/**
 * Check that shortcuts shown on second tab
 */
add_task(async function test_show_shortcuts_second_tab() {
  // NB: this test runs after test_show_shortcuts, which showed shortcuts
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });
  await BrowserTestUtils.withNewTab(
    "data:text/html,<title>second</title>page",
    async browser => {
      await selectAllAndMouseUp(browser);

      await TestUtils.waitForCondition(() => {
        const panelElement = document.getElementById(
          "selection-shortcut-action-panel"
        );
        return panelElement.getAttribute("panelopen") === "true";
      });
      const sandbox = sinon.createSandbox();
      const stub = sandbox.stub(GenAI, "addAskChatItems");

      const shortcuts = document.querySelector("#ai-action-button");
      shortcuts.click();

      Assert.equal(stub.callCount, 1, "Shortcuts added on select");
      Assert.equal(stub.firstCall.args[0], browser, "Got correct browser");

      sandbox.restore();
    }
  );
});

/**
 * Check that the warning label is shown when too much text is selected
 */
add_task(async function test_show_warning_label() {
  Services.fog.testResetFOG();
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.chat.shortcuts", true]],
  });
  await BrowserTestUtils.withNewTab(
    "data:text/plain,hi".repeat(1000),
    async browser => {
      await selectAllAndMouseUp(browser);

      const selectionShortcutActionPanel = document.getElementById(
        "selection-shortcut-action-panel"
      );

      // Wait for shortcut actions panel to open
      await BrowserTestUtils.waitForEvent(
        selectionShortcutActionPanel,
        "popupshown"
      );

      Assert.ok(selectionShortcutActionPanel, "Shortcuts panel shown");
      const aiActionButton =
        selectionShortcutActionPanel.querySelector("#ai-action-button");

      let events = Glean.genaiChatbot.shortcutsDisplayed.testGetValue();
      Assert.equal(events.length, 1, "Shortcuts shown once");
      Assert.ok(events[0].extra.delay, "Waited some time");
      Assert.equal(events[0].extra.inputType, "", "Not in input");
      Assert.greater(
        Number(events[0].extra.selection),
        8192,
        "Selected enough text"
      );

      // Click button
      aiActionButton.click();

      const chatShortcutsOptionsPanel = document.getElementById(
        "chat-shortcuts-options-panel"
      );

      // Wait for wait for shortcut options panel to open
      await BrowserTestUtils.waitForEvent(
        chatShortcutsOptionsPanel,
        "popupshown"
      );

      Assert.ok(
        chatShortcutsOptionsPanel.querySelector(".ask-chat-shortcut-warning"),
        "Warning label shown"
      );

      events = Glean.genaiChatbot.shortcutsExpanded.testGetValue();
      Assert.equal(
        events[0].extra.warning,
        "true",
        "Warning lable value is correct"
      );

      Assert.ok(
        !aiActionButton.getAttribute("type").includes("ghost"),
        "button is active"
      );

      const hidden = BrowserTestUtils.waitForEvent(
        chatShortcutsOptionsPanel,
        "popuphidden"
      );
      chatShortcutsOptionsPanel.hidePopup();
      await hidden;

      Assert.ok(
        aiActionButton.getAttribute("type").includes("ghost"),
        "button is inactive"
      );
    }
  );
});

/**
 * Check that only plain clicks would show shortcuts
 */
add_task(async function test_plain_clicks() {
  // Set longpress to 0 to prevent delay condition from failing
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.chat.shortcuts.longPress", 0]],
  });

  const sandbox = sinon.createSandbox();
  const stub = sandbox
    .stub(GenAI, "handleShortcutsMessage")
    .withArgs("GenAI:ShowShortcuts");

  await BrowserTestUtils.withNewTab("data:text/plain,click", async browser => {
    await BrowserTestUtils.synthesizeMouse(
      browser,
      60,
      10,
      { type: "mouseup" },
      browser
    );

    await TestUtils.waitForCondition(() => stub.callCount !== 0);

    Assert.equal(stub.callCount, 1, "Plain click handled");

    await BrowserTestUtils.synthesizeMouse(
      browser,
      60,
      10,
      { button: 1, type: "mouseup" },
      browser
    );

    Assert.equal(stub.callCount, 1, "Middle click ignored");

    await BrowserTestUtils.synthesizeMouse(
      browser,
      60,
      10,
      { shiftKey: true, type: "mouseup" },
      browser
    );

    Assert.equal(stub.callCount, 1, "Modified click ignored");
  });

  await SpecialPowers.popPrefEnv();

  sandbox.restore();
});

/**
 * Check that input selection can show shortcuts
 */
add_task(async function test_input_selection() {
  Assert.equal(GenAI.ignoredInputs.size, 2, "Default ignore 2 types of fields");
  Assert.ok(GenAI.ignoredInputs.has("input"), "Default ignore inputs");
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.ml.chat.shortcuts.ignoreFields",
        "contenteditable,textarea,moz-multiline-editor",
      ],
    ],
  });
  Assert.equal(GenAI.ignoredInputs.size, 3, "Ignoring other fields not input");
  Assert.ok(GenAI.ignoredInputs.has("textarea"), "Now ignore textarea");
  Assert.ok(!GenAI.ignoredInputs.has("input"), "Not ignoring input for test");

  const sandbox = sinon.createSandbox();
  const stub = sandbox.stub(GenAI, "handleShortcutsMessage");

  await BrowserTestUtils.withNewTab(
    `data:text/html,<input value="input"/>`,
    async browser => {
      await SpecialPowers.spawn(browser, [], () => {
        const input = content.document.querySelector("input");
        input.focus();
        input.selectionEnd = 3;
      });

      await BrowserTestUtils.synthesizeMouse(
        browser,
        60,
        10,
        { type: "mouseup" },
        browser
      );
      const showCalls = () =>
        stub.getCalls().filter(c => c.args[0] == "GenAI:ShowShortcuts");
      await TestUtils.waitForCondition(() => showCalls().length);

      Assert.equal(showCalls().length, 1, "Show shortcuts once");
      Assert.equal(
        showCalls()[0].args[1].selection,
        "inp",
        "Got selected text from input"
      );
      Assert.equal(showCalls()[0].args[1].inputType, "input", "Got input type");
    }
  );

  sandbox.restore();
});

/**
 * Check that a selection the page makes while the mouse is clicked doesn't
 * show shortcuts, but one that comes with a drag does.
 */
add_task(async function test_page_made_selection() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.chat.shortcuts.debounce", 0]],
  });
  const sandbox = sinon.createSandbox();
  const stub = sandbox.stub(GenAI, "handleShortcutsMessage");
  const showCalls = () =>
    stub.getCalls().filter(c => c.args[0] == "GenAI:ShowShortcuts");

  await BrowserTestUtils.withNewTab(
    `data:text/html,<p id="text">select this text</p><div style="height:3000px"></div>`,
    async browser => {
      const select = (start, end) =>
        SpecialPowers.spawn(browser, [start, end], (from, to) => {
          const node = content.document.getElementById("text").firstChild;
          content.getSelection().setBaseAndExtent(node, from, node, to);
        });
      const press = x =>
        BrowserTestUtils.synthesizeMouse(
          browser,
          x,
          10,
          { type: "mousedown" },
          browser
        );
      const release = x =>
        BrowserTestUtils.synthesizeMouse(
          browser,
          x,
          10,
          { type: "mouseup" },
          browser
        );

      await SimpleTest.promiseFocus(browser);

      // The page selects the whole line while the mouse is clicked in place.
      await press(10);
      await select(0, 16);
      await release(10);
      // Let the actor's zero-length debounce run, so the next gesture can't
      // cancel a message that would have been sent.
      await SpecialPowers.spawn(
        browser,
        [],
        () => new Promise(resolve => content.setTimeout(resolve, 100))
      );
      Assert.equal(
        showCalls().length,
        0,
        "A click the page answered is ignored"
      );

      // The user then drags across a single word.
      await press(10);
      await select(7, 11);
      await release(60);
      await TestUtils.waitForCondition(() => showCalls().length);

      Assert.equal(
        showCalls()[0].args[1].selection,
        "this",
        "The first shortcuts were for the dragged selection, not the page's"
      );

      // The user holds the button and scrolls to extend the selection.
      await press(10);
      await SpecialPowers.spawn(browser, [], () => content.scrollBy(0, 50));
      await select(0, 4);
      await release(10);
      await TestUtils.waitForCondition(() => showCalls().length == 2);

      Assert.equal(
        showCalls()[1].args[1].selection,
        "sele",
        "Scrolling while the button is held counts as the user selecting"
      );
    }
  );

  sandbox.restore();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_panel_actions_layout() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });

  await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
    await selectAllAndMouseUp(browser);

    const panel = document.getElementById("selection-shortcut-action-panel");
    await TestUtils.waitForCondition(
      () => panel.getAttribute("panelopen") === "true",
      "Panel should open after text selection"
    );

    const buttons = [...panel.querySelectorAll("moz-button")];
    Assert.deepEqual(
      buttons.map(button => button.id),
      [
        "ai-action-button",
        "search-action-button",
        "copy-action-button",
        "more-actions-button",
      ],
      "Panel holds the four controls in the correct order"
    );

    Assert.ok(!buttons[0].hidden, "AI action is visible");
    for (const button of buttons.slice(1)) {
      Assert.ok(button.hidden, `${button.id} is hidden`);
      Assert.equal(
        button.getBoundingClientRect().width,
        0,
        `${button.id} takes up no space while hidden`
      );
    }

    // panel-subview-body stacks its children, so check the actions really do
    // sit in a row.
    for (const button of buttons) {
      button.hidden = false;
      await button.updateComplete;
    }
    const rects = buttons.map(button => button.getBoundingClientRect());
    for (let i = 1; i < rects.length; i++) {
      Assert.equal(
        rects[i].top,
        rects[i - 1].top,
        `${buttons[i].id} shares a row with ${buttons[i - 1].id}`
      );
      Assert.greater(
        rects[i].left,
        rects[i - 1].left,
        `${buttons[i].id} follows ${buttons[i - 1].id} along the row`
      );
    }
    for (const button of buttons.slice(1)) {
      button.hidden = true;
    }

    // moz-button maps the host aria-label and title onto the inner button, so
    // check the element that actually takes focus rather than the custom
    // element.
    await document.l10n.translateFragment(panel);
    for (const button of buttons) {
      await button.updateComplete;
      const ariaLabel = button.buttonEl.getAttribute("aria-label") ?? "";
      Assert.stringMatches(
        ariaLabel,
        /\S/,
        `${button.id} has an accessible name`
      );
      Assert.equal(
        button.buttonEl.getAttribute("title"),
        ariaLabel,
        `${button.id} shows the same text as a tooltip`
      );
      Assert.ok(button.iconSrc, `${button.id} has an icon`);
    }

    Assert.equal(
      buttons[0].buttonEl.getAttribute("aria-label"),
      "Ask about this text",
      "AI action uses the provider-agnostic label"
    );
    Assert.stringMatches(
      buttons[1].buttonEl.getAttribute("aria-label"),
      /^Search .+ for “hi”$/,
      "Search action names the engine and the selection"
    );
  });

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_panel_opens_without_search_service() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });

  const panel = document.getElementById("selection-shortcut-action-panel");
  panel.hidePopup();
  await TestUtils.waitForCondition(
    () => !panel.hasAttribute("panelopen"),
    "Panel left over from an earlier task should be closed"
  );

  await BrowserTestUtils.withNewTab("data:text/plain,hi", async browser => {
    await SimpleTest.promiseFocus(browser);

    // "failed" rather than the other statuses because it is the one that makes
    // the default engine getters throw.
    SearchService.forceInitializationStatusForTests("failed");
    try {
      await selectAllAndMouseUp(browser);
      await TestUtils.waitForCondition(
        () => panel.getAttribute("panelopen") === "true"
      );
      Assert.ok(
        panel.hasAttribute("panelopen"),
        "Panel still opens when the search service failed to initialize"
      );
    } finally {
      SearchService.forceInitializationStatusForTests("success");
    }
  });

  await SpecialPowers.popPrefEnv();
});

/**
 * Check that IME composition hides the shortcuts panel visually
 */
add_task(async function test_ime_composition_hides_panel() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.ml.chat.shortcuts", true],
      ["browser.ml.chat.provider", "http://localhost:8080"],
    ],
  });

  await BrowserTestUtils.withNewTab("data:text/plain,hello", async browser => {
    await selectAllAndMouseUp(browser);

    const panel = document.getElementById("selection-shortcut-action-panel");
    await TestUtils.waitForCondition(
      () => panel.getAttribute("panelopen") === "true",
      "Panel should open after text selection"
    );

    Assert.ok(!panel.hasAttribute("ime-hiding"), "No ime-hiding before IME");

    // Simulate IME composition - compositionstart sets #compositionActive, then
    // selectionchange triggers a CSS-only hide instead of hidePopup().
    await SpecialPowers.spawn(browser, [], () => {
      content.document.dispatchEvent(
        new content.CompositionEvent("compositionstart", {
          bubbles: true,
          data: "",
        })
      );
      content.document.dispatchEvent(
        new content.Event("selectionchange", { bubbles: true })
      );
    });

    await TestUtils.waitForCondition(
      () => panel.hasAttribute("ime-hiding"),
      "Panel should have ime-hiding attribute during IME composition"
    );
    Assert.equal(
      panel.getAttribute("panelopen"),
      "true",
      "hidePopup was not called during IME composition"
    );
  });

  await SpecialPowers.popPrefEnv();
});

const DEFAULT_IGNORE_FIELDS = "input,moz-multiline-editor";

/**
 * Check that textareas are ignored only while the Highlight to Search feature
 * gate is on, so existing chatbot users keep the menu there until then.
 */
add_task(async function test_textarea_ignored_with_feature_gate() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.ml.chat.shortcuts.ignoreFields", DEFAULT_IGNORE_FIELDS]],
  });
  Assert.ok(
    !GenAI.ignoredInputs.has("textarea"),
    "Textareas are not ignored while the feature gate is off"
  );

  await SpecialPowers.pushPrefEnv({
    set: [["browser.highlightToSearch.featureGate", true]],
  });
  Assert.ok(
    GenAI.ignoredInputs.has("textarea"),
    "Textareas are ignored while the feature gate is on"
  );
  Assert.ok(GenAI.ignoredInputs.has("input"), "Inputs are still ignored");

  await SpecialPowers.popPrefEnv();
  Assert.ok(
    !GenAI.ignoredInputs.has("textarea"),
    "Textareas are shown again once the feature gate is off"
  );
  await SpecialPowers.popPrefEnv();
});

async function selectTextareaAndMouseUp(browser) {
  await SimpleTest.promiseFocus(browser);
  await BrowserTestUtils.synthesizeMouse(
    browser,
    10,
    10,
    { type: "mousedown" },
    browser
  );
  await SpecialPowers.spawn(browser, [], () => {
    const textarea = content.document.querySelector("textarea");
    textarea.focus();
    textarea.select();
  });
  await BrowserTestUtils.synthesizeMouse(
    browser,
    60,
    10,
    { type: "mouseup" },
    browser
  );
}

/**
 * Check that selecting text in a textarea shows no menu while the feature gate
 * is on, and still does while it is off.
 */
add_task(async function test_textarea_selection_menu() {
  const panel = document.getElementById("selection-shortcut-action-panel");
  const spy = sinon.spy(GenAI, "handleShortcutsMessage");

  for (const featureGate of [true, false]) {
    spy.resetHistory();
    await SpecialPowers.pushPrefEnv({
      set: [
        ["browser.highlightToSearch.featureGate", featureGate],
        ["browser.ml.chat.shortcuts.ignoreFields", DEFAULT_IGNORE_FIELDS],
        ["browser.ml.chat.shortcuts", true],
        ["browser.ml.chat.shortcut.onboardingMouseoverCount", 2],
        ["browser.ml.chat.provider", "http://localhost:8080"],
      ],
    });

    await BrowserTestUtils.withNewTab(
      "data:text/html,<textarea>some text</textarea>",
      async browser => {
        await selectTextareaAndMouseUp(browser);
        await TestUtils.waitForCondition(
          () => spy.calledWith("GenAI:ShowShortcuts"),
          "Actor offered the textarea selection to the parent"
        );

        if (featureGate) {
          Assert.equal(
            panel.state,
            "closed",
            "No menu for a textarea while the feature gate is on"
          );
        } else {
          await TestUtils.waitForCondition(
            () => panel.getAttribute("panelopen") === "true",
            "Menu opens for a textarea while the feature gate is off"
          );
          const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
          panel.hide();
          await hidden;
        }
      }
    );

    await SpecialPowers.popPrefEnv();
  }

  spy.restore();
});
