/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// End-to-end performance coverage for semantic history search: history is
// ingested through the production indexing task, and queries are typed into
// the real urlbar, so the embedding engine is configured and driven entirely
// by production code. Indexing reports the embedder's cost for one sweep on a
// resident engine, which is what scales with history size; the search reports
// the user-perceived time until a semantic result shows in the urlbar view.
//
// Parsed by the mozperftest static parser (vendored esprima, ES2017): no
// optional chaining, nullish coalescing, or object spread.

const { UrlbarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlbarTestUtils.sys.mjs"
);

const { getPlacesSemanticHistoryManager } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesSemanticHistoryManager.sys.mjs"
);
const { MLPerfTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/MLPerfTestUtils.sys.mjs"
);

MLPerfTestUtils.init(this);

const METRIC_PREFIX = "SEMANTICHISTORY";
const EMBEDDER_FEATURE_ID = "simple-text-embedder";
const SEMANTIC_RESULT_LATENCY = "semantic-result-latency";
const UPDATE_COMPLETE_TOPIC = "places-semantichistorymanager-update-complete";

// The query is semantically close to the dessert entries below but shares no
// word with any title or URL: a textual history match on the same URL would
// win muxer dedup and hide the semantic result this test waits for.
const SEARCH_QUERY = "baking sugary cakes";

const DESSERT_TITLES = [
  "Rich chocolate brownie recipe with fudgy center",
  "How to bake the perfect vanilla layer cake",
  "Classic apple pie crust techniques explained",
  "Easy homemade cookie dough for beginners",
  "Lemon meringue tart step by step guide",
  "Cinnamon rolls that rise overnight in the fridge",
  "Cheesecake baking mistakes and how to avoid them",
  "Glazed donuts made without a deep fryer",
  "Banana bread with caramelized walnuts",
  "French macarons troubleshooting common failures",
  "Pastry cream filling for eclairs and profiteroles",
  "Gingerbread house construction for the holidays",
];

const FILLER_TITLES = [
  "Quarterly earnings report analysis for investors",
  "Mountain bike suspension setup and tuning",
  "Understanding container orchestration architecture",
  "Migratory bird patterns in northern wetlands",
  "Electric vehicle charging standards compared",
  "Ancient roman aqueduct engineering principles",
  "Beginner guide to watercolor landscape painting",
  "Marathon training schedule for first timers",
  "Deep sea exploration submersible technology",
  "Municipal recycling program participation rates",
  "Vintage synthesizer restoration and repair",
  "Constitutional law landmark decisions reviewed",
  "Greenhouse tomato cultivation temperature control",
  "Professional camera lens optics fundamentals",
  "Volcanic activity monitoring instrumentation",
  "Medieval manuscript preservation techniques",
  "Urban traffic flow optimization modeling",
  "Antarctic research station daily operations",
];

