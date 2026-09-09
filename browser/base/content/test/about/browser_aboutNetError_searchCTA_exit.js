/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Exit-outcome event for the search CTA (bug 2055717). Exactly one
// search_cta_exit event per CTA-eligible online dnsNotFound page, with a
// content-free reason (clicked-cta / clicked-reload / clicked-suggestion /
// navigated-or-closed) plus cta_shown and suggestion_shown booleans. Recorded
// at the click for the three click-driven reasons, at pagehide otherwise.
// Non-eligible pages (pref off, etc.) record nothing.

const { SearchService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/search/SearchService.sys.mjs"
);

const CTA_PREF = "browser.netError.searchCTA.enabled";
// Empty path -> registrable-domain (host) query, so the CTA shows with a
// default engine present.
const FAILED_URL = "https://foo.exit-cta.com/";

add_setup(async function () {
  stubSearchCTASupportedEngine();
  await SearchTestUtils.installSearchExtension(
    {
      name: "MozSearchCTAExit",
      search_url: "https://example.com/",
      search_url_get_params: "q={searchTerms}",
    },
    { setAsDefault: true }
  );
  await SpecialPowers.pushPrefEnv({
    set: [
      [CTA_PREF, true],
      // Treat the connectivity reading as always fresh so the bug 2055712 guard
      // is a no-op and the CTA renders deterministically.
      ["browser.netError.searchCTA.connectivityFreshnessMs", 2147483647],
    ],
  });
});

const exitEvents = () =>
  Glean.securityUiNeterror.searchCtaExit.testGetValue() ?? [];

// The CTA exit event fires on every eligible page, so tab closes in other
// searchCTA test files can leave events buffered in content. Ship those to the
// parent, then clear, so each task starts from a known-empty state.
async function drainAndResetExitEvents() {
  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();
}

/**
 * Navigate the error page away to fire pagehide, then flush content telemetry.
 * Kept local because this is the only file that has to force a pagehide.
 *
 * @param {MozBrowser} browser The browser showing the error page.
 */
async function navigateAwayAndFlush(browser) {
  const loaded = BrowserTestUtils.browserLoaded(
    browser,
    false,
    url => url === "about:blank"
  );
  BrowserTestUtils.startLoadingURIString(browser, "about:blank");
  await loaded;
  await Services.fog.testFlushAllChildren();
}

