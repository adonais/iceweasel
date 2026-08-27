/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AboutNewTab } = ChromeUtils.importESModule(
  "resource:///modules/AboutNewTab.sys.mjs"
);
const { UrlbarProviderTopSites } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/UrlbarProviderTopSites.sys.mjs"
);

add_setup(async function () {
  Services.prefs.setBoolPref("browser.urlbar.suggest.topsites", true);
  Services.prefs.setBoolPref(
    "browser.newtabpage.activity-stream.feeds.system.topsites",
    true
  );
  Services.prefs.setBoolPref(
    "browser.urlbar.resultExplanations.featureGate",
    true
  );

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("browser.urlbar.suggest.topsites");
    Services.prefs.clearUserPref(
      "browser.newtabpage.activity-stream.feeds.system.topsites"
    );
    Services.prefs.clearUserPref(
      "browser.urlbar.resultExplanations.featureGate"
    );
    await PlacesUtils.history.clear();
  });
});

// For a top site added manually by the user that is a domain without a trailing
// slash, if the canonical URL is visited, the provider should create a history
// result with a visit date.
add_task(async function noTrailingSlash() {
  info("Add a visit for the canonical URL (with a trailing slash)");
  let visitDate = new Date(Date.now() - 60 * 60 * 1000);
  await PlacesTestUtils.addVisits({ uri: "https://example.org/", visitDate });

  let url = "https://example.org";
  let title = "No trailing slash";
  await doTest({
    topSite: {
      url,
      title,
      favicon: "page-icon:" + url,
      type: "history",
    },
    makeExpectedResult: context =>
      makeVisitResult(context, {
        title,
        lastVisit: visitDate.getTime(),
        bookmarkDateMs: 0,
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
      }),
  });
});

// For a top site that redirects, if the redirect chain is visited, the provider
// should create a history result with a visit date.
add_task(async function redirectChain() {
  info("Build a redirect chain of three URLs");
  const PINNED_URL = "https://redirect-a.example/";
  const HOP_URL = "https://redirect-b.example/";
  const FINAL_URL = "https://redirect-c.example/";
  let now = Date.now();
  let finalVisitDate = new Date(now - 1000);
  await PlacesTestUtils.addVisits([
    {
      uri: PINNED_URL,
      transition: PlacesUtils.history.TRANSITIONS.LINK,
      visitDate: new Date(now - 3000),
    },
    {
      uri: HOP_URL,
      transition: PlacesUtils.history.TRANSITIONS.REDIRECT_TEMPORARY,
      referrer: PINNED_URL,
      visitDate: new Date(now - 2000),
    },
    {
      uri: FINAL_URL,
      transition: PlacesUtils.history.TRANSITIONS.REDIRECT_PERMANENT,
      referrer: HOP_URL,
      visitDate: finalVisitDate,
    },
  ]);

  let title = "Redirect chain";
  await doTest({
    topSite: {
      title,
      url: PINNED_URL,
      favicon: "page-icon:" + PINNED_URL,
      type: "history",
    },
    makeExpectedResult: context =>
      makeVisitResult(context, {
        title,
        lastVisit: finalVisitDate.getTime(),
        bookmarkDateMs: 0,
        uri: PINNED_URL,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
      }),
  });
});

// For a visited unbookmarked top site, the provider should create a history
// result with a visit date.
add_task(async function history() {
  info("Add a visit for the page");
  let url = "https://example.org/history";
  let visitDate = new Date(Date.now() - 60 * 60 * 1000);
  await PlacesTestUtils.addVisits({ uri: url, visitDate });

  let title = "Visited top site";
  let topSite = {
    url,
    title,
    favicon: "page-icon:" + url,
    type: "history",
  };

  // The provider should create a history result with a visit date.
  info("Search 1");
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeVisitResult(context, {
        title,
        lastVisit: visitDate.getTime(),
        bookmarkDateMs: 0,
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
      }),
  });

  // Temporarily pin the top site.
  info("Search 2: Pin the top site");
  await doTest({
    topSite: {
      ...topSite,
      isPinned: true,
    },
    makeExpectedResult: context =>
      makeVisitResult(context, {
        title,
        lastVisit: visitDate.getTime(),
        bookmarkDateMs: 0,
        uri: url,
        isPinned: true,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        iconUri: "page-icon:" + url,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
      }),
  });

  // Disable bookmark results. It shouldn't affect anything.
  info("Search 3: Bookmark results disabled");
  UrlbarPrefs.set("suggest.bookmark", false);
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeVisitResult(context, {
        title,
        lastVisit: visitDate.getTime(),
        bookmarkDateMs: 0,
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
      }),
  });

  // Disable history results. The provider is still expected to create a result,
  // but its source should be `OTHER_LOCAL` instead of `HISTORY` so that the
  // muxer and providers manager include it in the query's final results. (This
  // seems wrong but appears to be how this provider has always worked.) The
  // result shouldn't have a visit date.
  info("Search 4: History results disabled");
  UrlbarPrefs.set("suggest.history", false);
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeVisitResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: 0,
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        iconUri: "page-icon:" + url,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
      }),
  });

  // Temporarily pin the top site again. Since it's now pinned, the provider
  // should create a result even though history results are disabled.
  info("Search 5: Pin the top site again");
  await doTest({
    topSite: {
      ...topSite,
      isPinned: true,
    },
    makeExpectedResult: context =>
      makeVisitResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: 0,
        uri: url,
        isPinned: true,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        iconUri: "page-icon:" + url,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
      }),
  });

  UrlbarPrefs.clear("suggest.history");
  UrlbarPrefs.clear("suggest.bookmark");
});

