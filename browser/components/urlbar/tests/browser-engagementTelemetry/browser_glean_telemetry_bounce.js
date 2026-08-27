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
