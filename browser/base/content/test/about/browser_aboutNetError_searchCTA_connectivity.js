/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Connectivity-signal freshness guards for the search CTA (bug 2055712).
// Render time: a stale captive-portal reading triggers an authoritative,
// time-bounded re-check; the CTA is suppressed (action:none, reason:
// connectivity_unconfirmed) unless we come back affirmatively online, and a
// fresh reading is trusted without a re-check. Click time: if connectivity has
// dropped since render, the search is aborted (offline message shown) and the
// drop is recorded once as search_cta_click_aborted[connectivity_lost] — a
// click-time outcome, deliberately not a page-load reason.

const CTA_PREF = "browser.netError.searchCTA.enabled";
const CPS = Ci.nsICaptivePortalService;
const CONNECTIVITY_TOPIC = "network:captive-portal-connectivity";
// An empty path falls back to the registrable domain (host action), so the CTA
// shows whenever connectivity allows it.
const FAILED_URL = "https://foo.connectivity-cta.com/";

add_setup(async function () {
  stubSearchCTASupportedEngine();
  await SearchTestUtils.installSearchExtension(
    {
      name: "MozSearchCTAConnectivity",
      search_url: "https://example.com/",
      search_url_get_params: "q={searchTerms}",
    },
    { setAsDefault: true }
  );
  await SpecialPowers.pushPrefEnv({ set: [[CTA_PREF, true]] });
  registerCleanupFunction(() => Services.io.setConnectivityForTesting(true));
});

/**
 * Wait for the CTA decision to land and flush telemetry, so the counters the
 * parent recorded during that decision are readable in this process.
 *
 * @param {MozBrowser} browser The browser showing the error page.
 */
async function waitForCtaResolved(browser) {
  await waitForSettledNetErrorCard(browser);
  await Services.fog.testFlushAllChildren();
}

const reason = label =>
  Glean.securityUiNeterror.searchCtaReason[label].testGetValue();
const shown = () => Glean.securityUiNeterror.searchCtaShown.testGetValue();

/**
 * A fake captive-portal service with a controllable state, reading age and
 * re-check behavior, so the guard can be exercised without real detection.
 *
 * @param {object} [options]
 * @param {number} [options.state] An nsICaptivePortalService state constant.
 * @param {number} [options.lastChecked] Age of the reading in milliseconds. 0
 *   is treated as fresh, and a large value forces the stale path.
 * @param {Function} [options.onRecheck] Called when the CTA asks for an
 *   authoritative re-check, to simulate its outcome.
 * @returns {object} A stand-in for nsICaptivePortalService.
 */
function fakeCPS({ state = CPS.NOT_CAPTIVE, lastChecked = 0, onRecheck } = {}) {
  return {
    state,
    lastChecked,
    recheckCaptivePortal() {
      onRecheck?.();
    },
  };
}

// A reading inside the freshness window is trusted as-is: the CTA shows and
// no authoritative re-check is triggered, so the common case costs nothing.
add_task(async function test_freshReadingShowsCtaWithoutRecheck() {
  Services.fog.testResetFOG();
  Services.io.setConnectivityForTesting(true);
  const sandbox = sinon.createSandbox();
  const cps = fakeCPS({ state: CPS.NOT_CAPTIVE, lastChecked: 0 });
  const recheckSpy = sandbox.spy(cps, "recheckCaptivePortal");
  sandbox
    .stub(NetErrorParent.prototype, "getCaptivePortalService")
    .returns(cps);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
    await waitForCtaResolved(browser);

    is(shown(), 1, "CTA shown on a fresh reading");
    is(
      reason("connectivity_unconfirmed"),
      null,
      "nothing recorded on the fresh path"
    );
    ok(!recheckSpy.called, "no re-check when the reading is already fresh");
    BrowserTestUtils.removeTab(tab);
  } finally {
    sandbox.restore();
  }
});

