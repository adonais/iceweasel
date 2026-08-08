/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * These tests check that, for providers configured with
 * requireTopLevelImpressionOrigin, a same-document navigation can never
 * originate impression tracking for a browser whose current session did not
 * begin with a genuine top-level load of a trackable page. This guards against
 * providers whose redirects (ad clicks, or organic outbound links) land on an
 * intermediate page that rewrites its URL via history.pushState to look like a
 * SERP, without ever performing a genuine top-level navigation to it.
 *
 * Also check this restriction doesn't falsely trigger for legitimate
 * sessions that pass through an intermediate, untracked page type (e.g.
 * clicking from "All" to "Images" and back), even though the
 * browser has no tracked session at the moment it navigates back to a
 * trackable page type.
 */

"use strict";

add_setup(async function () {
  await initSinglePageAppTest({
    baseProviderOverrides: { requireTopLevelImpressionOrigin: true },
  });

  registerCleanupFunction(async () => {
    SearchSERPTelemetry.overrideSearchTelemetryForTests();
    resetTelemetry();
  });
});

add_task(
  async function test_pushstate_from_non_matching_page_does_not_originate_impression() {
    resetTelemetry();

    let targetUrl = new URL(getSERPUrl("searchTelemetrySinglePageApp.html"));
    targetUrl.searchParams.set("s", "test");
    let tab =
      await SinglePageAppUtils.createTabAndPushStateFromNonMatchingUrl(
        targetUrl
      );

    // No top-level navigation ever matched the provider's searchPageRegexp,
    // so even though the same-document URL now matches and resolves to a
    // trackable ("web") page type, no impression should have been recorded.
    await assertSearchSourcesTelemetry({}, {});
    assertSERPTelemetry([]);

    BrowserTestUtils.removeTab(tab);
  }
);

add_task(
  async function test_top_level_load_then_non_serp_tab_then_all_still_tracked() {
    resetTelemetry();

    // A genuine top-level load must still be able to originate tracking again
    // after an intermediate same-document navigation to an untracked page
    // type (e.g. clicking a non-SERP "Images" tab), even though the browser
    // has no tracked session at the moment it navigates back to a trackable
    // page type. requireTopLevelImpressionOrigin should only block
    // origination for sessions that never had a genuine top-level SERP load
    // to begin with, not sessions that are merely passing through an
    // untracked page type.
    let tab = await SinglePageAppUtils.createTabAndLoadURL();
    await SinglePageAppUtils.clickImagesTab(tab);

    assertSERPTelemetry([
      {
        impression: {
          provider: "example1",
        },
        engagements: [
          {
            action: SearchSERPTelemetryUtils.ACTIONS.CLICKED,
            target: SearchSERPTelemetryUtils.COMPONENTS.NON_ADS_LINK,
          },
        ],
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

    info("Click All tab to return to a SERP.");
    await SinglePageAppUtils.clickAllTab(tab);

    assertSERPTelemetry([
      {
        impression: {
          provider: "example1",
        },
        engagements: [
          {
            action: SearchSERPTelemetryUtils.ACTIONS.CLICKED,
            target: SearchSERPTelemetryUtils.COMPONENTS.NON_ADS_LINK,
          },
        ],
        adImpressions: [
          {
            component: SearchSERPTelemetryUtils.COMPONENTS.AD_LINK,
            ads_loaded: "2",
            ads_visible: "2",
            ads_hidden: "0",
          },
        ],
      },
      {
        impression: {
          provider: "example1",
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

    await BrowserTestUtils.removeTab(tab);
  }
);

add_task(
  async function test_top_level_load_then_follow_on_search_still_tracked() {
    resetTelemetry();

    // A genuine top-level load must still originate tracking, and a
    // same-document follow-on search from there must still be tracked as
    // usual - requireTopLevelImpressionOrigin only blocks origination from
    // a same-document navigation, not legitimate continuation of a session
    // that was already tracked.
    let tab = await SinglePageAppUtils.createTabAndLoadURL();
    await SinglePageAppUtils.visitRelatedSearch(tab);

    await assertSearchSourcesTelemetry(
      {},
      {
        "browser.search.content.unknown": { "example1:tagged:ff": 2 },
        "browser.search.withads.unknown": { "example1:tagged": 2 },
      }
    );

    assertSERPTelemetry([
      {
        impression: {
          provider: "example1",
        },
        engagements: [
          {
            action: SearchSERPTelemetryUtils.ACTIONS.CLICKED,
            target: SearchSERPTelemetryUtils.COMPONENTS.NON_ADS_LINK,
          },
        ],
        adImpressions: [
          {
            component: SearchSERPTelemetryUtils.COMPONENTS.AD_LINK,
            ads_loaded: "2",
            ads_visible: "2",
            ads_hidden: "0",
          },
        ],
      },
      {
        impression: {
          provider: "example1",
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

    await BrowserTestUtils.removeTab(tab);
  }
);