// For a visited bookmarked top site, the provider should create a bookmark
// result with a visit date and bookmark date.
add_task(async function visitedBookmark() {
  info("Add a visit for the page that will be bookmarked");
  let url = "https://example.org/bookmark";
  let visitDate = new Date(Date.now() - 60 * 60 * 1000);
  await PlacesTestUtils.addVisits({ uri: url, visitDate });

  info("Bookmark the page");
  await PlacesTestUtils.addBookmarkWithDetails({
    uri: url,
    title: "My bookmark",
    dateAdded: visitDate,
  });

  let title = "Visited bookmarked top site";
  let topSite = {
    url,
    title,
    favicon: "page-icon:" + url,
    type: "history",
  };

  // The provider should create a bookmark result with visit and bookmark dates.
  info("Search 1");
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: visitDate.getTime(),
        bookmarkDateMs: visitDate.getTime(),
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.BOOKMARKS,
      }),
  });

  // Temporarily pin the top site.
  info("Search 2: Pin the top site");
  await doTest({
    topSite: {
      ...topSite,
      isPinned: true,
    },
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: visitDate.getTime(),
        bookmarkDateMs: visitDate.getTime(),
        uri: url,
        isPinned: true,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.BOOKMARKS,
      }),
  });

  // Enable only bookmark results. The provider should still create a bookmark
  // result with a bookmark date but without a visit date.
  info("Search 3: Only bookmark results enabled");
  UrlbarPrefs.set("suggest.history", false);
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: visitDate.getTime(),
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.BOOKMARKS,
      }),
  });

  // Enable neither bookmarks nor history. The provider is still expected to
  // create a result, but its source should be `OTHER_LOCAL` instead of
  // `BOOKMARKS` so that the muxer and providers manager include it in the
  // query's final results. (This seems wrong but appears to be how this
  // provider has always worked. See also bug 1631281.) The result shouldn't
  // have a bookmarked date.
  info("Search 4: Neither bookmarks nor history enabled");
  UrlbarPrefs.set("suggest.bookmark", false);
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: 0,
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
      }),
  });

  // Temporarily pin the top site again. Since it's now pinned, the provider
  // should create a result even though bookmark and history results are
  // disabled.
  info("Search 5: Pin the top site again");
  await doTest({
    topSite: {
      ...topSite,
      isPinned: true,
    },
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: 0,
        uri: url,
        isPinned: true,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
      }),
  });

  // Re-enable only history results. The provider should create a history result
  // with a visit date but without a bookmark date.
  info("Search 6: Only history results enabled");
  UrlbarPrefs.clear("suggest.history");
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeVisitResult(context, {
        title,
        lastVisit: visitDate.getTime(),
        bookmarkDateMs: 0,
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.HISTORY,
      }),
  });

  UrlbarPrefs.clear("suggest.bookmark");
});