// A stale reading triggers a re-check, and when that comes back offline the CTA
// is suppressed rather than inviting a search that cannot run.
add_task(async function test_staleReadingRechecksOfflineSuppressesCta() {
  Services.fog.testResetFOG();
  Services.io.setConnectivityForTesting(true);
  const sandbox = sinon.createSandbox();
  // Stale reading; the authoritative re-check comes back offline.
  const cps = fakeCPS({
    state: CPS.NOT_CAPTIVE,
    lastChecked: 999999,
    onRecheck() {
      Services.io.setConnectivityForTesting(false);
      Services.obs.notifyObservers(null, CONNECTIVITY_TOPIC, "captive");
    },
  });
  sandbox
    .stub(NetErrorParent.prototype, "getCaptivePortalService")
    .returns(cps);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
    await waitForCtaResolved(browser);

    is(
      reason("connectivity_unconfirmed"),
      1,
      "connectivity-unconfirmed recorded"
    );
    is(shown(), null, "CTA not shown when the re-check resolves offline");
    await SpecialPowers.spawn(browser, [], () => {
      const card =
        content.document.querySelector("net-error-card").wrappedJSObject;
      is(card.searchCTAButton, null, "no Search button after offline re-check");
    });
    BrowserTestUtils.removeTab(tab);
  } finally {
    Services.io.setConnectivityForTesting(true);
    sandbox.restore();
  }
});

// A re-check that never completes must not hang the CTA. The bounded timeout
// wins and the CTA is suppressed, which is the fail-safe direction.
add_task(async function test_recheckTimeoutSuppressesCta() {
  Services.fog.testResetFOG();
  Services.io.setConnectivityForTesting(true);
  await SpecialPowers.pushPrefEnv({
    set: [["browser.netError.searchCTA.connectivityRecheckTimeoutMs", 100]],
  });
  const sandbox = sinon.createSandbox();
  // Stale reading whose re-check never completes: the bounded timeout wins.
  const cps = fakeCPS({ state: CPS.UNKNOWN, lastChecked: 999999 });
  sandbox
    .stub(NetErrorParent.prototype, "getCaptivePortalService")
    .returns(cps);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
    await waitForCtaResolved(browser);

    is(
      reason("connectivity_unconfirmed"),
      1,
      "connectivity-unconfirmed recorded on timeout"
    );
    is(shown(), null, "CTA not shown when the re-check times out");
    BrowserTestUtils.removeTab(tab);
  } finally {
    sandbox.restore();
    await SpecialPowers.popPrefEnv();
  }
});

// Connectivity dropping after the CTA was shown is a click-time outcome, not a
// page-load decision: the search is aborted with an offline message, the click
// is still counted, and no page-load reason is recorded.
add_task(async function test_clickTimeConnectivityDropAbortsSearch() {
  Services.fog.testResetFOG();
  Services.io.setConnectivityForTesting(true);
  const sandbox = sinon.createSandbox();
  // Fresh + online at render so the CTA shows.
  sandbox
    .stub(NetErrorParent.prototype, "getCaptivePortalService")
    .returns(fakeCPS({ state: CPS.NOT_CAPTIVE, lastChecked: 0 }));
  try {
    const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
    await SpecialPowers.spawn(browser, [], async () => {
      const doc = content.document;
      const card = await ContentTaskUtils.waitForCondition(
        () => doc.querySelector("net-error-card")?.wrappedJSObject
      );
      await ContentTaskUtils.waitForCondition(() => card.searchCTAButton);
    });

    // Drop connectivity and wait for the content process to observe it.
    Services.io.setConnectivityForTesting(false);
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(() => !Services.io.connectivity);
    });

    let openedTab = false;
    const onTabOpen = () => {
      openedTab = true;
    };
    gBrowser.tabContainer.addEventListener("TabOpen", onTabOpen);
    await SpecialPowers.spawn(browser, [], async () => {
      const card =
        content.document.querySelector("net-error-card").wrappedJSObject;
      card.searchCTAButton.click();
      await ContentTaskUtils.waitForCondition(
        () => card.searchCTAOfflineMessage,
        "the offline message replaces the Search button"
      );
      is(card.searchCTAButton, null, "Search button is gone after the abort");
    });
    gBrowser.tabContainer.removeEventListener("TabOpen", onTabOpen);
    await Services.fog.testFlushAllChildren();

    ok(!openedTab, "no search tab opened when connectivity dropped");
    is(
      Glean.securityUiNeterror.searchCtaClicked.testGetValue(),
      1,
      "the click is still counted"
    );
    is(
      Glean.securityUiNeterror.searchCtaClickAborted.connectivity_lost.testGetValue(),
      1,
      "the aborted click is recorded as a click-time outcome"
    );
    is(
      reason("connectivity_lost"),
      null,
      "an aborted click adds no page-load reason"
    );
    is(
      reason("connectivity_unconfirmed"),
      null,
      "and is not confused with load-time suppression"
    );
    BrowserTestUtils.removeTab(tab);
  } finally {
    Services.io.setConnectivityForTesting(true);
    sandbox.restore();
  }
});
