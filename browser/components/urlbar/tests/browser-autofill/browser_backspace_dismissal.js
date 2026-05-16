/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests for adaptive autofill backspace dismissal.
//
// When a user consecutively backspaces away an adaptive autofill suggestion
// enough times (default: 3), the system temporarily blocks the origin or URL
// from autofilling by setting block_until_ms or block_pages_until_ms on
// moz_origins.

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  UrlbarUtils: "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs",
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.sys.mjs",
});

const TEST_PAGE_URL = "https://example.com/some/path";
const TEST_ORIGIN_URL = "https://example.com/";
const TEST_INPUT = "exam";
const BACKSPACE_THRESHOLD = 3;

add_setup(async function () {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();

  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.autoFill", true],
      ["browser.urlbar.autoFill.adaptiveHistory.enabled", true],
      ["browser.urlbar.autoFill.adaptiveHistory.minCharsThreshold", 0],
      ["browser.urlbar.autoFill.adaptiveHistory.useCountThreshold", 0],
      ["browser.urlbar.autoFill.backspaceThreshold", BACKSPACE_THRESHOLD],
    ],
  });

  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
    await PlacesTestUtils.clearInputHistory();
  });
});

async function seedAdaptiveHistory(url, input, useCount = 3) {
  // A typed visit is important because it will generate the possibility for
  // origins autofill to trigger for the URL.
  await PlacesTestUtils.addVisits({
    url,
    transition: PlacesUtils.history.TRANSITION_TYPED,
  });
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await PlacesUtils.withConnectionWrapper("seedAdaptiveHistory", async db => {
    await db.executeCached(
      `
      INSERT OR REPLACE INTO moz_inputhistory (place_id, input, use_count)
      SELECT id, :input, :useCount
      FROM moz_places
      WHERE url_hash = hash(:url) AND url = :url
      `,
      { url, input: input.toLowerCase(), useCount }
    );
  });
}

async function getOriginBlockState(url) {
  let originId = await PlacesTestUtils.getDatabaseValue(
    "moz_places",
    "origin_id",
    { url }
  );
  if (!originId) {
    return null;
  }
  let blockUntilMs = await PlacesTestUtils.getDatabaseValue(
    "moz_origins",
    "block_until_ms",
    { id: originId }
  );
  let blockPagesUntilMs = await PlacesTestUtils.getDatabaseValue(
    "moz_origins",
    "block_pages_until_ms",
    { id: originId }
  );
  return {
    blockUntilMs: blockUntilMs ?? 0,
    blockPagesUntilMs: blockPagesUntilMs ?? 0,
  };
}

async function backspaces(n, input = TEST_INPUT) {
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: input,
  });

  for (let i = 0; i < n; i++) {
    EventUtils.synthesizeKey("KEY_Backspace");
    await UrlbarTestUtils.promiseSearchComplete(window);
  }

  // Allow the async block call to settle.
  await TestUtils.waitForTick();
  await UrlbarTestUtils.promisePopupClose(window);
}

add_task(async function test_threshold_triggers_block() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);
  await backspaces(BACKSPACE_THRESHOLD);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.greater(
    state.blockPagesUntilMs,
    Date.now() - 1000,
    "block_pages_until_ms should be set to a future time for a page URL"
  );
  Assert.equal(state.blockUntilMs, 0, "block_until_ms should be 0");

  await PlacesUtils.history.clear();
});

// Fewer than threshold backspaces should NOT trigger a block.
add_task(async function test_below_threshold_no_block() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);
  await backspaces(BACKSPACE_THRESHOLD - 1);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.equal(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should not be set below threshold"
  );

  await PlacesUtils.history.clear();
});

