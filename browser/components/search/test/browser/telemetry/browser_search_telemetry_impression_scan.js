/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests the prescan and scan properties of the Glean SERP impression event,
 * and the ad_uncategorized component of the Glean SERP ad_impression event.
 */

"use strict";

const PRESCAN_FOUND = "found";
const PRESCAN_NONE_FOUND = "none_found";
const PRESCAN_NOT_RUN = "not_run";
const SCAN_COMPLETE = "complete";
const SCAN_ERROR = "error";
const SCAN_NOT_RUN = "not_run";

// head.js's ADLINK_CHECK_TIMEOUT_MS getter points at a module that doesn't
// export it, so import it from the module that does.
const { ADLINK_CHECK_TIMEOUT_MS: DEFAULT_LOAD_TIMEOUT_MS } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/search/SearchSERPTelemetry.sys.mjs"
  );

const AD_UNCATEGORIZED = SearchSERPTelemetryUtils.COMPONENTS.AD_UNCATEGORIZED;

function createProviderInfo(telemetryId, components) {
  return [
    {
      telemetryId,
      searchPageRegexp:
        /^https:\/\/example.org\/browser\/browser\/components\/search\/test\/browser\/telemetry\/(?:searchTelemetry(?:Ad)?|slow_loading_page_with_ads)/,
      queryParamNames: ["s"],
      codeParamName: "abc",
      taggedCodes: ["ff"],
      extraAdServersRegexps: [/^https:\/\/example\.com\/ad2?/],
      components,
    },
  ];
}

const DEFAULT_COMPONENTS = [
  {
    type: SearchSERPTelemetryUtils.COMPONENTS.AD_LINK,
    default: true,
  },
];

// An invalid selector in a top-down component makes the categorization throw.
const ERROR_COMPONENTS = [
  ...DEFAULT_COMPONENTS,
  {
    type: SearchSERPTelemetryUtils.COMPONENTS.REFINED_SEARCH_BUTTONS,
    topDown: true,
    included: {
      parent: {
        selector: "!invalid",
      },
    },
  },
];

// Every anchor on the page is inside a parent that is skipped on purpose, so
// no component is categorized even though the page has ads.
const SKIP_ALL_COMPONENTS = [
  ...DEFAULT_COMPONENTS,
  {
    type: SearchSERPTelemetryUtils.COMPONENTS.AD_SIDEBAR,
    included: {
      parent: {
        selector: "body",
        skipCount: true,
      },
    },
  },
];

// The content process caches the components for a provider by its telemetry
// id, so each set of components needs its own.
async function setProviderInfo(telemetryId, components) {
  SearchSERPTelemetry.overrideSearchTelemetryForTests(
    createProviderInfo(telemetryId, components)
  );
  await waitForIdle();
}

add_setup(async function () {
  await setProviderInfo("example", DEFAULT_COMPONENTS);
  // Enable local telemetry recording for the duration of the tests.
  let oldCanRecord = Services.telemetry.canRecordExtended;
  Services.telemetry.canRecordExtended = true;

  registerCleanupFunction(async () => {
    SearchSERPTelemetry.overrideSearchTelemetryForTests();
    Services.telemetry.canRecordExtended = oldCanRecord;
    resetTelemetry();
    Services.ppmm.sharedData.set(
      SEARCH_TELEMETRY_SHARED.LOAD_TIMEOUT,
      DEFAULT_LOAD_TIMEOUT_MS
    );
    Services.ppmm.sharedData.flush();
  });
});

