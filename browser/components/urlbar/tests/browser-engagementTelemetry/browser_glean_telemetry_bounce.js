/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Tests bounce event .
 */

const { Interactions } = ChromeUtils.importESModule(
  "moz-src:///browser/components/places/Interactions.sys.mjs"
);

const BOUNCE_THRESHOLD_SECONDS = 10;
const ENGINE_ID =
  "other-browser_searchSuggestionEngine searchSuggestionEngine.xml";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "browser.urlbar.events.bounce.maxSecondsFromLastSearch",
        BOUNCE_THRESHOLD_SECONDS,
      ],
      ["browser.search.totalSearches", 0],
    ],
  });

  let root = gTestPath;
  let engineURL = new URL("../browser/searchSuggestionEngine.xml", root).href;

  await SearchTestUtils.installOpenSearchEngine({
    url: engineURL,
    setAsDefault: true,
  });

  registerCleanupFunction(async function () {
    Services.prefs.clearUserPref(
      "browser.urlbar.quickactions.timesShownOnboardingLabel"
    );
  });
});

const expected = {
  selected_result: "search_engine",
  results: "search_engine",
  n_results: "1",
  interaction: "typed",
  search_mode: "",
  search_engine_default_id:
    "other-browser_searchSuggestionEngine searchSuggestionEngine.xml",
  n_chars: "4",
  n_words: "1",
  engagement_type: "enter",
  provider: "UrlbarProviderHeuristicFallback",
  threshold: "10",
};

add_task(async function test_bounce_tab_close() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      window.gBrowser,
      "example.com"
    );

    await openPopup("test");
    await doEnter();

    // The bounce counts interactions at or after the tracked start time. Anchor
    // the stubbed interactions around now -- the first is before tracking began
    // and must be excluded -- so the filter is deterministic without reaching
    // into the tracking state.
    let now = Date.now();
    const stub = sinon
      .stub(Interactions, "getRecentInteractionsForBrowser")
      .returns([
        { created_at: now - 60000, totalViewTime: 300 },
        { created_at: now + 60000, totalViewTime: 200 },
        { created_at: now + 120000, totalViewTime: 1000 },
      ]);

    await BrowserTestUtils.removeTab(tab);
    await Interactions.interactionUpdatePromise;

    await assertBounceTelemetry([
      {
        view_time: "1.2",
        selected_result: expected.selected_result,
        results: expected.results,
        n_results: expected.n_results,
        interaction: expected.interaction,
        search_mode: expected.search_mode,
        search_engine_default_id: expected.search_engine_default_id,
        n_chars: expected.n_chars,
        n_words: expected.n_words,
        engagement_type: expected.engagement_type,
        provider: expected.provider,
        threshold: expected.threshold,
        window_mode: "classic",
      },
    ]);

    await PlacesUtils.history.clear();
    stub.restore();
  });
});

add_task(async function test_no_bounce() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      window.gBrowser,
      "example.com"
    );

    await openPopup("test");
    await doEnter();

    // Anchor the stubbed interactions around now (see test_bounce_tab_close);
    // the two at or after tracking sum past the bounce threshold, so no bounce
    // is recorded.
    let now = Date.now();
    const stub = sinon
      .stub(Interactions, "getRecentInteractionsForBrowser")
      .returns([
        { created_at: now - 60000, totalViewTime: 3000 },
        { created_at: now + 60000, totalViewTime: 8000 },
        { created_at: now + 120000, totalViewTime: 5000 },
      ]);

    await BrowserTestUtils.removeTab(tab);
    await Interactions.interactionUpdatePromise;

    await assertBounceTelemetry([]);

    await PlacesUtils.history.clear();
    stub.restore();
  });
});

add_task(async function test_bounce_back_button() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      window.gBrowser,
      "example.com"
    );

    let browser = window.gBrowser.selectedBrowser;
    await openPopup("test");
    await doEnter();

    // Anchor the stubbed interactions around now (see test_bounce_tab_close).
    let now = Date.now();
    const stub = sinon
      .stub(Interactions, "getRecentInteractionsForBrowser")
      .returns([
        { created_at: now - 60000, totalViewTime: 300 },
        { created_at: now + 60000, totalViewTime: 200 },
        { created_at: now + 120000, totalViewTime: 1000 },
      ]);

    gBrowser.goBack();
    await TestUtils.waitForCondition(
      () => browser.currentURI?.spec == "https://example.com/",
      "Waiting for previous page to load"
    );

    await Interactions.interactionUpdatePromise;

    await assertBounceTelemetry([
      {
        view_time: "1.2",
        selected_result: expected.selected_result,
        results: expected.results,
        n_results: expected.n_results,
        interaction: expected.interaction,
        search_mode: expected.search_mode,
        search_engine_default_id: expected.search_engine_default_id,
        n_chars: expected.n_chars,
        n_words: expected.n_words,
        engagement_type: expected.engagement_type,
        provider: expected.provider,
        threshold: expected.threshold,
        window_mode: "classic",
      },
    ]);

    stub.restore();
    await PlacesUtils.history.clear();
    await BrowserTestUtils.removeTab(tab);
  });
});

