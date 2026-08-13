/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that Firefox Suggest results show in the Smart Window smartbar with
 * sponsored results filtered out.
 */

"use strict";

const { QuickSuggestTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/QuickSuggestTestUtils.sys.mjs"
);
QuickSuggestTestUtils.init(this);

const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);
UrlbarTestUtils.init(this);

/**
 * Returns the URLs of the result rows in the smartbar view.
 *
 * @param {MozBrowser} browser - The browser element
 * @returns {Promise<string[]>} The URLs of the result rows
 */
function getSmartbarResultUrls(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const aiWindowElement = content.document.querySelector("ai-window");
    const smartbar = aiWindowElement.shadowRoot.querySelector(
      "#ai-window-smartbar"
    );
    await smartbar.lastQueryContextPromise;
    return [...smartbar.querySelectorAll(".urlbarView-row")]
      .map(
        resultRow => smartbar.view.getResultFromElement(resultRow).payload.url
      )
      .filter(Boolean);
  });
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.endpoint", "http://localhost:0/v1"],
      ["browser.search.suggest.enabled", false],
    ],
  });

  await QuickSuggestTestUtils.ensureQuickSuggestInit({
    remoteSettingsRecords: [
      {
        collection: QuickSuggestTestUtils.RS_COLLECTION.AMP,
        type: QuickSuggestTestUtils.RS_TYPE.AMP,
        attachment: [
          QuickSuggestTestUtils.ampRemoteSettings({
            keywords: ["sponsored"],
            url: "https://example.com/sponsored",
            title: "Sponsored suggestion",
          }),
        ],
      },
      {
        collection: QuickSuggestTestUtils.RS_COLLECTION.OTHER,
        type: QuickSuggestTestUtils.RS_TYPE.WIKIPEDIA,
        attachment: [
          QuickSuggestTestUtils.wikipediaRemoteSettings({
            keywords: ["non-sponsored"],
            url: "https://example.com/non-sponsored",
            title: "Non-sponsored suggestion",
          }),
        ],
      },
    ],
    prefs: [
      // Enable sponsored and non-sponsored suggestions.
      ["quicksuggest.enabled", true],
      ["suggest.amp", true],
      ["suggest.quicksuggest.sponsored", true],
      ["suggest.wikipedia", true],
    ],
  });
});

add_task(async function test_smartbar_keeps_non_sponsored_suggest() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  await promiseSmartbarSuggestionsOpen(browser, () =>
    typeInSmartbar(browser, "non-sponsored")
  );

  const resultUrls = await getSmartbarResultUrls(browser);
  Assert.ok(
    resultUrls.includes("https://example.com/non-sponsored"),
    "Non-sponsored Suggest result appears in the smartbar results"
  );

  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_smartbar_filters_sponsored_suggest() {
  const win = await openAIWindow();
  const browser = win.gBrowser.selectedBrowser;

  // Classic urlbar does not filter sponsored results.
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window: win,
    value: "sponsored",
  });
  const urlbarUrls = [];
  for (
    let resultIndex = 0;
    resultIndex < UrlbarTestUtils.getResultCount(win);
    resultIndex++
  ) {
    const details = await UrlbarTestUtils.getDetailsOfResultAt(
      win,
      resultIndex
    );
    urlbarUrls.push(details.url);
  }
  Assert.ok(
    urlbarUrls.includes("https://example.com/sponsored"),
    "Sponsored result included in the classic urlbar"
  );

  await promiseSmartbarSuggestionsOpen(browser, () =>
    typeInSmartbar(browser, "sponsored")
  );

  // Smart Window smartbar does filter sponsored results.
  const resultUrls = await getSmartbarResultUrls(browser);
  Assert.ok(
    !resultUrls.includes("https://example.com/sponsored"),
    "Sponsored result filtered in the smartbar"
  );

  await BrowserTestUtils.closeWindow(win);
});
