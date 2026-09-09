/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// End-to-end coverage for the query-derivation module wired into the Search
// CTA (bug 2055651): descriptive path -> keywords, empty/filtered path -> host,
// blocked host -> no CTA, and query string / fragment never searched.

const CTA_PREF = "browser.netError.searchCTA.enabled";

add_setup(async function () {
  stubSearchCTASupportedEngine();
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
    "best hiking boots reviews wildernessgear cta",
    "Path keywords come first, then the host's tokens"
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
    "tents shop wildernessgear cta",
    "Only the path and host contribute to the query"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_blockedHostRendersNoSearchButton() {
  const { tab, browser } = await loadDnsNotFoundPage(
    "https://db.internal/status"
  );
  await waitForSettledNetErrorCard(browser);
  await SpecialPowers.spawn(browser, [], async () => {
    const card =
      content.document.querySelector("net-error-card").wrappedJSObject;
    ok(card.reloadButton, "Reload is always present");
    is(
      card.searchCTAButton,
      null,
      "A blocked host renders no Search button despite the wordy path"
    );
  });
  BrowserTestUtils.removeTab(tab);
});
