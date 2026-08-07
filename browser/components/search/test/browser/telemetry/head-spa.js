/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Helpers to simulate the use of a single page application.
 */

/* import-globals-from head.js */

/**
 * Used to control the SPA SERP.
 */
class SinglePageAppUtils {
  static async clickAd(tab) {
    info("Clicking ad.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#ad",
      {},
      tab.linkedBrowser
    );
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  }

  static async clickAllTab(tab) {
    info("Click All tab to return to a SERP.");
    let adsPromise = TestUtils.topicObserved(
      "reported-page-with-ad-impressions"
    );
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#all",
      {},
      tab.linkedBrowser
    );
    await adsPromise;
  }

  static async clickImagesTab(tab) {
    info("Click images tab.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#images",
      {},
      tab.linkedBrowser
    );
    info("Wait a brief amount of time.");
    // There's no obvious way to know we shouldn't expect a SERP impression, so
    // we wait roughly the amount of time it would take for extracting ads to
    // take.
    await promiseWaitForAdLinkCheck();
  }

  static async clickOrganic(tab) {
    info("Clicking organic result.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#organic",
      {},
      tab.linkedBrowser
    );
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  }

  static async clickRedirectAd(tab) {
    info("Clicking redirect ad.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#ad-redirect",
      {},
      tab.linkedBrowser
    );
    await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  }

  static async clickRedirectAdInNewTab(tab) {
    info("Clicking redirect ad in new tab.");
    let tabPromise = BrowserTestUtils.waitForNewTab(
      tab.documentGlobal.gBrowser
    );
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#ad-redirect",
      { button: 1 },
      tab.linkedBrowser
    );
    let redirectedTab = await tabPromise;
    return redirectedTab;
  }

  static async clickRedirectAdInNewWindow(tab) {
    let contextMenu = tab.linkedBrowser.documentGlobal.document.getElementById(
      "contentAreaContextMenu"
    );
    let contextMenuPromise = BrowserTestUtils.waitForEvent(
      contextMenu,
      "popupshown"
    );
    info("Open context menu.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#ad-redirect",
      { type: "contextmenu", button: 2 },
      tab.linkedBrowser
    );
    await contextMenuPromise;

    let newWindowPromise = BrowserTestUtils.waitForNewWindow({
      url: "https://example.com/hello_world",
    });
    let openLinkInNewWindow = contextMenu.querySelector("#context-openlink");
    info("Click on Open Link in New Window");
    contextMenu.activateItem(openLinkInNewWindow);
    return await newWindowPromise;
  }

  static async clickSearchbox(tab) {
    info("Clicking searchbox.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#searchbox",
      {},
      tab.linkedBrowser
    );
    await waitForIdle();
  }

  static async clickSearchboxAndType(tab, str = "hello world") {
    await SinglePageAppUtils.clickSearchbox(tab);
    info(`Type ${str} in searchbox.`);
    for (let char of str) {
      await BrowserTestUtils.sendChar(char, tab.linkedBrowser);
    }
    await waitForIdle();
  }

  static async clickShoppingTab(tab) {
    info("Clicking shopping tab.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#shopping",
      {},
      tab.linkedBrowser
    );
    await waitForPageWithAdImpressions();
  }

  static async clickSuggestion(tab) {
    info("Clicking the first suggestion.");
    let adsPromise = TestUtils.topicObserved(
      "reported-page-with-ad-impressions"
    );
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#searchbox-suggestions div",
      {},
      tab.linkedBrowser
    );
    await adsPromise;
  }

  static async clickSuggestionOnImagesTab(tab) {
    info("Clicking the first suggestion on images tab.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#searchbox-suggestions div",
      {},
      tab.linkedBrowser
    );
    await promiseWaitForAdLinkCheck();
  }

  static async createTabAndLoadURL(
    url = new URL(getSERPUrl("searchTelemetrySinglePageApp.html"))
  ) {
    info("Load SERP.");
    let adsPromise = TestUtils.topicObserved(
      "reported-page-with-ad-impressions"
    );
    let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url.href);
    await adsPromise;
    return tab;
  }

  /**
   * Loads a page that doesn't match any provider's searchPageRegexp, then
   * has that page use history.pushState (a same-document navigation) to
   * change the URL to one that does match. This simulates a redirect (e.g.
   * an ad click, or an organic outbound link) whose landing page happens to
   * rewrite the URL to look like a SERP without ever performing a top-level
   * navigation to it.
   *
   * @param {URL} targetUrl
   *   The SERP-shaped URL to push into history from the non-matching page.
   */
  static async createTabAndPushStateFromNonMatchingUrl(targetUrl) {
    info("Load non-matching page.");
    let url = new URL(getSERPUrl("searchTelemetryNonSerpPushState.html"));
    url.searchParams.set("target", targetUrl.href);
    let pushStatePromise = BrowserTestUtils.waitForLocationChange(
      gBrowser,
      targetUrl.href
    );
    let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url.href);
    info("Wait for the page to push the SERP-shaped URL.");
    await pushStatePromise;
    // There's no impression to wait for in the success case, so wait roughly
    // the amount of time it would take for one to be reported if the bug
    // being tested for were present.
    await promiseWaitForAdLinkCheck();
    return tab;
  }

  /**
   * Loads the SPA's own URL without a search query, which doesn't count as
   * a SERP match (there's no search term), then simulates the page pushing
   * state to a URL that does match a trackable page type - as if the user
   * searched from the provider's homepage. This is used to verify that
   * providers without requireTopLevelImpressionOrigin can still originate
   * impression tracking from a same-document navigation, even though the
   * top-level load itself didn't match a trackable page.
   *
   * @param {string} searchTerm
   *   The search term to push into the URL from the non-matching page.
   */
  static async createTabWithHomepageSearch(searchTerm = "test") {
    info("Load SPA homepage without a search query.");
    let url = new URL(getSERPUrl("searchTelemetrySinglePageApp.html"));
    // getSERPUrl always appends a search query; strip it so the top-level
    // load doesn't itself match a SERP (there's no search term), mirroring
    // a provider's homepage rather than a search results page.
    url.searchParams.delete("s");
    let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url.href);

    info("Simulate an in-page search that pushes a SERP-shaped URL.");
    let adsPromise = TestUtils.topicObserved(
      "reported-page-with-ad-impressions"
    );
    await SpecialPowers.spawn(
      tab.linkedBrowser,
      [searchTerm],
      async function (contentSearchTerm) {
        // Mirrors the SPA's own "All" tab click handler, which is what a
        // homepage search box submission would trigger. The argument is
        // built inside the content global so updatePageState's destructuring
        // isn't denied access by the Xray wrapper around a privileged object.
        content.wrappedJSObject.updatePageState(
          Cu.cloneInto({ page: "web", query: contentSearchTerm }, content)
        );
        content.wrappedJSObject.replaceWithBasicResults();
        content.wrappedJSObject.updateRelatedSearches();
        content.wrappedJSObject.updateSearchbox();
        content.wrappedJSObject.updateSuggestions();
      }
    );
    await adsPromise;
    return tab;
  }

  static async createTabAndSearch(searchTerm = "test") {
    info("Load SERP.");
    let adsPromise = TestUtils.topicObserved(
      "reported-page-with-ad-impressions"
    );
    let url = new URL(getSERPUrl("searchTelemetrySinglePageApp.html"));
    url.searchParams.set("s", searchTerm);
    let tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url.href);
    await adsPromise;
    return tab;
  }

  static async createTabsWithDifferentProviders() {
    let url1 = new URL(getSERPUrl("searchTelemetrySinglePageApp.html"));
    let tab1 = await SinglePageAppUtils.createTabAndLoadURL(url1);

    let url2 = new URL(
      getAlternateSERPUrl("searchTelemetrySinglePageApp.html")
    );
    let tab2 = await SinglePageAppUtils.createTabAndLoadURL(url2);

    return [tab1, tab2];
  }

  static async goBack(tab) {
    info("Go back to SERP ads.");
    let promise = TestUtils.topicObserved("reported-page-with-ad-impressions");
    tab.linkedBrowser.goBack();
    await promise;
  }

  static async goBackToPageWithoutAds(tab) {
    info("Go back to SERP without ads.");
    tab.linkedBrowser.goBack();
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  static async goForward(tab) {
    info("Go forward to SERP ads.");
    let promise = TestUtils.topicObserved("reported-page-with-ad-impressions");
    tab.linkedBrowser.goForward();
    await promise;
  }

  static async goForwardToPageWithoutAds(tab) {
    info("Go forward to SERP without ads.");
    tab.linkedBrowser.goForward();
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  static async pushUnrelatedState(tab, { key = "foobar", value = "baz" } = {}) {
    info(`Pushing ${key}=${value} to the list of query parameters in URL.`);
    await SpecialPowers.spawn(
      tab.linkedBrowser,
      [key, value],
      async function (contentKey, contentValue) {
        let url = new URL(content.window.location.href);
        url.searchParams.set(contentKey, contentValue);
        content.history.pushState({}, "", url);
      }
    );
  }

  static async visitRelatedSearch(tab) {
    let adsPromise = TestUtils.topicObserved(
      "reported-page-with-ad-impressions"
    );
    info("Clicking a related search with an ad.");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#related-search",
      {},
      tab.linkedBrowser
    );
    await adsPromise;
  }

  static async visitRelatedSearchWithoutAds(tab) {
    info("Clicking a related search without ads.");
    let adsPromise = TestUtils.topicObserved(
      "reported-page-with-ad-impressions"
    );
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#related-search-without-ads",
      {},
      tab.linkedBrowser
    );
    await adsPromise;
  }
}

function getAlternateSERPUrl(page, organic = false) {
  let url =
    getRootDirectory(gTestPath).replace(
      "chrome://mochitests/content",
      "https://example.com"
    ) + page;
  return `${url}?s=test${organic ? "" : "&abc=ff"}`;
}
