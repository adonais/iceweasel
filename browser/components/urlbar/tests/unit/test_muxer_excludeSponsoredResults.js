/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// Tests the `excludeSponsoredResults` query context flag for filtering all
// sponsored results.

"use strict";

add_task(function test_excludeSponsoredResults_flag() {
  let context = createContext("test", {});
  Assert.strictEqual(
    context.excludeSponsoredResults,
    false,
    "excludeSponsoredResults defaults to false"
  );

  context = createContext("test", { excludeSponsoredResults: true });
  Assert.strictEqual(
    context.excludeSponsoredResults,
    true,
    "excludeSponsoredResults is explicitly set to true"
  );

  context = createContext("test", { excludeSponsoredResults: false });
  Assert.strictEqual(
    context.excludeSponsoredResults,
    false,
    "excludeSponsoredResults is explicitly set to false"
  );
});

add_task(async function test_filters_sponsored_results() {
  let results = [
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test1" },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test2", isSponsored: true },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test3" },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test4", isSponsored: true },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.TAB_SWITCH,
      source: UrlbarShared.RESULT_SOURCE.TABS,
      payload: { url: "http://example.com/test5", isSponsored: true },
    }),
  ];
  let provider = registerBasicTestProvider(results);
  let context = createContext(undefined, {
    providers: [provider.name],
    excludeSponsoredResults: true,
  });
  let controller = UrlbarTestUtils.newMockController();
  await ProvidersManager.getInstanceForSap("urlbar").startQuery(
    context,
    controller
  );
  Assert.deepEqual(
    context.results,
    [results[0], results[2]],
    "Only non-sponsored results are returned"
  );
});

add_task(async function test_filters_all_sponsored_results() {
  let results = [
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test1", isSponsored: true },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.TAB_SWITCH,
      source: UrlbarShared.RESULT_SOURCE.TABS,
      payload: { url: "http://example.com/test2", isSponsored: true },
    }),
  ];
  let provider = registerBasicTestProvider(results);
  let context = createContext(undefined, {
    providers: [provider.name],
    excludeSponsoredResults: true,
  });
  let controller = UrlbarTestUtils.newMockController();
  await ProvidersManager.getInstanceForSap("urlbar").startQuery(
    context,
    controller
  );
  Assert.deepEqual(
    context.results,
    [],
    "No results are returned when all are sponsored"
  );
});

add_task(async function test_keeps_non_sponsored_when_flag_set() {
  let results = [
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test1" },
    }),
  ];
  let provider = registerBasicTestProvider(results);
  let context = createContext(undefined, {
    providers: [provider.name],
    excludeSponsoredResults: true,
  });
  let controller = UrlbarTestUtils.newMockController();
  await ProvidersManager.getInstanceForSap("urlbar").startQuery(
    context,
    controller
  );
  Assert.deepEqual(
    context.results,
    results,
    "Non-sponsored result is kept when flag is set"
  );
});

add_task(async function test_keeps_sponsored_when_flag_unset() {
  let results = [
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test1" },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test2", isSponsored: true },
    }),
  ];
  let provider = registerBasicTestProvider(results);
  let context = createContext(undefined, { providers: [provider.name] });
  let controller = UrlbarTestUtils.newMockController();
  await ProvidersManager.getInstanceForSap("urlbar").startQuery(
    context,
    controller
  );
  Assert.deepEqual(
    context.results,
    results,
    "Sponsored URL result is kept when flag is unset"
  );
});

add_task(async function test_keeps_sponsored_tab_when_flag_unset() {
  let results = [
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.URL,
      source: UrlbarShared.RESULT_SOURCE.HISTORY,
      payload: { url: "http://example.com/test1" },
    }),
    new UrlbarResult({
      type: UrlbarShared.RESULT_TYPE.TAB_SWITCH,
      source: UrlbarShared.RESULT_SOURCE.TABS,
      payload: { url: "http://example.com/test2", isSponsored: true },
    }),
  ];
  let provider = registerBasicTestProvider(results);
  let context = createContext(undefined, { providers: [provider.name] });
  let controller = UrlbarTestUtils.newMockController();
  await ProvidersManager.getInstanceForSap("urlbar").startQuery(
    context,
    controller
  );
  Assert.deepEqual(
    context.results,
    results,
    "Sponsored tab result is kept when flag is unset"
  );
});
