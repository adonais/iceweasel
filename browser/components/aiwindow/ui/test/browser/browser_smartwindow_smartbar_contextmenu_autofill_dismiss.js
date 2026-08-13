/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that the Smartbar input context menu in the AI window has the
 * adaptive autofill Dismiss/Forget.
 */

"use strict";

const ADAPTIVE_URL = "https://example.com/adaptive-page";
const SEARCH_STRING = "exa";
const ADAPTIVE_INPUT = "exa";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
});

async function addAdaptiveHistoryEntry(url, input, useCount = 3) {
  await lazy.PlacesTestUtils.addVisits({
    uri: url,
    transition: lazy.PlacesUtils.history.TRANSITIONS.TYPED,
  });
  for (let i = 0; i < useCount; i++) {
    await lazy.UrlbarUtils.addToInputHistory(url, input);
  }
}

async function triggerContextMenuCommand(browser, anonid) {
  await SpecialPowers.spawn(browser, [anonid], async itemAnonid => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    const inputBox = smartbar.querySelector("moz-input-box");
    const menupopup = inputBox.menupopup;

    await ContentTaskUtils.waitForCondition(
      () => smartbar._resultForCurrentValue?.autofill?.type === "adaptive_url",
      "Wait for adaptive_url autofill heuristic"
    );

    // Mirror UrlbarTestUtils.activateContextMenuItem: open the popup with a
    // real contextmenu event so popupshowing visibility logic runs, then
    // activate the item the same way a click would.
    const popupShown = ContentTaskUtils.waitForEvent(menupopup, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      smartbar.inputField,
      { type: "contextmenu", button: 2 },
      content
    );
    await popupShown;
    // On Mac sometimes the menuitems are not ready.
    await new Promise(content.requestAnimationFrame);
    await ContentTaskUtils.waitForCondition(
      () => menupopup.state === "open",
      "Wait for context menu to be fully open"
    );

    const item = inputBox.getMenuItem(itemAnonid);
    menupopup.activateItem(item);
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.autoFill", true],
      ["browser.urlbar.autoFill.adaptiveHistory.enabled", true],
      ["browser.urlbar.autoFill.adaptiveHistory.minCharsThreshold", 0],
      ["browser.urlbar.autoFill.adaptiveHistory.useCountThreshold", 0],
      ["browser.urlbar.suggest.quicksuggest.sponsored", false],
      ["browser.urlbar.suggest.quicksuggest.nonsponsored", false],
    ],
  });

  registerCleanupFunction(async () => {
    await lazy.PlacesUtils.history.clear();
    await lazy.PlacesUtils.bookmarks.eraseEverything();
  });
});

add_task(
  async function dismiss_via_smartbar_context_menu_blocks_adaptive_url() {
    await lazy.PlacesUtils.history.clear();
    await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    await typeInSmartbar(browser, SEARCH_STRING);
    await triggerContextMenuCommand(browser, "urlbar-input-dismiss-autofill");

    const originId = await lazy.PlacesTestUtils.getDatabaseValue(
      "moz_places",
      "origin_id",
      { url: ADAPTIVE_URL }
    );
    await TestUtils.waitForCondition(async () => {
      const val = await lazy.PlacesTestUtils.getDatabaseValue(
        "moz_origins",
        "block_pages_until_ms",
        { id: originId }
      );
      return val > Date.now();
    }, "block_pages_until_ms should be set after smartbar context-menu dismiss");
    Assert.ok(true, "Dismiss recorded a page-level autofill block");

    await BrowserTestUtils.closeWindow(win);
    await lazy.PlacesUtils.history.clear();
  }
);

add_task(
  async function forget_via_smartbar_context_menu_removes_from_history() {
    await lazy.PlacesUtils.history.clear();
    await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);

    const win = await openAIWindow();
    const browser = win.gBrowser.selectedBrowser;

    await typeInSmartbar(browser, SEARCH_STRING);
    await triggerContextMenuCommand(
      browser,
      "urlbar-input-remove-from-history"
    );

    await TestUtils.waitForCondition(async () => {
      const page = await lazy.PlacesUtils.history.fetch(ADAPTIVE_URL);
      return !page;
    }, "URL should be removed from history after Forget");
    Assert.ok(true, "Forget removed the URL from history");

    await BrowserTestUtils.closeWindow(win);
    await lazy.PlacesUtils.history.clear();
  }
);
