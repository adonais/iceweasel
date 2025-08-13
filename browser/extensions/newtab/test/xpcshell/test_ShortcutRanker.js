"use strict";

ChromeUtils.defineESModuleGetters(this, {
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

add_task(async function test_tsampleTopSites_no_guid_last() {
  // Ranker are utilities we are testing
  const Ranker = ChromeUtils.importESModule(
    "resource://newtab/lib/ShortcutsRanker.sys.mjs"
  );
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

  const result = await Ranker.tsampleTopSites(input, {});

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
    "resource://newtab/lib/ShortcutsRanker.sys.mjs"
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
    "resource://newtab/lib/ShortcutsRanker.sys.mjs"
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
