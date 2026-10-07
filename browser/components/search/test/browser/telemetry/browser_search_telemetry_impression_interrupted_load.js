/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/*
 * Tests what happens when a SERP load is interrupted. These could cause a
 * discrepancy between legacy and SERP event telemetry. These tests validate
 * that hypothesis.
 */

"use strict";

const TEST_PROVIDER_INFO = [
  {
    telemetryId: "interrupted-load",
    searchPageRegexp:
      /^https:\/\/example.org\/browser\/browser\/components\/search\/test\/browser\/telemetry\/slow_loading_page_with_ads(_on_load_event)?.html/,
    queryParamNames: ["s"],
    codeParamName: "abc",
    taggedCodes: ["ff"],
    extraAdServersRegexps: [/^https:\/\/example\.com\/ad2?/],
    components: [
      {
        type: SearchSERPTelemetryUtils.COMPONENTS.AD_LINK,
        default: true,
      },
    ],
  },
];

add_setup(async function () {
  SearchSERPTelemetry.overrideSearchTelemetryForTests(TEST_PROVIDER_INFO);
  await waitForIdle();
  let oldCanRecord = Services.telemetry.canRecordExtended;
  Services.telemetry.canRecordExtended = true;

  registerCleanupFunction(async () => {
    SearchSERPTelemetry.overrideSearchTelemetryForTests();
    Services.telemetry.canRecordExtended = oldCanRecord;
    resetTelemetry();
  });
});

function getWithads() {
  let total = 0;
  for (let label of Object.keys(Glean.browserSearchWithads)) {
    total +=
      Glean.browserSearchWithads[label][
        "interrupted-load:tagged"
      ].testGetValue() ?? 0;
  }
  return total;
}

function getContent() {
  let total = 0;
  for (let label of Object.keys(Glean.browserSearchContent)) {
    total +=
      Glean.browserSearchContent[label][
        "interrupted-load:tagged:ff"
      ].testGetValue() ?? 0;
  }
  return total;
}

/**
 * Opens the SERP whose ads are injected ~2s after DOMContentLoaded, and
 * resolves once browser.search.content has been recorded but before withads
 * has. content is recorded synchronously by _reportSerpPage during
 * updateTrackingStatus, which runs off the network state change, so it lands
 * well before any DOM scan finds the late-injected ads.
 */
async function openLateAdSERPAndWaitForContent() {
  let tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: getSERPUrl("slow_loading_page_with_ads_on_load_event.html"),
    waitForLoad: false,
  });

  await TestUtils.waitForCondition(
    () => getContent() == 1,
    "browser.search.content should be recorded from the network state change."
  );

  Assert.equal(
    getWithads(),
    0,
    "withads has not been recorded yet, so we are in the target window."
  );
  Assert.equal(
    (Glean.serp.adImpression.testGetValue() ?? []).length,
    0,
    "ad_impression has not been recorded yet."
  );

  return tab;
}

/**
 * Opens the slow SERP and resolves once withads has been recorded from the
 * DOMContentLoaded scan, which is strictly before the load event fires.
 */
async function openSlowSERPAndWaitForWithads() {
  let pageWithAds = TestUtils.topicObserved("reported-page-with-ads");

  let tab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    opening: getSERPUrl("slow_loading_page_with_ads.html"),
    waitForLoad: false,
  });

  await pageWithAds;

  Assert.equal(
    getWithads(),
    1,
    "withads was recorded from the DOMContentLoaded scan."
  );
  Assert.equal(
    (Glean.serp.adImpression.testGetValue() ?? []).length,
    0,
    "ad_impression has not been recorded yet, so we are in the target window."
  );

  return tab;
}