// Declared names match emitted series as substrings, so each entry covers its
// lifecycle variants (-cold, -warm). The indexing engine series carry their
// own prefix: a sweep embeds a chunk of titles, a search embeds one query.
const perfMetadata = {
  owner: "GenAI Team",
  name: "browser_urlbar_semantic_history_perf.js",
  description:
    "User-perceived latency and inference memory for semantic history search, driven through history ingestion and the production urlbar flow",
  options: {
    default: {
      perfherder: true,
      perfherder_metrics: [
        {
          name: "SEMANTICHISTORY-indexing-engine-run-time",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SEMANTICHISTORY-indexing-memory-after-run",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SEMANTICHISTORY-semantic-result-latency",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SEMANTICHISTORY-peak-memory",
          unit: "MiB",
          shouldAlert: true,
        },
        {
          name: "SEMANTICHISTORY-engine-creation-time",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SEMANTICHISTORY-engine-run-time",
          unit: "ms",
          shouldAlert: true,
        },
        {
          name: "SEMANTICHISTORY-memory-after-run",
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

// One chunk of history entries. The first batch carries the dessert titles
// the search relies on; later batches recycle the filler titles.
function historyBatch(batch, size) {
  const titles = [];
  for (let i = 0; i < size; i++) {
    if (batch === 0 && i < DESSERT_TITLES.length) {
      titles.push(DESSERT_TITLES[i]);
    } else {
      const filler = FILLER_TITLES[i % FILLER_TITLES.length];
      titles.push(batch === 0 ? filler : `${filler} ${batch}`);
    }
  }
  return titles.map((title, i) => ({
    url: `https://site${i}.example.com/batch${batch}/page/${i}`,
    title,
    visits: [{ date: new Date() }],
  }));
}

// The urlbar provider builds the manager singleton lazily with production
// parameters, whose indexing cadence waits on organic history churn. Create
// the same singleton first with an eager indexing schedule; the provider
// then reuses it. The embedding and search paths are untouched.
function createSemanticManager() {
  return getPlacesSemanticHistoryManager(
    {
      rowLimit: 10000,
      samplingAttrib: "frecency",
      changeThresholdCount: 0,
      distanceThreshold: Services.prefs.getFloatPref(
        "places.semanticHistory.distanceThreshold",
        0.6
      ),
      testFlag: true,
    },
    true
  );
}

let semanticManager;
// The indexing task embeds one chunk of pending entries per engine run, so a
// batch of one chunk is one sweep and one run.
let batchSize;
let batches = 0;

// Resolves once an indexing sweep reports completion with every inserted
// entry embedded. A sweep that runs before frecencies settle sees no rows
// and reports completion early, so the count is checked on each
// notification.
function promiseEntriesEmbedded(expectedCount) {
  return new Promise(resolve => {
    let done = false;
    async function observe() {
      const conn = await semanticManager.getConnection();
      const rows = await conn.execute(
        "SELECT COUNT(*) AS n FROM vec_history_mapping"
      );
      if (done || rows[0].getResultByName("n") < expectedCount) {
        return;
      }
      done = true;
      Services.obs.removeObserver(observe, UPDATE_COMPLETE_TOPIC);
      resolve();
    }
    Services.obs.addObserver(observe, UPDATE_COMPLETE_TOPIC);
  });
}

// One indexing sweep: a chunk of new history lands and gets embedded.
async function indexBatchOnce() {
  const entries = historyBatch(batches++, batchSize);
  const embedded = promiseEntriesEmbedded(batches * batchSize);
  await PlacesUtils.history.insertMany(entries);
  // Frecency recalculation normally waits for idle; the semantic query
  // filters out rows whose frecency is still 0, so settle it now.
  await Cc["@mozilla.org/places/frecency-recalculator;1"]
    .getService(Ci.nsIObserver)
    .wrappedJSObject.recalculateAnyOutdatedFrecencies();
  // The first connection creates and arms the indexing task.
  await semanticManager.getConnection();
  await embedded;
  return {};
}

async function hasSemanticResult() {
  const count = UrlbarTestUtils.getResultCount(window);
  for (let i = 0; i < count; i++) {
    const details = await UrlbarTestUtils.getDetailsOfResultAt(window, i);
    if (details.result.providerName == "UrlbarProviderSemanticHistorySearch") {
      return true;
    }
  }
  return false;
}

// One urlbar search: from typing the query to the semantic result showing in
// the view. The provider awaits its inference inside the query, so the result
// is in the view once the query completes.
async function searchOnce() {
  const start = performance.now();
  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    value: SEARCH_QUERY,
    waitForFocus: SimpleTest.waitForFocus,
  });
  const latency = performance.now() - start;
  Assert.ok(
    await hasSemanticResult(),
    "The urlbar view shows a semantic history result"
  );
  await UrlbarTestUtils.promisePopupClose(window, () => gURLBar.blur());
  const measurements = {};
  measurements[SEMANTIC_RESULT_LATENCY] = latency;
  return measurements;
}

add_setup(async function () {
  UrlbarTestUtils.init(this);
  await SpecialPowers.pushPrefEnv({
    set: [["places.semanticHistory.featureGate", true]],
  });

  semanticManager = createSemanticManager();
  Assert.ok(
    semanticManager.qualifiedForSemanticSearch,
    "Semantic history search is available on this machine"
  );

  batchSize = Services.prefs.getIntPref(
    "places.semanticHistory.defaultBatchChunksize",
    25
  );
  Assert.greaterOrEqual(
    batchSize,
    DESSERT_TITLES.length,
    "One chunk holds every dessert title"
  );

  registerCleanupFunction(async () => {
    if (semanticManager) {
      await semanticManager.shutdown();
    }
    await PlacesUtils.history.clear();
    Services.prefs.clearUserPref("places.semanticHistory.initialized");
  });
});

add_task(async function test_semantic_history_perf() {
  // The first, unreported sweep lands the model and the dessert entries.
  // Indexing has no user-facing first use or cold state: it runs in the
  // background on whatever engine is resident.
  await MLPerfTestUtils.runPerfScenario({
    metricPrefix: METRIC_PREFIX,
    scenario: indexBatchOnce,
    engines: [{ featureId: EMBEDDER_FEATURE_ID, metricName: "indexing" }],
    measureFirstUse: false,
    coldIterations: 0,
    warmIterations: 3,
    memoryIterations: 0,
  });

  // The eager indexing schedule kept polling via testFlag; silence it so the
  // no-op sweeps stop perturbing the query measurements.
  semanticManager.testFlag = false;

  // Indexing above already landed the model, so the query flow has no
  // measurable first use; its shipping states are cold (first search of a
  // session, engine not yet running) and warm (engine resident, timeoutMS -1).
  await MLPerfTestUtils.runPerfScenario({
    metricPrefix: METRIC_PREFIX,
    scenario: searchOnce,
    engines: [{ featureId: EMBEDDER_FEATURE_ID }],
    measureFirstUse: false,
    coldIterations: 5,
    warmIterations: 5,
    memoryIterations: 3,
  });
});