// After blocking, the adaptive page autofill should not appear.
add_task(async function test_blocked_adaptive_autofill_not_autofilled() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);
  await backspaces(BACKSPACE_THRESHOLD);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });

  // Origins autofill is the backup when no adaptive autofill result is present.
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(
    details.autofill && details.result.autofill.type === "origin",
    "Autofill will appear for origin"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

add_task(async function test_blocked_origins_autofill_not_autofilled() {
  await PlacesTestUtils.addVisits({
    url: TEST_PAGE_URL,
    transition: PlacesUtils.history.TRANSITION_TYPED,
  });
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();
  await backspaces(BACKSPACE_THRESHOLD);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.greater(
    state.blockUntilMs,
    0,
    "block_until_ms should be greater than 0"
  );

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });

  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(!details.autofill, "Autofill should not be present");

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Non-backspace input between backspaces should reset the counter, so the
// threshold is never reached.
add_task(async function test_non_backspace_input_resets_count() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  // Backspace twice (below threshold)
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });

  for (let i = 0; i < BACKSPACE_THRESHOLD - 1; i++) {
    EventUtils.synthesizeKey("KEY_Backspace");
    await UrlbarTestUtils.promiseSearchComplete(window);
  }

  // Type a non-backspace character to reset the counter.
  EventUtils.synthesizeKey("a");
  await UrlbarTestUtils.promiseSearchComplete(window);

  // Now backspace once more (should be a fresh count, still below threshold).
  EventUtils.synthesizeKey("KEY_Backspace");
  await UrlbarTestUtils.promiseSearchComplete(window);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.equal(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should not be set since counter was reset"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

add_task(async function test_blur_prevents_block() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });

  for (let i = 0; i < BACKSPACE_THRESHOLD - 1; i++) {
    EventUtils.synthesizeKey("KEY_Backspace");
    await UrlbarTestUtils.promiseSearchComplete(window);
  }

  gURLBar.blur();
  await TestUtils.waitForTick();

  gURLBar.focus();
  EventUtils.synthesizeKey("KEY_Backspace");
  await UrlbarTestUtils.promiseSearchComplete(window);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.equal(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should not be set since blur reset the counter"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// An origin URL should set block_until_ms on moz_origins,
// not block_pages_until_ms.
add_task(async function test_origin_url_blocks_origin() {
  await seedAdaptiveHistory(TEST_ORIGIN_URL, TEST_INPUT);

  await backspaces(BACKSPACE_THRESHOLD);

  let state = await getOriginBlockState(TEST_ORIGIN_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.greater(
    state.blockUntilMs,
    Date.now() - 1000,
    "block_until_ms should be set for an origin URL"
  );
  Assert.equal(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should NOT be set for an origin URL"
  );

  await PlacesUtils.history.clear();
});

// A page URL should set block_pages_until_ms, not block_until_ms.
add_task(async function test_page_url_blocks_pages() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  await backspaces(BACKSPACE_THRESHOLD);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.greater(
    state.blockPagesUntilMs,
    Date.now() - 1000,
    "block_pages_until_ms should be set for a page URL"
  );
  // block_until_ms should remain unset.
  Assert.equal(
    state.blockUntilMs,
    0,
    "block_until_ms should NOT be set for a page URL"
  );

  await PlacesUtils.history.clear();
});

// Backspace dismissal should not fire when adaptive history is disabled.
add_task(async function test_disabled_adaptive_history_no_block() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.autoFill.adaptiveHistory.enabled", false]],
  });

  // Add typed visits so origin autofill kicks in.
  await PlacesTestUtils.addVisits({
    url: "https://example.com/",
    transition: PlacesUtils.history.TRANSITION_TYPED,
  });
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "exam",
  });

  // Backspace several times; with adaptive history disabled, the backspace
  // state tracking should be completely skipped.
  for (let i = 0; i < 5; i++) {
    EventUtils.synthesizeKey("KEY_Backspace");
  }
  await UrlbarTestUtils.promiseSearchComplete(window);
  await TestUtils.waitForTick();

  let state = await getOriginBlockState("https://example.com/");
  Assert.ok(
    !state || (state.blockUntilMs === 0 && state.blockPagesUntilMs === 0),
    "No block should be set when adaptive history is disabled"
  );

  await SpecialPowers.popPrefEnv();
  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Backspace dismissal should not write to the DB in private browsing mode.
add_task(async function test_private_browsing_no_block() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  let privateWin = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });

  // Perform backspace cycles in the private window.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window: privateWin,
    value: TEST_INPUT,
  });
  for (let i = 0; i < 3; i++) {
    EventUtils.synthesizeKey("KEY_Backspace", {}, privateWin);
    await UrlbarTestUtils.promiseSearchComplete(privateWin);
  }
  await TestUtils.waitForTick();
  await UrlbarTestUtils.promisePopupClose(privateWin);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(
    !state || state.blockPagesUntilMs === 0,
    "block_pages_until_ms should not be set from private browsing"
  );

  await BrowserTestUtils.closeWindow(privateWin);
  await PlacesUtils.history.clear();
});