add_task(async function test_bounce_chrome_navigation() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      window.gBrowser,
      "example.com"
    );

    let browser = window.gBrowser.selectedBrowser;
    await openPopup("test");
    await doEnter();

    // Anchor the stubbed interactions around now (see test_bounce_tab_close).
    let now = Date.now();
    const stub = sinon
      .stub(Interactions, "getRecentInteractionsForBrowser")
      .returns([
        { created_at: now - 60000, totalViewTime: 300 },
        { created_at: now + 60000, totalViewTime: 200 },
        { created_at: now + 120000, totalViewTime: 1000 },
      ]);

    let loaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      "https://example.org/"
    );
    window.openTrustedLinkIn("https://example.org/", "current");
    await loaded;

    await Interactions.interactionUpdatePromise;

    await assertBounceTelemetry([
      {
        view_time: "1.2",
        selected_result: expected.selected_result,
        results: expected.results,
        n_results: expected.n_results,
        interaction: expected.interaction,
        search_mode: expected.search_mode,
        search_engine_default_id: expected.search_engine_default_id,
        n_chars: expected.n_chars,
        n_words: expected.n_words,
        engagement_type: expected.engagement_type,
        provider: expected.provider,
        threshold: expected.threshold,
        window_mode: "classic",
      },
    ]);

    stub.restore();
    await PlacesUtils.history.clear();
    await BrowserTestUtils.removeTab(tab);
  });
});

add_task(async function test_other_engagement() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      window.gBrowser,
      "example.com"
    );

    await openPopup("test");
    await doEnter();

    // Anchor the stubbed interactions around now (see test_bounce_tab_close).
    let now = Date.now();
    const stub = sinon
      .stub(Interactions, "getRecentInteractionsForBrowser")
      .returns([
        { created_at: now - 60000, totalViewTime: 300 },
        { created_at: now + 60000, totalViewTime: 200 },
        { created_at: now + 120000, totalViewTime: 1000 },
      ]);

    await PlacesUtils.history.clear();

    await openPopup("test");
    await doEnter();

    await Interactions.interactionUpdatePromise;

    await assertBounceTelemetry([
      {
        view_time: "1.2",
        selected_result: expected.selected_result,
        results: expected.results,
        n_results: expected.n_results,
        interaction: expected.interaction,
        search_mode: expected.search_mode,
        search_engine_default_id: expected.search_engine_default_id,
        n_chars: expected.n_chars,
        n_words: expected.n_words,
        engagement_type: expected.engagement_type,
        provider: expected.provider,
        threshold: expected.threshold,
        window_mode: "classic",
      },
    ]);

    stub.restore();
    await BrowserTestUtils.removeTab(tab);
  });
});

/**
 * Stubs the interactions of the page an engagement loaded to fall within the
 * bounce threshold, then navigates back to the page the engagement started
 * from, which triggers the bounce. The caller restores the stub.
 *
 * @param {string} startURL
 *   The page the engagement started from.
 */
async function goBackWithinBounceThreshold(startURL) {
  let browser = gBrowser.selectedBrowser;
  let now = Date.now();
  sinon
    .stub(Interactions, "getRecentInteractionsForBrowser")
    .returns([{ created_at: now + 60000, totalViewTime: 1000 }]);

  gBrowser.goBack();
  await TestUtils.waitForCondition(
    () => browser.currentURI?.spec == startURL,
    "Waiting for previous page to load"
  );
  await Interactions.interactionUpdatePromise;
}

add_task(async function test_bounce_search_mode_enter() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com/"
    );

    await openPopup("test");
    await UrlbarTestUtils.activateSearchModeSwitcherItem(
      window,
      `panel-item[data-engine-name="${(await SearchService.getDefault()).name}"]`
    );
    await doEnter();
    await goBackWithinBounceThreshold("https://example.com/");

    await assertBounceTelemetry([
      {
        view_time: "1",
        selected_result: "search_engine",
        search_mode: "search_engine",
        interaction: "typed",
        engagement_type: "enter",
      },
    ]);

    sinon.restore();
    await PlacesUtils.history.clear();
    BrowserTestUtils.removeTab(tab);
  });
});

