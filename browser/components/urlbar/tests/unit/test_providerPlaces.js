/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// This is a simple test to check the Places provider works, it is not
// intended to check all the edge cases, because that component is already
// covered by a good amount of tests.

const SUGGEST_PREF = "browser.urlbar.suggest.searches";
const SUGGEST_ENABLED_PREF = "browser.search.suggest.enabled";
const QUICKACTIONS_PREF = "browser.urlbar.suggest.quickactions";

add_task(async function test_places() {
  Services.prefs.setBoolPref(SUGGEST_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);
  Services.prefs.setBoolPref(QUICKACTIONS_PREF, false);

  let engine = await addTestSuggestionsEngine();
  await SearchService.setDefault(engine, SearchService.CHANGE_REASON.UNKNOWN);
  let oldCurrentEngine = SearchService.defaultEngine;

  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref(SUGGEST_PREF);
    Services.prefs.clearUserPref(SUGGEST_ENABLED_PREF);
    Services.prefs.clearUserPref(QUICKACTIONS_PREF);
    await SearchService.setDefault(
      oldCurrentEngine,
      SearchService.CHANGE_REASON.UNKNOWN
    );
  });

  // Also check case insensitivity.
  let searchString = "MoZ oRg";
  let tabGroupId = "1234567890-1";
  let context = createContext(searchString, { isPrivate: false });

  // Add some bookmarks.
  await PlacesUtils.bookmarks.insert({
    url: "https://bookmark.mozilla.org/",
    title: "Test bookmark",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    dateAdded: new Date(100),
  });
  PlacesUtils.tagging.tagURI(
    Services.io.newURI("https://bookmark.mozilla.org/"),
    ["mozilla", "org", "ham", "moz", "bacon"]
  );

  await PlacesUtils.bookmarks.insert({
    url: "https://bookmark-open.mozilla.org/",
    title: "Test bookmark open in tab",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    dateAdded: new Date(101),
  });

  // Add some history.
  await PlacesTestUtils.addVisits([
    {
      title: "Test history",
      uri: "https://history.mozilla.org/",
      visitDate: new Date(1368270000000),
    },
    {
      uri: "https://tab.mozilla.org/",
      title: "Test tab",
      visitDate: new Date(1368270000001),
    },
    {
      uri: "https://tabingroup.mozilla.org/",
      title: "Test tab in group",
      visitDate: new Date(1368270000002),
    },
    {
      url: "https://bookmark-open.mozilla.org/",
      visitDate: new Date(1368270000003),
    },
  ]);

  // Add some open tabs.
  let openTabs = [
    {
      uri: "https://tab.mozilla.org/",
      tabGroup: null,
    },
    {
      uri: "https://tabingroup.mozilla.org/",
      tabGroup: tabGroupId,
    },
    {
      uri: "https://bookmark-open.mozilla.org/",
      tabGroup: null,
    },
  ];
  for (let { uri, tabGroup } of openTabs) {
    UrlbarProviderOpenTabs.registerOpenTab(uri, 0, tabGroup, false);
  }

  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await check_results({
    context,
    matches: [
      makeSearchResult(context, {
        heuristic: true,
        engineName: engine.name,
        query: searchString,
      }),
      makeSearchResult(context, {
        engineName: engine.name,
        suggestion: `${searchString} foo`,
      }),
      makeSearchResult(context, {
        engineName: engine.name,
        suggestion: `${searchString} bar`,
      }),
      makeBookmarkResult(context, {
        title: "Test bookmark",
        uri: "https://bookmark.mozilla.org/",
        tags: ["moz", "mozilla", "org"],
        bookmarkDateMs: 100,
      }),
      makeTabSwitchResult(context, {
        title: "Test bookmark open in tab",
        uri: "https://bookmark-open.mozilla.org/",
        tabGroup: null,
        bookmarkDateMs: 101,
        lastVisit: 1368270000003,
      }),
      makeTabSwitchResult(context, {
        title: "Test tab in group",
        uri: "https://tabingroup.mozilla.org/",
        tabGroup: tabGroupId,
        lastVisit: 1368270000002,
      }),
      makeTabSwitchResult(context, {
        title: "Test tab",
        uri: "https://tab.mozilla.org/",
        tabGroup: null,
        lastVisit: 1368270000001,
      }),
      makeVisitResult(context, {
        title: "Test history",
        uri: "https://history.mozilla.org/",
        bookmarkDateMs: 0,
        lastVisit: 1368270000000,
      }),
    ],
  });

  // Clean up.
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();
  for (let { uri, tabGroup } of openTabs) {
    UrlbarProviderOpenTabs.unregisterOpenTab(uri, 0, tabGroup, false);
  }
});

