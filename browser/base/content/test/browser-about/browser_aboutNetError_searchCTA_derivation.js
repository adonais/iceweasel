/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// End-to-end coverage for the query-derivation module wired into the Search
// CTA (bug 2055651): descriptive path -> keywords, empty/filtered path -> host,
// blocked host -> no CTA, and query string / fragment never searched.

const CTA_PREF = "browser.netError.searchCTA.enabled";

add_setup(async function () {
  stubSearchCTASupportedEngine();
  pinSearchCTADecisionDeadline();
  await SearchTestUtils.installSearchExtension(
    {
      name: "MozSearchCTADerivation",
      search_url: "https://example.com/",
      search_url_get_params: "q={searchTerms}",
    },
    { setAsDefault: true }
  );
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
 * Click the Search button and return the decoded value of the resulting search
 * query, which is robust to +/%20 space encoding.
 *
 * @param {MozBrowser} browser The browser showing the error page.
 * @returns {Promise<string>} The query the search engine received.
 */
async function searchQueryFromClick(browser) {
  const newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  await waitForSettledNetErrorCard(browser, { clickQuery: "searchCTAButton" });
  const searchTab = await newTabPromise;
  const query = new URL(
    searchTab.linkedBrowser.currentURI.spec
  ).searchParams.get("q");
  BrowserTestUtils.removeTab(searchTab);
  return query;
}

add_task(async function test_descriptivePathSearchesKeywords() {
  const { tab, browser } = await loadDnsNotFoundPage(
    "https://www.wildernessgear-cta.com/best-hiking-boots/reviews"
  );
  is(
    await searchQueryFromClick(browser),
    "wildernessgear cta best hiking boots reviews",
    "The host's tokens come first, then the path keywords"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_emptyPathSearchesRegistrableDomain() {
  const { tab, browser } = await loadDnsNotFoundPage(
    "https://foo.wildernessgear-cta.com/"
  );
  is(
    await searchQueryFromClick(browser),
    "wildernessgear-cta.com",
    "An empty path falls back to the registrable domain"
  );
  BrowserTestUtils.removeTab(tab);
});

// The exact expected query is the assertion: the secret in the query string and
// the fragment are both absent from it, so neither can reach the engine.
add_task(async function test_queryStringAndFragmentNeverSearched() {
  const { tab, browser } = await loadDnsNotFoundPage(
    "https://shop.wildernessgear-cta.com/tents?token=supersecret#section-2"
  );
  is(
    await searchQueryFromClick(browser),
    "shop wildernessgear cta tents",
    "Only the host and path contribute to the query"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_blockedHostRendersNoSearchButton() {
  for (const failedURL of [
    "https://db.internal/status",
    // Private-use intranet suffixes (bug 2066447), including the two-label
    // home.arpa that a last-label-only check would miss.
    "https://wiki.acme.corp/it-helpdesk",
    "https://router.home/setup",
    "https://nas.lan/media",
    "https://gateway.home.arpa/status",
  ]) {
    const { tab, browser } = await loadDnsNotFoundPage(failedURL);
    await waitForSettledNetErrorCard(browser);
    await SpecialPowers.spawn(browser, [failedURL], async url => {
      const card =
        content.document.querySelector("net-error-card").wrappedJSObject;
      ok(card.reloadButton, `Reload is always present (${url})`);
      is(
        card.searchCTAButton,
        null,
        `A blocked host renders no Search button despite the wordy path (${url})`
      );
    });
    BrowserTestUtils.removeTab(tab);
  }
});

// The over-blocking guard: a mistyped TLD is not a private-use suffix, so it
// keeps its Search button (bug 2066447).
add_task(async function test_mistypedTLDStillRendersSearchButton() {
  const { tab, browser } = await loadDnsNotFoundPage(
    "https://wildernessgear-cta.comm/winter-deals"
  );
  is(
    await searchQueryFromClick(browser),
    "wildernessgear cta winter deals",
    "A mistyped TLD still gets a Search button"
  );
  BrowserTestUtils.removeTab(tab);
});