// Opening an engine's results page from the search mode switcher tracks no
// bounce of its own, so its load triggers the bounce of the page it leaves.
add_task(async function test_bounce_search_mode_switcher_shift_click() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com/"
    );

    await openPopup("test");
    await doEnter();

    let now = Date.now();
    sinon
      .stub(Interactions, "getRecentInteractionsForBrowser")
      .returns([{ created_at: now + 60000, totalViewTime: 1000 }]);

    await openPopup("other");
    let popup = await UrlbarTestUtils.openSearchModeSwitcher(window);
    let engineItem = popup.querySelector(
      `panel-item[data-engine-name="${(await SearchService.getDefault()).name}"]`
    );
    let loaded = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
    EventUtils.synthesizeMouseAtCenter(engineItem, { shiftKey: true });
    await loaded;

    await assertBounceTelemetry([
      {
        view_time: "1",
        selected_result: "search_engine",
        engagement_type: "enter",
      },
    ]);

    sinon.restore();
    await PlacesUtils.history.clear();
    BrowserTestUtils.removeTab(tab);
  });
});

add_task(async function test_bounce_paste_and_go_url() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com/"
    );

    await doPasteAndGo("https://example.org/");
    await goBackWithinBounceThreshold("https://example.com/");

    await assertBounceTelemetry([
      {
        view_time: "1",
        interaction: "pasted",
        engagement_type: "paste_go",
      },
    ]);

    sinon.restore();
    await PlacesUtils.history.clear();
    BrowserTestUtils.removeTab(tab);
  });
});

// Paste & go of a search term has no result for the pasted value, so the
// parent resolves a heuristic result for it and picks that after the
// engagement has been recorded.
add_task(async function test_bounce_paste_and_go_search() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com/"
    );

    await doPasteAndGo("test");
    await goBackWithinBounceThreshold("https://example.com/");

    await assertBounceTelemetry([
      {
        view_time: "1",
        interaction: "pasted",
        engagement_type: "paste_go",
      },
    ]);

    sinon.restore();
    await PlacesUtils.history.clear();
    BrowserTestUtils.removeTab(tab);
  });
});

// An engine search picked while the page of an earlier pick is still tracked
// triggers that page's bounce, with the earlier pick's search mode, and tracks
// a bounce of its own.
add_task(async function test_bounce_engine_search_after_pick() {
  await doTest(async () => {
    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com/"
    );

    await openPopup("test");
    await doEnter();
    let firstPageURL = gBrowser.selectedBrowser.currentURI.spec;

    let now = Date.now();
    sinon
      .stub(Interactions, "getRecentInteractionsForBrowser")
      .returns([{ created_at: now + 60000, totalViewTime: 1000 }]);

    await openPopup("other");
    await UrlbarTestUtils.activateSearchModeSwitcherItem(
      window,
      `panel-item[data-engine-name="${(await SearchService.getDefault()).name}"]`
    );
    await doEnter();
    await Interactions.interactionUpdatePromise;

    await assertBounceTelemetry([
      { view_time: "1", search_mode: "", engagement_type: "enter" },
    ]);

    sinon.restore();
    await goBackWithinBounceThreshold(firstPageURL);

    await assertBounceTelemetry([
      { view_time: "1", search_mode: "", engagement_type: "enter" },
      {
        view_time: "1",
        search_mode: "search_engine",
        engagement_type: "enter",
      },
    ]);

    sinon.restore();
    await PlacesUtils.history.clear();
    BrowserTestUtils.removeTab(tab);
  });
});

/**
 * Engages with Alt+Enter, which opens the page in a new tab, then closes that
 * tab and the tab the engagement happened in. Only closing the new tab records
 * a bounce.
 *
 * @param {Function} search
 *   Starts the search to engage with.
 */
async function doNewTabBounceTest(search) {
  await doTest(async () => {
    let sourceTab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      "https://example.com/"
    );

    await search();
    let onNewTab = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
    EventUtils.synthesizeKey("KEY_Enter", { altKey: true });
    let resultTab = await onNewTab;

    let now = Date.now();
    sinon
      .stub(Interactions, "getRecentInteractionsForBrowser")
      .returns([{ created_at: now + 60000, totalViewTime: 1000 }]);

    await BrowserTestUtils.removeTab(resultTab);
    await assertBounceTelemetry([{ view_time: "1", engagement_type: "enter" }]);

    await BrowserTestUtils.removeTab(sourceTab);
    await Interactions.interactionUpdatePromise;
    await assertBounceTelemetry([{ view_time: "1", engagement_type: "enter" }]);

    sinon.restore();
    await PlacesUtils.history.clear();
  });
}

add_task(async function test_bounce_new_tab() {
  await doNewTabBounceTest(() => openPopup("test"));
});

add_task(async function test_bounce_new_tab_search_mode() {
  await doNewTabBounceTest(async () => {
    await openPopup("test");
    await UrlbarTestUtils.activateSearchModeSwitcherItem(
      window,
      `panel-item[data-engine-name="${(await SearchService.getDefault()).name}"]`
    );
  });
});