add_task(async function test_bookmarkBehaviorDisabled_tagged() {
  Services.prefs.setBoolPref(SUGGEST_PREF, false);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, false);

  // Disable the bookmark behavior.
  Services.prefs.setBoolPref("browser.urlbar.suggest.bookmark", false);

  let controller = UrlbarTestUtils.newMockController();
  // Also check case insensitivity.
  let searchString = "MoZ oRg";
  let context = createContext(searchString, { isPrivate: false });

  // Add a tagged bookmark that's also visited.
  await PlacesUtils.bookmarks.insert({
    url: "https://bookmark.mozilla.org/",
    title: "Test bookmark",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
  });
  PlacesUtils.tagging.tagURI(
    Services.io.newURI("https://bookmark.mozilla.org/"),
    ["mozilla", "org", "ham", "moz", "bacon"]
  );
  await PlacesTestUtils.addVisits("https://bookmark.mozilla.org/");
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await controller.startQuery(context);

  info("Results:\n" + context.results.map(m => m.payload.url).join("\n"));
  Assert.equal(
    context.results.length,
    2,
    "Found the expected number of matches"
  );

  Assert.deepEqual(
    [UrlbarShared.RESULT_TYPE.SEARCH, UrlbarShared.RESULT_TYPE.URL],
    context.results.map(m => m.type),
    "Check result types"
  );

  Assert.deepEqual(
    [searchString, "Test bookmark"],
    context.results.map(m => m.getDisplayableValueAndHighlights("title").value),
    "Check match titles"
  );

  Assert.deepEqual(context.results[1].payload.tags, [], "Check tags");

  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();
});

add_task(async function test_bookmarkBehaviorDisabled_untagged() {
  Services.prefs.setBoolPref(SUGGEST_PREF, false);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, false);

  // Disable the bookmark behavior.
  Services.prefs.setBoolPref("browser.urlbar.suggest.bookmark", false);

  let controller = UrlbarTestUtils.newMockController();
  // Also check case insensitivity.
  let searchString = "MoZ oRg";
  let context = createContext(searchString, { isPrivate: false });

  // Add an *untagged* bookmark that's also visited.
  await PlacesUtils.bookmarks.insert({
    url: "https://bookmark.mozilla.org/",
    title: "Test bookmark",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
  });
  await PlacesTestUtils.addVisits("https://bookmark.mozilla.org/");
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await controller.startQuery(context);

  info("Results:\n" + context.results.map(m => m.payload.url).join("\n"));
  Assert.equal(
    context.results.length,
    2,
    "Found the expected number of matches"
  );

  Assert.deepEqual(
    [UrlbarShared.RESULT_TYPE.SEARCH, UrlbarShared.RESULT_TYPE.URL],
    context.results.map(m => m.type),
    "Check result types"
  );

  Assert.deepEqual(
    [searchString, "Test bookmark"],
    context.results.map(m => m.getDisplayableValueAndHighlights("title").value),
    "Check match titles"
  );

  Assert.deepEqual(context.results[1].payload.tags, [], "Check tags");

  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();
});

add_task(async function test_diacritics() {
  Services.prefs.setBoolPref(SUGGEST_PREF, false);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, false);

  // Enable the bookmark behavior.
  Services.prefs.setBoolPref("browser.urlbar.suggest.bookmark", true);

  let controller = UrlbarTestUtils.newMockController();
  let searchString = "agui";
  let context = createContext(searchString, { isPrivate: false });

  await PlacesUtils.bookmarks.insert({
    url: "https://bookmark.mozilla.org/%C3%A3g%CC%83u%C4%A9",
    title: "Test bookmark with accents in path",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
  });
  await PlacesFrecencyRecalculator.recalculateAnyOutdatedFrecencies();

  await controller.startQuery(context);

  info("Results:\n" + context.results.map(m => m.payload.url).join("\n"));
  Assert.equal(
    context.results.length,
    2,
    "Found the expected number of matches"
  );

  Assert.deepEqual(
    [UrlbarShared.RESULT_TYPE.SEARCH, UrlbarShared.RESULT_TYPE.URL],
    context.results.map(m => m.type),
    "Check result types"
  );

  Assert.deepEqual(
    [searchString, "Test bookmark with accents in path"],
    context.results.map(m => m.getDisplayableValueAndHighlights("title").value),
    "Check match titles"
  );

  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();
});
