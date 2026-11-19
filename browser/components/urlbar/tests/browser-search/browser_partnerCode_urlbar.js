/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that searches from the address bar load and report the partner code
 * and telemetry id for the search access point they were made from.
 */

"use strict";

const SEARCH_URL =
  "https://example.org/browser/browser/components/urlbar/tests/browser-search/dummy_page.html";

/**
 * Returns the partner code and telemetry suffix expected for a search access
 * point. Per-SAP partner codes are only supported by search-config-v3.
 *
 * @param {string} sapSource
 * @returns {{partnerCode: string, telemetrySuffix: string}}
 */
function expectedPartnerDetails(sapSource) {
  if (!SearchUtils.configV3FeatureGate) {
    return { partnerCode: "defaultcode", telemetrySuffix: "" };
  }
  return {
    urlbar: { partnerCode: "urlbarcode", telemetrySuffix: "-urlbarsx" },
    urlbar_searchmode: {
      partnerCode: "searchmodecode",
      telemetrySuffix: "-searchmodesx",
    },
  }[sapSource];
}

add_setup(async function () {
  let partnerDetails;
  if (SearchUtils.configV3FeatureGate) {
    partnerDetails = {
      partner: {
        default: { code: "defaultcode" },
        urlbar: { code: "urlbarcode", telemetrySuffix: "urlbarsx" },
        urlbar_searchmode: {
          code: "searchmodecode",
          telemetrySuffix: "searchmodesx",
        },
      },
    };
  } else {
    partnerDetails = { partnerCode: "defaultcode" };
  }

  await SearchTestUtils.updateRemoteSettingsConfig([
    {
      identifier: "engine",
      base: {
        urls: {
          search: {
            base: SEARCH_URL,
            params: [{ name: "pc", value: "{partnerCode}" }],
            searchTermParamName: "s",
          },
        },
        ...partnerDetails,
      },
    },
  ]);

  registerCleanupFunction(async () => {
    await PlacesUtils.history.clear();
    await UrlbarTestUtils.formHistory.clear();
  });
});

async function assertSearch(browser, sapSource) {
  let { partnerCode, telemetrySuffix } = expectedPartnerDetails(sapSource);
  Assert.equal(
    new URL(browser.currentURI.spec).searchParams.get("pc"),
    partnerCode,
    "Should have loaded the search with the expected partner code"
  );
  await SearchUITestUtils.assertSAPTelemetry({
    engineId: "engine",
    engineName: "engine",
    partnerCode,
    source: sapSource,
    telemetrySuffix,
    count: 1,
  });
}

function promiseSearchLoaded(browser) {
  return BrowserTestUtils.browserLoaded(browser, false, url =>
    url.startsWith(SEARCH_URL)
  );
}

add_task(async function test_urlbar_current_tab() {
  clearSAPTelemetry();
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "current tab",
  });
  let loadPromise = promiseSearchLoaded(tab.linkedBrowser);
  EventUtils.synthesizeKey("KEY_Enter");
  await loadPromise;

  await assertSearch(tab.linkedBrowser, "urlbar");

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_urlbar_new_tab() {
  clearSAPTelemetry();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "https://example.com/"
  );

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "new tab",
  });
  let newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, url =>
    url.startsWith(SEARCH_URL)
  );
  EventUtils.synthesizeKey("KEY_Enter", { altKey: true });
  let newTab = await newTabPromise;

  await assertSearch(newTab.linkedBrowser, "urlbar");

  BrowserTestUtils.removeTab(newTab);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_urlbar_search_mode() {
  clearSAPTelemetry();
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "search mode",
  });
  let popup = await UrlbarTestUtils.openSearchModeSwitcher(window);
  popup.querySelector("panel-item[data-engine-name=engine]").button.click();
  await UrlbarTestUtils.assertSearchMode(window, {
    engineName: "engine",
    entry: "searchbutton",
    source: UrlbarShared.RESULT_SOURCE.SEARCH,
  });
  let loadPromise = promiseSearchLoaded(tab.linkedBrowser);
  EventUtils.synthesizeKey("KEY_Enter");
  await loadPromise;

  await assertSearch(tab.linkedBrowser, "urlbar_searchmode");

  await UrlbarTestUtils.exitSearchMode(window);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_search_mode_switcher_open_serp() {
  clearSAPTelemetry();
  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: "switcher",
  });
  let popup = await UrlbarTestUtils.openSearchModeSwitcher(window);
  let loadPromise = promiseSearchLoaded(tab.linkedBrowser);
  // Shift opens the SERP directly, rather than entering search mode.
  EventUtils.synthesizeMouseAtCenter(
    popup.querySelector("panel-item[data-engine-name=engine]").button,
    { shiftKey: true }
  );
  await loadPromise;

  await assertSearch(tab.linkedBrowser, "urlbar_searchmode");

  await UrlbarTestUtils.exitSearchMode(window);
  BrowserTestUtils.removeTab(tab);
});
