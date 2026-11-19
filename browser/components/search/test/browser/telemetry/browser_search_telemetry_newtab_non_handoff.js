/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that searches from the non-handoff search box on about:newtab and
 * about:home report the correct search access point and partner code.
 */

"use strict";

const SEARCH_URL =
  "https://example.org/browser/browser/components/search/test/browser/telemetry/searchTelemetry.html";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.urlbar.newtab.featureGate", false],
      [
        "browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar",
        false,
      ],
    ],
  });

  let partnerDetails;
  if (SearchUtils.configV3FeatureGate) {
    partnerDetails = {
      partner: {
        default: { code: "defaultcode" },
        newtab: { code: "newtabcode", telemetrySuffix: "newtabsx" },
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
});

async function searchFromNonHandoffUI(url) {
  Services.fog.testResetFOG();
  TelemetryTestUtils.getAndClearKeyedHistogram("SEARCH_COUNTS");

  let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url);
  await BrowserTestUtils.browserStopped(tab.linkedBrowser, url);

  let loadPromise = BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    false,
    loadedUrl => loadedUrl.startsWith(SEARCH_URL)
  );
  await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
    let handoffUI = await ContentTaskUtils.waitForCondition(
      () => content.document.querySelector("content-search-handoff-ui"),
      "Wait for content-search-handoff-ui to be created"
    );
    await handoffUI.updateComplete;
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.body.style.getPropertyValue("--newtab-search-icon"),
      "Wait for the default engine to be received"
    );

    let input = handoffUI.shadowRoot.querySelector("#newtab-search-text");
    Assert.ok(input, "Should be displaying the non-handoff search input");
    input.value = "test";
    handoffUI.shadowRoot.querySelector("#searchSubmit").click();
  });
  await loadPromise;

  let expectedPartnerCode = SearchUtils.configV3FeatureGate
    ? "newtabcode"
    : "defaultcode";
  Assert.equal(
    URL.fromURI(tab.linkedBrowser.currentURI).searchParams.get("pc"),
    expectedPartnerCode,
    "Should have loaded the search with the expected partner code"
  );

  BrowserTestUtils.removeTab(tab);
}

add_task(async function test_about_newtab() {
  await searchFromNonHandoffUI("about:newtab");

  await SearchUITestUtils.assertSAPTelemetry({
    engineId: "engine",
    engineName: "engine",
    partnerCode: SearchUtils.configV3FeatureGate ? "newtabcode" : "defaultcode",
    source: "about_newtab",
    telemetrySuffix: SearchUtils.configV3FeatureGate ? "-newtabsx" : "",
    count: 1,
  });
});

add_task(async function test_about_home() {
  await searchFromNonHandoffUI("about:home");

  await SearchUITestUtils.assertSAPTelemetry({
    engineId: "engine",
    engineName: "engine",
    partnerCode: SearchUtils.configV3FeatureGate ? "newtabcode" : "defaultcode",
    source: "about_home",
    telemetrySuffix: SearchUtils.configV3FeatureGate ? "-newtabsx" : "",
    count: 1,
  });
});