// For an unvisited bookmark top site, the provider should create a bookmark
// result without a visit date.
add_task(async function unvisitedBookmark() {
  let url = "https://example.org/bookmark-unvisited";

  info("Bookmark the page");
  let bookmarkDate = new Date(Date.now() - 60 * 60 * 1000);
  await PlacesTestUtils.addBookmarkWithDetails({
    uri: url,
    title: "My bookmark",
    dateAdded: bookmarkDate,
  });

  let title = "Bookmarked unvisited top site";
  let topSite = {
    url,
    title,
    favicon: "page-icon:" + url,
  };

  info("Search 1");
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: bookmarkDate.getTime(),
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.BOOKMARKS,
      }),
  });

  // Temporarily pin the top site.
  info("Search 2: Pin the top site");
  await doTest({
    topSite: {
      ...topSite,
      isPinned: true,
    },
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: bookmarkDate.getTime(),
        uri: url,
        isPinned: true,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.BOOKMARK,
      }),
  });

  // Disable history results. It shouldn't affect anything.
  info("Search 3: History results disabled");
  UrlbarPrefs.set("suggest.history", false);
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: bookmarkDate.getTime(),
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.BOOKMARKS,
      }),
  });

  // Disable bookmark results. The provider is still expected to create a
  // result, but its source should be `OTHER_LOCAL` instead of `BOOKMARKS` so
  // that the muxer and providers manager include it in the query's final
  // results. (This seems wrong but appears to be how this provider has always
  // worked. See also bug 1631281.) The result shouldn't have a bookmarked date.
  info("Search 4: Bookmark results disabled");
  UrlbarPrefs.set("suggest.bookmark", false);
  await doTest({
    topSite,
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: 0,
        uri: url,
        isPinned: false,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
      }),
  });

  // Temporarily pin the top site again. Since it's now pinned, the provider
  // should create a result even though bookmark results are disabled.
  info("Search 5: Pin the top site again");
  await doTest({
    topSite: {
      ...topSite,
      isPinned: true,
    },
    makeExpectedResult: context =>
      makeBookmarkResult(context, {
        title,
        lastVisit: 0,
        bookmarkDateMs: 0,
        uri: url,
        isPinned: true,
        isSponsored: false,
        tags: null,
        sendAttributionRequest: false,
        providerName: UrlbarProviderTopSites.name,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
      }),
  });

  UrlbarPrefs.clear("suggest.bookmark");
  UrlbarPrefs.clear("suggest.history");
});

// For a default (unvisited) top site, the provider should create an
// `OTHER_LOCAL` result. (Visited top sites become "history" top sites, which
// are tested by other tasks.)
add_task(async function defaultTopSite() {
  let url = "https://example.org/default";
  let title = "Default top site";
  let topSite = {
    url,
    title,
    isDefault: true,
    favicon: "page-icon:" + url,
  };

  info("Search 1");
  await doTest({
    topSite,
    makeExpectedResult: () =>
      new UrlbarResult({
        type: UrlbarShared.RESULT_TYPE.URL,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
        heuristic: false,
        payload: {
          url,
          title,
          lastVisit: 0,
          bookmarkDateMs: 0,
          icon: "page-icon:" + url,
          isPinned: false,
          isSponsored: false,
          sendAttributionRequest: false,
        },
      }),
  });

  // Temporarily pin the top site.
  info("Search 2: Pin the top site");
  await doTest({
    topSite: {
      ...topSite,
      isPinned: true,
    },
    makeExpectedResult: () =>
      new UrlbarResult({
        type: UrlbarShared.RESULT_TYPE.URL,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
        heuristic: false,
        payload: {
          url,
          title,
          lastVisit: 0,
          bookmarkDateMs: 0,
          icon: "page-icon:" + url,
          isPinned: true,
          isSponsored: false,
          sendAttributionRequest: false,
        },
      }),
  });
});

// For a pinned top site that's not visited, bookmarked, or default, the
// provider should create an `OTHER_LOCAL` result.
add_task(async function onlyPinned() {
  let url = "https://example.org/only-pinned";
  let title = "Only pinned top site";
  await doTest({
    topSite: {
      url,
      title,
      isPinned: true,
      favicon: "page-icon:" + url,
    },
    makeExpectedResult: () =>
      new UrlbarResult({
        type: UrlbarShared.RESULT_TYPE.URL,
        source: UrlbarShared.RESULT_SOURCE.OTHER_LOCAL,
        heuristic: false,
        payload: {
          url,
          title,
          lastVisit: 0,
          bookmarkDateMs: 0,
          icon: "page-icon:" + url,
          isPinned: true,
          isSponsored: false,
          sendAttributionRequest: false,
        },
      }),
  });
});

async function doTest({ topSite, makeExpectedResult }) {
  let sandbox = sinon.createSandbox();
  sandbox.stub(AboutNewTab, "getTopSites").returns([topSite]);

  let context = createContext("", {
    providers: [UrlbarProviderTopSites.name],
    isPrivate: false,
  });
  let expectedResult = makeExpectedResult(context);
  await check_results({
    context,
    matches: expectedResult ? [expectedResult] : [],
  });

  sandbox.restore();
}