// Custom threshold pref: setting it to 5 means 4 backspaces don't trigger,
// but 5 do.
add_task(async function test_custom_threshold() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.urlbar.autoFill.backspaceThreshold", 5]],
  });

  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  // 4 backspaces: below the custom threshold of 5.
  await backspaces(4);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.equal(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should not be set below custom threshold"
  );

  // 5th backspace should trigger.
  await backspaces(5);

  state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.greater(
    state.blockPagesUntilMs,
    Date.now() - 1000,
    "block_pages_until_ms should be set after reaching custom threshold"
  );

  await SpecialPowers.popPrefEnv();
  await PlacesUtils.history.clear();
});

// Backspace-blocked adaptive page autofill should be restored after picking the
// same URL as a history result.
add_task(async function test_reintegration_adaptive_page_url() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  // Verify adaptive autofill works before blocking.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(
    details.result.autofill?.type,
    "adaptive_url",
    "Should have adaptive url autofill before blocking"
  );
  await UrlbarTestUtils.promisePopupClose(window);

  // Block via backspaces.
  await backspaces(BACKSPACE_THRESHOLD);
  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.greater(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should be set after backspaces"
  );

  // Verify adaptive autofill is gone.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(
    !details.result.autofill ||
      (details.result.autofill.type !== "adaptive_url" &&
        details.result.autofill.type !== "adaptive_origin"),
    "Adaptive autofill should not appear while blocked"
  );

  await UrlbarTestUtils.pickResultAndWaitForLoad(window, TEST_PAGE_URL);

  // The block should be cleared after reintegration.
  state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.equal(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should be cleared after picking a history result"
  );

  // Adaptive autofill should work again.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(
    details.result.autofill?.type,
    "adaptive_url",
    "Adaptive autofill url should be restored after reintegration"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Backspace-blocked adaptive origin autofill should be restored after picking
