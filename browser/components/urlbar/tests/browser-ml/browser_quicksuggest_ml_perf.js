/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// End-to-end performance coverage for ML-backed Firefox Suggest: the query is
// typed into the real urlbar, so the intent and NER models are configured by
// Remote Settings and driven by the production Suggest ML backend, and the
// Yelp feature turns the ML result into a row the way it does for users. The
// reported span is user-perceived: how long until that row shows in the
// urlbar view.
//
// Parsed by the mozperftest static parser (vendored esprima, ES2017): no
// optional chaining, nullish coalescing, or object spread.

const { QuickSuggest } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/QuickSuggest.sys.mjs"
);
const { MLSuggest } = ChromeUtils.importESModule(
  "moz-src:///browser/components/urlbar/private/MLSuggest.sys.mjs"
);
const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);
const { MLPerfTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLPerfTestUtils.sys.mjs"
);

MLPerfTestUtils.init(this);

const METRIC_PREFIX = "MLSUGGEST";
const SUGGESTION_LATENCY = "suggestion-latency";

// The intent model classifies this as yelp_intent and the NER model resolves
// the city and state, which the Yelp feature then matches against geonames.
const SEARCH_QUERY = "restaurants in seattle, wa";

// The per-engine series isolate the models from the urlbar's own cost in
// the suggestion latency.
const perfMetadata = {
  owner: "GenAI Team",
  name: "browser_quicksuggest_ml_perf.js",
  description:
    "User-perceived latency and inference memory for ML-backed Firefox Suggest, driven through the production urlbar flow",
  options: {
    default: {
      perfherder: true,
      perfherder_metrics: [
        {
          name: "MLSUGGEST-suggestion-latency-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "MLSUGGEST-suggestion-latency-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "MLSUGGEST-peak-memory",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "MLSUGGEST-intent-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "MLSUGGEST-intent-engine-run-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "MLSUGGEST-intent-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "MLSUGGEST-intent-memory-after-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "MLSUGGEST-ner-engine-run-time-first-use",
          unit: "ms",
          shouldAlert: false,
        },
        {
          name: "MLSUGGEST-ner-engine-run-time-warm",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "MLSUGGEST-ner-memory-after-run-first-use",
          unit: "MiB",
          shouldAlert: false,
        },
        {
          name: "MLSUGGEST-ner-memory-after-run-warm",
          unit: "MiB",
          shouldAlert: true,
        },
      ],
      verbose: true,
      ml_services: true,
      manifest: "perftest.toml",
      manifest_flavor: "browser-chrome",
      try_platform: ["linux", "mac", "win"],
    },
  },
};

requestLongerTimeout(30);

async function findMlSuggestResult() {
  const count = UrlbarTestUtils.getResultCount(window);
  for (let i = 0; i < count; i++) {
    const details = await UrlbarTestUtils.getDetailsOfResultAt(window, i);
    if (
      details.result.providerName == "UrlbarProviderQuickSuggest" &&
      details.result.payload.source == "ml"
    ) {
      return details.result;
    }
  }
  return null;
}

// One urlbar search: from typing the query to the ML-backed suggestion showing
// in the view. The first use enables the backend, which sets its models up in
// the background; a query never waits for them, so join that setup before
// searching.
async function searchOnce() {
  const start = performance.now();
  if (!QuickSuggest.getFeature("SuggestBackendMl").isEnabled) {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.urlbar.quicksuggest.mlEnabled", true]],
    });
    await MLSuggest.initialize();
  }
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: SEARCH_QUERY,
    waitForFocus: SimpleTest.waitForFocus,
  });
  const result = await findMlSuggestResult();
  const latency = performance.now() - start;

  Assert.ok(result, "The urlbar view shows an ML-backed Suggest result");
  Assert.equal(result.payload.provider, "yelp_intent", "The intent is Yelp");

  await UrlbarTestUtils.promisePopupClose(window, () => gURLBar.blur());
  const measurements = {};
  measurements[SUGGESTION_LATENCY] = latency;
  return measurements;
}

add_setup(async function () {
  UrlbarTestUtils.init(this);
  await QuickSuggest.init();

  // The Yelp feature builds its row from Rust's Yelp metadata and geonames,
  // which the Rust backend ingests from Remote Settings after startup.
  await QuickSuggest.rustBackend.ingestPromise;
  const yelpProbe = await QuickSuggest.rustBackend.query("coffee in atlanta", {
    types: ["Yelp"],
  });
  Assert.greater(yelpProbe.length, 0, "Rust ingested the Yelp suggestions");
});

add_task(async function test_ml_suggest_perf() {
  await MLPerfTestUtils.runPerfScenario({
    metricPrefix: METRIC_PREFIX,
    scenario: searchOnce,
    engines: [
      { featureId: "suggest-intent-classification", metricName: "intent" },
      { featureId: "suggest-NER", metricName: "ner" },
    ],
    coldIterations: 0,
    warmIterations: 5,
    memoryIterations: 3,
  });
});
