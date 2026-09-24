/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests that clicking a sponsored link before the content process has
 * categorized the SERP still reports the ad click in legacy and Glean
 * telemetry.
 *
 * The child actor debounces its scan of the page by ADLINK_CHECK_TIMEOUT_MS
 * after DOMContentLoaded. Navigating away within that window fires pagehide,
 * which cancels the scan, so no ad impressions are ever reported and the
 * impression is recorded through the fallback path instead.
 *
 * Because the component type is unknown in that case, the engagement is
 * recorded with the ad_uncategorized target.
 */

"use strict";

const TEST_PROVIDER_INFO = [
  {
    telemetryId: "example",
    searchPageRegexp:
      /^https:\/\/example.org\/browser\/browser\/components\/search\/test\/browser\/telemetry\/searchTelemetry(?:Ad)?.html/,
    queryParamNames: ["s"],
    codeParamName: "abc",
    taggedCodes: ["ff"],
    followOnParamNames: ["a"],
    extraAdServersRegexps: [/^https:\/\/example\.com\/ad2?/],
    components: [
      {
        type: SearchSERPTelemetryUtils.COMPONENTS.AD_LINK,
        default: true,
      },
    ],
  },
];

// Note: head.js defines an ADLINK_CHECK_TIMEOUT_MS getter pointing at the
// child actor module, which does not export it, so that global is undefined.
// Import it from the module that actually exports it.
const { ADLINK_CHECK_TIMEOUT_MS: DEFAULT_LOAD_TIMEOUT_MS } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/search/SearchSERPTelemetry.sys.mjs"
  );

// Lengthen the debounce window the child actor waits before scanning the page,
// so that the click below reliably lands inside it even on a loaded machine.
// Otherwise this test would race a 1 second timer and could intermittently
// observe a fully categorized SERP instead.
const LONG_LOAD_TIMEOUT_MS = 45000;

add_setup(async function () {
  SearchSERPTelemetry.overrideSearchTelemetryForTests(TEST_PROVIDER_INFO);
  await waitForIdle();
  // Enable local telemetry recording for the duration of the tests.
  let oldCanRecord = Services.telemetry.canRecordExtended;
  Services.telemetry.canRecordExtended = true;

  Services.ppmm.sharedData.set(
    SEARCH_TELEMETRY_SHARED.LOAD_TIMEOUT,
    LONG_LOAD_TIMEOUT_MS
  );

  registerCleanupFunction(async () => {
    Services.ppmm.sharedData.set(
      SEARCH_TELEMETRY_SHARED.LOAD_TIMEOUT,
      DEFAULT_LOAD_TIMEOUT_MS
    );
    SearchSERPTelemetry.overrideSearchTelemetryForTests();
    Services.telemetry.canRecordExtended = oldCanRecord;
    resetTelemetry();
  });
});

add_task(async function test_ad_click_before_ad_impressions_reported() {
  resetTelemetry();

  let adImpressionsReported = false;
  let observer = () => {
    adImpressionsReported = true;
  };
  Services.obs.addObserver(observer, "reported-page-with-ad-impressions");

  // Deliberately do not wait for ad impressions here: we want to click while
  // the child actor's debounced scan is still pending.
  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    getSERPUrl("searchTelemetryAd.html")
  );

  Assert.ok(
    !adImpressionsReported,
    "Ad impressions should not have been reported yet."
  );

  let pageLoadPromise = BrowserTestUtils.waitForLocationChange(gBrowser);
  BrowserTestUtils.synthesizeMouseAtCenter("#ad1", {}, tab.linkedBrowser);
  await pageLoadPromise;

  // The ad click is recorded off a dispatch to the main thread from the network
  // observer, so wait for it to land rather than for the (now lengthened)
  // ad link check.
  await TestUtils.waitForCondition(
    () =>
      "browser.search.adclicks.unknown" in
      (Services.telemetry.getSnapshotForKeyedScalars("main", false).parent ??
        {}),
    "Should have recorded the ad click scalar."
  );

  Services.obs.removeObserver(observer, "reported-page-with-ad-impressions");

  Assert.ok(
    !adImpressionsReported,
    "Navigating away should have cancelled the pending ad impression scan."
  );

  // The legacy ad click scalar is recorded by observing the network request in
  // the parent process, so it survives the cancelled content scan.
  //
  // browser.search.withads.* is absent: it is derived from the child's
  // SearchTelemetry:PageInfo message, which is sent from the same scan that
  // pagehide cancelled.
  await assertSearchSourcesTelemetry(
    {},
    {
      "browser.search.content.unknown": { "example:tagged:ff": 1 },
      "browser.search.adclicks.unknown": { "example:tagged": 1 },
    }
  );

  // In Glean, the impression is recorded through the fallback path when the
  // browser stops being tracked. That path cannot know the element-based
  // attributes, so they are reported as "unknown".
  //
  // The click is recorded as an engagement even though the page was never
  // categorized: the component type is unknown, but the URL is enough to tell
  // that it was an ad, so it is reported as ad_uncategorized. No abandonment
  // is recorded, because the SERP was engaged with.
  assertSERPTelemetry([
    {
      impression: {
        shopping_tab_displayed: "unknown",
        has_ai_summary: "unknown",
      },
      engagements: [
        {
          action: SearchSERPTelemetryUtils.ACTIONS.CLICKED,
          target: SearchSERPTelemetryUtils.COMPONENTS.AD_UNCATEGORIZED,
        },
      ],
    },
  ]);

  BrowserTestUtils.removeTab(tab);
});