// the same origin as a history result.
add_task(async function test_reintegration_adaptive_origin() {
  await seedAdaptiveHistory(TEST_ORIGIN_URL, TEST_INPUT);

  // Verify adaptive autofill works before blocking.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(
    details.result.autofill?.type,
    "adaptive_origin",
    "Should have adaptive autofill before blocking"
  );
  await UrlbarTestUtils.promisePopupClose(window);

  // Block via backspaces.
  await backspaces(BACKSPACE_THRESHOLD);

  let state = await getOriginBlockState(TEST_ORIGIN_URL);
  Assert.greater(
    state.blockUntilMs,
    0,
    "block_until_ms should be set after backspacing an origin"
  );

  // Verify autofill is gone.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(!details.autofill, "Autofill should not appear while blocked");

  await UrlbarTestUtils.pickResultAndWaitForLoad(window, TEST_ORIGIN_URL);

  // The block should be cleared.
  state = await getOriginBlockState(TEST_ORIGIN_URL);
  Assert.equal(
    state.blockUntilMs,
    0,
    "block_until_ms should be cleared after picking the origin as a history result"
  );

  // Adaptive autofill should work again.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(
    details.result.autofill?.type,
    "adaptive_origin",
    "Adaptive origin autofill should be restored after reintegration"
  );

  // Make sure we navigate away or else in other tests, a result macthing the
  // URL the user on will be suppressed.
  await BrowserTestUtils.loadURIString({
    browser: gBrowser.selectedBrowser,
    uriString: "about:blank",
  });

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Backspace-blocking a www. adaptive origin should also block the non-www.
// variant.
add_task(async function test_www_origin_block_applies_to_non_www() {
  const WWW_ORIGIN_URL = "https://www.example.com/";
  await seedAdaptiveHistory(WWW_ORIGIN_URL, TEST_INPUT);
  await PlacesTestUtils.addVisits({
    url: TEST_ORIGIN_URL,
    transition: PlacesUtils.history.TRANSITION_TYPED,
  });
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await backspaces(BACKSPACE_THRESHOLD, TEST_INPUT);

  let state = await getOriginBlockState(WWW_ORIGIN_URL);
  Assert.ok(state, "www. origin row should exist");
  Assert.greater(
    state.blockUntilMs,
    0,
    "block_until_ms should be set on www. origin after backspaces"
  );

  // The non-www. variant should also be blocked.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(
    !details.autofill,
    "Autofill should not appear for non-www. origin after blocking www. variant"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Backspace-blocking a www. adaptive page URL should also block the non-www.
// page variant.
add_task(async function test_www_page_block_applies_to_non_www() {
  const WWW_PAGE_URL = "https://www.example.com/some/path";
  await seedAdaptiveHistory(WWW_PAGE_URL, TEST_INPUT);
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  await backspaces(BACKSPACE_THRESHOLD, TEST_INPUT);

  let state = await getOriginBlockState(WWW_PAGE_URL);
  Assert.ok(state, "www. origin row should exist");
  Assert.greater(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should be set on www. origin after backspaces"
  );

  // The non-www. page variant should also be blocked.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  // Origin autofill might appear for this.
  Assert.notEqual(
    details.autofill?.type,
    "adaptive_url",
    "Adaptive autofill url should not appear for non-www. page after blocking www. variant"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Backspace-blocking a non-www. adaptive origin should also block the www.
// variant.
add_task(async function test_non_www_origin_block_applies_to_www() {
  const WWW_ORIGIN_URL = "https://www.example.com/";
  await seedAdaptiveHistory(TEST_ORIGIN_URL, TEST_INPUT);
  await PlacesTestUtils.addVisits({
    url: WWW_ORIGIN_URL,
    transition: PlacesUtils.history.TRANSITION_TYPED,
  });
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await backspaces(BACKSPACE_THRESHOLD, TEST_INPUT);

  let state = await getOriginBlockState(TEST_ORIGIN_URL);
  Assert.ok(state, "Non-www. origin row should exist");
  Assert.greater(
    state.blockUntilMs,
    0,
    "block_until_ms should be set on non-www. origin after backspaces"
  );

  // The www. variant should also be blocked.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(
    !details.autofill,
    "Autofill should not appear for www. origin after blocking non-www. variant"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Backspacing after arrowing down to a non-autofill result should not trigger
// a block, because the autofill suggestion is no longer visible.
add_task(async function test_no_block_when_non_autofill_result_selected() {
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

  // Also add a second history entry so there's a non-autofill result to arrow
  // down to.
  const OTHER_URL = "https://example.com/other/page";
  await PlacesTestUtils.addVisits({ url: OTHER_URL });

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });

  // Confirm the first result is an adaptive autofill.
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(
    details.result.autofill?.type,
    "adaptive_url",
    "First result should be adaptive autofill"
  );

  // Arrow down to a non-autofill result.
  EventUtils.synthesizeKey("KEY_ArrowDown");
  let selectedIndex = UrlbarTestUtils.getSelectedRowIndex(window);
  Assert.greater(
    selectedIndex,
    0,
    "Should have moved to a non-autofill result"
  );

  // Backspace BACKSPACE_THRESHOLD times — this should NOT block anything
  // because the autofill suggestion is no longer visible.
  for (let i = 0; i < BACKSPACE_THRESHOLD; i++) {
    EventUtils.synthesizeKey("KEY_Backspace");
    await UrlbarTestUtils.promiseSearchComplete(window);
  }
  await UrlbarTestUtils.promisePopupClose(window);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Origin row should exist");
  Assert.equal(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should not be set after backspacing a non-autofill result"
  );
  Assert.equal(
    state.blockUntilMs,
    0,
    "block_until_ms should not be set after backspacing a non-autofill result"
  );

  await PlacesUtils.history.clear();
});

// Backspacing, then arrowing to a non-autofill result, then continuing to
// backspace should not trigger a block. The partial backspace count should be
// reset when the user navigates away from the autofill result.
add_task(
  async function test_no_block_when_backspace_then_arrow_then_backspace() {
    await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);

    const OTHER_URL = "https://example.com/other/page";
    await PlacesTestUtils.addVisits({ url: OTHER_URL });

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: TEST_INPUT,
    });

    let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
    Assert.equal(
      details.result.autofill?.type,
      "adaptive_url",
      "First result should be adaptive autofill"
    );

    // Backspace once while autofill is shown, starting the count.
    EventUtils.synthesizeKey("KEY_Backspace");
    await UrlbarTestUtils.promiseSearchComplete(window);

    // Arrow down to a non-autofill result, which should reset the count.
    EventUtils.synthesizeKey("KEY_ArrowDown");
    let selectedIndex = UrlbarTestUtils.getSelectedRowIndex(window);
    Assert.greater(
      selectedIndex,
      0,
      "Should have moved to a non-autofill result"
    );

    // Backspace the remaining times to reach the threshold. This should NOT
    // trigger a block because we aren't focused on an autofill result.
    for (let i = 0; i < BACKSPACE_THRESHOLD; i++) {
      EventUtils.synthesizeKey("KEY_Backspace");
      await UrlbarTestUtils.promiseSearchComplete(window);
    }

    await UrlbarTestUtils.promisePopupClose(window);

    let state = await getOriginBlockState(TEST_PAGE_URL);
    Assert.ok(state, "Origin row should exist");
    Assert.equal(
      state.blockPagesUntilMs,
      0,
      "block_pages_until_ms should not be set when arrow interrupted backspaces"
    );
    Assert.equal(
      state.blockUntilMs,
      0,
      "block_until_ms should not be set when arrow interrupted backspaces"
    );

    await PlacesUtils.history.clear();
  }
);

// Backspace-blocking a non-www. adaptive page URL should also block the www.
// page variant.
add_task(async function test_non_www_page_block_applies_to_www() {
  const WWW_PAGE_URL = "https://www.example.com/some/path";
  await seedAdaptiveHistory(TEST_PAGE_URL, TEST_INPUT);
  await seedAdaptiveHistory(WWW_PAGE_URL, TEST_INPUT);

  await backspaces(BACKSPACE_THRESHOLD, TEST_INPUT);

  let state = await getOriginBlockState(TEST_PAGE_URL);
  Assert.ok(state, "Non-www. origin row should exist");
  Assert.greater(
    state.blockPagesUntilMs,
    0,
    "block_pages_until_ms should be set on non-www. origin after backspaces"
  );

  // The www. page variant should also be blocked.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.notEqual(
    details.autofill?.type,
    "adaptive_url",
    "Adaptive autofill url should not appear for www. page after blocking non-www variant."
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

// Backspace-blocked origins autofill (non-adaptive) should be restored after
// picking the origin as a history result.
add_task(async function test_reintegration_origins_autofill() {
  // Create a typed visit for origins autofill (no adaptive history).
  await PlacesTestUtils.addVisits({
    url: TEST_ORIGIN_URL,
    transition: PlacesUtils.history.TRANSITION_TYPED,
  });
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  // Verify origins autofill works.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  let details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(details.autofill, "Should have origins autofill before blocking");
  Assert.notEqual(
    details.result.autofill?.type,
    "adaptive_origin",
    "Should be regular origin autofill, not adaptive origin"
  );
  await UrlbarTestUtils.promisePopupClose(window);

  // Block via backspaces.
  await backspaces(BACKSPACE_THRESHOLD);

  let state = await getOriginBlockState(TEST_ORIGIN_URL);
  Assert.greater(
    state.blockUntilMs,
    0,
    "block_until_ms should be set after backspaces on origins autofill"
  );

  // Verify autofill is gone.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(!details.autofill, "Autofill should not appear while blocked");

  // Re-pick the URL to unblock it.
  await UrlbarTestUtils.pickResultAndWaitForLoad(window, TEST_ORIGIN_URL);

  state = await getOriginBlockState(TEST_ORIGIN_URL);
  Assert.equal(
    state.blockUntilMs,
    0,
    "block_until_ms should be cleared after picking the origin as history"
  );

  // Origins autofill should work again.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: TEST_INPUT,
  });
  details = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.ok(
    details.autofill,
    "Origins autofill should be restored after reintegration"
  );

  // Make sure we navigate away or else in other tests, a result macthing the
  // URL the user on will be suppressed.
  await BrowserTestUtils.loadURIString({
    browser: gBrowser.selectedBrowser,
    uriString: "about:blank",
  });

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});
