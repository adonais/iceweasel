/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// The Search CTA in private browsing: it renders in a private window, and a
// click runs the search through the *private* default engine, opening a
// *private* tab in the same window. A distinct private engine (and a
// non-private contrast task) prove the private search path is exercised rather
// than the normal default leaking through.

const CTA_PREF = "browser.netError.searchCTA.enabled";
// An empty path falls back to the registrable domain, so the query is
// deterministic without depending on keyword derivation.
const FAILED_URL = "https://foo.doesnotexist-searchctapbm.com/";
const EXPECTED_QUERY = "doesnotexist-searchctapbm.com";

add_setup(async function () {
  stubSearchCTASupportedEngine();
  // Enable a separate private default so getDefaultPrivate() returns the
  // dedicated engine below; the .ui.enabled pref must be set before installing
  // it, or setDefaultPrivate() would fall back to the normal default.
  await SpecialPowers.pushPrefEnv({
    set: [
      [CTA_PREF, true],
      ["browser.search.separatePrivateDefault.ui.enabled", true],
      ["browser.search.separatePrivateDefault", true],
      // Treat the connectivity reading as always fresh so the bug 2055712 guard
      // is a no-op and this test doesn't depend on captive-portal state.
      ["browser.netError.searchCTA.connectivityFreshnessMs", 2147483647],
    ],
  });
  // Two engines sharing example.com (routed by the mochitest server) but tagged
  // with a distinct "variant" param so the click assertions can tell them apart.
  await SearchTestUtils.installSearchExtension(
    {
      name: "MozSearchCTAPbmNormal",
      search_url: "https://example.com/",
      search_url_get_params: "q={searchTerms}&variant=normal",
    },
    { setAsDefault: true }
  );
  await SearchTestUtils.installSearchExtension(
    {
      name: "MozSearchCTAPbmPrivate",
      search_url: "https://example.com/",
      search_url_get_params: "q={searchTerms}&variant=private",
    },
    { setAsDefaultPrivate: true }
  );
});

add_task(async function test_privateWindowCtaRendersAndUsesPrivateEngine() {
  const win = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  try {
    ok(PrivateBrowsingUtils.isWindowPrivate(win), "Opened a private window");
    const { browser } = await loadDnsNotFoundPage(FAILED_URL, win);
    await waitForSettledNetErrorCard(browser);

    await SpecialPowers.spawn(browser, [], async () => {
      const card =
        content.document.querySelector("net-error-card").wrappedJSObject;
      is(
        card.errorTitle.getAttribute("data-l10n-id"),
        "neterror-search-cta-title",
        "Search CTA heading renders in a private window"
      );
      ok(card.reloadButton, "Reload button renders in a private window");
      ok(card.searchCTAButton, "Search button renders in a private window");
    });

    const newTabPromise = BrowserTestUtils.waitForNewTab(
      win.gBrowser,
      null,
      true
    );
    await waitForSettledNetErrorCard(browser, {
      clickQuery: "searchCTAButton",
    });
    const searchTab = await newTabPromise;

    ok(
      PrivateBrowsingUtils.isBrowserPrivate(searchTab.linkedBrowser),
      "Search opens a private tab"
    );
    // Awaiting win.gBrowser's TabOpen above already means the parent targeted
    // this private window rather than the primary one; assert it explicitly.
    ok(
      win.gBrowser.tabs.includes(searchTab),
      "Search tab opens in the same private window"
    );

    const searchURL = new URL(searchTab.linkedBrowser.currentURI.spec);
    is(
      searchURL.searchParams.get("variant"),
      "private",
      "The private default engine is used in a private window"
    );
    is(
      searchURL.searchParams.get("q"),
      EXPECTED_QUERY,
      "The derived query is searched"
    );

    BrowserTestUtils.removeTab(searchTab);
  } finally {
    await BrowserTestUtils.closeWindow(win);
  }
});

// Contrast: the same click in a non-private window uses the normal default,
// confirming the private path above is genuinely distinct.
add_task(async function test_nonPrivateSearchUsesNormalEngine() {
  const { tab, browser } = await loadDnsNotFoundPage(FAILED_URL);
  const newTabPromise = BrowserTestUtils.waitForNewTab(gBrowser, null, true);
  await waitForSettledNetErrorCard(browser, { clickQuery: "searchCTAButton" });
  const searchTab = await newTabPromise;

  is(
    new URL(searchTab.linkedBrowser.currentURI.spec).searchParams.get(
      "variant"
    ),
    "normal",
    "The normal default engine is used in a non-private window"
  );

  BrowserTestUtils.removeTab(searchTab);
  BrowserTestUtils.removeTab(tab);
});
