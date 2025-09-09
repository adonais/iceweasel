"use strict";

ChromeUtils.defineESModuleGetters(this, {
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

add_task(async function test_weightedSampleTopSites_no_guid_last() {
  // Ranker are utilities we are testing
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcuts.mjs"
  );
  const provider = new Ranker.RankShortcutsProvider();
  // We are going to stub a database call
  const { NewTabUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/NewTabUtils.sys.mjs"
  );

  await NewTabUtils.init();

  const sandbox = sinon.createSandbox();

  // Stub DB call
  sandbox
    .stub(NewTabUtils.activityStreamProvider, "executePlacesQuery")
    .resolves([
      ["a", 5, 10],
      ["b", 2, 10],
    ]);

  // First item here intentially has no guid
  const input = [
    { url: "no-guid.com" },
    { guid: "a", url: "a.com" },
    { guid: "b", url: "b.com" },
  ];

  const result = await provider.rankTopSites(input, {}, { isStartup: false });

  Assert.ok(Array.isArray(result), "returns an array");
  Assert.equal(
    result[result.length - 1].url,
    "no-guid.com",
    "top-site without GUID is last"
  );

  sandbox.restore();
});

add_task(async function test_sumNorm() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  let vec = [1, 1];
  let result = Ranker.sumNorm(vec);
  Assert.ok(
    result.every((v, i) => Math.abs(v - [0.5, 0.5][i]) < 1e-6),
    "sum norm works as expected for dense array"
  );

  vec = [0, 0];
  result = Ranker.sumNorm(vec);
  Assert.ok(
    result.every((v, i) => Math.abs(v - [0.0, 0.0][i]) < 1e-6),
    "if sum is 0.0, it should return the original vector, input is zeros"
  );

  vec = [1, -1];
  result = Ranker.sumNorm(vec);
  Assert.ok(
    result.every((v, i) => Math.abs(v - [1.0, -1.0][i]) < 1e-6),
    "if sum is 0.0, it should return the original vector, input contains negatives"
  );
});

add_task(async function test_computeLinearScore() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );

  let entry = { a: 1, b: 0, bias: 1 };
  let weights = { a: 1, b: 0, bias: 0 };
  let result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 1, "check linear score with one non-zero weight");

  entry = { a: 1, b: 1, bias: 1 };
  weights = { a: 1, b: 1, bias: 1 };
  result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 3, "check linear score with 1 everywhere");

  entry = { bias: 1 };
  weights = { a: 1, b: 1, bias: 1 };
  result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 1, "check linear score with empty entry, get bias");

  entry = { a: 1, b: 1, bias: 1 };
  weights = {};
  result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 0, "check linear score with empty weights");

  entry = { a: 1, b: 1, bias: 1 };
  weights = { a: 3 };
  result = Ranker.computeLinearScore(entry, weights);
  Assert.equal(result, 3, "check linear score with a missing weight");
});

add_task(async function test_interpolateWrappedHistogram() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  let hist = [1, 2];
  let t = 0.5;
  let result = Ranker.interpolateWrappedHistogram(hist, t);
  Assert.equal(result, 1.5, "test linear interpolation square in the middle");

  hist = [1, 2, 5];
  t = 2.5;
  result = Ranker.interpolateWrappedHistogram(hist, t);
  Assert.equal(
    result,
    (hist[0] + hist[2]) / 2,
    "test linear interpolation correctly wraps around"
  );

  hist = [1, 2, 5];
  t = 5;
  result = Ranker.interpolateWrappedHistogram(hist, t);
  Assert.equal(
    result,
    hist[2],
    "linear interpolation will wrap around to the last index"
  );
});

add_task(async function test_bayesHist() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );

  let vec = [1, 2];
  let pvec = [0.5, 0.5];
  let tau = 2;
  let result = Ranker.bayesHist(vec, pvec, tau);
  // checking the math
  // (1+2*.5)/(3+2)........... 2/5
  // (2+2*.5)/(3+2)........... 3/5
  Assert.ok(
    result.every((v, i) => Math.abs(v - [0.4, 0.6][i]) < 1e-6),
    "bayes histogram is expected for typical input"
  );
  vec = [1, 2];
  pvec = [0.5, 0.5];
  tau = 0.0;
  result = Ranker.bayesHist(vec, pvec, tau);
  Assert.ok(
    result.every((v, i) => Math.abs(v - vec[i] / 3) < 1e-6), // 3 is sum of vec
    "bayes histogram is a sum norming function if tau is 0"
  );
});

add_task(async function test_normSites() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  let Y = {
    a: [2, 2],
    b: [3, 3],
  };
  let result = Ranker.normHistDict(Y);
  Assert.ok(
    result.a.every(
      (v, i) => Math.abs(v - [4 / (4 + 9), 4 / (4 + 9)][i]) < 1e-6
    ),
    "normSites, basic input, first array"
  );
  Assert.ok(
    result.b.every(
      (v, i) => Math.abs(v - [9 / (4 + 9), 9 / (4 + 9)][i]) < 1e-6
    ),
    "normSites, basic input, second array"
  );

  Y = [];
  result = Ranker.normHistDict(Y);
  Assert.deepEqual(result, [], "normSites handles empty array");
});

add_task(async function test_clampWeights() {
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );
  let weights = { a: 0, b: 1000, bias: 0 };
  let result = Ranker.clampWeights(weights, 100);
  info("clampWeights clamps a big weight vector");
  Assert.equal(result.a, 0);
  Assert.equal(result.b, 100);
  Assert.equal(result.bias, 0);

  weights = { a: 1, b: 1, bias: 1 };
  result = Ranker.clampWeights(weights, 100);
  info("clampWeights ignores a small weight vector");
  Assert.equal(result.a, 1);
  Assert.equal(result.b, 1);
  Assert.equal(result.bias, 1);
});

add_task(async function test_updateWeights_batch() {
  // Import the module that exports updateWeights
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/SmartShortcutsRanker/RankShortcutsWorkerClass.mjs"
  );

  const eta = 1;
  const click_bonus = 1;
  const features = ["a", "b", "bias"];

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }
  function approxEqual(actual, expected, eps = 1e-12) {
    Assert.lessOrEqual(
      Math.abs(actual - expected),
      eps,
      `expected ${actual} ≈ ${expected}`
    );
  }

  //  single click on guid_A updates all weights
  const initial1 = { a: 0, b: 1, bias: 0.1 };
  const scores1 = {
    guid_A: { final: 1.1, a: 1, b: 1, bias: 1 },
  };

  let updated = await Ranker.updateWeights(
    {
      data: { guid_A: { clicks: 1, impressions: 0 } },
      scores: scores1,
      features,
      weights: { ...initial1 },
      eta,
      click_bonus,
    },
    false
  );

  const delta = sigmoid(1.1) - 1; // gradient term for a positive click
  approxEqual(updated.a, 0 - Number(delta) * 1);
  approxEqual(updated.b, 1 - Number(delta) * 1);
  approxEqual(updated.bias, 0.1 - Number(delta) * 1);

  // missing guid -> no-op (weights unchanged)
  const initial2 = { a: 0, b: 1000, bias: 0 };
  const scores2 = {
    guid_A: { final: 1, a: 1, b: 1e-3, bias: 1 },
  };

  updated = await Ranker.updateWeights(
    {
      data: { guid_B: { clicks: 1, impressions: 0 } }, // guid_B not in scores
      scores: scores2,
      features,
      weights: { ...initial2 },
      eta,
      click_bonus,
    },
    false
  );

  Assert.equal(updated.a, 0);
  Assert.equal(updated.b, 1000);
  Assert.equal(updated.bias, 0);
});