add_task(async function test_prescan_found_scan_complete() {
  resetTelemetry();
  await setProviderInfo("example", DEFAULT_COMPONENTS);

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getSERPUrl("searchTelemetryAd.html")
  );
  await waitForPageWithAdImpressions();

  assertSERPTelemetry([
    {
      impression: {
        prescan: PRESCAN_FOUND,
        scan: SCAN_COMPLETE,
      },
      adImpressions: [
        {
          component: SearchSERPTelemetryUtils.COMPONENTS.AD_LINK,
          ads_loaded: "2",
          ads_visible: "2",
          ads_hidden: "0",
        },
      ],
    },
  ]);

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_prescan_none_found_scan_complete() {
  resetTelemetry();
  await setProviderInfo("example", DEFAULT_COMPONENTS);

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getSERPUrl("searchTelemetry.html")
  );
  await waitForPageWithAdImpressions();

  assertSERPTelemetry([
    {
      impression: {
        prescan: PRESCAN_NONE_FOUND,
        scan: SCAN_COMPLETE,
      },
    },
  ]);

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_prescan_and_scan_not_run() {
  resetTelemetry();
  await setProviderInfo("example", DEFAULT_COMPONENTS);

  // Make the content process wait long enough that closing the tab always
  // happens before either phase runs.
  Services.ppmm.sharedData.set(SEARCH_TELEMETRY_SHARED.LOAD_TIMEOUT, 60000);
  Services.ppmm.sharedData.flush();
  await waitForIdle();

  let pageImpression = waitForPageWithImpression();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getSERPUrl("searchTelemetryAd.html")
  );
  BrowserTestUtils.removeTab(tab);
  await pageImpression;

  Services.ppmm.sharedData.set(
    SEARCH_TELEMETRY_SHARED.LOAD_TIMEOUT,
    DEFAULT_LOAD_TIMEOUT_MS
  );
  Services.ppmm.sharedData.flush();

  assertSERPTelemetry([
    {
      impression: {
        has_ai_summary: "unknown",
        shopping_tab_displayed: "unknown",
        prescan: PRESCAN_NOT_RUN,
        scan: SCAN_NOT_RUN,
      },
      abandonment: {
        reason: SearchSERPTelemetryUtils.ABANDONMENTS.TAB_CLOSE,
      },
    },
  ]);
});

add_task(async function test_prescan_found_scan_not_run() {
  resetTelemetry();
  await setProviderInfo("example", DEFAULT_COMPONENTS);

  let pageWithAds = TestUtils.topicObserved("reported-page-with-ads");
  let tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: getSERPUrl("slow_loading_page_with_ads.html"),
    waitForLoad: false,
  });
  // The prescan runs on DOMContentLoaded, but the page doesn't fire the load
  // event, which the scan waits for, until a slow resource has loaded.
  await pageWithAds;

  Assert.equal(
    (Glean.serp.impression.testGetValue() ?? []).length,
    0,
    "No impression should be recorded before the scan."
  );

  let pageImpression = waitForPageWithImpression();
  BrowserTestUtils.removeTab(tab);
  await pageImpression;

  assertSERPTelemetry([
    {
      impression: {
        has_ai_summary: "unknown",
        shopping_tab_displayed: "unknown",
        prescan: PRESCAN_FOUND,
        scan: SCAN_NOT_RUN,
      },
      adImpressions: [{ component: AD_UNCATEGORIZED }],
      abandonment: {
        reason: SearchSERPTelemetryUtils.ABANDONMENTS.TAB_CLOSE,
      },
    },
  ]);
});

add_task(async function test_scan_error() {
  resetTelemetry();
  await setProviderInfo("example-scan-error", ERROR_COMPONENTS);

  let pageImpression = waitForPageWithImpression();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getSERPUrl("searchTelemetryAd.html")
  );
  await pageImpression;

  assertSERPTelemetry([
    {
      impression: {
        provider: "example-scan-error",
        prescan: PRESCAN_FOUND,
        scan: SCAN_ERROR,
      },
      adImpressions: [{ component: AD_UNCATEGORIZED }],
    },
  ]);

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_scan_error_no_ads() {
  resetTelemetry();
  await setProviderInfo("example-scan-error", ERROR_COMPONENTS);

  let pageImpression = waitForPageWithImpression();
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getSERPUrl("searchTelemetry.html")
  );
  await pageImpression;

  assertSERPTelemetry([
    {
      impression: {
        provider: "example-scan-error",
        prescan: PRESCAN_NONE_FOUND,
        scan: SCAN_ERROR,
      },
      adImpressions: [],
    },
  ]);

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_prescan_found_scan_complete_ads_skipped() {
  resetTelemetry();
  await setProviderInfo("example-scan-skip", SKIP_ALL_COMPONENTS);

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getSERPUrl("searchTelemetryAd.html")
  );
  await waitForPageWithAdImpressions();

  assertSERPTelemetry([
    {
      impression: {
        provider: "example-scan-skip",
        prescan: PRESCAN_FOUND,
        scan: SCAN_COMPLETE,
      },
      // Skipping ads is configured on purpose, so they aren't uncategorized.
      adImpressions: [],
    },
  ]);

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_no_ad_uncategorized_without_prescan_ads() {
  resetTelemetry();
  await setProviderInfo("example-scan-skip", SKIP_ALL_COMPONENTS);

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getSERPUrl("searchTelemetry.html")
  );
  await waitForPageWithAdImpressions();

  assertSERPTelemetry([
    {
      impression: {
        provider: "example-scan-skip",
        prescan: PRESCAN_NONE_FOUND,
        scan: SCAN_COMPLETE,
      },
      adImpressions: [],
    },
  ]);

  BrowserTestUtils.removeTab(tab);
});
