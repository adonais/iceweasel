/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Feature telemetry for the search CTA (bug 2055675): one action + one reason
// count per decision, a shown count when a CTA is displayed, and a clicked
// count. All content-free (counters only). connectivity-unconfirmed and the
// separate search_cta_click_aborted counter are added by bug 2055712.

const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);
const { SearchUITestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/SearchUITestUtils.sys.mjs"
);
SearchUITestUtils.init(this);

const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

const CTA_PREF = "browser.netError.searchCTA.enabled";

// Test engines report isGeneralPurposeEngine=false, so force the CTA's engine
// support decision per-test (bug 2055637). Caller restores the returned sandbox.
function stubEngineSupported(supported) {
  const sandbox = sinon.createSandbox();
  sandbox
    .stub(NetErrorParent.prototype, "isSupportedSearchEngine")
    .returns(supported);
  return sandbox;
}

add_setup(async function () {
  await SearchTestUtils.updateRemoteSettingsConfig([
    {
      // Temporary conflict with a normal engine to check that the partner code is removed for now.
      identifier: "google",
      base: {
        partnerCode: "foo",
        classification: "general",
        urls: {
          search: {
            base: "https://example.com/",
            params: [
              {
                name: "client",
                value: "{partnerCode}",
              },
            ],
            searchTermParamName: "q",
          },
        },
      },
    },
  ]);

  await SpecialPowers.pushPrefEnv({
    set: [
      [CTA_PREF, true],
      // Treat the connectivity reading as always fresh so the bug 2055712
      // guard is a no-op and this test doesn't depend on captive-portal state.
      ["browser.netError.searchCTA.connectivityFreshnessMs", 2147483647],
    ],
  });
});

/**
 * The parent records the decision before content resolves, so waiting for the
 * card to settle guarantees the telemetry is already recorded. The flush then
 * makes it readable through testGetValue in this process.
 *
 * @param {MozBrowser} browser The browser showing the error page.
 */
async function waitForCtaResolved(browser) {
  await waitForSettledNetErrorCard(browser);
  await Services.fog.testFlushAllChildren();
}

const action = label =>
  Glean.securityUiNeterror.searchCtaAction[label].testGetValue();
// Reason labels are asserted as they appear in metrics.yaml, which is the
// contract this test pins. They are the underscored form of the reason strings,
// and the two engine reasons belong to the decision layer rather than to
// URLKeywordAnalyzer, so there is no shared constant to use here.
const reason = label =>
  Glean.securityUiNeterror.searchCtaReason[label].testGetValue();
const shown = () => Glean.securityUiNeterror.searchCtaShown.testGetValue();

add_task(async function test_keywordOutcome() {
  Services.fog.testResetFOG();
  const engineStub = stubEngineSupported(true);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(
      "https://www.wildernessgear-cta.com/best-hiking-boots/reviews"
    );
    await waitForCtaResolved(browser);

    is(action(SEARCH_CTA_ACTIONS.KEYWORDS), 1, "action=keywords recorded");
    is(reason("keywords_found"), 1, "reason=keywords_found recorded");
    is(shown(), 1, "shown recorded for a displayed CTA");
    is(action(SEARCH_CTA_ACTIONS.NONE), null, "action=none not recorded");
    // No dynamic labels means no url/keywords/host could leak as a label.
    is(
      Glean.securityUiNeterror.searchCtaAction.__other__.testGetValue(),
      null,
      "No unexpected action label"
    );
    is(
      Glean.securityUiNeterror.searchCtaReason.__other__.testGetValue(),
      null,
      "No unexpected reason label"
    );
    BrowserTestUtils.removeTab(tab);
  } finally {
    engineStub.restore();
  }
});

add_task(async function test_hostOutcome() {
  Services.fog.testResetFOG();
  const engineStub = stubEngineSupported(true);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(
      "https://foo.wildernessgear-cta.com/"
    );
    await waitForCtaResolved(browser);

    is(action(SEARCH_CTA_ACTIONS.HOST), 1, "action=host recorded");
    is(reason("no_path"), 1, "reason=no_path recorded");
    is(shown(), 1, "shown recorded for a displayed CTA");
    BrowserTestUtils.removeTab(tab);
  } finally {
    engineStub.restore();
  }
});

add_task(async function test_blockedHostOutcome() {
  Services.fog.testResetFOG();
  const { tab, browser } = await loadDnsNotFoundPage(
    "https://db.internal/status"
  );
  await waitForCtaResolved(browser);

  is(
    action(SEARCH_CTA_ACTIONS.NONE),
    1,
    "action=none recorded for a blocked host"
  );
  is(reason("host_unusable"), 1, "reason=host_unusable recorded");
  is(shown(), null, "shown not recorded when no CTA is displayed");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_noEngineOutcome() {
  Services.fog.testResetFOG();
  const sandbox = sinon.createSandbox();
  sandbox.stub(SearchService, "getDefault").resolves(null);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(
      "https://www.wildernessgear-cta.com/best-hiking-boots"
    );
    await waitForCtaResolved(browser);

    is(
      action(SEARCH_CTA_ACTIONS.NONE),
      1,
      "action=none recorded with no engine"
    );
    is(reason("search_unavailable"), 1, "reason=search_unavailable recorded");
    is(shown(), null, "shown not recorded with no engine");
    BrowserTestUtils.removeTab(tab);
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_engineNotGeneralOutcome() {
  Services.fog.testResetFOG();
  // A default exists but is special-purpose (e.g. Wikipedia): no CTA is shown.
  const engineStub = stubEngineSupported(false);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(
      "https://www.wildernessgear-cta.com/best-hiking-boots"
    );
    await waitForCtaResolved(browser);

    is(
      action(SEARCH_CTA_ACTIONS.NONE),
      1,
      "action=none recorded for a non-general engine"
    );
    is(reason("engine_not_general"), 1, "reason=engine_not_general recorded");
    is(shown(), null, "shown not recorded for a non-general engine");
    BrowserTestUtils.removeTab(tab);
  } finally {
    engineStub.restore();
  }
});

add_task(async function test_clickedCount() {
  TelemetryTestUtils.getAndClearKeyedHistogram("SEARCH_COUNTS");
  Services.fog.testResetFOG();
  const engineStub = stubEngineSupported(true);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(
      "https://foo.wildernessgear-cta.com/"
    );
    const newTabPromise = BrowserTestUtils.waitForNewTab(
      gBrowser,
      // Should be no client field.
      "https://example.com/?q=wildernessgear-cta.com",
      true
    );
    await waitForSettledNetErrorCard(browser, {
      clickQuery: "searchCTAButton",
    });
    const searchTab = await newTabPromise;
    await Services.fog.testFlushAllChildren();

    is(
      Glean.securityUiNeterror.searchCtaClicked.testGetValue(),
      1,
      "clicked recorded on CTA click"
    );
    BrowserTestUtils.removeTab(searchTab);
    BrowserTestUtils.removeTab(tab);

    await SearchUITestUtils.assertSAPTelemetry({
      engineId: "google",
      engineName: "google",
      source: "errorpage",
      count: 1,
      telemetrySuffix: "-com-nocodes",
    });
  } finally {
    engineStub.restore();
  }
});