add_task(async function test_navigatedOrClosed() {
  await drainAndResetExitEvents();
  const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
  await waitForSettledNetErrorCard(browser);
  await navigateAwayAndFlush(browser);

  const events = exitEvents();
  is(events.length, 1, "one exit event for a qualifying page");
  is(
    events[0].extra.reason,
    "navigated-or-closed",
    "merged away/closed reason"
  );
  is(String(events[0].extra.cta_shown), "true", "cta_shown true when shown");
  is(
    String(events[0].extra.suggestion_shown),
    "false",
    "suggestion_shown false when no suggestion was offered"
  );
  Assert.deepEqual(
    Object.keys(events[0].extra).sort(),
    ["cta_shown", "reason", "suggestion_shown"],
    "no content fields recorded"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_clickedCta() {
  await drainAndResetExitEvents();
  const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
  const newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  await waitForSettledNetErrorCard(browser, {
    clickQuery: "searchCTAButton",
  });
  const searchTab = await newTabPromise;
  BrowserTestUtils.removeTab(searchTab);

  // The error page stays open after the search; navigating it away exits it.
  await navigateAwayAndFlush(browser);

  const events = exitEvents();
  is(events.length, 1, "one exit event");
  is(events[0].extra.reason, "clicked-cta", "clicked-cta recorded");
  is(String(events[0].extra.cta_shown), "true", "cta_shown true");
  BrowserTestUtils.removeTab(tab);
});

// Clicking Search opens a separate tab and leaves this page loaded, so the
// event must not wait for pagehide: it would otherwise be delayed for as long
// as the tab stays open, and lost entirely if pagehide never fires — losing
// precisely the clicks the CTA worked for.
add_task(async function test_clickedCtaRecordsWithoutPagehide() {
  await drainAndResetExitEvents();
  const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
  const newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  await waitForSettledNetErrorCard(browser, {
    clickQuery: "searchCTAButton",
  });
  const searchTab = await newTabPromise;

  // Deliberately no navigation: the error page is still open and has not fired
  // pagehide, yet the outcome must already be recorded.
  await Services.fog.testFlushAllChildren();
  const events = exitEvents();
  is(events.length, 1, "exit recorded at click time, with no pagehide");
  is(events[0].extra.reason, "clicked-cta", "clicked-cta recorded");
  is(String(events[0].extra.cta_shown), "true", "cta_shown true");

  BrowserTestUtils.removeTab(searchTab);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_clickedReload() {
  await drainAndResetExitEvents();
  const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
  const reloaded = BrowserTestUtils.waitForErrorPage(browser);
  await waitForSettledNetErrorCard(browser, { clickQuery: "reloadButton" });
  await reloaded;
  await Services.fog.testFlushAllChildren();

  const events = exitEvents();
  is(events.length, 1, "reload fires one exit event");
  is(events[0].extra.reason, "clicked-reload", "clicked-reload recorded");
  // Navigate away before closing so the still-live reloaded error page doesn't
  // fire a stray exit event on tab close that races into the next task.
  await navigateAwayAndFlush(browser);
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_clickedSuggestion() {
  await drainAndResetExitEvents();
  const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
  await waitForSettledNetErrorCard(browser);
  await SpecialPowers.spawn(browser, [], async () => {
    const card =
      content.document.querySelector("net-error-card").wrappedJSObject;
    // Simulate the NetErrorChild-injected "did you mean" link and click it.
    const span = content.document.createElement("span");
    span.id = "dns-suggestion";
    const link = content.document.createElement("a");
    link.textContent = "did you mean";
    span.appendChild(link);
    card.errorIntro.after(span);
    link.click();
  });
  await navigateAwayAndFlush(browser);

  const events = exitEvents();
  is(events.length, 1, "one exit event");
  is(
    events[0].extra.reason,
    "clicked-suggestion",
    "clicked-suggestion recorded"
  );
  is(
    String(events[0].extra.suggestion_shown),
    "true",
    "suggestion_shown true when the suggestion was on the page"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_ctaShownFalseWhenSuppressed() {
  await drainAndResetExitEvents();
  const sandbox = sinon.createSandbox();
  sandbox.stub(SearchService, "getDefault").resolves(null);
  try {
    const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
    await waitForSettledNetErrorCard(browser);
    await SpecialPowers.spawn(browser, [], async () => {
      const card =
        content.document.querySelector("net-error-card").wrappedJSObject;
      is(card.searchCTAButton, null, "Search button suppressed with no engine");
    });
    await navigateAwayAndFlush(browser);

    const events = exitEvents();
    is(events.length, 1, "exit event still fires on a qualifying page");
    is(events[0].extra.reason, "navigated-or-closed", "reason recorded");
    is(
      String(events[0].extra.cta_shown),
      "false",
      "cta_shown false when the Search button was suppressed"
    );
    BrowserTestUtils.removeTab(tab);
  } finally {
    sandbox.restore();
  }
});

add_task(async function test_noEventWhenNotEligible() {
  await drainAndResetExitEvents();
  await SpecialPowers.pushPrefEnv({ set: [[CTA_PREF, false]] });
  const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
  await waitForSettledNetErrorCard(browser);
  await SpecialPowers.spawn(browser, [], async () => {
    const card =
      content.document.querySelector("net-error-card").wrappedJSObject;
    ok(card.tryAgainButton, "The standard dnsNotFound page is shown");
  });
  await navigateAwayAndFlush(browser);

  is(exitEvents().length, 0, "no exit event on a non-eligible page");
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