add_task(async function test_reload_before_ad_impression() {
  resetTelemetry();

  let tab = await openSlowSERPAndWaitForWithads();

  // Reload while the first load is still pending. This re-enters
  // updateTrackingStatus for the same URL rather than untracking the browser.
  let loaded = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let adImpressions = waitForPageWithAdImpressions();
  tab.linkedBrowser.reload();
  await loaded;
  await adImpressions;

  let impressions = Glean.serp.impression.testGetValue() ?? [];
  let adImpressions2 = Glean.serp.adImpression.testGetValue() ?? [];

  info(
    `Reload: withads=${getWithads()}, impressions=${impressions.length}, ` +
      `adImpressions=${adImpressions2.length}`
  );

  // The interrupted first load and the reload each record their own withads
  // and their own impression, so a SERP impression is not lost here.
  Assert.equal(
    getContent(),
    2,
    "content is recorded for both the interrupted load and the reload."
  );
  Assert.equal(
    getWithads(),
    2,
    "Both the interrupted load and the reload recorded withads."
  );
  Assert.equal(
    impressions.length,
    2,
    "An impression is recorded for both the interrupted load and the reload."
  );

  // Only the reload survived to run its load-event scan, so the ad data from
  // the interrupted load is lost even though withads counted it.
  Assert.equal(
    adImpressions2.length,
    1,
    "Only the reload recorded ad_impression, leaving withads ahead by one."
  );

  // The interrupted load's impression comes from the fallback path, which is
  // the one that cannot attach ad data.
  Assert.equal(
    impressions.filter(i => i.extra.has_ai_summary == "unknown").length,
    1,
    "The interrupted load's impression came from the fallback path."
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_stop_load_before_ad_impression() {
  resetTelemetry();

  let tab = await openSlowSERPAndWaitForWithads();

  // Press Stop. This aborts the pending load so the load event never fires,
  // meaning the load-triggered scan that would send PageImpression never runs.
  tab.linkedBrowser.stop();

  // Wait well past the load-event scan window to be sure any ad data is
  // genuinely lost rather than merely late.
  /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
  await new Promise(resolve => setTimeout(resolve, 3000));

  let impressions = Glean.serp.impression.testGetValue() ?? [];
  let adImpressions = Glean.serp.adImpression.testGetValue() ?? [];

  info(
    `Stop: withads=${getWithads()}, impressions=${impressions.length}, ` +
      `adImpressions=${adImpressions.length}`
  );

  Assert.equal(
    getContent(),
    1,
    "content remains recorded after the load was stopped."
  );
  Assert.equal(
    getWithads(),
    1,
    "withads remains recorded after the load was stopped."
  );

  // The browser is still tracked because stopping a load does not navigate
  // away, so nothing has triggered the fallback impression yet.
  Assert.equal(
    impressions.length,
    0,
    "No impression is recorded while the stopped SERP is still the loaded page."
  );
  Assert.equal(
    adImpressions.length,
    0,
    "Ad data is lost: withads counted an ad but no ad_impression exists."
  );

  let impression = waitForPageWithImpression();
  BrowserTestUtils.removeTab(tab);
  await impression;

  impressions = Glean.serp.impression.testGetValue() ?? [];
  Assert.equal(
    impressions.length,
    1,
    "A fallback impression is recorded when the browser is untracked."
  );
  Assert.equal(
    impressions[0].extra.has_ai_summary,
    "unknown",
    "The impression came from the fallback path, not the page scan."
  );
  Assert.equal(
    (Glean.serp.adImpression.testGetValue() ?? []).length,
    0,
    "The fallback impression has no accompanying ad_impression."
  );
});

add_task(async function test_reload_before_withads() {
  resetTelemetry();

  let tab = await openLateAdSERPAndWaitForContent();

  // Reload before the late-injected ads have been scanned. The reload is
  // allowed to run to completion so its own ads are eventually counted.
  let loaded = BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  let adImpressions = waitForPageWithAdImpressions();
  tab.linkedBrowser.reload();
  await loaded;
  await adImpressions;

  let impressions = Glean.serp.impression.testGetValue() ?? [];

  info(
    `Reload before withads: content=${getContent()}, ` +
      `withads=${getWithads()}, impressions=${impressions.length}, ` +
      `adImpressions=${(Glean.serp.adImpression.testGetValue() ?? []).length}`
  );

  // content is recorded per SERP load regardless of whether ads were found.
  Assert.equal(
    getContent(),
    2,
    "content is recorded for both the interrupted load and the reload."
  );

  // The interrupted load never got far enough to find its ads, so only the
  // reload contributes withads here.
  Assert.equal(
    getWithads(),
    1,
    "Only the reload recorded withads; the interrupted load found no ads."
  );

  Assert.equal(
    impressions.length,
    2,
    "An impression is recorded for both the interrupted load and the reload."
  );
  Assert.equal(
    impressions.filter(i => i.extra.has_ai_summary == "unknown").length,
    1,
    "The interrupted load's impression came from the fallback path."
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_stop_load_before_withads() {
  resetTelemetry();

  let tab = await openLateAdSERPAndWaitForContent();

  // Stop before the ads are injected, so no ad scan ever reports them.
  tab.linkedBrowser.stop();

  // Wait past the 2s ad injection and the load-event scan window to be sure
  // nothing lands late.
  /* eslint-disable-next-line mozilla/no-arbitrary-setTimeout */
  await new Promise(resolve => setTimeout(resolve, 3000));

  info(
    `Stop before withads: content=${getContent()}, ` +
      `withads=${getWithads()}, ` +
      `impressions=${(Glean.serp.impression.testGetValue() ?? []).length}`
  );

  Assert.equal(
    getContent(),
    1,
    "content remains recorded after the load was stopped."
  );
  Assert.equal(
    getWithads(),
    0,
    "withads is never recorded because the ads were never scanned."
  );

  // Stopping does not navigate away, so the browser stays tracked and the
  // fallback impression has not run yet.
  Assert.equal(
    (Glean.serp.impression.testGetValue() ?? []).length,
    0,
    "No impression is recorded while the stopped SERP is still loaded."
  );

  let impression = waitForPageWithImpression();
  BrowserTestUtils.removeTab(tab);
  await impression;

  let impressions = Glean.serp.impression.testGetValue() ?? [];
  Assert.equal(
    impressions.length,
    1,
    "A fallback impression is recorded when the browser is untracked."
  );
  Assert.equal(
    impressions[0].extra.has_ai_summary,
    "unknown",
    "The impression came from the fallback path, not the page scan."
  );

  // This is the consistent case: no ad was ever counted, so the absence of
  // ad_impression matches withads.
  Assert.equal(
    (Glean.serp.adImpression.testGetValue() ?? []).length,
    0,
    "No ad_impression, matching the absent withads."
  );
});
