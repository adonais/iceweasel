/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests reintegration of adaptive autofill after a context-menu Dismiss,
 * including the reintegration Glean counter.
 */

"use strict";

const ADAPTIVE_URL = "https://example.com/adaptive-page";
const ORIGIN_URL = "https://example.com/";
const SEARCH_STRING = "exa";
const ADAPTIVE_INPUT = "exa";

const DISMISS_ID = "urlbar-input-dismiss-autofill";

add_setup(async function () {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();

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
    await PlacesUtils.history.clear();
    await PlacesUtils.bookmarks.eraseEverything();
  });
});

async function addAdaptiveHistoryEntry(url, input, useCount = 3) {
  await PlacesTestUtils.addVisits({
    uri: url,
    transition: PlacesUtils.history.TRANSITIONS.TYPED,
  });
  for (let i = 0; i < useCount; i++) {
    await UrlbarUtils.addToInputHistory(url, input);
  }
}

async function pickHistoryResult(url) {
  let resultCount = UrlbarTestUtils.getResultCount(window);
  let historyIndex = -1;
  for (let i = 0; i < resultCount; i++) {
    let d = await UrlbarTestUtils.getDetailsOfResultAt(window, i);
    if (
      !d.autofill &&
      d.result.payload.url === url &&
      d.result.type === UrlbarShared.RESULT_TYPE.URL
    ) {
      historyIndex = i;
      break;
    }
  }
  Assert.notEqual(historyIndex, -1, "Should find the history result in panel");

  let loadPromise = BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
  while (UrlbarTestUtils.getSelectedRowIndex(window) !== historyIndex) {
    EventUtils.synthesizeKey("KEY_ArrowDown");
  }
  EventUtils.synthesizeKey("KEY_Enter");
  await loadPromise;
  await TestUtils.waitForTick();
  // pickResult() fires re-integration without awaiting it.
  await UrlbarParentController._lastAutofillReintegrationPromise;
}

async function waitForBlock(url, column) {
  let originId = await PlacesTestUtils.getDatabaseValue(
    "moz_places",
    "origin_id",
    { url }
  );
  await TestUtils.waitForCondition(async () => {
    let val = await PlacesTestUtils.getDatabaseValue("moz_origins", column, {
      id: originId,
    });
    return val > Date.now();
  }, `${column} should be set on origin ${originId}`);
}

add_task(async function reintegration_after_context_menu_block_page_url() {
  await PlacesUtils.history.clear();
  await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: SEARCH_STRING,
    fireInputEvent: true,
  });
  let { result } = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(
    result.autofill?.type,
    "adaptive_url",
    "Pre-condition: heuristic is adaptive_url autofill"
  );

  await UrlbarTestUtils.activateContextMenuItem(window, DISMISS_ID);
  await waitForBlock(ADAPTIVE_URL, "block_pages_until_ms");

  await BrowserTestUtils.withNewTab("", async () => {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: SEARCH_STRING,
      fireInputEvent: true,
    });
    await pickHistoryResult(ADAPTIVE_URL);
  });

  let originId = await PlacesTestUtils.getDatabaseValue(
    "moz_places",
    "origin_id",
    { url: ADAPTIVE_URL }
  );
  let blockPagesUntilMs = await PlacesTestUtils.getDatabaseValue(
    "moz_origins",
    "block_pages_until_ms",
    { id: originId }
  );
  Assert.ok(
    !blockPagesUntilMs,
    "block_pages_until_ms should be cleared after reintegration"
  );

  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

add_task(async function reintegration_after_context_menu_block_origin() {
  await PlacesUtils.history.clear();
  await addAdaptiveHistoryEntry(ORIGIN_URL, ADAPTIVE_INPUT);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: SEARCH_STRING,
    fireInputEvent: true,
  });
  let { result } = await UrlbarTestUtils.getDetailsOfResultAt(window, 0);
  Assert.equal(
    result.autofill?.type,
    "adaptive_origin",
    "Pre-condition: heuristic is adaptive_origin autofill"
  );

  await UrlbarTestUtils.activateContextMenuItem(window, DISMISS_ID);
  await waitForBlock(ORIGIN_URL, "block_until_ms");

  await BrowserTestUtils.withNewTab("", async () => {
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: SEARCH_STRING,
      fireInputEvent: true,
    });
    await pickHistoryResult(ORIGIN_URL);
  });

  let originId = await PlacesTestUtils.getDatabaseValue(
    "moz_places",
    "origin_id",
    { url: ORIGIN_URL }
  );
  let blockUntilMs = await PlacesTestUtils.getDatabaseValue(
    "moz_origins",
    "block_until_ms",
    { id: originId }
  );
  Assert.ok(
    !blockUntilMs,
    "block_until_ms should be cleared after reintegration"
  );

  await BrowserTestUtils.loadURIString({
    browser: gBrowser.selectedBrowser,
    uriString: "about:blank",
  });
  await UrlbarTestUtils.promisePopupClose(window);
  await PlacesUtils.history.clear();
});

add_task(
  async function reintegration_telemetry_recorded_for_context_menu_block() {
    Services.fog.testResetFOG();
    await PlacesUtils.history.clear();
    await addAdaptiveHistoryEntry(ADAPTIVE_URL, ADAPTIVE_INPUT);

    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      value: SEARCH_STRING,
      fireInputEvent: true,
    });

    await UrlbarTestUtils.activateContextMenuItem(window, DISMISS_ID);
    await waitForBlock(ADAPTIVE_URL, "block_pages_until_ms");

    Assert.equal(
      Glean.urlbarAutofill.reintegration.url.testGetValue(),
      null,
      "URL reintegration counter should be empty before picking history"
    );

    await BrowserTestUtils.withNewTab("", async () => {
      await UrlbarTestUtils.promiseAutocompleteResultPopup({
        window,
        value: SEARCH_STRING,
        fireInputEvent: true,
      });
      await pickHistoryResult(ADAPTIVE_URL);
    });

    Assert.equal(
      Glean.urlbarAutofill.reintegration.url.testGetValue(),
      1,
      "URL reintegration counter should be incremented once after context-menu block + history pick"
    );
    Assert.equal(
      Glean.urlbarAutofill.reintegration.origin.testGetValue(),
      null,
      "Origin reintegration counter should remain empty for a page-URL reintegration"
    );
    // The block was set via context menu, not backspace — the after-backspace
    // timing distribution should remain untouched.
    Assert.equal(
      Glean.urlbarAutofill.reintegrationAfterBackspace.url.testGetValue(),
      null,
      "Backspace timing distribution should not sample for context-menu block"
    );

    await UrlbarTestUtils.promisePopupClose(window);
    await PlacesUtils.history.clear();
  }
);
